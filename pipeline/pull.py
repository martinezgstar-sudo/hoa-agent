#!/usr/bin/env python3
"""
pipeline/pull.py — THE MORNING TOUCH (one Supabase connection, reads only).

Opens a single keep-alive connection to Supabase, runs a small set of batched
read queries, fills the dated local SQLite snapshot, then closes the connection.
After this runs, Supabase is NOT touched again until push.py.

It pulls three things into the snapshot:
  1. communities_to_work  — communities that still need core fields
  2. rejected_pairings    — known-bad matches to skip (Supabase rejected rows
                            + the hard-coded seed list)
  3. open_admin_items     — current pending_community_data rows (status=pending)

Usage:
  python3 pipeline/pull.py                 # cap 400 (default)
  python3 pipeline/pull.py --cap 10        # tiny dry-run pull
  python3 pipeline/pull.py --status published --date 20260629
"""

import argparse
import os
import time
from datetime import datetime

import requests

import local_db as db  # same-folder import (run from pipeline/ or via -m)

# Communities are "core-incomplete" when this field is null. Matches the legacy
# enricher's primary selection signal (management_company is.null).
CORE_NULL_FIELD = "management_company"

# Columns pulled for each community: identity + every researchable field, so
# research.py has full context offline.
SELECT_COLS = ",".join([
    "id", "canonical_name", "slug", "city", "status",
    "website_url", "management_company", "legal_name", "entity_status",
    "state_entity_number", "registered_agent", "registered_agent_address",
    "incorporation_date", "unit_count",
    "monthly_fee_min", "monthly_fee_max", "monthly_fee_median",
    "amenities", "pet_restriction", "rental_approval", "str_restriction",
    "vehicle_restriction", "subdivision_names",
    "is_gated", "is_55_plus", "is_age_restricted",
    "phone", "email", "updated_at",
])

# Hard-coded known-bad communities we must never re-research (field/value '*').
SEED_REJECTED = [
    {"community_name": "Cresthaven No. 34", "reason": "known bad match (seed)"},
    {"community_name": "Lena Lane East",    "reason": "known bad match (seed)"},
    {"community_name": "Odyssey",           "reason": "known bad match (seed)"},
    {"community_name": "Cypress Lakes 9",   "reason": "known bad match (seed)"},
]

PCD = "pending_community_data"


def log(msg):
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


class Supabase:
    """A single authenticated keep-alive connection to Supabase PostgREST."""

    def __init__(self):
        self.url = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or \
            os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or ""
        if not self.url or not key:
            raise SystemExit("ERROR: Supabase URL / key missing from environment "
                             "(.env.local). Cannot pull.")
        self.s = requests.Session()
        self.s.headers.update({
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        })

    def get(self, table, params):
        r = self.s.get(f"{self.url}/rest/v1/{table}", params=params, timeout=30)
        r.raise_for_status()
        return r.json()

    def close(self):
        self.s.close()


def main():
    ap = argparse.ArgumentParser(description="HOA pipeline — morning pull")
    ap.add_argument("--cap", type=int, default=400,
                    help="Max communities to pull (default 400)")
    ap.add_argument("--needs", default="management_company",
                    choices=["management_company", "sunbiz"],
                    help="selection: 'management_company' (mgmt co null) or "
                         "'sunbiz' (legal_name OR state_entity_number null)")
    ap.add_argument("--status", default="published", help="Community status filter")
    ap.add_argument("--date", default=None, help="Snapshot date YYYYMMDD (default today)")
    args = ap.parse_args()

    db.load_env()

    conn, path = db.open_snapshot(date=args.date, create=True)
    log(f"snapshot: {path}")

    t0 = time.time()
    sb = Supabase()
    log("Supabase connection opened (morning touch).")
    try:
        # 1. communities needing core fields
        comm_params = {
            "status": f"eq.{args.status}",
            "order": "updated_at.asc",
            "limit": str(args.cap),
            "select": SELECT_COLS,
        }
        if args.needs == "sunbiz":
            # missing Sunbiz registry fields: legal_name OR state_entity_number null
            comm_params["or"] = "(legal_name.is.null,state_entity_number.is.null)"
        else:
            comm_params[CORE_NULL_FIELD] = "is.null"
        communities = sb.get("communities", comm_params)
        n_comm = db.upsert_communities(conn, communities)
        log(f"communities_to_work: pulled {n_comm} (cap {args.cap}, needs={args.needs})")

        # 2. rejected pairings: seed list + Supabase rejected rows
        n_seed = db.upsert_rejected_pairings(
            conn, [dict(r, source="seed", field_name="*", proposed_value="*")
                   for r in SEED_REJECTED])
        rejected_rows = sb.get(PCD, {
            "status": "eq.rejected",
            "select": "community_id,field_name,proposed_value",
            "limit": "100000",
        })
        n_rej = db.upsert_rejected_pairings(conn, [
            {"community_id": r.get("community_id"),
             "field_name": r.get("field_name") or "*",
             "proposed_value": r.get("proposed_value") or "*",
             "reason": "previously rejected in Supabase", "source": "supabase"}
            for r in rejected_rows])
        log(f"rejected_pairings: {n_seed} seed + {n_rej} from Supabase "
            f"= {n_seed + n_rej}")

        # 3. open admin items (currently pending) to avoid duplicates
        pending_rows = sb.get(PCD, {
            "status": "eq.pending",
            "select": "id,community_id,field_name,proposed_value,"
                      "source_type,confidence,created_at",
            "limit": "100000",
        })
        n_open = db.upsert_open_admin_items(conn, pending_rows)
        log(f"open_admin_items: {n_open} pending rows")
    finally:
        sb.close()
        log("Supabase connection closed. No further Supabase access until push.")

    db.set_meta(conn, "stage", "pulled")
    db.set_meta(conn, "run_date", args.date or datetime.now().strftime("%Y%m%d"))
    db.set_meta(conn, "cap", args.cap)
    db.set_meta(conn, "status_filter", args.status)
    db.set_meta(conn, "pulled_at", datetime.now().isoformat())

    s = db.summary(conn)
    db.set_meta(conn, "pull_summary", s)
    conn.close()

    dt = time.time() - t0
    print("\n── PULL SUMMARY ─────────────────────────────")
    print(f"  snapshot file        : {path}")
    print(f"  communities_to_work  : {s['communities_to_work']}")
    print(f"  rejected_pairings    : {s['rejected_pairings']} "
          f"(seed {s['rejected_pairings_seed']})")
    print(f"  open_admin_items     : {s['open_admin_items']}")
    print(f"  elapsed              : {dt:.1f}s")
    print("─────────────────────────────────────────────")


if __name__ == "__main__":
    main()
