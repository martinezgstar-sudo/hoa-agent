#!/usr/bin/env python3
"""
apply-city-corrections.py

Apply ZIP-based city corrections from city-corrections.json.
SAFE: only updates city + city_verified, preserves status=published filter.

Usage:
  python3 scripts/apply-city-corrections.py --dry-run   (preview only)
  python3 scripts/apply-city-corrections.py             (apply for real)
  python3 scripts/apply-city-corrections.py --limit 1   (test on one row)
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
    "apikey": KEY, "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json", "Prefer": "return=minimal",
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="scripts/output/city-corrections.json")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"ERROR: {args.input} not found")
        sys.exit(1)

    with open(args.input) as f:
        rows = json.load(f)
    if args.limit:
        rows = rows[: args.limit]

    print(f"Total corrections to apply: {len(rows)}")
    if args.dry_run:
        print("\nDRY RUN — first 5:")
        for c in rows[:5]:
            print(f"  {c['canonical_name'][:55]:<55} '{c['current_city']}' → '{c['correct_city']}'")
        return

    log_rows = []
    success = 0
    failed = 0
    for i, c in enumerate(rows, 1):
        cid = c["id"]
        new_city = c["correct_city"]
        r = requests.patch(
            f"{URL}/rest/v1/communities?id=eq.{cid}&status=eq.published",
            headers=H,
            json={"city": new_city, "city_verified": True, "updated_at": "now()"},
        )
        if r.status_code in (200, 204):
            success += 1
            log_rows.append({
                "id": cid,
                "canonical_name": c["canonical_name"],
                "old_city": c["current_city"],
                "new_city": new_city,
                "method": c.get("method", "zip_lookup"),
                "zip_code": c.get("zip_code", ""),
                "corrected_at": datetime.now().isoformat(),
            })
        else:
            failed += 1
            print(f"  FAIL {cid}: {r.status_code} {r.text[:80]}")

        if i % 100 == 0:
            print(f"  Progress: {i}/{len(rows)} (success={success} fail={failed})")

    csv_path = f"scripts/output/city-corrections-applied-{datetime.now().strftime('%Y%m%d')}.csv"
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["id","canonical_name","old_city","new_city","method","zip_code","corrected_at"])
        writer.writeheader()
        writer.writerows(log_rows)

    print()
    print(f"Successful updates: {success}")
    print(f"Failed updates:     {failed}")
    print(f"Log saved:          {csv_path}")


if __name__ == "__main__":
    main()
