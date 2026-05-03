#!/usr/bin/env python3
"""
verify-10-fees.py
Search 6 sites per community, extract fee mentions, insert to pending_fee_observations.
Never auto-approve. Round to nearest $25. Reject slider noise.
"""
import json, math, os, re, time, urllib.parse, urllib.request, warnings
import requests
warnings.filterwarnings("ignore")
from dotenv import load_dotenv
load_dotenv(".env.local", override=True)

URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}",
     "Content-Type": "application/json", "Prefer": "return=minimal"}
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


def round25(n, mode="nearest"):
    if mode == "down":   return int(math.floor(n / 25) * 25)
    if mode == "up":     return int(math.ceil(n / 25) * 25)
    return int(round(n / 25) * 25)


def is_slider_noise(fees):
    if len(fees) < 3:
        return False
    multiples_of_100 = [f for f in fees if f % 100 == 0]
    return len(multiples_of_100) >= 3 and len(multiples_of_100) == len(fees)


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
        rm = re.search(r"uddg=(https?[^&]+)", href)
        url = urllib.parse.unquote(rm.group(1)) if rm else ""
        title_clean = re.sub(r"<[^>]+>", "", title).strip()
        idx = html.find(href)
        snip_m = re.search(r'class="result__snippet"[^>]*>([\s\S]*?)</a>', html[idx:idx+3000])
        snip = re.sub(r"<[^>]+>", "", snip_m.group(1)).strip() if snip_m else ""
        out.append((url, title_clean, snip))
    return out


def extract_fees(text):
    """Return list of fees that appear within 10 words of HOA-context terms."""
    fees = []
    # Pattern: HOA/fee/dues/monthly/assessment within ~50 chars before $XXX
    ctx_re = re.compile(
        r"(?:hoa(?:\s+fee|\s+dues)?|monthly|assessment|maintenance\s+fee|condo\s+fee)[^$\d]{0,50}\$\s*([\d,]+)",
        re.IGNORECASE,
    )
    # Also: $XXX/mo with HOA context within 100 chars before
    mo_re = re.compile(r"\$\s*([\d,]+)\s*(?:per\s+month|/?\s*mo\b|/\s*month)", re.IGNORECASE)
    for m in ctx_re.finditer(text):
        try:
            v = float(m.group(1).replace(",", ""))
            if 50 <= v <= 2500: fees.append(v)
        except: pass
    for m in mo_re.finditer(text):
        ctx = text[max(0, m.start() - 100):m.start()]
        if re.search(r"hoa|dues|fee|assessment|condo", ctx, re.IGNORECASE):
            try:
                v = float(m.group(1).replace(",", ""))
                if 50 <= v <= 2500: fees.append(v)
            except: pass
    return fees


SOURCES = [
    ("web_search",   '"{name}" HOA fee monthly {city} Florida'),
    ("web_search",   '"{name}" HOA dues {city} FL'),
    ("redfin",       'site:redfin.com "{name}" HOA fee'),
    ("homes_com",    'site:homes.com "{name}" HOA'),
    ("trulia",       'site:trulia.com "{name}" HOA fee'),
    ("niche",        'site:niche.com "{name}" HOA'),
]


def main():
    targets = json.load(open("scripts/output/research-targets-10.json"))
    print(f"Fee research for {len(targets)} communities\n")

    all_results = []
    total_inserted = 0
    total_noise = 0

    for c in targets:
        name = c["canonical_name"]
        city = c.get("city", "")
        print(f"=== {name} ({city})")

        per_source_fees = {}
        for src_type, q_tpl in SOURCES:
            q = q_tpl.format(name=name, city=city)
            results = ddg_search(q, 4)
            found = []
            for url, title, snip in results:
                fees = extract_fees(f"{title} {snip}")
                for f in fees:
                    found.append((f, url))
            if found:
                per_source_fees.setdefault(src_type, []).extend(found)
            time.sleep(0.5)

        # Dedupe by source + amount, then run slider-noise check per source
        inserted = 0
        slider_dropped = 0
        per_source_amounts = {}
        for src, items in per_source_fees.items():
            seen = set()
            for amt, url in items:
                key = (round(amt), url)
                if key not in seen:
                    seen.add(key)
                    per_source_amounts.setdefault(src, []).append((amt, url))

        for src, items in per_source_amounts.items():
            amounts = [x[0] for x in items]
            if is_slider_noise(amounts):
                slider_dropped += len(items)
                print(f"   [slider noise] dropping {len(items)} fees from {src}")
                continue
            for amt, url in items:
                payload = {
                    "community_id": c["id"],
                    "fee_amount": amt,
                    "fee_rounded_min": round25(amt, "down"),
                    "fee_rounded_max": round25(amt, "up"),
                    "fee_rounded_median": round25(amt, "nearest"),
                    "source_url": url[:500],
                    "source_type": src,
                    "status": "pending",
                }
                r = requests.post(f"{URL}/rest/v1/pending_fee_observations", headers=H, json=payload)
                if r.status_code in (200, 201, 204):
                    inserted += 1
                    print(f"   inserted: ${amt} (rnd ${round25(amt)}) [{src}]")
                else:
                    print(f"   FAIL insert: {r.status_code} {r.text[:80]}")

        all_results.append({
            "id": c["id"], "canonical_name": name, "city": city,
            "fees_inserted": inserted, "slider_noise_dropped": slider_dropped,
        })
        total_inserted += inserted
        total_noise += slider_dropped
        print(f"   total inserted: {inserted}, noise dropped: {slider_dropped}\n")

    with open("scripts/output/verify-10-fees-result.json", "w") as f:
        json.dump(all_results, f, indent=2)
    print(f"=== TOTALS ===")
    print(f"  Fee observations inserted: {total_inserted}")
    print(f"  Slider noise dropped:       {total_noise}")


if __name__ == "__main__":
    main()
