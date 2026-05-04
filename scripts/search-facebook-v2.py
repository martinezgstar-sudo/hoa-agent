#!/usr/bin/env python3
"""
search-facebook-v2.py
Refined 10-query DDG sweep with operator at end (better DDG behavior).
Reuses Task 1-5 pipeline from search-facebook-duckduckgo.py.
"""
import json, os, re, sys, time, urllib.parse, urllib.request, warnings
from datetime import date
from difflib import SequenceMatcher
import requests
warnings.filterwarnings("ignore")
from dotenv import load_dotenv
load_dotenv(".env.local", override=True)

try:
    import anthropic
except ImportError:
    print("anthropic not installed"); sys.exit(1)

URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}",
     "Content-Type": "application/json", "Prefer": "return=minimal"}
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
CLIENT = anthropic.Anthropic()
DELAY = 1.0

QUERIES = [
    '"Palm Beach County" HOA site:facebook.com',
    '"West Palm Beach" HOA assessment site:facebook.com',
    '"Delray Beach" HOA site:facebook.com',
    '"Boca Raton" HOA site:facebook.com',
    '"Wellington" HOA site:facebook.com',
    '"Jupiter" HOA site:facebook.com',
    '"Boynton Beach" HOA site:facebook.com',
    'Palm Beach County HOA lawsuit 2026',
    'Palm Beach County special assessment 2026',
    'Palm Beach HOA board recall',
]


def ddg_search(query: str):
    qenc = urllib.parse.quote_plus(query)
    try:
        req = urllib.request.Request(
            f"https://html.duckduckgo.com/html/?q={qenc}",
            headers={"User-Agent": UA},
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            html = r.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"   search failed: {e}")
        return []
    out = []
    for m in re.finditer(r'<a\s+class="result__a"\s+href="(/l/\?[^"]+)"[^>]*>([\s\S]*?)</a>', html):
        href, title = m.group(1), m.group(2)
        rm = re.search(r"uddg=(https?[^&]+)", href)
        url = urllib.parse.unquote(rm.group(1)) if rm else ""
        if not url: continue
        title_clean = re.sub(r"<[^>]+>", "", title).strip()
        idx = html.find(href)
        snip_m = re.search(r'class="result__snippet"[^>]*>([\s\S]*?)</a>', html[idx:idx+3000])
        snip = re.sub(r"<[^>]+>", "", snip_m.group(1)).strip() if snip_m else ""
        out.append({"title": title_clean, "url": url, "snippet": snip})
    return out


def ai_evaluate(result: dict):
    user = (
        f'Evaluate this search result:\n'
        f'Title: {result["title"][:300]}\n'
        f'URL: {result["url"][:200]}\n'
        f'Snippet: {result.get("snippet","")[:400]}\n\n'
        '1. About an HOA/condo community in Palm Beach County FL?\n'
        '2. Specific community named?\n'
        '3. Topic: assessment/fees/board/lawsuit/fraud/general/other\n'
        '4. Useful HOA intelligence?\n\n'
        'Return JSON only:\n'
        '{"relevant": true|false, "community_mentioned": "name"|null, '
        '"topic": "assessment|fees|board|lawsuit|fraud|general|other", '
        '"sentiment": "positive|negative|neutral", "useful": true|false, '
        '"summary": "one sentence"}'
    )
    try:
        resp = CLIENT.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=200,
            system="You evaluate search results for HOA intelligence in Palm Beach County, Florida. Return JSON only.",
            messages=[{"role": "user", "content": user}],
        )
        text = resp.content[0].text if resp.content else ""
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE)
        return json.loads(text)
    except Exception as e:
        return {"relevant": False, "useful": False, "summary": f"err: {e}"}


def fuzzy_match(name: str, communities: list, threshold: float = 0.75):
    name_lower = name.lower().strip()
    best_score = 0
    best_match = None
    for c in communities:
        cn = (c.get("canonical_name") or "").lower()
        if not cn: continue
        score = SequenceMatcher(None, name_lower, cn).ratio()
        if name_lower in cn or cn in name_lower:
            score = max(score, 0.85)
        if score > best_score:
            best_score = score
            best_match = c
    if best_score >= threshold:
        return best_match, round(best_score, 3)
    return None, 0


def fetch_communities():
    rows = []
    offset = 0
    while True:
        r = requests.get(
            f"{URL}/rest/v1/communities?select=id,canonical_name,slug,city"
            f"&status=eq.published&limit=1000&offset={offset}",
            headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"},
        )
        chunk = r.json()
        if not chunk: break
        rows.extend(chunk)
        if len(chunk) < 1000: break
        offset += 1000
        if offset > 20000: break
    return rows


TOPIC_TO_FIELD = {
    "assessment": ("assessment_signal", 0.5),
    "fees":       ("assessment_signal", 0.5),
    "lawsuit":    ("litigation_signal", 0.5),
    "fraud":      ("litigation_signal", 0.5),
    "board":      ("community_signal",  0.4),
    "general":    ("community_signal",  0.4),
    "other":      ("community_signal",  0.4),
}


