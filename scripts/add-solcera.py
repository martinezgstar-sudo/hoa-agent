"""
One-time script: Insert Solcera community into Supabase.
Community: Solcera by Mattamy Homes, West Palm Beach FL 33415
"""
import os
import sys
import re
import importlib.util
from datetime import date
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from supabase import create_client

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# Load the dedupe helper (filename has a hyphen, so import via spec)
_DEDUPE_PATH = os.path.join(os.path.dirname(__file__), "lib", "dedupe-check.py")
_spec = importlib.util.spec_from_file_location("dedupe_check", _DEDUPE_PATH)
dedupe_check = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dedupe_check)


def _log_skip(reason: str, name: str, existing_id: str = ""):
    """Append to scripts/output/dedupe-skipped-<date>.txt."""
    out_dir = os.path.join(os.path.dirname(__file__), "output")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"dedupe-skipped-{date.today().isoformat()}.txt")
    with open(path, "a") as f:
        f.write(f"[add-solcera] {reason} · name={name!r} · existing_id={existing_id}\n")


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

    # Check if already exists (legacy ilike test, kept as a fast-path)
    existing = (
        supabase.table("communities")
        .select("id, canonical_name")
        .ilike("canonical_name", "%Solcera%")
        .execute()
    )
    if existing.data:
        print(f"Solcera already exists: {existing.data[0]}")
        _log_skip("ilike-prefilter hit", canonical_name, existing.data[0].get("id", ""))
        return

    # Dedupe check per CLAUDE.md rule #15 — never insert a duplicate community
    dup_id = dedupe_check.check_for_duplicate(
        supabase,
        canonical_name,
        master_hoa_id=None,
        zip_code="33415",
    )
    if dup_id:
        print(f"Dedupe-check matched existing community {dup_id}; skipping insert.")
        _log_skip("fuzzy-match hit", canonical_name, dup_id)
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
