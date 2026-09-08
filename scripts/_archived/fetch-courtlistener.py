import os
import sys
import time
import json
import requests
from datetime import datetime
from supabase import create_client, Client

COURTLISTENER_TOKEN = os.environ.get("COURTLISTENER_TOKEN", "")
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

SEARCH_ENDPOINT = "https://www.courtlistener.com/api/rest/v4/search/"

FLORIDA_COURT_IDS = [
    "fladistctapp",
    "fla",
    "flsd",
    "flmd",
    "flnd",
    "flaapp1",
    "flaapp2",
    "flaapp3",
    "flaapp4",
    "flaapp5",
]

CASE_TAGS = [
    ("special assessment", "special_assessment"),
    ("board fraud", "board_fraud"),
    ("structural integrity", "structural_integrity"),
    ("foreclosure", "foreclosure"),
    ("embezzl", "embezzlement"),
    ("HB 1203", "hb_1203"),
    ("HB 1021", "hb_1021"),
    ("SB 4-D", "sb_4d"),
    ("reserve fund", "reserve_fund"),
    ("condo collapse", "condo_collapse"),
    ("election", "board_election"),
    ("discrimination", "discrimination"),
    ("harassment", "harassment"),
    ("towing", "towing"),
    ("fine", "fines"),
    ("lien", "lien"),
    ("amendment", "amendment"),
    ("record", "records_access"),
]

def get_supabase():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: Missing SUPABASE env vars")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def extract_tags(text):
    text_lower = text.lower()
    found = []
    for phrase, tag in CASE_TAGS:
        if phrase.lower() in text_lower:
            found.append(tag)
    return list(set(found))

def fetch_cases(query, court_id=None, page_size=20, cursor=None):
    headers = {"Authorization": f"Token {COURTLISTENER_TOKEN}"}
    params = {
        "q": query,
        "type": "o",
        "page_size": page_size,
        "order_by": "dateFiled desc",
    }
    if court_id:
        params["court"] = court_id
    if cursor:
        params["cursor"] = cursor
    for attempt in range(3):
        try:
            resp = requests.get(SEARCH_ENDPOINT, headers=headers, params=params, timeout=60)
            break
        except Exception as e:
            if attempt == 2:
                print(f"  Timeout after 3 attempts: {e}")
                return {}
            print(f"  Timeout attempt {attempt + 1}, retrying...")
            time.sleep(5)
    if resp.status_code != 200:
        print(f"API error {resp.status_code}: {resp.text[:200]}")
        return {}
    return resp.json()

def ai_summarize_case(case_name, snippet, court):
    if not ANTHROPIC_API_KEY or not snippet:
        return None
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    payload = {
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 256,
        "messages": [
            {
                "role": "user",
                "content": f"""Summarize this Florida HOA court case in 1-2 plain English sentences for a homeowner audience.

Case: {case_name}
Court: {court}
Excerpt: {snippet[:1000]}

Return only the summary, no labels or explanation.""",
            }
        ],
    }
    try:
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers=headers,
            json=payload,
            timeout=30,
        )
        data = resp.json()
        return data["content"][0]["text"].strip()
    except Exception as e:
        print(f"AI summary error: {e}")
        return None

def match_communities(supabase, case_name):
    words = [w for w in case_name.split() if len(w) > 4 and w.lower() not in [
        "homeowners", "association", "condominium", "community", "incorporated",
        "versus", "appellant", "appellee", "plaintiff", "defendant", "inc", "llc"
    ]]
    matches = []
    for word in words[:3]:
        result = (
            supabase.table("communities")
            .select("id, canonical_name, zip_code, city")
            .ilike("canonical_name", f"%{word}%")
            .limit(3)
            .execute()
        )
        for row in result.data:
            already = any(m["community_id"] == row["id"] for m in matches)
            if not already:
                matches.append({
                    "community_id": row["id"],
                    "community_name": row["canonical_name"],
                    "confidence": 0.75,
                    "match_reason": f"Name keyword match: '{word}' in '{row['canonical_name']}'",
                })
    return matches

