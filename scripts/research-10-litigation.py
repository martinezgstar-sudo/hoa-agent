#!/usr/bin/env python3
"""
research-10-litigation.py
Per-community litigation research. CourtListener API + DDG variants.
AI verify (confidence >= 0.80). Insert into legal_cases + link via community_legal_cases.
Increment communities.litigation_count.
"""
import json, os, re, sys, time, urllib.parse, urllib.request, warnings
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


def fetch(url, timeout=12):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", errors="ignore")
    except Exception:
        return ""


def courtlistener_search(name):
    """Public CourtListener search API."""
    q = urllib.parse.quote_plus(f'"{name}"')
    api = f"https://www.courtlistener.com/api/rest/v3/search/?q={q}&type=o&court=fladistctapp,flacirct,flsd,flmd,flnd"
    try:
        body = fetch(api, timeout=20)
        if not body: return []
        data = json.loads(body)
        out = []
        for r in data.get("results", [])[:5]:
            out.append({
                "court_listener_id": str(r.get("id") or ""),
                "case_name": (r.get("caseName") or "")[:500],
                "court": r.get("court") or "",
                "court_id": r.get("court_id") or "",
                "docket_number": r.get("docketNumber") or "",
                "date_filed": (r.get("dateFiled") or "")[:10] or None,
                "absolute_url": "https://www.courtlistener.com" + (r.get("absolute_url") or ""),
                "snippet": (r.get("snippet") or "")[:1000],
                "source": "courtlistener",
            })
        return out
    except Exception as e:
        print(f"   courtlistener err: {e}")
        return []


def ddg_search(q, max_results=4):
    qenc = urllib.parse.quote_plus(q)
    html = fetch(f"https://html.duckduckgo.com/html/?q={qenc}")
    if not html: return []
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
        out.append({
            "court_listener_id": "",
            "case_name": title_clean[:500],
            "court": "",
            "court_id": "",
            "docket_number": "",
            "date_filed": None,
            "absolute_url": url,
            "snippet": snip[:1000],
            "source": "duckduckgo",
        })
    return out


def case_in_db(case_name, cl_id):
    if cl_id:
        r = requests.get(f"{URL}/rest/v1/legal_cases?select=id&court_listener_id=eq.{urllib.parse.quote(cl_id)}", headers=H)
        if r.status_code == 200 and r.json(): return r.json()[0]["id"]
    qn = urllib.parse.quote(f"%{case_name[:40]}%")
    r = requests.get(f"{URL}/rest/v1/legal_cases?select=id&case_name=ilike.{qn}", headers=H)
    if r.status_code == 200 and r.json(): return r.json()[0]["id"]
    return None


def ai_verify(case, name, city):
    user = (
        f'Is this Florida court case about the "{name}" HOA/condo association in {city}, FL?\n\n'
        f'Case: {case["case_name"][:300]}\n'
        f'Court: {case.get("court","")}\n'
        f'Snippet: {case.get("snippet","")[:500]}\n\n'
        'Return JSON only: {"match": true|false, "confidence": 0.0-1.0, "reason": "brief", "case_type": "lien|foreclosure|breach|injury|construction|other"}'
    )
    try:
        resp = CLIENT.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=200,
            system="You verify whether a Florida court case is about a named HOA/condo association. Strict matching: party name must clearly reference the named community.",
            messages=[{"role": "user", "content": user}],
        )
        text = resp.content[0].text if resp.content else ""
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE)
        return json.loads(text)
    except Exception as e:
        return {"match": False, "confidence": 0, "reason": f"err: {e}", "case_type": "other"}


def insert_case(case, ev):
    payload = {
        "court_listener_id": case.get("court_listener_id") or None,
        "case_name": case["case_name"][:500],
        "court": (case.get("court") or "")[:200] or None,
        "court_id": (case.get("court_id") or "")[:50] or None,
        "docket_number": (case.get("docket_number") or "")[:100] or None,
        "date_filed": case.get("date_filed"),
        "absolute_url": case.get("absolute_url") or None,
        "snippet": case.get("snippet") or None,
        "status": "published",
        "case_type": ev.get("case_type") or None,
        "ai_summary": ev.get("reason", "")[:500],
    }
    r = requests.post(f"{URL}/rest/v1/legal_cases", headers={**H, "Prefer": "return=representation"}, json=payload)
    if r.status_code in (200, 201):
        body = r.json()
        return body[0]["id"] if body else None
    print(f"   insert FAIL {r.status_code}: {r.text[:120]}")
    return None


def link_case(community_id, case_id, ev):
    payload = {
        "community_id": community_id,
        "legal_case_id": case_id,
        "match_confidence": ev.get("confidence", 0),
        "match_reason": ev.get("reason", "")[:300],
        "status": "approved",
    }
    r = requests.post(f"{URL}/rest/v1/community_legal_cases", headers=H, json=payload)
    return r.status_code in (200, 201, 204)


def bump_litigation(community_id, n):
    r = requests.get(f"{URL}/rest/v1/communities?select=litigation_count&id=eq.{community_id}", headers=H)
    cur = 0
    if r.status_code == 200 and r.json():
        cur = r.json()[0].get("litigation_count") or 0
    requests.patch(
        f"{URL}/rest/v1/communities?id=eq.{community_id}&status=eq.published",
        headers=H, json={"litigation_count": cur + n})


def main():
    targets = json.load(open("scripts/output/research-targets-10.json"))
    print(f"Litigation research for {len(targets)} communities\n")
    all_results = []
    grand_inserted = 0

    for c in targets:
        name = c["canonical_name"]
        city = c.get("city") or ""
        print(f"=== {name} ({city})")

        cases = []
        cases.extend(courtlistener_search(name))
        cases.extend(ddg_search(f'"{name}" lawsuit Florida'))
        cases.extend(ddg_search(f'"{name}" HOA litigation OR foreclosure OR lien Florida'))
        cases.extend(ddg_search(f'site:scholar.google.com "{name}"'))
        cases.extend(ddg_search(f'site:law.justia.com "{name}" Florida'))
        time.sleep(0.5)

        seen = set()
        unique = []
        for ca in cases:
            key = (ca.get("court_listener_id") or "") + "|" + ca["case_name"][:60].lower()
            if ca["case_name"] and key not in seen:
                seen.add(key)
                unique.append(ca)
        print(f"   Found {len(unique)} unique cases")

        new_inserted = 0
        verified = 0
        for ca in unique[:12]:
            existing = case_in_db(ca["case_name"], ca.get("court_listener_id", ""))
            ev = ai_verify(ca, name, city)
            if ev.get("match") and ev.get("confidence", 0) >= 0.80:
                verified += 1
                cid = existing
                if not cid:
                    cid = insert_case(ca, ev)
                    if cid:
                        new_inserted += 1
                        print(f'   + inserted "{ca["case_name"][:60]}" (conf {ev["confidence"]})')
                if cid:
                    link_case(c["id"], cid, ev)
            time.sleep(0.3)

        if verified:
            bump_litigation(c["id"], verified)

        all_results.append({
            "id": c["id"], "canonical_name": name,
            "cases_found": len(unique), "verified": verified, "new_inserted": new_inserted,
        })
        grand_inserted += new_inserted
        print(f"   verified: {verified}, new inserted: {new_inserted}\n")

    with open("scripts/output/research-10-litigation-result.json", "w") as f:
        json.dump(all_results, f, indent=2)
    print(f"=== TOTALS ===")
    print(f"  New cases inserted: {grand_inserted}")


if __name__ == "__main__":
    main()
