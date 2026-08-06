#!/usr/bin/env python3
"""
revalidate-changed.py — refresh only the community pages that actually changed.

Run in two phases around the weekly triage:

    revalidate-changed.py snapshot <state-file>
    ... claude triage runs, promoting pending rows onto communities ...
    revalidate-changed.py diff <state-file> [--dry-run]

Why a before/after snapshot rather than a timestamp window:

  * The promotion path (app/api/admin/pending/route.ts) never writes
    `updated_at` on communities, so a pure updated_at window would miss exactly
    the promotions this is meant to catch.
  * 11 of ~2,082 approved pending rows carry a NULL `reviewed_at`, so a
    reviewed_at window silently drops that class too.
  * The triage agent is an LLM following a prompt. It is told to mark rows
    "approved/applied" — the exact string is not guaranteed. So we track rows
    LEAVING 'pending' rather than arriving at any particular status.

Three independent change vectors are unioned:

  1. pending_community_data rows that left 'pending'   (field promotions)
  2. pending_fee_observations rows that left 'pending' (fee promotions — a
     different table, missed entirely if you only watch the first)
  3. communities.updated_at newer than the snapshot    (direct admin edits,
     which DO set updated_at)

Emits the refreshed slugs on stdout. admin-triage-run.sh runs under
job-wrap.sh, which captures stdout into job_runs.summary, so the weekly run
record shows exactly which pages were refreshed with no extra logging.
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ENV_FILE = "/Users/izzymartinez/Projects/hoa-agent/.env.local"
SITE = os.environ.get("REVALIDATE_SITE", "https://www.hoa-agent.com")
PAGE = 1000  # PostgREST page size for id pulls


def log(msg):
    print(f"[{datetime.now():%F %T}] {msg}", flush=True)


def load_env(path):
    env = {}
    try:
        with open(path) as fh:
            for line in fh:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return env


ENV = load_env(ENV_FILE)


def cfg(name):
    return os.environ.get(name) or ENV.get(name) or ""


SUPABASE_URL = cfg("NEXT_PUBLIC_SUPABASE_URL").rstrip("/")
SERVICE_KEY = cfg("SUPABASE_SERVICE_ROLE_KEY")
REVALIDATE_SECRET = cfg("REVALIDATE_SECRET")

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}


def get(path):
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode() or "[]")


def all_rows(path_tpl):
    """Page through PostgREST rather than trusting a single default-limited call."""
    out, offset = [], 0
    while True:
        sep = "&" if "?" in path_tpl else "?"
        batch = get(f"{path_tpl}{sep}limit={PAGE}&offset={offset}")
        out.extend(batch)
        if len(batch) < PAGE:
            return out
        offset += PAGE


def pending_ids(table):
    return {r["id"] for r in all_rows(f"{table}?status=eq.pending&select=id")}


def snapshot(state_path):
    state = {
        "taken_at": datetime.now(timezone.utc).isoformat(),
        "pending_community_data": sorted(pending_ids("pending_community_data")),
        "pending_fee_observations": sorted(pending_ids("pending_fee_observations")),
    }
    with open(state_path, "w") as fh:
        json.dump(state, fh)
    log(
        f"snapshot: {len(state['pending_community_data'])} pending data rows, "
        f"{len(state['pending_fee_observations'])} pending fee rows, at {state['taken_at']}"
    )
    return 0


def slugs_for(community_ids):
    """Map community_id -> slug, chunked to keep the URL a sane length."""
    slugs, ids = set(), [i for i in community_ids if i]
    for i in range(0, len(ids), 50):
        chunk = ids[i : i + 50]
        joined = ",".join(chunk)
        for row in get(f"communities?id=in.({joined})&select=slug,status"):
            # Only published pages exist to revalidate.
            if row.get("slug") and row.get("status") == "published":
                slugs.add(row["slug"])
    return slugs


def left_pending(table, before_ids):
    """community_ids of rows that were pending before and are not pending now."""
    if not before_ids:
        return set()
    still = pending_ids(table)
    gone = set(before_ids) - still
    if not gone:
        return set()
    out, gone_list = set(), sorted(gone)
    for i in range(0, len(gone_list), 50):
        joined = ",".join(gone_list[i : i + 50])
        for row in get(f"{table}?id=in.({joined})&select=community_id"):
            if row.get("community_id"):
                out.add(row["community_id"])
    return out


def revalidate(slug, dry):
    url = f"{SITE}/api/revalidate?secret={urllib.parse.quote(REVALIDATE_SECRET)}&slug={urllib.parse.quote(slug)}"
    if dry:
        log(f"  [dry-run] would revalidate /community/{slug}")
        return True
    req = urllib.request.Request(url, data=b"", method="POST")
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            ok = resp.status == 200
            log(f"  revalidated /community/{slug} ({resp.status})")
            return ok
    except urllib.error.HTTPError as e:
        log(f"  FAILED /community/{slug}: {e.code} {e.read().decode()[:120]}")
        return False
    except Exception as e:  # noqa: BLE001 - never let one slug abort the run
        log(f"  FAILED /community/{slug}: {e}")
        return False


def diff(state_path, dry):
    try:
        with open(state_path) as fh:
            state = json.load(fh)
    except FileNotFoundError:
        log(f"no snapshot at {state_path} — nothing to compare, skipping revalidation")
        return 0

    changed = set()
    changed |= left_pending("pending_community_data", state.get("pending_community_data", []))
    n_data = len(changed)
    changed |= left_pending("pending_fee_observations", state.get("pending_fee_observations", []))
    n_fee = len(changed) - n_data

    slugs = slugs_for(changed)

    # Third vector: direct edits. These DO set updated_at, unlike the promotion
    # path, so this catches admin edits the queue diff cannot see.
    taken_at = state.get("taken_at")
    direct = set()
    if taken_at:
        q = f"communities?updated_at=gt.{urllib.parse.quote(taken_at)}&status=eq.published&select=slug"
        direct = {r["slug"] for r in all_rows(q) if r.get("slug")}
    before_union = len(slugs)
    slugs |= direct

    log(
        f"changed: {n_data} via pending_community_data, {n_fee} via pending_fee_observations, "
        f"{len(direct)} via communities.updated_at ({len(slugs) - before_union} of those new)"
    )

    if not slugs:
        log("REVALIDATED SLUGS: none — no community changed this run")
        return 0

    ok = sum(1 for s in sorted(slugs) if revalidate(s, dry))
    log(f"REVALIDATED SLUGS ({ok}/{len(slugs)} ok): {' '.join(sorted(slugs))}")
    return 0 if ok == len(slugs) else 1


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    mode, state_path = sys.argv[1], sys.argv[2]
    dry = "--dry-run" in sys.argv

    if not SUPABASE_URL or not SERVICE_KEY:
        log("missing Supabase credentials — skipping (job continues)")
        return 0
    if mode == "diff" and not REVALIDATE_SECRET and not dry:
        log("REVALIDATE_SECRET not set — skipping revalidation (job continues)")
        return 0

    if mode == "snapshot":
        return snapshot(state_path)
    if mode == "diff":
        return diff(state_path, dry)
    log(f"unknown mode: {mode}")
    return 2


if __name__ == "__main__":
    sys.exit(main())
