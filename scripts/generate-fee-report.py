"""
Palm Beach County HOA Fee Report 2026.
Pulls all communities with fee data from Supabase and calculates:
  - Average and median monthly fee by city
  - Highest and lowest fee communities
  - Fee distribution buckets
Outputs: scripts/output/fee-report-2026.json and fee-report-2026.csv
"""
import os
import sys
import json
import csv
import statistics
from collections import defaultdict
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from supabase import create_client

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
JSON_FILE = os.path.join(OUTPUT_DIR, "fee-report-2026.json")
CSV_FILE = os.path.join(OUTPUT_DIR, "fee-report-2026.csv")


def get_supabase():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: Missing SUPABASE env vars")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def fetch_communities(supabase):
    result = (
        supabase.table("communities")
        .select("id, canonical_name, city, monthly_fee_min, monthly_fee_max, monthly_fee_median, property_type")
        .eq("status", "published")
        .not_.is_("monthly_fee_min", "null")
        .execute()
    )
    return result.data or []


def safe_float(val):
    try:
        f = float(val)
        return f if 0 < f < 100_000 else None
    except (TypeError, ValueError):
        return None


def fee_bucket(fee):
    if fee < 200:
        return "under_200"
    elif fee < 400:
        return "200_to_400"
    elif fee < 600:
        return "400_to_600"
    else:
        return "over_600"


def main():
    print("Palm Beach County HOA Fee Report 2026")
    supabase = get_supabase()
    communities = fetch_communities(supabase)
    print(f"Loaded {len(communities)} communities with fee data")

    # Build representative fee per community (prefer median, else midpoint, else min)
    records = []
    for c in communities:
        fee_min = safe_float(c.get("monthly_fee_min"))
        fee_max = safe_float(c.get("monthly_fee_max"))
        fee_med = safe_float(c.get("monthly_fee_median"))

        if fee_med:
            rep_fee = fee_med
        elif fee_min and fee_max:
            rep_fee = (fee_min + fee_max) / 2
        elif fee_min:
            rep_fee = fee_min
        else:
            continue

        records.append({
            "id": c["id"],
            "canonical_name": c["canonical_name"],
            "city": (c.get("city") or "Unknown").strip(),
            "property_type": c.get("property_type") or "HOA",
            "monthly_fee_min": fee_min,
            "monthly_fee_max": fee_max,
            "monthly_fee_median": fee_med,
            "rep_fee": round(rep_fee, 2),
        })

    print(f"Usable records: {len(records)}")

    # --- By city ---
    by_city = defaultdict(list)
    for r in records:
        by_city[r["city"]].append(r["rep_fee"])

    city_stats = []
    for city, fees in sorted(by_city.items()):
        if len(fees) < 2:
            continue
        city_stats.append({
            "city": city,
            "count": len(fees),
            "average": round(statistics.mean(fees), 2),
            "median": round(statistics.median(fees), 2),
            "min": round(min(fees), 2),
            "max": round(max(fees), 2),
        })
    city_stats.sort(key=lambda x: -x["count"])

    # --- Distribution buckets ---
    buckets = {"under_200": 0, "200_to_400": 0, "400_to_600": 0, "over_600": 0}
    for r in records:
        buckets[fee_bucket(r["rep_fee"])] += 1

    # --- Highest / lowest ---
    sorted_by_fee = sorted(records, key=lambda x: x["rep_fee"])
    lowest_10 = [{"name": r["canonical_name"], "city": r["city"], "fee": r["rep_fee"]} for r in sorted_by_fee[:10]]
    highest_10 = [{"name": r["canonical_name"], "city": r["city"], "fee": r["rep_fee"]} for r in sorted_by_fee[-10:][::-1]]

    # --- Overall stats ---
    all_fees = [r["rep_fee"] for r in records]
    overall = {
        "total_communities_with_fees": len(records),
        "overall_average": round(statistics.mean(all_fees), 2),
        "overall_median": round(statistics.median(all_fees), 2),
        "overall_min": round(min(all_fees), 2),
        "overall_max": round(max(all_fees), 2),
    }

    report = {
        "generated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "title": "Palm Beach County HOA Fee Report 2026",
        "overall": overall,
        "fee_distribution": buckets,
        "by_city": city_stats,
        "lowest_fee_communities": lowest_10,
        "highest_fee_communities": highest_10,
    }

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    with open(JSON_FILE, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"JSON saved: {JSON_FILE}")

    # CSV: by_city stats
    with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["city", "count", "average", "median", "min", "max"])
        writer.writeheader()
        writer.writerows(city_stats)
    print(f"CSV saved: {CSV_FILE}")

    print(f"\nOverall: avg=${overall['overall_average']}, median=${overall['overall_median']}, range=${overall['overall_min']}-${overall['overall_max']}")
    print(f"\nDistribution:")
    for k, v in buckets.items():
        pct = round(100 * v / len(records), 1) if records else 0
        print(f"  {k}: {v} ({pct}%)")
    print(f"\nTop cities by community count:")
    for s in city_stats[:10]:
        print(f"  {s['city']}: {s['count']} communities, median ${s['median']}/mo")


if __name__ == "__main__":
    main()
