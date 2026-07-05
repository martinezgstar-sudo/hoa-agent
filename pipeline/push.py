#!/usr/bin/env python3
"""
pipeline/push.py — THE EVENING TOUCH (one Supabase connection, one transaction).

Reads the REVIEWED proposals from the dated local snapshot and writes them back
to Supabase in a single Postgres transaction that rolls back whole on any error:

  bucket 'approved'  -> written live into communities (UPDATE)
  bucket 'needs_you' -> inserted into pending_community_data (status='pending',
                        auto_approvable=false) so it shows on the admin page
  bucket 'rejected'  -> inserted into pending_community_data (status='rejected'),
                        the permanent rejected list future pulls skip

A real transaction (BEGIN/COMMIT/ROLLBACK) requires a direct Postgres
connection, so this uses psycopg2 with a connection string. Provide it via one
of: SUPABASE_DB_URL / DATABASE_URL / POSTGRES_URL, or SUPABASE_DB_PASSWORD
(combined with project ref uacgzbojhjelzirvbphg). The PostgREST service-role key
alone cannot open a transactional DB session, so push refuses to run without a
DB connection string rather than doing non-atomic REST writes.

Usage:
  python3 pipeline/push.py --date 20260629           # real push
  python3 pipeline/push.py --date 20260629 --dry-run # rollback at the end
"""

import argparse
import os
from datetime import datetime

import local_db as db

PROJECT_REF = "uacgzbojhjelzirvbphg"

# Real communities columns a push may write (column allow-list; field_name is
# validated against this before being used as an SQL identifier).
ALLOWED_COLUMNS = {
    "management_company", "website_url", "legal_name", "entity_status",
    "state_entity_number", "registered_agent", "registered_agent_address",
    "incorporation_date", "unit_count",
    "monthly_fee_min", "monthly_fee_max", "monthly_fee_median",
    "amenities", "pet_restriction", "rental_approval", "str_restriction",
    "vehicle_restriction", "subdivision_names",
    "is_gated", "is_55_plus", "is_age_restricted", "phone", "email",
}


def log(msg):
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


def resolve_db_url():
    for k in ("SUPABASE_DB_URL", "DATABASE_URL", "POSTGRES_URL"):
        if os.environ.get(k):
            return os.environ[k]
    pw = os.environ.get("SUPABASE_DB_PASSWORD")
    ref = os.environ.get("SUPABASE_PROJECT_REF", PROJECT_REF)
    if pw:
        return (f"postgresql://postgres:{pw}@db.{ref}.supabase.co:5432/postgres"
                "?sslmode=require")
    return None


def main():
    ap = argparse.ArgumentParser(description="HOA pipeline — evening push")
    ap.add_argument("--date", default=None, help="Snapshot date YYYYMMDD")
    ap.add_argument("--path", default=None, help="Explicit snapshot path")
    ap.add_argument("--dry-run", action="store_true",
                    help="Build the transaction then ROLL BACK (no writes)")
    args = ap.parse_args()

    db.load_env()

    path = args.path or (db.snapshot_path(args.date) if args.date
                         else db.latest_snapshot())
    if not path or not os.path.exists(path):
        raise SystemExit("ERROR: no snapshot found.")
    conn, path = db.open_snapshot(create=False, path=path)
    log(f"snapshot: {path}")

    approved = db.get_proposals(conn, bucket="approved", unpushed_only=True)
    needs_you = db.get_proposals(conn, bucket="needs_you", unpushed_only=True)
    rejected = db.get_proposals(conn, bucket="rejected", unpushed_only=True)
    total = len(approved) + len(needs_you) + len(rejected)
    log(f"reviewed proposals: {len(approved)} approved, "
        f"{len(needs_you)} needs_you, {len(rejected)} rejected")
    if total == 0:
        conn.close()
        raise SystemExit("Nothing to push (no unpushed proposals). Stopping.")

    # Validate approved columns BEFORE opening any connection.
    bad = sorted({p["field_name"] for p in approved
                  if p["field_name"] not in ALLOWED_COLUMNS})
    if bad:
        conn.close()
        raise SystemExit(f"ERROR: approved proposals target unknown columns: {bad}")

    dsn = resolve_db_url()
    if not dsn:
        conn.close()
        raise SystemExit(
            "ERROR: no Postgres connection string. Set SUPABASE_DB_URL (or "
            "DATABASE_URL / POSTGRES_URL), or SUPABASE_DB_PASSWORD, so push can "
            "run a single atomic transaction. Refusing non-atomic writes.")

    import psycopg2
    from psycopg2 import sql

    pushed_ids = []
    pg = psycopg2.connect(dsn)
    log("Supabase Postgres connection opened (evening touch).")
    try:
        pg.autocommit = False
        cur = pg.cursor()

        # approved -> live into communities
        for p in approved:
            cur.execute(
                sql.SQL("UPDATE communities SET {col} = %s WHERE id = %s").format(
                    col=sql.Identifier(p["field_name"])),
                (p["proposed_value"], p["community_id"]))
            pushed_ids.append(p["id"])

        # needs_you -> pending_community_data (pending, manual review)
        for p in needs_you:
            cur.execute(
                "INSERT INTO pending_community_data "
                "(community_id, field_name, proposed_value, source_url, "
                " source_type, confidence, auto_approvable, status) "
                "VALUES (%s,%s,%s,%s,%s,%s,false,'pending')",
                (p["community_id"], p["field_name"], p["proposed_value"],
                 p["source_url"], p["source_type"], p["confidence"]))
            pushed_ids.append(p["id"])

        # rejected -> pending_community_data (rejected = permanent skip list)
        for p in rejected:
            cur.execute(
                "INSERT INTO pending_community_data "
                "(community_id, field_name, proposed_value, source_url, "
                " source_type, confidence, auto_approvable, status, reviewed_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,false,'rejected',now())",
                (p["community_id"], p["field_name"], p["proposed_value"],
                 p["source_url"], p["source_type"], p["confidence"]))
            pushed_ids.append(p["id"])

        if args.dry_run:
            pg.rollback()
            log("DRY RUN — transaction rolled back, nothing written.")
        else:
            pg.commit()
            log(f"COMMIT — {len(pushed_ids)} rows written in one transaction.")
    except Exception as e:
        pg.rollback()
        log(f"ERROR — transaction rolled back, nothing written: {e}")
        raise
    finally:
        pg.close()
        log("Supabase connection closed.")

    # Mark local proposals pushed only after a successful real commit.
    if not args.dry_run and pushed_ids:
        conn.executemany("UPDATE proposals SET pushed=1 WHERE id=?",
                         [(i,) for i in pushed_ids])
        db.set_meta(conn, "stage", "pushed")
        db.set_meta(conn, "pushed_at", datetime.now().isoformat())
        conn.commit()
    conn.close()

    print("\n── PUSH SUMMARY ─────────────────────────────")
    print(f"  approved -> communities         : {len(approved)}")
    print(f"  needs_you -> pending (pending)  : {len(needs_you)}")
    print(f"  rejected -> pending (rejected)  : {len(rejected)}")
    print(f"  mode                            : "
          f"{'DRY RUN (rolled back)' if args.dry_run else 'COMMITTED'}")
    print("─────────────────────────────────────────────")


if __name__ == "__main__":
    main()
