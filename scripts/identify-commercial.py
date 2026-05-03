#!/usr/bin/env python3
"""
identify-commercial.py

Scan every published community by name + property_type and flag candidates
that look commercial (office park, business center, storage, etc).

Outputs:
  scripts/output/commercial-candidates.json
  scripts/output/commercial-unclear.json
"""
import json
import os
import sys
import warnings
import requests

warnings.filterwarnings("ignore")
from dotenv import load_dotenv  # noqa: E402

load_dotenv(".env.local", override=True)
URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}

# Strong commercial indicators (uppercase substring match)
COMMERCIAL_TERMS = [
    "COMMERCIAL", "BUSINESS PARK", "OFFICE PARK", "INDUSTRIAL", "RETAIL",
    "SHOPPING CENTER", "SHOPPING PLAZA", "PROFESSIONAL CENTER",
    "MEDICAL CENTER", "MEDICAL PLAZA", "CORPORATE CENTER", "CORPORATE PARK",
    "COMMERCE CENTER", "COMMERCE PARK", "WAREHOUSE", "SELF STORAGE",
    "MINI STORAGE", "LIGHT INDUSTRIAL", "MIXED USE", "MIXED-USE",
    "BUSINESS CENTER", "TECH PARK", "RESEARCH PARK", "PROFESSIONAL PARK",
    "EXECUTIVE CENTER", "EXECUTIVE PARK", "OFFICE BUILDING", "OFFICE COMPLEX",
    "PROFESSIONAL SUITES", "BUSINESS SUITES",
]

# Commercial-leaning LLC suffixes — only flag when there's no residential override
LLC_COMMERCIAL = [
    "PROPERTIES LLC", "INVESTMENTS LLC", "REAL ESTATE LLC", "HOLDINGS LLC",
    "DEVELOPMENT LLC", "VENTURES LLC", "ENTERPRISES LLC", "MANAGEMENT LLC",
    "SERVICES LLC", "REALTY LLC",
]

# If any of these residential terms appear, override the commercial flag
RESIDENTIAL_OVERRIDE = [
    "RESIDENTIAL", "CONDO", "CONDOMINIUM", "TOWNHOME", "TOWNHOUSE", "VILLAS",
    "APARTMENTS", "HOMES", "HOMEOWNERS", "HOA", "COMMUNITY", "VILLAGE",
    "ESTATES", "GARDENS", "TERRACE", "PLACE", "COURT", "LANDING",
    "POINTE", "POINT", "SHORES", "HEIGHTS", "RIDGE", "GROVE",
    "CLUB", "COUNTRY CLUB", "GOLF", "BEACH", "LAKE", "LAKES",
    "PALMS", "PINES", "OAKS",
]


def fetch_all_published():
    """Paginate through all published communities."""
    rows = []
    PAGE = 1000
    offset = 0
    for _ in range(30):  # safety cap at 30k rows
        r = requests.get(
            f"{URL}/rest/v1/communities"
            f"?select=id,canonical_name,city,property_type,unit_count,management_company,status"
            f"&status=eq.published"
            f"&order=canonical_name.asc&limit={PAGE}&offset={offset}",
            headers=H,
        )
        if r.status_code != 200:
            print(f"  ERROR at offset {offset}: {r.status_code} {r.text[:100]}")
            break
        batch = r.json()
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return rows


def classify(name: str, property_type: str) -> tuple[bool, bool, list]:
    """Returns (is_commercial_candidate, is_unclear, hits)."""
    upper = (name or "").upper()
    hits = [t for t in COMMERCIAL_TERMS if t in upper]
    llc_hits = [t for t in LLC_COMMERCIAL if t in upper]
    res_hits = [t for t in RESIDENTIAL_OVERRIDE if t in upper]
    pt_upper = (property_type or "").upper()

    # Direct commercial keyword
    if hits:
        if res_hits:
            # Mixed signals — keep for manual review
            return False, True, hits + ["+RESIDENTIAL_TERMS:" + ",".join(res_hits[:2])]
        return True, False, hits

    # Commercial property_type signal
    if any(k in pt_upper for k in ("COMMERCIAL", "OFFICE", "INDUSTRIAL", "RETAIL", "WAREHOUSE", "STORAGE")):
        if res_hits:
            return False, True, ["property_type:" + property_type, "+RESIDENTIAL_TERMS"]
        return True, False, ["property_type:" + property_type]

    # LLC suffix — only suggestive, must lack residential override
    if llc_hits and not res_hits:
        return False, True, llc_hits + ["uncertain_LLC_suffix"]

    return False, False, []


def main():
    print("Fetching all published communities…")
    rows = fetch_all_published()
    print(f"Loaded {len(rows)} communities")

    candidates = []
    unclear = []
    for c in rows:
        is_c, is_u, hits = classify(c.get("canonical_name") or "", c.get("property_type") or "")
        if is_c:
            candidates.append({**c, "indicator_hits": hits})
        elif is_u:
            unclear.append({**c, "indicator_hits": hits})

    out_dir = "scripts/output"
    os.makedirs(out_dir, exist_ok=True)
    with open(f"{out_dir}/commercial-candidates.json", "w") as f:
        json.dump(candidates, f, indent=2)
    with open(f"{out_dir}/commercial-unclear.json", "w") as f:
        json.dump(unclear, f, indent=2)

    print()
    print(f"Total scanned: {len(rows)}")
    print(f"Commercial candidates (auto-flag): {len(candidates)}")
    print(f"Unclear (mixed signals): {len(unclear)}")
    print()
    print("Sample commercial candidates:")
    for c in candidates[:10]:
        print(f"  {c['canonical_name'][:55]:<55}  {c.get('property_type','—'):<15}  hits={c['indicator_hits'][:2]}")
    print()
    print("Sample unclear:")
    for c in unclear[:5]:
        print(f"  {c['canonical_name'][:55]:<55}  hits={c['indicator_hits'][:2]}")


if __name__ == "__main__":
    main()
