#!/usr/bin/env python3
"""
remove-commercial.py

Unpublish AI-confirmed commercial associations from confirmed-commercial.json
(produced by verify-commercial-ai.py).

Sets status=draft only for rows currently published — same safety pattern as
apply-city-corrections.py.

Usage:
  python3 scripts/remove-commercial.py --dry-run
  python3 scripts/remove-commercial.py --limit 5
  python3 scripts/remove-commercial.py
"""
import argparse
import csv
import json
import os
import sys
import warnings
from datetime import datetime

warnings.filterwarnings("ignore")
import requests
from dotenv import load_dotenv

load_dotenv(".env.local", override=True)
URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
H = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="scripts/output/confirmed-commercial.json")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"ERROR: {args.input} not found — run verify-commercial-ai.py first")
        sys.exit(1)

    with open(args.input) as f:
        rows = json.load(f)
    if not isinstance(rows, list):
        print("ERROR: input must be a JSON array")
        sys.exit(1)
    if args.limit:
        rows = rows[: args.limit]

    print(f"Confirmed commercial rows to unpublish: {len(rows)}")
    if args.dry_run:
        print("\nDRY RUN — first 8:")
        for c in rows[:8]:
            print(f"  {c.get('canonical_name','')[:60]}  id={c.get('id')}")
        return

    ok = bad = 0
    log_rows = []
    for i, c in enumerate(rows, 1):
        cid = c.get("id")
        if not cid:
            bad += 1
            continue
        r = requests.patch(
            f"{URL}/rest/v1/communities?id=eq.{cid}&status=eq.published",
            headers=H,
            json={"status": "draft", "updated_at": "now()"},
        )
        if r.status_code in (200, 204):
            ok += 1
            log_rows.append({
                "id": cid,
                "canonical_name": c.get("canonical_name", ""),
                "confidence": c.get("confidence", ""),
                "reason": (c.get("reason") or "")[:200],
                "unpublished_at": datetime.now().isoformat(),
            })
        else:
            bad += 1
            print(f"  FAIL {cid}: {r.status_code} {r.text[:120]}")

        if i % 50 == 0:
            print(f"  Progress: {i}/{len(rows)} (ok={ok} fail={bad})")

    csv_path = f"scripts/output/commercial-removed-{datetime.now().strftime('%Y%m%d')}.csv"
    with open(csv_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(log_rows[0].keys()) if log_rows else
                           ["id", "canonical_name", "confidence", "reason", "unpublished_at"])
        w.writeheader()
        w.writerows(log_rows)

    print()
    print(f"Unpublished (draft): {ok}")
    print(f"Failed / skipped:    {bad}")
    print(f"Log:                  {csv_path}")


if __name__ == "__main__":
    main()
