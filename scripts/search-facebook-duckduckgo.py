#!/usr/bin/env python3
"""
search-facebook-duckduckgo.py
DDG site:facebook.com searches → Claude AI relevance filter →
fuzzy-match to communities → insert to pending_community_data
(never auto-approved, confidence 0.4–0.5).

Pipeline = Tasks 1–5 in one run.
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
DELAY  = 1.0  # seconds between DDG calls (per spec)

QUERIES_GENERAL = [
    'site:facebook.com "HOA" "Palm Beach County" assessment',
    'site:facebook.com "homeowners association" "Palm Beach" complaint',
    'site:facebook.com "HOA" "West Palm Beach" board',
    'site:facebook.com "condo association" "Palm Beach" fees',
    'site:facebook.com "HOA" "Delray Beach" lawsuit',
    'site:facebook.com "HOA" "Boynton Beach" special assessment',
    'site:facebook.com "HOA" "Jupiter" Florida complaint',
    'site:facebook.com "HOA" "Boca Raton" board dispute',
    'site:facebook.com "HOA" "Wellington" Florida fees',
    'site:facebook.com "HOA" "Lake Worth" Florida assessment',
]

LARGE_COMMUNITIES = [
    "Huntington Pointe", "Golden Lakes Village",
    "Palm Isles", "Century Village",
    "Kings Point Delray", "Valencia Falls",
    "Valencia Shores", "Fountains of Palm Beach",
    "BallenIsles", "PGA National",
    "Abacoa", "Ibis Golf",
    "Mirasol", "Olympia Wellington",
    "Seven Bridges", "Lotus Boca",
    "Covered Bridge Lake Worth",
    "High Point Delray",
]
QUERIES_COMMUNITIES = [f'site:facebook.com "{n}" HOA' for n in LARGE_COMMUNITIES]

QUERIES_ISSUES = [
    'site:facebook.com "special assessment" "Palm Beach" HOA 2025',
    'site:facebook.com "special assessment" "Palm Beach" HOA 2026',
    'site:facebook.com "HOA board" "Palm Beach" recall 2025',
    'site:facebook.com "HOA board" "Palm Beach" recall 2026',
    'site:facebook.com "HOA fraud" "Palm Beach" Florida',
    'site:facebook.com "HOA lawsuit" "Palm Beach" Florida 2025',
    'site:facebook.com "HOA lawsuit" "Palm Beach" Florida 2026',
    'site:facebook.com "condo assessment" "Palm Beach" 2026',
    'site:facebook.com "HOA fees increase" "Palm Beach"',
    'site:facebook.com "HOA management" "Palm Beach" fired',
]

ALL_QUERIES = QUERIES_GENERAL + QUERIES_COMMUNITIES + QUERIES_ISSUES


# ── Task 1: DDG search ────────────────────────────────────────────────────────

def search_duckduckgo(query: str):
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
        title_clean = re.sub(r"<[^>]+>", "", title).strip()
        idx = html.find(href)
        snip_m = re.search(r'class="result__snippet"[^>]*>([\s\S]*?)</a>', html[idx:idx+3000])
        snip = re.sub(r"<[^>]+>", "", snip_m.group(1)).strip() if snip_m else ""
        if "facebook.com" not in url.lower():
            continue
        out.append({"title": title_clean, "url": url, "snippet": snip})
    return out


# ── Task 2: Claude AI filter ──────────────────────────────────────────────────

def ai_evaluate(result: dict):
    user = (
        f'Evaluate this search result:\n'
        f'Title: {result["title"][:300]}\n'
        f'URL: {result["url"][:200]}\n'
        f'Snippet: {result.get("snippet","")[:400]}\n\n'
        'Questions:\n'
        '1. Is this about an HOA or condo community in Palm Beach County Florida?\n'
        '2. Does it mention a specific community name?\n'
        '3. Topic? (assessment/fees/board/lawsuit/fraud/general/other)\n'
        '4. Useful intelligence for HOA research?\n\n'
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
            system="You evaluate Facebook posts and pages for relevance to HOA communities in Palm Beach County Florida. Return JSON only.",
            messages=[{"role": "user", "content": user}],
        )
        text = resp.content[0].text if resp.content else ""
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE)
        return json.loads(text)
    except Exception as e:
        return {"relevant": False, "useful": False, "summary": f"err: {e}"}


# ── Task 3: fuzzy match ──────────────────────────────────────────────────────

def fuzzy_match(name: str, communities: list, threshold: float = 0.75):
    name_lower = name.lower().strip()
    best_score = 0
    best_match = None
    for c in communities:
        cn = (c.get("canonical_name") or "").lower()
        if not cn: continue
        score = SequenceMatcher(None, name_lower, cn).ratio()
        # Boost if one is a substring of the other
        if name_lower in cn or cn in name_lower:
            score = max(score, 0.85)
        if score > best_score:
            best_score = score
            best_match = c
    if best_score >= threshold:
        return best_match, round(best_score, 3)
    return None, 0


def fetch_all_communities():
    rows = []
    offset = 0
    while True:
        r = requests.get(
            f"{URL}/rest/v1/communities"
            f"?select=id,canonical_name,slug,city"
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


# ── Task 4: insert pending ────────────────────────────────────────────────────

TOPIC_TO_FIELD = {
    "assessment":     ("assessment_signal", 0.5),
    "fees":           ("assessment_signal", 0.5),
    "lawsuit":        ("litigation_signal", 0.5),
    "fraud":          ("litigation_signal", 0.5),
    "board":          ("community_signal",  0.4),
    "general":        ("community_signal",  0.4),
    "other":          ("community_signal",  0.4),
}


def insert_pending(community_id: str, eval_: dict, source_url: str):
    topic = (eval_.get("topic") or "general").lower()
    field, conf = TOPIC_TO_FIELD.get(topic, ("community_signal", 0.4))
    payload = {
        "community_id": community_id,
        "field_name": field,
        "proposed_value": (eval_.get("summary") or "")[:1000],
        "source_url": source_url[:500],
        "source_type": "facebook_public",
        "confidence": conf,
        "auto_approvable": False,
        "status": "pending",
    }
    r = requests.post(f"{URL}/rest/v1/pending_community_data", headers=H, json=payload)
    return r.status_code in (200, 201, 204), r.status_code, r.text[:200]


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    os.makedirs("scripts/output", exist_ok=True)
    print(f"FB-DDG search · {len(ALL_QUERIES)} queries · 1s delay\n")

    # Task 1 — collect
    raw = []
    for i, q in enumerate(ALL_QUERIES, 1):
        results = search_duckduckgo(q)
        print(f"  [{i}/{len(ALL_QUERIES)}] {len(results):2d} hits · {q[:80]}")
        for r in results:
            r["query"] = q
            raw.append(r)
        time.sleep(DELAY)

    # Dedupe by URL
    seen = set()
    unique = []
    for r in raw:
        if r["url"] and r["url"] not in seen:
            seen.add(r["url"])
            unique.append(r)
    print(f"\n  total raw: {len(raw)} · after dedupe: {len(unique)}")
    with open("scripts/output/facebook-raw.json", "w") as f:
        json.dump(unique, f, indent=2)

    # Task 2 — AI filter
    print(f"\n=== Claude AI filter on {len(unique)} unique results ===")
    relevant = []
    for i, r in enumerate(unique, 1):
        ev = ai_evaluate(r)
        r["ai"] = ev
        if ev.get("relevant") and ev.get("useful"):
            relevant.append(r)
            print(f"  [{i}] KEEP · {ev.get('topic')} · {ev.get('community_mentioned') or '?'}")
        time.sleep(0.3)
    print(f"  relevant+useful: {len(relevant)}/{len(unique)}")
    with open("scripts/output/facebook-relevant.json", "w") as f:
        json.dump(relevant, f, indent=2)

    # Task 3 — match
    print(f"\n=== Fuzzy-match to DB ===")
    communities = fetch_all_communities()
    print(f"  loaded {len(communities)} published communities")
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
                print(f"  ✓ {cname!r:40s} → {m['canonical_name']} ({score})")
            else:
                r["matched_community"] = None
                unmatched.append(r)
                print(f"  ✗ {cname!r} — no DB match")
        else:
            unmatched.append(r)
    with open("scripts/output/facebook-matched.json", "w") as f:
        json.dump(matched, f, indent=2)
    with open("scripts/output/facebook-unmatched.json", "w") as f:
        json.dump(unmatched, f, indent=2)
    print(f"  matched: {len(matched)} · unmatched: {len(unmatched)}")

    # Task 4 — insert
    print(f"\n=== Insert to pending_community_data ===")
    inserted = 0
    topic_counts = {}
    for r in matched:
        topic = (r["ai"].get("topic") or "general").lower()
        topic_counts[topic] = topic_counts.get(topic, 0) + 1
        ok, code, body = insert_pending(r["matched_community"]["id"], r["ai"], r["url"])
        if ok:
            inserted += 1
            print(f"  + [{topic:11s}] {r['matched_community']['canonical_name']} — {r['ai'].get('summary','')[:60]}")
        else:
            print(f"  ! FAIL ({code}) {body}")

    # Task 5 — report
    today = date.today().isoformat()
    report_path = f"scripts/output/facebook-search-report-{today}.txt"
    lines = []
    lines.append("=== FACEBOOK PUBLIC POST SEARCH REPORT ===")
    lines.append(f"Date: {today}")
    lines.append("Method: DuckDuckGo site:facebook.com searches")
    lines.append("")
    lines.append("SEARCH SUMMARY:")
    lines.append(f"  Total queries run:          {len(ALL_QUERIES)}")
    lines.append(f"  Total results found:        {len(raw)}")
    lines.append(f"  After deduplication:        {len(unique)}")
    lines.append(f"  Relevant and useful:        {len(relevant)}")
    lines.append(f"  Matched to database:        {len(matched)}")
    lines.append(f"  Unmatched (no community):   {len(unmatched)}")
    lines.append("")
    lines.append("TOP TOPICS FOUND:")
    for t in ["assessment","fees","board","lawsuit","fraud","general","other"]:
        n = sum(1 for r in relevant if (r['ai'].get('topic') or '').lower() == t)
        lines.append(f"  {t:14s}: {n}")
    lines.append("")
    lines.append("MATCHED COMMUNITIES:")
    for r in matched:
        lines.append(f"  • {r['matched_community']['canonical_name']} [{r['ai'].get('topic')}] {r['url'][:80]}")
    lines.append("")
    lines.append(f"PENDING QUEUE ITEMS ADDED: {inserted}")
    lines.append("Go to https://www.hoa-agent.com/admin/pending to review.")
    lines.append("")
    lines.append("UNMATCHED MENTIONS (candidates to add to DB):")
    seen_unmatched = set()
    for r in unmatched:
        cname = (r.get("ai") or {}).get("community_mentioned")
        if cname and cname not in seen_unmatched:
            seen_unmatched.add(cname)
            lines.append(f"  • {cname} — {r['url'][:80]}")
    with open(report_path, "w") as f:
        f.write("\n".join(lines))
    print("\n" + "\n".join(lines[-25:]))
    print(f"\nReport saved: {report_path}")


if __name__ == "__main__":
    main()
