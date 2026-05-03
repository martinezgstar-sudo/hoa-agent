#!/usr/bin/env python3
"""
verify-locations.py

For every published community:
  - If zip_code is a known PBC ZIP, check city matches expected city.
  - If zip_code starts with 33 but isn't PBC → wrong-zip-review.json
  - If zip_code starts with anything else → wrong-zip-review.json (definitely outside FL)
  - If name contains a city indicator that disagrees with current city → flag
  - If zip_code is null → no-zip-communities.json

Outputs:
  scripts/output/city-corrections.json
  scripts/output/wrong-zip-review.json
  scripts/output/no-zip-communities.json
  scripts/output/name-city-mismatch.json
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

PBC_ZIPS = {
    '33401':'West Palm Beach','33402':'West Palm Beach','33403':'West Palm Beach',
    '33404':'West Palm Beach','33405':'West Palm Beach','33406':'West Palm Beach',
    '33407':'West Palm Beach','33408':'North Palm Beach','33409':'West Palm Beach',
    '33410':'Palm Beach Gardens','33411':'West Palm Beach','33412':'West Palm Beach',
    '33413':'West Palm Beach','33414':'Wellington','33415':'West Palm Beach',
    '33417':'West Palm Beach','33418':'Palm Beach Gardens','33426':'Boynton Beach',
    '33428':'Boca Raton','33430':'Belle Glade','33431':'Boca Raton','33432':'Boca Raton',
    '33433':'Boca Raton','33434':'Boca Raton','33435':'Boynton Beach','33436':'Boynton Beach',
    '33437':'Boynton Beach','33438':'Canal Point','33440':'Clewiston',
    '33444':'Delray Beach','33445':'Delray Beach','33446':'Delray Beach','33448':'Delray Beach',
    '33449':'Lake Worth','33458':'Jupiter','33460':'Lake Worth','33461':'Lake Worth',
    '33462':'Lake Worth','33463':'Lake Worth','33467':'Lake Worth','33469':'Jupiter',
    '33470':'Loxahatchee','33471':'Moore Haven','33472':'Boynton Beach','33473':'Boynton Beach',
    '33474':'Boynton Beach','33476':'Pahokee','33477':'Jupiter','33478':'Jupiter',
    '33480':'Palm Beach','33483':'Delray Beach','33484':'Delray Beach','33486':'Boca Raton',
    '33487':'Boca Raton','33488':'Boca Raton','33496':'Boca Raton','33498':'Boca Raton',
}

NAME_CITY_MAP = [
    ("PALM BEACH GARDENS", "Palm Beach Gardens"),  # check first (longer match)
    ("ROYAL PALM", "Royal Palm Beach"),
    ("NORTH PALM", "North Palm Beach"),
    ("HIGHLAND BEACH", "Highland Beach"),
    ("OCEAN RIDGE", "Ocean Ridge"),
    ("LAKE WORTH", "Lake Worth"),
    ("BOCA", "Boca Raton"),
    ("DELRAY", "Delray Beach"),
    ("JUPITER", "Jupiter"),
    ("BOYNTON", "Boynton Beach"),
    ("WELLINGTON", "Wellington"),
    ("RIVIERA", "Riviera Beach"),
    ("JUNO", "Juno Beach"),
    ("TEQUESTA", "Tequesta"),
    ("LANTANA", "Lantana"),
    ("ATLANTIS", "Atlantis"),
    ("GREENACRES", "Greenacres"),
    ("MANALAPAN", "Manalapan"),
    ("HYPOLUXO", "Hypoluxo"),
]


def fetch_all_published():
    rows = []
    PAGE = 1000
    offset = 0
    for _ in range(30):
        r = requests.get(
            f"{URL}/rest/v1/communities"
            f"?select=id,canonical_name,city,zip_code,county"
            f"&status=eq.published"
            f"&order=canonical_name.asc&limit={PAGE}&offset={offset}",
            headers=H,
        )
        if r.status_code != 200:
            break
        batch = r.json()
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return rows


def main():
    print("Fetching all published communities…")
    rows = fetch_all_published()
    print(f"Loaded {len(rows)} communities")

    city_corrections = []   # ZIP confirms a different city than what's stored
    wrong_zip = []          # ZIP not in PBC_ZIPS
    no_zip = []             # zip_code is null
    name_mismatch = []      # name contains city indicator that disagrees

    for c in rows:
        zip_code = (c.get("zip_code") or "").strip()
        cur_city = (c.get("city") or "").strip()
        name = (c.get("canonical_name") or "").upper()

        # ── ZIP check ──────────────────────────────
        if not zip_code:
            no_zip.append(c)
        elif zip_code in PBC_ZIPS:
            expected = PBC_ZIPS[zip_code]
            if cur_city.lower() != expected.lower():
                city_corrections.append({
                    **c,
                    "current_city": cur_city,
                    "correct_city": expected,
                    "method": "zip_lookup",
                })
        else:
            # Outside PBC
            location = "florida_outside_pbc" if zip_code.startswith("33") else "outside_florida"
            wrong_zip.append({**c, "location": location})

        # ── Name-vs-city consistency ───────────────
        if cur_city:
            for marker, expected_city in NAME_CITY_MAP:
                if marker in name:
                    # Special case: BOCA inside another city's name like "BOCALAGO" — only match word boundary
                    if marker == "BOCA" and "BOCAGRANDE" in name:
                        continue
                    if cur_city.lower() != expected_city.lower():
                        name_mismatch.append({
                            **c,
                            "current_city": cur_city,
                            "name_implies_city": expected_city,
                            "name_marker": marker,
                            "method": "name_indicator",
                        })
                    break  # first match wins (longer ones first)

    out_dir = "scripts/output"
    with open(f"{out_dir}/city-corrections.json", "w") as f:
        json.dump(city_corrections, f, indent=2)
    with open(f"{out_dir}/wrong-zip-review.json", "w") as f:
        json.dump(wrong_zip, f, indent=2)
    with open(f"{out_dir}/no-zip-communities.json", "w") as f:
        json.dump(no_zip, f, indent=2)
    with open(f"{out_dir}/name-city-mismatch.json", "w") as f:
        json.dump(name_mismatch, f, indent=2)

    print()
    print(f"Total verified: {len(rows)}")
    print(f"City corrections (ZIP confirms different city): {len(city_corrections)}")
    print(f"Wrong/non-PBC ZIP: {len(wrong_zip)}")
    print(f"No ZIP code: {len(no_zip)}")
    print(f"Name-implies-city mismatch: {len(name_mismatch)}")
    print()
    print("Sample ZIP corrections:")
    for c in city_corrections[:8]:
        print(f"  {c['canonical_name'][:50]:<50} '{c['current_city']}' → '{c['correct_city']}' (ZIP {c['zip_code']})")
    print()
    print("Sample wrong-ZIP:")
    for c in wrong_zip[:8]:
        print(f"  {c['canonical_name'][:50]:<50} ZIP {c['zip_code']} ({c['location']})")


if __name__ == "__main__":
    main()
