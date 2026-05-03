#!/usr/bin/env python3
"""
sweep-gated-55plus.py
Step 1: pull large unflagged communities (unit_count >= 50, is_gated=false)
Step 2: amenities-text scan for gated/55+ keywords (no API call)
Step 3: DDG web sweep for unit_count >= 200 still unflagged after Step 2
Step 4: print final counts

Rules:
  - Only update if currently false (never set true → false).
  - Auto-approvable: is_gated, is_55_plus, is_age_restricted.
  - Web search needs 2+ confirming hits per category.
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

GATED_TERMS_AMENITIES = [
    "gated", "guard gate", "security gate", "controlled access",
    "guardhouse", "guard house", "gatehouse",
]
PLUS55_TERMS_AMENITIES = [
    "55+", "55 plus", "age 55", "55 and older", "55 or older",
    "age restricted", "age-restricted", "active adult",
    "adult community", "senior", "hopa", "62+", "62 and older",
]

GATED_TERMS_WEB = [
    "gated community", "gated entrance", "guard gate",
    "security gate", "controlled access", "guardhouse",
    "guard house", "gatehouse",
]
PLUS55_TERMS_WEB = [
    "55+", "55 and older", "55 or older", "age 55",
    "age-restricted", "age restricted", "active adult",
    "adult community", "hopa", "62+",
]


def step1_get_candidates():
    print("\n=== STEP 1: pull large unflagged candidates ===")
    out = []
    offset = 0
    while True:
        r = requests.get(
            f"{URL}/rest/v1/communities"
            f"?select=id,canonical_name,slug,city,zip_code,unit_count,"
            f"is_gated,is_55_plus,is_age_restricted,amenities,property_type"
            f"&status=eq.published&is_gated=eq.false&unit_count=gte.50"
            f"&order=unit_count.desc"
            f"&limit=1000&offset={offset}",
            headers=H,
        )
        chunk = r.json()
        if not chunk:
            break
        out.extend(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000
        if offset > 5000:
            break
    print(f"   {len(out)} unflagged-gated communities with unit_count >= 50")
    os.makedirs("scripts/output", exist_ok=True)
    with open("scripts/output/sweep-candidates.json", "w") as f:
        json.dump(out, f, indent=2)
    return out


def step2_amenities_scan():
    print("\n=== STEP 2: amenities text scan ===")
    # Pull all published with non-null amenities (we'll filter flag state per row)
    rows = []
    offset = 0
    while True:
        r = requests.get(
            f"{URL}/rest/v1/communities"
            f"?select=id,canonical_name,city,amenities,is_gated,is_55_plus,is_age_restricted"
            f"&status=eq.published&amenities=not.is.null"
            f"&limit=1000&offset={offset}",
            headers=H,
        )
        chunk = r.json()
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000
        if offset > 20000:
            break
    print(f"   scanning {len(rows)} rows with non-null amenities")

    g_updates = 0
    p_updates = 0
    for c in rows:
        amen = (c.get("amenities") or "").lower()
        if not amen:
            continue
        # Gated
        if not c.get("is_gated"):
            for t in GATED_TERMS_AMENITIES:
                if t in amen:
                    r = requests.patch(
                        f"{URL}/rest/v1/communities?id=eq.{c['id']}&is_gated=eq.false",
                        headers=H,
                        json={"is_gated": True, "updated_at": "now()"},
                    )
                    if r.status_code in (200, 204):
                        g_updates += 1
                        print(f"   GATED: {c['canonical_name']} ({c.get('city')}) — match '{t}'")
                    break
        # 55+
        if not c.get("is_55_plus"):
            for t in PLUS55_TERMS_AMENITIES:
                if t in amen:
                    r = requests.patch(
                        f"{URL}/rest/v1/communities?id=eq.{c['id']}&is_55_plus=eq.false",
                        headers=H,
                        json={"is_55_plus": True, "is_age_restricted": True, "updated_at": "now()"},
                    )
                    if r.status_code in (200, 204):
                        p_updates += 1
                        print(f"   55+:   {c['canonical_name']} ({c.get('city')}) — match '{t}'")
                    break
    print(f"   amenities updates: gated={g_updates}, 55+={p_updates}")
    return g_updates, p_updates


def ddg_html(q):
    qenc = urllib.parse.quote_plus(q)
    try:
        req = urllib.request.Request(
            f"https://html.duckduckgo.com/html/?q={qenc}",
            headers={"User-Agent": UA},
        )
        with urllib.request.urlopen(req, timeout=12) as r:
            return r.read().decode("utf-8", errors="ignore").lower()
    except Exception:
        return ""


def count_term_hits(text, terms):
    """Count distinct terms that match (proxy for # confirming sources)."""
    hits = 0
    for t in terms:
        if t in text:
            hits += 1
    return hits


def step3_web_sweep(candidates):
    print("\n=== STEP 3: DDG web sweep for unit_count >= 200 still unflagged ===")
    # Re-pull current state to skip any flagged in step 2
    big_ids = {c["id"] for c in candidates if (c.get("unit_count") or 0) >= 200}
    if not big_ids:
        print("   no candidates >= 200 units")
        return [], []
    refreshed = []
    ids = list(big_ids)
    for i in range(0, len(ids), 100):
        batch = ids[i:i+100]
        in_clause = ",".join(batch)
        r = requests.get(
            f"{URL}/rest/v1/communities"
            f"?select=id,canonical_name,city,unit_count,is_gated,is_55_plus,is_age_restricted"
            f"&id=in.({in_clause})",
            headers=H,
        )
        refreshed.extend(r.json() or [])
    targets = [c for c in refreshed if not c.get("is_gated") or not c.get("is_55_plus")]
    print(f"   {len(targets)} large communities to web-check")

    g_found = []
    p_found = []
    for idx, c in enumerate(targets, 1):
        name = c["canonical_name"]
        city = c.get("city") or "Florida"
        q = f'"{name}" {city} Florida gated OR "55+" OR "age restricted" OR "active adult"'
        text = ddg_html(q)
        if not text:
            time.sleep(0.4)
            continue

        g_hits = count_term_hits(text, GATED_TERMS_WEB)
        p_hits = count_term_hits(text, PLUS55_TERMS_WEB)

        if g_hits >= 2 and not c.get("is_gated"):
            r = requests.patch(
                f"{URL}/rest/v1/communities?id=eq.{c['id']}&is_gated=eq.false",
                headers=H, json={"is_gated": True, "updated_at": "now()"})
            if r.status_code in (200, 204):
                g_found.append({"id": c["id"], "name": name, "city": city, "hits": g_hits})
                print(f"   [{idx}/{len(targets)}] GATED: {name} ({city}) hits={g_hits}")
        if p_hits >= 2 and not c.get("is_55_plus"):
            r = requests.patch(
                f"{URL}/rest/v1/communities?id=eq.{c['id']}&is_55_plus=eq.false",
                headers=H, json={"is_55_plus": True, "is_age_restricted": True, "updated_at": "now()"})
            if r.status_code in (200, 204):
                p_found.append({"id": c["id"], "name": name, "city": city, "hits": p_hits})
                print(f"   [{idx}/{len(targets)}] 55+:   {name} ({city}) hits={p_hits}")

        if idx % 50 == 0:
            print(f"   ...progress {idx}/{len(targets)} | gated+={len(g_found)} 55+={len(p_found)}")
        time.sleep(0.4)

    with open("scripts/output/sweep-results.json", "w") as f:
        json.dump({"gated_found": g_found, "plus55_found": p_found,
                   "total_checked": len(targets)}, f, indent=2)
    return g_found, p_found


def step4_final_counts():
    print("\n=== STEP 4: final counts ===")
    Hc = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Prefer": "count=exact"}
    for label, q in [
        ("gated", "is_gated=eq.true"),
        ("55+", "is_55_plus=eq.true"),
        ("both", "is_gated=eq.true&is_55_plus=eq.true"),
        ("age_restricted", "is_age_restricted=eq.true"),
    ]:
        r = requests.head(f"{URL}/rest/v1/communities?select=id&status=eq.published&{q}", headers=Hc)
        print(f"   {label}: {r.headers.get('content-range')}")


def main():
    cand = step1_get_candidates()
    step2_amenities_scan()
    step3_web_sweep(cand)
    step4_final_counts()


if __name__ == "__main__":
    main()