def save_case(supabase, result):
    court_listener_id = str(result.get("cluster_id", ""))
    if not court_listener_id:
        return None

    existing = supabase.table("legal_cases").select("id").eq("court_listener_id", court_listener_id).execute()
    if existing.data:
        print(f"  SKIP (duplicate): {result.get('caseName', '')[:60]}")
        return None

    case_name = result.get("caseName", "")
    snippet = ""
    opinions = result.get("opinions", [])
    if opinions:
        snippet = opinions[0].get("snippet", "")

    tags = extract_tags(case_name + " " + snippet)
    ai_summary = ai_summarize_case(case_name, snippet, result.get("court", ""))

    row = {
        "court_listener_id": court_listener_id,
        "case_name": case_name[:500],
        "court": result.get("court", ""),
        "court_id": result.get("court_id", ""),
        "docket_number": result.get("docketNumber", ""),
        "date_filed": result.get("dateFiled"),
        "absolute_url": "https://www.courtlistener.com" + result.get("absolute_url", ""),
        "snippet": snippet[:2000],
        "tags": tags,
        "ai_summary": ai_summary,
        "status": "published",
    }
    insert = supabase.table("legal_cases").insert(row).execute()
    if not insert.data:
        print(f"  ERROR saving: {case_name[:60]}")
        return None

    case_id = insert.data[0]["id"]
    print(f"  SAVED [{case_id[:8]}]: {case_name[:60]}")
    return case_id

def save_community_matches(supabase, case_id, matches):
    for m in matches:
        existing = (
            supabase.table("community_legal_cases")
            .select("id")
            .eq("legal_case_id", case_id)
            .eq("community_id", m["community_id"])
            .execute()
        )
        if existing.data:
            continue
        supabase.table("community_legal_cases").insert({
            "legal_case_id": case_id,
            "community_id": m["community_id"],
            "match_confidence": m["confidence"],
            "match_reason": m["match_reason"],
            "status": "pending",
        }).execute()
        print(f"    -> Matched: {m['community_name']} ({m['confidence']})")

def run_florida_search(supabase, query, max_pages=3):
    total_saved = 0
    total_matched = 0
    cursor = None

    for page in range(1, max_pages + 1):
        print(f"\n-- Page {page} ({query[:50]}) --")
        data = fetch_cases(query, cursor=cursor)
        results = data.get("results", [])
        if not results:
            print("No results.")
            break

        print(f"{data.get('count', 0)} total -- processing {len(results)}")

        for result in results:
            court_id = result.get("court_id", "")
            if court_id not in FLORIDA_COURT_IDS:
                print(f"  SKIP (non-Florida): {result.get('caseName', '')[:50]} [{court_id}]")
                continue

            case_id = save_case(supabase, result)
            if case_id:
                total_saved += 1
                case_name = result.get("caseName", "")
                matches = match_communities(supabase, case_name)
                if matches:
                    save_community_matches(supabase, case_id, matches)
                    total_matched += len(matches)
            time.sleep(0.3)

        next_url = data.get("next")
        if not next_url:
            break
        cursor = next_url.split("cursor=")[1].split("&")[0] if "cursor=" in next_url else None
        time.sleep(2)

    return total_saved, total_matched

def main():
    print(f"CourtListener Fetcher")
    print(f"Token: {COURTLISTENER_TOKEN[:8]}...")

    supabase = get_supabase()
    total_saved = 0
    total_matched = 0

    queries = [
        "Florida homeowners association",
        "Florida condo association",
        "Florida HOA fraud",
        "Florida HOA special assessment",
        "Florida HOA foreclosure",
        "Florida condominium structural",
        # Palm Beach County targeted queries
        "homeowners association Palm Beach",
        "HOA assessment Palm Beach",
        "special assessment Palm Beach County",
        "condominium association Palm Beach",
        "community association lien Palm Beach",
        "HOA foreclosure Palm Beach County",
        # Deep-research queries (task 12)
        "HOA fraud Palm Beach",
        "condo association special assessment Florida",
        "HOA board recall Florida",
        "homeowners association embezzlement Florida",
        "community association manager fraud Florida",
        "HOA discrimination Florida",
        "condo termination Florida",
        "bulk buyer condo Florida",
    ]

    for query in queries:
        saved, matched = run_florida_search(supabase, query, max_pages=2)
        total_saved += saved
        total_matched += matched
        time.sleep(3)

    print(f"\nDone -- {total_saved} cases saved, {total_matched} community matches")

if __name__ == "__main__":
    main()
