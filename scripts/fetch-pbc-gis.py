"""
Fetch Palm Beach County GIS subdivision data and fuzzy-match to communities.
Outputs matched pairs to scripts/output/pbc-gis-matches.json and
unmatched subdivisions to scripts/output/pbc-gis-unmatched.csv.
Does NOT write to the database.
"""
import os
import sys
import csv
import json
import time
import re
import requests
from difflib import SequenceMatcher
from typing import Dict, List, Optional, Tuple
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))
from supabase import create_client

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
MATCHES_FILE = os.path.join(OUTPUT_DIR, "pbc-gis-matches.json")
UNMATCHED_FILE = os.path.join(OUTPUT_DIR, "pbc-gis-unmatched.csv")

SIMILARITY_THRESHOLD = 0.75

# Primary endpoint from the task brief
BASE_URL = "https://maps.co.palm-beach.fl.us/arcgis/rest/services/open_data_v2/FeatureServer"

# Fallback: Property Appraiser parcel endpoint (has SUBDIV_NAME)
PA_URL = "https://maps.co.palm-beach.fl.us/arcgis/rest/services/PAO/Parcels/FeatureServer"

# Target cities — map GIS city codes and full names to canonical values
CITY_CODES = {
    "PBG": "Palm Beach Gardens",
    "JUP": "Jupiter",
    "NPB": "North Palm Beach",
    "RVB": "Riviera Beach",
    "TEQ": "Tequesta",
    "JNO": "Juno Beach",
}
CITY_NAMES = set(CITY_CODES.values())

# Also match full names in case the layer stores them directly
CITY_NAME_TO_CANONICAL = {name.upper(): name for name in CITY_NAMES}
# Map short codes too
for code, name in CITY_CODES.items():
    CITY_NAME_TO_CANONICAL[code] = name


def get_supabase():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: Missing SUPABASE env vars — cannot fetch communities")
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
    # Remove punctuation
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return " ".join(s.split())


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def discover_layers(base_url: str) -> List[Dict]:
    """Return layer list from a FeatureServer."""
    try:
        r = requests.get(base_url, params={"f": "json"}, timeout=15)
        r.raise_for_status()
        data = r.json()
        return data.get("layers", [])
    except Exception as e:
        print(f"  Layer discovery failed for {base_url}: {e}")
        return []


def get_layer_fields(base_url: str, layer_id: int) -> List[str]:
    """Return field names for a given layer."""
    try:
        r = requests.get(f"{base_url}/{layer_id}", params={"f": "json"}, timeout=15)
        r.raise_for_status()
        data = r.json()
        return [f["name"].upper() for f in data.get("fields", [])]
    except Exception as e:
        print(f"  Field fetch failed for layer {layer_id}: {e}")
        return []


def query_layer_distinct(base_url: str, layer_id: int, field: str,
                         where: str = "1=1", max_records: int = 2000) -> List[str]:
    """Return distinct non-null values from a field in a layer."""
    url = f"{base_url}/{layer_id}/query"
    params = {
        "where": where,
        "outFields": field,
        "returnDistinctValues": "true",
        "returnGeometry": "false",
        "resultRecordCount": max_records,
        "f": "json",
    }
    try:
        r = requests.get(url, params=params, timeout=30)
        r.raise_for_status()
        data = r.json()
        features = data.get("features", [])
        values = []
        for feat in features:
            val = feat.get("attributes", {}).get(field)
            if val and str(val).strip():
                values.append(str(val).strip())
        return values
    except Exception as e:
        print(f"  Query failed layer {layer_id} field {field}: {e}")
        return []


def query_layer_records(base_url: str, layer_id: int, fields: List[str],
                        where: str = "1=1", max_records: int = 5000) -> List[Dict]:
    """Return records from a layer as list of attribute dicts."""
    url = f"{base_url}/{layer_id}/query"
    params = {
        "where": where,
        "outFields": ",".join(fields),
        "returnGeometry": "false",
        "resultRecordCount": max_records,
        "f": "json",
    }
    try:
        r = requests.get(url, params=params, timeout=30)
        r.raise_for_status()
        data = r.json()
        return [feat.get("attributes", {}) for feat in data.get("features", [])]
    except Exception as e:
        print(f"  Record query failed layer {layer_id}: {e}")
        return []


def find_subdiv_layer(base_url: str, layers: List[Dict]) -> Tuple[Optional[int], Optional[str]]:
    """
    Search all layers for a SUBDIV_NAME (or similar) field.
    Returns (layer_id, field_name) or (None, None).
    """
    candidates = ["SUBDIV_NAME", "SUBDIVISION", "SUBDIV", "SUB_NAME", "SUBDVNAME",
                  "SUBDIVISION_NAME", "NAME", "PLACE_NAME", "COMMUNITY"]
    for layer in layers:
        lid = layer.get("id")
        name = layer.get("name", "")
        fields = get_layer_fields(base_url, lid)
        print(f"  Layer {lid} '{name}': {fields[:8]}{'...' if len(fields) > 8 else ''}")
        for cand in candidates:
            if cand in fields:
                print(f"  -> Found '{cand}' in layer {lid} '{name}'")
                return lid, cand
        time.sleep(0.3)
    return None, None