def insert_pending(community_id, eval_, source_url):
    topic = (eval_.get("topic") or "general").lower()
    field, conf = TOPIC_TO_FIELD.get(topic, ("community_signal", 0.4))
    src_type = "facebook_public" if "facebook.com" in source_url.lower() else "web_search"
    payload = {
        "community_id": community_id,
        "field_name": field,
        "proposed_value": (eval_.get("summary") or "")[:1000],
        "source_url": source_url[:500],
        "source_type": src_type,
        "confidence": conf,
        "auto_approvable": False,
        "status": "pending",
    }
    r = requests.post(f"{URL}/rest/v1/pending_community_data", headers=H, json=payload)
    return r.status_code in (200, 201, 204), r.status_code, r.text[:200]


def main():
    os.makedirs("scripts/output", exist_ok=True)
    print(f"FB v2 · {len(QUERIES)} queries · {DELAY}s delay\n")

    raw = []
    for i, q in enumerate(QUERIES, 1):
        results = ddg_search(q)
        print(f"  [{i:2}/{len(QUERIES)}] {len(results):2d} hits · {q}")
        for r in results:
            r["query"] = q
            raw.append(r)
        time.sleep(DELAY)

    seen = set()
    unique = []
    for r in raw:
        if r["url"] and r["url"] not in seen:
            seen.add(r["url"])
            unique.append(r)
    print(f"\n  raw: {len(raw)} · dedupe: {len(unique)}")
    with open("scripts/output/facebook-v2-raw.json", "w") as f:
        json.dump(unique, f, indent=2)

    if not unique:
        print("\nNo results. Exiting.")
        return

    print(f"\n=== AI filter on {len(unique)} ===")
    relevant = []
    for i, r in enumerate(unique, 1):
        ev = ai_evaluate(r)
        r["ai"] = ev
        if ev.get("relevant") and ev.get("useful"):
            relevant.append(r)
            print(f"  [{i}] KEEP · {ev.get('topic')} · {ev.get('community_mentioned') or '?'} · {r['url'][:60]}")
        time.sleep(0.3)
    print(f"  relevant+useful: {len(relevant)}/{len(unique)}")
    with open("scripts/output/facebook-v2-relevant.json", "w") as f:
        json.dump(relevant, f, indent=2)

    print(f"\n=== Match to DB ===")
    communities = fetch_communities()
    print(f"  loaded {len(communities)} communities")
    matched = []
    unmatched = []
    for r in relevant:
        cname = r["ai"].get("community_mentioned")
        if cname:
            m, score = fuzzy_match(cname, communities)
            if m:
                r["matched_community"] = m
                r["match_score"] = score
                matched.append(r)
                print(f"  ✓ {cname!r} → {m['canonical_name']} ({score})")
            else:
                unmatched.append(r)
                print(f"  ✗ {cname!r} — no DB match")
        else:
            unmatched.append(r)
    with open("scripts/output/facebook-v2-matched.json", "w") as f:
        json.dump(matched, f, indent=2)
    with open("scripts/output/facebook-v2-unmatched.json", "w") as f:
        json.dump(unmatched, f, indent=2)

    print(f"\n=== Insert pending ===")
    inserted = 0
    topic_counts = {}
    for r in matched:
        topic = (r["ai"].get("topic") or "general").lower()
        topic_counts[topic] = topic_counts.get(topic, 0) + 1
        ok, code, body = insert_pending(r["matched_community"]["id"], r["ai"], r["url"])
        if ok:
            inserted += 1
            print(f"  + [{topic:11s}] {r['matched_community']['canonical_name']}")
        else:
            print(f"  ! FAIL ({code}) {body}")

    today = date.today().isoformat()
    report_path = f"scripts/output/facebook-v2-report-{today}.txt"
    lines = [
        "=== FACEBOOK V2 SEARCH REPORT ===",
        f"Date: {today}",
        f"Queries: {len(QUERIES)} (refined; site: at end)",
        "",
        "SUMMARY:",
        f"  Total raw results:     {len(raw)}",
        f"  After dedupe:          {len(unique)}",
        f"  Relevant + useful:     {len(relevant)}",
        f"  Matched to DB:         {len(matched)}",
        f"  Unmatched:             {len(unmatched)}",
        f"  Inserted to pending:   {inserted}",
        "",
        "TOPICS:",
    ]
    for t in ["assessment","fees","board","lawsuit","fraud","general","other"]:
        lines.append(f"  {t:14s}: {topic_counts.get(t, 0)}")
    lines.append("")
    lines.append("MATCHED COMMUNITIES:")
    for r in matched:
        lines.append(f"  • {r['matched_community']['canonical_name']} [{r['ai'].get('topic')}] {r['url'][:80]}")
    lines.append("")
    lines.append("UNMATCHED MENTIONS:")
    seen_u = set()
    for r in unmatched:
        cname = (r.get("ai") or {}).get("community_mentioned")
        if cname and cname not in seen_u:
            seen_u.add(cname)
            lines.append(f"  • {cname} — {r['url'][:80]}")
    with open(report_path, "w") as f:
        f.write("\n".join(lines))
    print("\n" + "\n".join(lines))
    print(f"\nReport: {report_path}")


if __name__ == "__main__":
    main()
