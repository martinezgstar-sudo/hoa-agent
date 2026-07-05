#!/usr/bin/env python3
"""
pipeline/local_db.py
Local SQLite snapshot helpers for the HOA Agent pull-once pipeline.

One dated SQLite file per run lives under:
    ~/hoa-pipeline/snapshots/snapshot-YYYYMMDD.sqlite
(override the parent dir with HOA_PIPELINE_DIR).

This module is intentionally Supabase-free. pull.py and push.py own the two
Supabase touches; research.py works only against the file these helpers manage.

Public surface:
    load_env()                           # parse repo .env.local into os.environ
    snapshot_dir() / snapshot_path(d)    # resolve the dated file path
    open_snapshot(date=None, create=)    # -> (conn, path)
    latest_snapshot()                    # newest existing snapshot path or None
    name_key(name)                       # normalized key for reject matching
    upsert_communities / upsert_rejected_pairings / upsert_open_admin_items
    insert_proposal / set_community_researched
    get_unresearched_communities / get_rejected_pairings / get_open_admin_items
    get_proposals(bucket=None)
    set_meta / get_meta / summary
    is_rejected(rejected_index, ...)     # skip check for research
    auto_approve_bucket(...)             # hard-coded safe review rule
"""

import os
import re
import json
import glob
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO = os.path.dirname(_HERE)
_SCHEMA = os.path.join(_HERE, "schema.sql")


# ── env / paths ─────────────────────────────────────────────────────────────

def load_env(path=None):
    """Parse the repo's .env.local (set -a style) into os.environ without
    overriding values already present in the environment."""
    path = path or os.path.join(_REPO, ".env.local")
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            if line.startswith("export "):
                line = line[len("export "):]
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val


def snapshot_dir():
    base = os.environ.get("HOA_PIPELINE_DIR") or os.path.expanduser("~/hoa-pipeline")
    d = os.path.join(base, "snapshots")
    os.makedirs(d, exist_ok=True)
    return d


def _run_date(date=None):
    if date:
        return date
    return datetime.now().strftime("%Y%m%d")


def snapshot_path(date=None):
    return os.path.join(snapshot_dir(), f"snapshot-{_run_date(date)}.sqlite")


def latest_snapshot():
    files = sorted(glob.glob(os.path.join(snapshot_dir(), "snapshot-*.sqlite")))
    return files[-1] if files else None


# ── connection ──────────────────────────────────────────────────────────────

def _apply_schema(conn):
    with open(_SCHEMA, "r", encoding="utf-8") as fh:
        conn.executescript(fh.read())
    conn.commit()


def open_snapshot(date=None, create=True, path=None):
    """Open (and, by default, create + schema-init) the dated snapshot.
    Returns (conn, path). With create=False, a missing file raises."""
    path = path or snapshot_path(date)
    if not create and not os.path.exists(path):
        raise FileNotFoundError(f"snapshot not found: {path}")
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    if create:
        _apply_schema(conn)
    return conn, path


# ── normalization ───────────────────────────────────────────────────────────

_PUNCT = re.compile(r"[^\w\s]")
_WS = re.compile(r"\s+")


def name_key(name):
    """Lowercase, punctuation-stripped, whitespace-collapsed name for matching
    rejected pairings by community name."""
    if not name:
        return ""
    s = _PUNCT.sub(" ", str(name).lower())
    return _WS.sub(" ", s).strip()


def _now():
    return datetime.now(timezone.utc).isoformat()


# ── writers ─────────────────────────────────────────────────────────────────

def upsert_communities(conn, rows):
    """rows: list of full community dicts (must contain 'id')."""
    now = _now()
    n = 0
    for r in rows:
        cid = r.get("id")
        if not cid:
            continue
        conn.execute(
            """INSERT INTO communities_to_work
               (community_id, canonical_name, slug, city, status,
                website_url, management_company, raw_json, pulled_at, researched)
               VALUES (?,?,?,?,?,?,?,?,?,0)
               ON CONFLICT(community_id) DO UPDATE SET
                 canonical_name=excluded.canonical_name,
                 slug=excluded.slug, city=excluded.city, status=excluded.status,
                 website_url=excluded.website_url,
                 management_company=excluded.management_company,
                 raw_json=excluded.raw_json, pulled_at=excluded.pulled_at""",
            (cid, r.get("canonical_name"), r.get("slug"), r.get("city"),
             r.get("status"), r.get("website_url"), r.get("management_company"),
             json.dumps(r, default=str), now))
        n += 1
    conn.commit()
    return n


