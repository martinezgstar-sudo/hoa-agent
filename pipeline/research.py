#!/usr/bin/env python3
"""
pipeline/research.py — FULLY OFFLINE research (NO Supabase, ever).

Reads only from the dated local SQLite snapshot. For each un-researched
community it uses the repo's existing local research code:
  - SearXNG + crawl4ai via scripts/lib/enrich_chain.py (chains.search / .fetch)
  - the compact local Sunbiz index (same schema as build-sunbiz-index.py)

Every finding is written to the local `proposals` table with a confidence and
source, bucketed by the hard-coded safe auto-approve rule. Community/field/value
pairs in rejected_pairings are skipped. A checkpoint (researched=1 + commit) is
written after each community so a crash resumes from the file.

This file must never import or open a Supabase connection. It does not import
local_db's Supabase callers because there are none — local_db is Supabase-free,
and the only network code here is the offline-capable enrich_chain search/fetch.

Usage:
  python3 pipeline/research.py                 # newest snapshot
  python3 pipeline/research.py --date 20260629 # a specific snapshot
  python3 pipeline/research.py --limit 5       # research only N communities
"""

import argparse
import json
import os
import re
import sqlite3
import sys
from datetime import datetime

import local_db as db

# Hard guard: research is offline. Make a Supabase touch impossible to do by
# accident — null out the env so any stray REST helper would fail loudly.
for _k in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
           "NEXT_PUBLIC_SUPABASE_ANON_KEY"):
    os.environ.pop(_k, None)

# Reuse the repo's search/fetch chains (SearXNG -> ... ; requests -> crawl4ai).
_REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SCRIPTS = os.path.join(_REPO, "scripts")
if _SCRIPTS not in sys.path:
    sys.path.insert(0, _SCRIPTS)
from lib.enrich_chain import build_chains, sunbiz_key  # noqa: E402

SUNBIZ_INDEX_PATH = os.environ.get("SUNBIZ_INDEX_PATH") or os.path.join(
    _REPO, ".enrich_state", "sunbiz-index", "sunbiz.db")

NON_OFFICIAL = [
    "zillow", "realtor", "trulia", "redfin", "homes.com", "movoto", "facebook",
    "instagram", "twitter", "x.com", "youtube", "tiktok", "linkedin",
    "pinterest", "yelp", "reddit", "google.", "bing.com", "duckduckgo",
    "wikipedia", "niche.com", "bestplaces", "neighborhoodscout",
    "apartments.com", "rent.com", "loopnet",
]

SUNBIZ_FIELDS = ["legal_name", "entity_status", "state_entity_number",
                 "incorporation_date", "registered_agent",
                 "registered_agent_address"]


def log(msg):
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


def _domain(url):
    m = re.search(r"https?://([^/]+)", url or "")
    h = (m.group(1) if m else "").lower()
    return h[4:] if h.startswith("www.") else h


def _tokens(name):
    return {t for t in db.name_key(name).split() if len(t) > 3}


def sunbiz_lookup(communities):
    """Resolve Sunbiz registry fields from the compact local index. Mirrors
    research-hoa-comprehensive.py.sunbiz_index_lookup. Returns {id: fields}."""
    out = {}
    if not os.path.exists(SUNBIZ_INDEX_PATH):
        log(f"[sunbiz] index absent ({SUNBIZ_INDEX_PATH}) — skipping Sunbiz tier")
        return out
    try:
        con = sqlite3.connect(f"file:{SUNBIZ_INDEX_PATH}?mode=ro", uri=True)
    except Exception as e:
        log(f"[sunbiz] index open failed ({e}) — skipping")
        return out
    try:
        cur = con.cursor()
        for c in communities:
            key = sunbiz_key(c.get("canonical_name", ""))
            if len(key) < 3:
                continue
            cur.execute(
                "SELECT legal_name, entity_status, state_entity_number, "
                "incorporation_date, registered_agent, registered_agent_address "
                "FROM entities WHERE name_key=? "
                "ORDER BY status_active DESC, incorporation_date DESC LIMIT 1",
                (key,))
            row = cur.fetchone()
            if not row:
                continue
            fields = {k: v for k, v in zip(SUNBIZ_FIELDS, row) if v}
            if fields:
                out[c["community_id"]] = (fields, row[2])  # row[2]=state_entity_number
    finally:
        con.close()
    log(f"[sunbiz] matched {len(out)}/{len(communities)} communities")
    return out


