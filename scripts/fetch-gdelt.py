import os
import sys
import time
import json
import requests
from datetime import datetime
from supabase import create_client, Client

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc"

GDELT_QUERIES = [
    '"homeowners association" sourcecountry:US sourcelang:english',
    '"HOA" "Palm Beach" sourcecountry:US',
    '"special assessment" "Florida" HOA',
]


def get_supabase():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: Missing SUPABASE env vars")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def fetch_gdelt(query, max_records=250):
    params = {
        "query": query,
        "mode": "artlist",
        "format": "json",
        "maxrecords": max_records,
        "sort": "DateDesc",
    }
    try:
        resp = requests.get(GDELT_ENDPOINT, params=params, timeout=60)
        if resp.status_code != 200:
            print(f"GDELT error {resp.status_code}: {resp.text[:200]}")
            return []
        data = resp.json()
        return data.get("articles", [])
    except Exception as e:
        print(f"GDELT fetch error: {e}")
        return []


def parse_gdelt_date(seendate):
    if not seendate:
        return None
    try:
        return datetime.strptime(seendate, "%Y%m%dT%H%M%SZ").isoformat()
    except ValueError:
        return None


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
        text = text.strip()
        return json.loads(text)
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
                "match_reason": "GDELT name match: '" + name + "' -> '" + row["canonical_name"] + "'",
            })
    return matches


def save_article(supabase, article):
    url = article.get("url", "")
    if not url:
        return None

    existing = supabase.table("news_items").select("id").eq("url", url).execute()
    if existing.data:
        print(f"  SKIP (duplicate): {article.get('title', '')[:60]}")
        return None

    title = article.get("title", "")
    seendate = article.get("seendate") or article.get("crawldate") or ""
    published = parse_gdelt_date(seendate)
    source = article.get("domain", "GDELT")

    row = {
        "title": title[:500],
        "url": url,
        "source": source,
        "published_date": published,
        "raw_content": "",
        "ai_summary": "",
        "ai_extracted_hoas": [],
        "status": "pending",
    }
    result = supabase.table("news_items").insert(row).execute()
    if not result.data:
        print(f"  ERROR saving: {title[:60]}")
        return None

    news_id = result.data[0]["id"]
    print(f"  SAVED [{news_id[:8]}]: {title[:60]}")
    return news_id


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


def main():
    print("GDELT Historical News Fetcher")
    supabase = get_supabase()

    total_fetched = 0
    total_saved = 0
    total_matched = 0

    for query in GDELT_QUERIES:
        print(f"\n=== Query: {query} ===")
        articles = fetch_gdelt(query)
        print(f"Fetched {len(articles)} articles")
        total_fetched += len(articles)

        for article in articles:
            title = article.get("title", "")
            news_id = save_article(supabase, article)
            if news_id:
                total_saved += 1
                hoas = ai_extract_hoas(title)
                if hoas:
                    matches = match_communities(supabase, hoas)
                    if matches:
                        save_community_matches(supabase, news_id, matches)
                        total_matched += len(matches)
            time.sleep(0.3)

        time.sleep(5)

    print(f"\nDone -- {total_fetched} fetched, {total_saved} saved, {total_matched} community matches")


if __name__ == "__main__":
    main()
