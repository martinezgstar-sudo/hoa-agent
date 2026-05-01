"""
One-time script: Insert Solcera community into Supabase.
Community: Solcera by Mattamy Homes, West Palm Beach FL 33415
"""
import os
import sys
import re
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from supabase import create_client

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def slugify(s):
    s = s.lower()
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"[\s]+", "-", s.strip())
    return s


def main():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: Missing SUPABASE env vars")
        sys.exit(1)

    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    canonical_name = "Solcera Homeowners Association"
    slug = slugify(canonical_name)

    # Check if already exists
    existing = (
        supabase.table("communities")
        .select("id, canonical_name")
        .ilike("canonical_name", "%Solcera%")
        .execute()
    )
    if existing.data:
        print(f"Solcera already exists: {existing.data[0]}")
        return

    # Check slug uniqueness
    slug_check = supabase.table("communities").select("id").eq("slug", slug).execute()
    suffix = 2
    base_slug = slug
    while slug_check.data:
        slug = f"{base_slug}-{suffix}"
        suffix += 1
        slug_check = supabase.table("communities").select("id").eq("slug", slug).execute()

    payload = {
        "canonical_name": canonical_name,
        "slug": slug,
        "city": "West Palm Beach",
        "county": "Palm Beach",
        "state": "FL",
        "zip_code": "33415",
        "street_address": "Pointe of Woods Drive, West Palm Beach, FL 33415",
        "property_type": "Single Family",
        "monthly_fee_min": 259,
        "monthly_fee_max": 267,
        "monthly_fee_median": 263,
        "amenities": "Pool, Clubhouse, Playground, Dog Park, Walking Trails, Gated",
        "status": "published",
        "subdivision_aliases": ["Pointe of Woods", "Pointe of Woods PUD", "Solcera"],
    }

    result = supabase.table("communities").insert(payload).execute()
    if result.data:
        print(f"Inserted Solcera: id={result.data[0]['id']}, slug={slug}")
    else:
        print(f"ERROR inserting Solcera")


if __name__ == "__main__":
    main()
