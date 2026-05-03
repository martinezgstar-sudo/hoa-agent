#!/usr/bin/env python3
"""
verify-10-locations.py
For each of the 10 targets, verify ZIP-implied city matches DB city,
apply corrections, and try to find a street address via DDG.
"""
import json, os, re, sys, time, urllib.parse, urllib.request, warnings
import requests
warnings.filterwarnings("ignore")
from dotenv import load_dotenv
load_dotenv(".env.local", override=True)

URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}",
     "Content-Type": "application/json", "Prefer": "return=minimal"}
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

PBC_ZIPS = {
    '33401':'West Palm Beach','33402':'West Palm Beach','33403':'West Palm Beach','33404':'West Palm Beach',
    '33405':'West Palm Beach','33406':'West Palm Beach','33407':'West Palm Beach','33408':'North Palm Beach',
    '33409':'West Palm Beach','33410':'Palm Beach Gardens','33411':'West Palm Beach','33412':'West Palm Beach',
    '33413':'West Palm Beach','33414':'Wellington','33415':'West Palm Beach','33417':'West Palm Beach',
    '33418':'Palm Beach Gardens','33426':'Boynton Beach','33428':'Boca Raton','33431':'Boca Raton',
    '33432':'Boca Raton','33433':'Boca Raton','33434':'Boca Raton','33435':'Boynton Beach','33436':'Boynton Beach',
    '33437':'Boynton Beach','33444':'Delray Beach','33445':'Delray Beach','33446':'Delray Beach','33448':'Delray Beach',
    '33449':'Lake Worth','33458':'Jupiter','33460':'Lake Worth','33461':'Lake Worth','33462':'Lake Worth',
    '33463':'Lake Worth','33467':'Lake Worth','33469':'Jupiter','33470':'Loxahatchee','33472':'Boynton Beach',
    '33473':'Boynton Beach','33474':'Boynton Beach','33476':'Pahokee','33477':'Jupiter','33478':'Jupiter',
    '33480':'Palm Beach','33483':'Delray Beach','33484':'Delray Beach','33486':'Boca Raton','33487':'Boca Raton',
    '33488':'Boca Raton','33496':'Boca Raton','33498':'Boca Raton',
}

def ddg_search(q, max_results=4):
    qenc = urllib.parse.quote_plus(q)
    try:
        req = urllib.request.Request(f"https://html.duckduckgo.com/html/?q={qenc}", headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=12) as r:
            html = r.read().decode("utf-8", errors="ignore")
    except Exception:
        return []
    out = []
    for m in re.finditer(r'<a\s+class="result__a"\s+href="(/l/\?[^"]+)"[^>]*>([\s\S]*?)</a>', html):
        if len(out) >= max_results: break
        href, title = m.group(1), m.group(2)
        real_m = re.search(r"uddg=(https?[^&]+)", href)
        url = urllib.parse.unquote(real_m.group(1)) if real_m else ""
        title_clean = re.sub(r"<[^>]+>", "", title).strip()
        # Snippet
        idx = html.find(href)
        snip_m = re.search(r'class="result__snippet"[^>]*>([\s\S]*?)</a>', html[idx:idx+3000])
        snip = re.sub(r"<[^>]+>", "", snip_m.group(1)).strip() if snip_m else ""
        out.append((url, title_clean, snip))
    return out


def find_street_address(name, city, zip_code):
    """Search DDG for an address. Look for patterns like '1234 Some Street'."""
    queries = [
        f'"{name}" {city} Florida address',
        f'"{name}" HOA {zip_code or ""} Florida'.strip(),
    ]
    addr_re = re.compile(
        r'\b(\d{2,5}\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,5}\s+(?:Dr|Drive|Blvd|Boulevard|Ave|Avenue|St|Street|Rd|Road|Ln|Lane|Way|Ct|Court|Pl|Place|Pkwy|Parkway|Ter|Terrace|Trl|Trail|Cir|Circle))\b'
    )
    for q in queries:
        for url, title, snip in ddg_search(q, 4):
            blob = f"{title} {snip}"
            m = addr_re.search(blob)
            if m:
                return m.group(1), url
        time.sleep(0.6)
    return None, None


def main():
    targets = json.load(open("scripts/output/research-targets-10.json"))
    print(f"Verifying locations for {len(targets)} communities\n")

    results = []
    for c in targets:
        print(f"=== {c['canonical_name']}")
        result = {
            "id": c["id"], "canonical_name": c["canonical_name"],
            "current_city": c.get("city"), "zip_code": c.get("zip_code"),
            "zip_status": "", "city_correction": None,
            "street_address_found": None, "street_address_source": None,
            "applied": [],
        }
        zip_code = (c.get("zip_code") or "").strip()
        cur_city = (c.get("city") or "").strip()

        if zip_code in PBC_ZIPS:
            expected = PBC_ZIPS[zip_code]
            if cur_city.lower() == expected.lower():
                result["zip_status"] = "VERIFIED"
                print(f"   ZIP {zip_code} → {expected} — VERIFIED")
            else:
                result["zip_status"] = "MISMATCH"
                result["city_correction"] = expected
                print(f"   ZIP {zip_code} → expected '{expected}', stored '{cur_city}' — MISMATCH")
                # Apply correction
                r = requests.patch(
                    f"{URL}/rest/v1/communities?id=eq.{c['id']}&status=eq.published",
                    headers=H, json={"city": expected, "city_verified": True, "updated_at": "now()"})
                if r.status_code in (200, 204):
                    result["applied"].append(f"city: '{cur_city}' → '{expected}'")
                    print(f"   ✓ Updated city to '{expected}'")
        elif zip_code:
            result["zip_status"] = "NOT_IN_PBC"
            print(f"   ZIP {zip_code} not in PBC ZIP list — flagging for review")
        else:
            result["zip_status"] = "NO_ZIP"

        # Try to find street_address only if missing
        if not c.get("street_address"):
            addr, src = find_street_address(c["canonical_name"], cur_city, zip_code)
            if addr:
                result["street_address_found"] = addr
                result["street_address_source"] = src
                print(f"   Address candidate: {addr}")
                # Apply only if currently null
                r = requests.patch(
                    f"{URL}/rest/v1/communities?id=eq.{c['id']}&status=eq.published&street_address=is.null",
                    headers=H, json={"street_address": addr, "updated_at": "now()"})
                if r.status_code in (200, 204):
                    result["applied"].append(f"street_address: '{addr}'")
                    print(f"   ✓ Saved street_address")

        results.append(result)
        print()

    with open("scripts/output/verify-10-locations-result.json", "w") as f:
        json.dump(results, f, indent=2)

    n_verified = sum(1 for r in results if r["zip_status"] == "VERIFIED")
    n_corrected = sum(1 for r in results if r["city_correction"])
    n_addr = sum(1 for r in results if r["street_address_found"])
    print(f"\n=== TOTALS ===")
    print(f"  Verified by ZIP:     {n_verified}/{len(results)}")
    print(f"  City corrections:    {n_corrected}")
    print(f"  Addresses found:     {n_addr}")


if __name__ == "__main__":
    main()
