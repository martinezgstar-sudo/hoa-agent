"""
Guardian API historical news fetcher for HOA-related Florida articles.
Goes back 10 years using the from-date parameter.
"""
import os
import sys
import time
import json
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from supabase import create_client

GUARDIAN_API_KEY = os.environ.get("GUARDIAN_API_KEY", "")
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

GUARDIAN_ENDPOINT = "https://content.guardianapis.com/search"

QUERIES = [
    "HOA Florida",
    "homeowners association Florida",
    "Palm Beach County HOA",
    "condo association Florida",
]

FROM_DATE = (datetime.utcnow() - timedelta(days=365 * 10)).strftime("%Y-%m-%d")


def get_supabase():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: Missing SUPABASE env vars")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def fetch_guardian_page(query, page=1, page_size=50):
    if not GUARDIAN_API_KEY:
        print("WARNING: GUARDIAN_API_KEY not set — skipping Guardian fetch")
        return {}
    params = {
        "q": query,
        "from-date": FROM_DATE,
        "lang": "en",
        "page-size": page_size,
        "page": page,
        "order-by": "newest",
        "show-fields": "headline,trailText,bodyText,publication",
        "api-key": GUARDIAN_API_KEY,
    }
    try:
        resp = requests.get(GUARDIAN_ENDPOINT, params=params, timeout=30)
        if resp.status_code != 200:
            print(f"Guardian API error {resp.status_code}: {resp.text[:300]}")
            return {}
        return resp.json().get("response", {})
    except Exception as e:
        print(f"Guardian fetch error: {e}")
        return {}


def ai_extract_hoas(title, body=""):
    if not ANTHROPIC_API_KEY:
        return []
    snippet = body[:2000] if body else title
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    payload = {
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 512,
        "messages": [
            {
                "role": "user",
                "content": (
                    "Extract any specific Florida HOA or condo association names from this article.\n\n"
                    "Article title: " + title + "\n"
                    "Article excerpt: " + snippet + "\n\n"
                    "Return ONLY a JSON array of objects with:\n"
                    "- name: association name as written\n"
                    "- city: Florida city if mentioned, else null\n"
                    "- zip: zip code if mentioned, else null\n\n"
                    "If no specific association is named return [].\n"
                    "Return only valid JSON, no explanation."
                ),
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
        text = data["content"][0]["text"].strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())
    except Exception as e:
        print(f"AI extraction error: {e}")
        return []


def match_communities(supabase, hoa_list):
    matches = []
    for hoa in hoa_list:
        name = hoa.get("name", "").strip()
        if not name or len(name) < 5:
            continue
        result = (
            supabase.table("communities")
            .select("id, canonical_name, zip_code, city")
            .ilike("canonical_name", "%" + name + "%")
            .limit(3)
            .execute()
        )
        for row in result.data:
            confidence = 0.7
            if hoa.get("zip") and str(hoa["zip"]) == str(row.get("zip_code", "")):
                confidence = 0.95
            elif hoa.get("city") and hoa["city"].lower() in (row.get("city") or "").lower():
                confidence = 0.85
            matches.append({
                "community_id": row["id"],
                "community_name": row["canonical_name"],
                "confidence": confidence,
                "match_reason": "Guardian name match: '" + name + "' -> '" + row["canonical_name"] + "'",
            })
    return matches


def save_article(supabase, result):
    url = result.get("webUrl", "")
    if not url:
        return None

    existing = supabase.table("news_items").select("id").eq("url", url).execute()
    if existing.data:
        print(f"  SKIP (duplicate): {result.get('webTitle', '')[:60]}")
        return None

    fields = result.get("fields", {})
    title = result.get("webTitle", "")
    body = fields.get("bodyText", "") or fields.get("trailText", "")
    published = result.get("webPublicationDate")

    row = {
        "title": title[:500],
        "url": url,
        "source": "The Guardian",
        "published_date": published,
        "raw_content": body[:10000],
        "ai_summary": fields.get("trailText", "")[:1000],
        "ai_extracted_hoas": [],
        "status": "pending",
    }
    insert = supabase.table("news_items").insert(row).execute()
    if not insert.data:
        print(f"  ERROR saving: {title[:60]}")
        return None

    news_id = insert.data[0]["id"]
    print(f"  SAVED [{news_id[:8]}]: {title[:60]}")
    return news_id, title, body


def save_community_matches(supabase, news_id, matches):
    has_high_confidence = any(m["confidence"] >= 0.90 for m in matches)
    for m in matches:
        confidence = m["confidence"]
        if confidence < 0.70:
            continue
        existing = (
            supabase.table("community_news")
            .select("id")
            .eq("news_item_id", news_id)
            .eq("community_id", m["community_id"])
            .execute()
        )
        if existing.data:
            continue
        match_status = "approved" if confidence >= 0.90 else "pending"
        supabase.table("community_news").insert({
            "news_item_id": news_id,
            "community_id": m["community_id"],
            "match_confidence": confidence,
            "match_reason": m["match_reason"],
            "status": match_status,
        }).execute()
        print(f"    -> Matched [{match_status}]: {m['community_name']} ({confidence})")
    if has_high_confidence:
        supabase.table("news_items").update({"status": "approved"}).eq("id", news_id).execute()


def run_query(supabase, query, max_pages=5):
    saved = 0
    matched = 0

    for page in range(1, max_pages + 1):
        print(f"\n  -- Page {page} | {query} --")
        data = fetch_guardian_page(query, page=page)

        if not data:
            break

        results = data.get("results", [])
        total = data.get("total", 0)
        pages = data.get("pages", 1)
        print(f"  {total} total results — processing {len(results)} (page {page}/{pages})")

        if not results:
            break

        for result in results:
            save_result = save_article(supabase, result)
            if save_result:
                news_id, title, body = save_result
                saved += 1
                hoas = ai_extract_hoas(title, body)
                if hoas:
                    matches = match_communities(supabase, hoas)
                    if matches:
                        save_community_matches(supabase, news_id, matches)
                        matched += len(matches)
            time.sleep(0.3)

        if page >= pages:
            break
        time.sleep(2)

    return saved, matched


def main():
    if not GUARDIAN_API_KEY:
        print("WARNING: GUARDIAN_API_KEY not set — skipping")
        sys.exit(0)

    print(f"Guardian API Fetcher — from {FROM_DATE}")
    print(f"Key: {GUARDIAN_API_KEY[:8]}...")

    supabase = get_supabase()
    total_saved = 0
    total_matched = 0

    for query in QUERIES:
        print(f"\n=== Query: {query} ===")
        saved, matched = run_query(supabase, query, max_pages=5)
        total_saved += saved
        total_matched += matched
        time.sleep(3)

    print(f"\nDone — {total_saved} articles saved, {total_matched} community matches")


if __name__ == "__main__":
    main()