def fetch_subdivisions_from_layer(base_url: str, layer_id: int,
                                  subdiv_field: str, city_field: Optional[str]) -> List[Dict]:
    """Fetch (subdiv_name, city) records from a discovered layer."""
    out_fields = [subdiv_field]
    if city_field:
        out_fields.append(city_field)

    if city_field:
        # Build city filter
        city_vals = list(CITY_CODES.keys()) + [f"'{n}'" for n in CITY_NAMES]
        code_list = ", ".join(f"'{c}'" for c in CITY_CODES.keys())
        name_list = ", ".join(f"'{n}'" for n in CITY_NAMES)
        where = f"{city_field} IN ({code_list}, {name_list})"
    else:
        where = "1=1"

    records = query_layer_records(base_url, layer_id, out_fields, where=where, max_records=5000)
    results = []
    for rec in records:
        name = rec.get(subdiv_field, "").strip()
        if not name:
            continue
        city_raw = rec.get(city_field, "").strip().upper() if city_field else ""
        city = CITY_NAME_TO_CANONICAL.get(city_raw, city_raw.title() if city_raw else None)
        results.append({"name": name, "city": city, "source_field": subdiv_field})
    return results


def fetch_from_situs_address(base_url: str, layer_id: int) -> List[Dict]:
    """
    Fallback: pull PROP_USE + CITY from Situs Address layer.
    Group by city to find likely HOA properties.
    Returns subdivision-like records using STREET_NAME as proxy (poor but available).
    """
    print("  [fallback] Using Situs Address layer with PROP_USE filter...")
    # PROP_USE codes for condos/HOA parcels: 04=Condo, 06=Rental, various
    # We'll grab all records for target cities and return unique street names per city
    # as a coarse proxy — these won't match well so we note the limitation
    fields = ["STREET_NAME", "CITY", "PROP_USE"]
    code_list = ", ".join(f"'{c}'" for c in CITY_CODES.keys())
    name_list = ", ".join(f"'{n}'" for n in CITY_NAMES)
    where = f"CITY IN ({code_list}, {name_list})"
    records = query_layer_records(base_url, layer_id, fields, where=where, max_records=5000)

    seen = set()
    results = []
    for rec in records:
        name = (rec.get("STREET_NAME") or "").strip()
        city_raw = (rec.get("CITY") or "").strip().upper()
        if not name:
            continue
        city = CITY_NAME_TO_CANONICAL.get(city_raw, city_raw.title())
        key = (name.upper(), city)
        if key not in seen:
            seen.add(key)
            results.append({"name": name, "city": city, "source_field": "STREET_NAME_fallback"})
    print(f"  Situs fallback: {len(results)} unique street+city combos (low match expected)")
    return results


def fetch_communities(supabase) -> List[Dict]:
    result = (
        supabase.table("communities")
        .select("id, canonical_name, city, slug, status")
        .eq("status", "published")
        .execute()
    )
    return result.data or []


