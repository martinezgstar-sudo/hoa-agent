"""
Duplicate community detection script.
Compares canonical_name + city to flag near-identical records.
Outputs a CSV report — does NOT delete anything.
"""
import os
import sys
import csv
from difflib import SequenceMatcher
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from supabase import create_client

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

SIMILARITY_THRESHOLD = 0.85
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "duplicates.csv")


def get_supabase():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: Missing SUPABASE env vars")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def normalize(s: str) -> str:
    s = s.lower().strip()
    for remove in [
        " homeowners association", " homeowners assoc", " hoa",
        " condominium association", " condo association", " condo assoc",
        " community association", " property owners association",
        ", inc.", ", inc", " inc.", " inc", " llc", ", llc",
        " at ", " of ", " the ",
    ]:
        s = s.replace(remove, " ")
    return " ".join(s.split())


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def fetch_all_communities(supabase):
    result = (
        supabase.table("communities")
        .select("id, canonical_name, city, slug, status")
        .eq("status", "published")
        .execute()
    )
    return result.data or []


def find_duplicates(communities):
    pairs = []
    seen = set()

    for i, a in enumerate(communities):
        norm_a = normalize(a["canonical_name"])
        city_a = (a.get("city") or "").lower().strip()

        for j, b in enumerate(communities):
            if j <= i:
                continue
            pair_key = tuple(sorted([a["id"], b["id"]]))
            if pair_key in seen:
                continue

            norm_b = normalize(b["canonical_name"])
            city_b = (b.get("city") or "").lower().strip()

            # Exact match on normalized name (any city)
            if norm_a == norm_b:
                seen.add(pair_key)
                pairs.append({
                    "id_a": a["id"],
                    "name_a": a["canonical_name"],
                    "city_a": a.get("city", ""),
                    "slug_a": a.get("slug", ""),
                    "id_b": b["id"],
                    "name_b": b["canonical_name"],
                    "city_b": b.get("city", ""),
                    "slug_b": b.get("slug", ""),
                    "similarity": 1.0,
                    "match_type": "exact_normalized",
                })
                continue

            # High-similarity match in same city
            if city_a and city_b and city_a == city_b:
                score = similarity(norm_a, norm_b)
                if score >= SIMILARITY_THRESHOLD:
                    seen.add(pair_key)
                    pairs.append({
                        "id_a": a["id"],
                        "name_a": a["canonical_name"],
                        "city_a": a.get("city", ""),
                        "slug_a": a.get("slug", ""),
                        "id_b": b["id"],
                        "name_b": b["canonical_name"],
                        "city_b": b.get("city", ""),
                        "slug_b": b.get("slug", ""),
                        "similarity": round(score, 3),
                        "match_type": "fuzzy_same_city",
                    })

    return pairs


def main():
    print("Duplicate Community Detector")

    supabase = get_supabase()
    communities = fetch_all_communities(supabase)
    print(f"Loaded {len(communities)} published communities")

    pairs = find_duplicates(communities)
    print(f"Found {len(pairs)} potential duplicate pairs")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "id_a", "name_a", "city_a", "slug_a",
            "id_b", "name_b", "city_b", "slug_b",
            "similarity", "match_type",
        ])
        writer.writeheader()
        writer.writerows(pairs)

    print(f"Report saved: {OUTPUT_FILE}")

    exact = sum(1 for p in pairs if p["match_type"] == "exact_normalized")
    fuzzy = sum(1 for p in pairs if p["match_type"] == "fuzzy_same_city")
    print(f"  Exact matches: {exact}")
    print(f"  Fuzzy same-city matches: {fuzzy}")

    if pairs:
        print("\nTop 10 duplicates:")
        for p in sorted(pairs, key=lambda x: -x["similarity"])[:10]:
            print(f"  [{p['similarity']:.2f}] '{p['name_a']}' ({p['city_a']}) <-> '{p['name_b']}' ({p['city_b']})")


if __name__ == "__main__":
    main()