def pick_website(name, results):
    """Choose the most likely official website from search results.
    Returns (url, confidence) or (None, 0)."""
    toks = _tokens(name)
    for url, title, snippet in results:
        dom = _domain(url)
        if not dom or any(bad in dom for bad in NON_OFFICIAL):
            continue
        hit = sum(1 for t in toks if t in dom)
        if hit:
            # domain carries a real name token -> strong signal
            conf = 0.9 if hit >= 1 and len(toks) <= 2 else 0.85
            return url, conf
    return None, 0.0


def main():
    ap = argparse.ArgumentParser(description="HOA pipeline — offline research")
    ap.add_argument("--date", default=None, help="Snapshot date YYYYMMDD")
    ap.add_argument("--path", default=None, help="Explicit snapshot path")
    ap.add_argument("--limit", type=int, default=0, help="Max communities (0=all)")
    args = ap.parse_args()

    db.load_env()  # loads SEARXNG_URL / CRAWL4AI_* for the chains
    # Re-strip Supabase creds in case .env.local re-added them.
    for _k in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
               "NEXT_PUBLIC_SUPABASE_ANON_KEY"):
        os.environ.pop(_k, None)

    path = args.path or (db.snapshot_path(args.date) if args.date
                         else db.latest_snapshot())
    if not path or not os.path.exists(path):
        raise SystemExit("ERROR: no snapshot found. Run pull.py first.")
    conn, path = db.open_snapshot(create=False, path=path)
    log(f"snapshot: {path}")

    communities = db.get_unresearched_communities(conn)
    if args.limit:
        communities = communities[:args.limit]
    log(f"{len(communities)} communities to research")

    reject_idx = db.build_reject_index(db.get_rejected_pairings(conn))
    open_pairs = {(r["community_id"], r["field_name"])
                  for r in db.get_open_admin_items(conn)}

    chains = build_chains()
    sb_fields = sunbiz_lookup(communities)

    staged = skipped = 0
    for i, c in enumerate(communities, 1):
        cid = c["community_id"]
        name = c.get("canonical_name") or ""
        city = c.get("city") or ""
        raw = json.loads(c.get("raw_json") or "{}")

        if db.is_rejected(reject_idx, cid, name):
            log(f"[{i}/{len(communities)}] SKIP rejected community: {name}")
            db.set_community_researched(conn, cid)
            skipped += 1
            continue

        proposals = []  # (field, value, source_type, source_url, confidence)

        # 1. Sunbiz registry fields (offline local index)
        if cid in sb_fields:
            fields, doc = sb_fields[cid]
            for f, v in fields.items():
                if raw.get(f):           # already have it
                    continue
                proposals.append((f, v, "sunbiz", f"sunbiz-index://{doc}", 0.95))

        # 2. Website via SearXNG (offline-capable provider chain)
        if not raw.get("website_url"):
            try:
                results, provider, _ = chains.search(f'"{name}" {city} HOA')
            except Exception as e:
                results, provider = [], None
                log(f"  search error: {e}")
            url, conf = pick_website(name, results or [])
            if url:
                proposals.append(("website_url", url, "search", url, conf))

        # Filter: drop dupes vs open admin items and rejected (field,value) pairs
        for f, v, st, su, conf in proposals:
            if (cid, f) in open_pairs:
                continue
            if db.is_rejected(reject_idx, cid, name, f, str(v)):
                continue
            bucket = db.auto_approve_bucket(f, v, st, conf, name)
            db.insert_proposal(conn, cid, f, v, source_type=st, source_url=su,
                               confidence=conf, bucket=bucket, commit=False)
            staged += 1

        # 3. Checkpoint per community so a crash resumes from the file.
        db.set_community_researched(conn, cid, commit=False)
        conn.commit()
        if i % 25 == 0:
            log(f"  …{i}/{len(communities)} done, {staged} proposals staged")

    db.set_meta(conn, "stage", "researched")
    db.set_meta(conn, "researched_at", datetime.now().isoformat())
    s = db.summary(conn)
    db.set_meta(conn, "research_summary", s)
    conn.close()

    print("\n── RESEARCH SUMMARY ─────────────────────────")
    print(f"  proposals staged     : {staged}")
    print(f"  communities skipped  : {skipped} (rejected)")
    print(f"    approved (auto)    : {s['proposals_approved']}")
    print(f"    needs_you (manual) : {s['proposals_needs_you']}")
    print("─────────────────────────────────────────────")


if __name__ == "__main__":
    main()