def match_subdivisions(subdivisions: List[Dict], communities: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
    """
    Fuzzy-match subdivision names to community canonical_names.
    Returns (matches, unmatched).
    """
    # Build city-bucketed community index for faster matching
    by_city: Dict[str, List[Dict]] = {}
    for c in communities:
        city = (c.get("city") or "").strip()
        by_city.setdefault(city, []).append(c)
    # Also keep all communities for cross-city matching if needed
    all_communities = communities

    matches = []
    unmatched = []

    for sub in subdivisions:
        sub_name = sub["name"]
        sub_city = sub.get("city") or ""
        norm_sub = normalize(sub_name)

        best_score = 0.0
        best_community = None

        # First pass: same city
        city_bucket = by_city.get(sub_city, [])
        for c in city_bucket:
            norm_c = normalize(c["canonical_name"])
            score = similarity(norm_sub, norm_c)
            if score > best_score:
                best_score = score
                best_community = c

        # Second pass: all cities if below threshold or no city
        if best_score < SIMILARITY_THRESHOLD or not city_bucket:
            for c in all_communities:
                if c in city_bucket:
                    continue
                norm_c = normalize(c["canonical_name"])
                score = similarity(norm_sub, norm_c)
                if score > best_score:
                    best_score = score
                    best_community = c

        if best_score >= SIMILARITY_THRESHOLD and best_community:
            matches.append({
                "gis_name": sub_name,
                "gis_city": sub_city,
                "source_field": sub.get("source_field"),
                "community_id": best_community["id"],
                "community_canonical_name": best_community["canonical_name"],
                "community_city": best_community.get("city"),
                "community_slug": best_community["slug"],
                "similarity_score": round(best_score, 4),
            })
        else:
            unmatched.append({
                "gis_name": sub_name,
                "gis_city": sub_city,
                "source_field": sub.get("source_field"),
                "best_candidate": best_community["canonical_name"] if best_community else "",
                "best_score": round(best_score, 4) if best_community else 0,
            })

    return matches, unmatched


def deduplicate(records: List[Dict], key: str) -> List[Dict]:
    seen = set()
    out = []
    for r in records:
        k = r[key].upper()
        if k not in seen:
            seen.add(k)
            out.append(r)
    return out


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print("=== PBC GIS Subdivision Fetch ===\n")

    # Step 1: Fetch communities from Supabase
    print("Fetching communities from Supabase...")
    supabase = get_supabase()
    communities = fetch_communities(supabase)
    target_cities_communities = [
        c for c in communities
        if (c.get("city") or "") in CITY_NAMES
    ]
    print(f"  Total published communities: {len(communities)}")
    print(f"  In target cities: {len(target_cities_communities)}\n")

    # Step 2: Discover layers in primary endpoint
    subdivisions = []
    found_subdiv_layer = False

    print(f"Discovering layers in primary endpoint: {BASE_URL}")
    layers = discover_layers(BASE_URL)
    print(f"  Found {len(layers)} layers")

    if layers:
        layer_id, subdiv_field = find_subdiv_layer(BASE_URL, layers)
        if layer_id is not None:
            found_subdiv_layer = True
            print(f"\nUsing layer {layer_id} field '{subdiv_field}'")
            # Check for a city field
            fields = get_layer_fields(BASE_URL, layer_id)
            city_field = next(
                (f for f in ["CITY", "CTY", "MUNICIPALITY", "MUNI"] if f in fields),
                None
            )
            print(f"  City field: {city_field}")
            raw = fetch_subdivisions_from_layer(BASE_URL, layer_id, subdiv_field, city_field)
            subdivisions.extend(raw)
            print(f"  Fetched {len(raw)} records")

    # Step 3: Try PAO/Parcels fallback if SUBDIV_NAME not found
    if not found_subdiv_layer:
        print(f"\nNo SUBDIV_NAME found in primary endpoint. Trying PAO Parcels: {PA_URL}")
        pa_layers = discover_layers(PA_URL)
        print(f"  Found {len(pa_layers)} layers")
        if pa_layers:
            layer_id, subdiv_field = find_subdiv_layer(PA_URL, pa_layers)
            if layer_id is not None:
                found_subdiv_layer = True
                fields = get_layer_fields(PA_URL, layer_id)
                city_field = next(
                    (f for f in ["CITY", "CTY", "MUNICIPALITY", "MUNI", "PROP_CITY"] if f in fields),
                    None
                )
                raw = fetch_subdivisions_from_layer(PA_URL, layer_id, subdiv_field, city_field)
                subdivisions.extend(raw)
                print(f"  Fetched {len(raw)} records")

    # Step 4: Last resort — use Situs Address layer (layer 0 of primary)
    if not found_subdiv_layer or not subdivisions:
        print("\nNo subdivision field found. Using Situs Address layer as fallback.")
        situs_layer = next((l for l in layers if "situs" in l.get("name", "").lower()), None)
        if situs_layer is None and layers:
            situs_layer = layers[0]  # default to layer 0
        if situs_layer:
            raw = fetch_from_situs_address(BASE_URL, situs_layer["id"])
            subdivisions.extend(raw)

    if not subdivisions:
        print("\nERROR: No subdivision data retrieved from any source. Exiting.")
        sys.exit(1)

    # Deduplicate by name
    subdivisions = deduplicate(subdivisions, "name")
    print(f"\nTotal unique subdivision names: {len(subdivisions)}")

    # Step 5: Fuzzy match
    print(f"\nFuzzy-matching against {len(communities)} communities (threshold={SIMILARITY_THRESHOLD})...")
    matches, unmatched = match_subdivisions(subdivisions, communities)
    print(f"  Matched:   {len(matches)}")
    print(f"  Unmatched: {len(unmatched)}")
    if subdivisions:
        rate = len(matches) / len(subdivisions) * 100
        print(f"  Match rate: {rate:.1f}%")

    # Step 6: Save outputs
    with open(MATCHES_FILE, "w") as f:
        json.dump(matches, f, indent=2)
    print(f"\nMatches saved to: {MATCHES_FILE}")

    with open(UNMATCHED_FILE, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["gis_name", "gis_city", "source_field",
                                               "best_candidate", "best_score"])
        writer.writeheader()
        writer.writerows(unmatched)
    print(f"Unmatched saved to: {UNMATCHED_FILE}")

    # Step 7: Summary
    print("\n=== Summary ===")
    print(f"  GIS source: {'SUBDIV_NAME layer' if found_subdiv_layer else 'Situs Address fallback'}")
    print(f"  Total subdivisions: {len(subdivisions)}")
    print(f"  Matched: {len(matches)}")
    print(f"  Unmatched: {len(unmatched)}")
    if matches:
        top = sorted(matches, key=lambda x: x["similarity_score"], reverse=True)[:5]
        print("\n  Top matches:")
        for m in top:
            print(f"    {m['gis_name']} ({m['gis_city']}) -> {m['community_canonical_name']} [{m['similarity_score']:.3f}]")
    print("\nDone. Review matches before any database updates.")


if __name__ == "__main__":
    main()