def upsert_rejected_pairings(conn, rows):
    """rows: list of dicts with optional community_id/community_name/field_name/
    proposed_value/reason/source. name_key is derived from community_name."""
    now = _now()
    n = 0
    for r in rows:
        conn.execute(
            """INSERT INTO rejected_pairings
               (community_id, community_name, name_key, field_name,
                proposed_value, reason, source, created_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            (r.get("community_id"), r.get("community_name"),
             name_key(r.get("community_name")),
             r.get("field_name") or "*", r.get("proposed_value") or "*",
             r.get("reason"), r.get("source") or "supabase", now))
        n += 1
    conn.commit()
    return n


def upsert_open_admin_items(conn, rows):
    """rows: list of pending_community_data dicts (status='pending')."""
    n = 0
    for r in rows:
        pid = r.get("id")
        if not pid:
            continue
        conn.execute(
            """INSERT INTO open_admin_items
               (pcd_id, community_id, field_name, proposed_value,
                source_type, confidence, status, created_at)
               VALUES (?,?,?,?,?,?,?,?)
               ON CONFLICT(pcd_id) DO UPDATE SET
                 field_name=excluded.field_name,
                 proposed_value=excluded.proposed_value,
                 source_type=excluded.source_type,
                 confidence=excluded.confidence, status=excluded.status""",
            (pid, r.get("community_id"), r.get("field_name"),
             r.get("proposed_value"), r.get("source_type"),
             r.get("confidence"), r.get("status"), r.get("created_at")))
        n += 1
    conn.commit()
    return n


def insert_proposal(conn, community_id, field_name, proposed_value,
                    source_type=None, source_url=None, confidence=None,
                    bucket="needs_you", commit=True):
    conn.execute(
        """INSERT INTO proposals
           (community_id, field_name, proposed_value, source_type, source_url,
            confidence, bucket, created_at)
           VALUES (?,?,?,?,?,?,?,?)""",
        (community_id, field_name, str(proposed_value), source_type, source_url,
         confidence, bucket, _now()))
    if commit:
        conn.commit()


def set_community_researched(conn, community_id, commit=True):
    conn.execute("UPDATE communities_to_work SET researched=1 WHERE community_id=?",
                 (community_id,))
    if commit:
        conn.commit()


# ── readers ─────────────────────────────────────────────────────────────────

def get_unresearched_communities(conn):
    cur = conn.execute(
        "SELECT * FROM communities_to_work WHERE researched=0 ORDER BY pulled_at")
    return [dict(r) for r in cur.fetchall()]


def get_rejected_pairings(conn):
    cur = conn.execute("SELECT * FROM rejected_pairings")
    return [dict(r) for r in cur.fetchall()]


def get_open_admin_items(conn):
    cur = conn.execute("SELECT * FROM open_admin_items")
    return [dict(r) for r in cur.fetchall()]


def get_proposals(conn, bucket=None, unpushed_only=False):
    q = "SELECT * FROM proposals"
    clauses, args = [], []
    if bucket:
        clauses.append("bucket=?")
        args.append(bucket)
    if unpushed_only:
        clauses.append("pushed=0")
    if clauses:
        q += " WHERE " + " AND ".join(clauses)
    cur = conn.execute(q, args)
    return [dict(r) for r in cur.fetchall()]


def set_meta(conn, key, value, commit=True):
    conn.execute(
        "INSERT INTO run_meta(key,value) VALUES(?,?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, json.dumps(value, default=str)))
    if commit:
        conn.commit()


def get_meta(conn, key, default=None):
    cur = conn.execute("SELECT value FROM run_meta WHERE key=?", (key,))
    row = cur.fetchone()
    if not row:
        return default
    try:
        return json.loads(row[0])
    except Exception:
        return row[0]


def _count(conn, table, where=""):
    q = f"SELECT COUNT(*) FROM {table}"
    if where:
        q += " WHERE " + where
    return conn.execute(q).fetchone()[0]


def summary(conn):
    return {
        "communities_to_work": _count(conn, "communities_to_work"),
        "communities_unresearched": _count(conn, "communities_to_work", "researched=0"),
        "rejected_pairings": _count(conn, "rejected_pairings"),
        "rejected_pairings_seed": _count(conn, "rejected_pairings", "source='seed'"),
        "open_admin_items": _count(conn, "open_admin_items"),
        "proposals": _count(conn, "proposals"),
        "proposals_approved": _count(conn, "proposals", "bucket='approved'"),
        "proposals_needs_you": _count(conn, "proposals", "bucket='needs_you'"),
        "proposals_rejected": _count(conn, "proposals", "bucket='rejected'"),
    }


# ── reject-skip index (used by research.py) ──────────────────────────────────

def build_reject_index(rejected_rows):
    """Build a fast lookup from the rejected_pairings rows. Returns a dict with
    name-only skips and (key)->set-of-(field,value) entries."""
    name_skips = set()           # name_key with field='*' and value='*'
    id_skips = set()             # community_id with field='*' and value='*'
    pairs = set()                # (community_id|name_key, field, value)
    for r in rejected_rows:
        f = r.get("field_name") or "*"
        v = r.get("proposed_value") or "*"
        cid = r.get("community_id")
        nk = r.get("name_key") or name_key(r.get("community_name"))
        if f == "*" and v == "*":
            if cid:
                id_skips.add(cid)
            if nk:
                name_skips.add(nk)
            continue
        token = cid or nk
        if token:
            pairs.add((token, f, v))
    return {"name_skips": name_skips, "id_skips": id_skips, "pairs": pairs}


def is_rejected(idx, community_id, canonical_name, field_name=None, value=None):
    """True if this community (or community+field+value) is a known-bad match."""
    nk = name_key(canonical_name)
    if community_id and community_id in idx["id_skips"]:
        return True
    if nk and nk in idx["name_skips"]:
        return True
    if field_name is not None and value is not None:
        for token in (community_id, nk):
            if token and (token, field_name, str(value)) in idx["pairs"]:
                return True
    return False


# ── hard-coded safe auto-approve review rule ─────────────────────────────────

# Sunbiz registry fields are safe to auto-approve when sourced from Sunbiz.
SUNBIZ_REGISTRY_FIELDS = {
    "legal_name", "entity_status", "state_entity_number",
    "registered_agent", "registered_agent_address", "incorporation_date",
}
# These never auto-approve — always manual review.
ALWAYS_MANUAL_FIELDS = {
    "monthly_fee_min", "monthly_fee_max", "monthly_fee_median",
    "phone", "email", "amenities", "pet_restriction", "rental_approval",
    "str_restriction", "vehicle_restriction", "is_gated", "is_55_plus",
    "is_age_restricted", "unit_count",
}
_MGMT_GENERIC = {"association", "associations", "community", "communities",
                 "homeowners", "owners", "condominium", "hoa", "poa", "coa",
                 "the", "inc", "llc", "management", "company"}


def _domain_of(url):
    m = re.search(r"https?://([^/]+)", str(url or ""))
    host = (m.group(1) if m else str(url or "")).lower()
    return host[4:] if host.startswith("www.") else host


def _name_tokens(name):
    return {t for t in name_key(name).split() if len(t) > 3}


def auto_approve_bucket(field_name, value, source_type, confidence, canonical_name):
    """Hard-coded, safe review rule. Returns 'approved' or 'needs_you'.

    ONLY two things auto-approve:
      - Sunbiz registry fields sourced from Sunbiz -> approved.
      - subdivision_names that EXACTLY match the canonical name -> approved.
    Everything else is manual:
      - website_url and management_company NEVER auto-approve (search-derived
        sites are too often realtor/listing pages) -> needs_you.
      - fees, phone, email, amenities, news, legal, etc. -> needs_you.
    """
    field_name = (field_name or "").strip()
    src = (source_type or "").lower()

    if field_name in SUNBIZ_REGISTRY_FIELDS and src == "sunbiz":
        return "approved"

    if field_name == "subdivision_names":
        # exact alias only: normalized value must equal the canonical name
        if name_key(value) and name_key(value) == name_key(canonical_name):
            return "approved"
        return "needs_you"

    # website_url, management_company, fees, contacts, amenities, ... -> manual
    return "needs_you"
