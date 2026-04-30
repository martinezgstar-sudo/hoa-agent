import os
import sys
import time
import json
import requests
import xml.etree.ElementTree as ET
from datetime import datetime
from urllib.parse import quote_plus
from supabase import create_client, Client

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

GNEWS_BASE = "https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"

SEARCH_QUERIES = [
    "site:sun-sentinel.com HOA",
    "site:palmbeachpost.com HOA",
    "Florida HOA lawsuit 2025",
    "Palm Beach County homeowners association",
]


def get_supabase():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: Missing SUPABASE env vars")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def fetch_rss(query):
    url = GNEWS_BASE.format(query=quote_plus(query))
    try:
        resp = requests.get(url, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
        if resp.status_code != 200:
            print(f"RSS error {resp.status_code} for query: {query}")
            return []
        root = ET.fromstring(resp.content)
        items = []
        for item in root.findall(".//item"):
            title = item.findtext("title") or ""
            link = item.findtext("link") or ""
            pub_date = item.findtext("pubDate") or ""
            source_el = item.find("source")
            source = source_el.text if source_el is not None else "Google News"
            if link:
                items.append({
                    "title": title,
                    "url": link,
                    "published_date": parse_date(pub_date),
                    "source": source,
                })
        return items
    except Exception as e:
        print(f"RSS fetch error: {e}")
        return []


def parse_date(date_str):
    if not date_str:
        return None
    formats = [
        "%a, %d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S GMT",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).isoformat()
        except ValueError:
            continue
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
                "match_reason": "Google News name match: '" + name + "' -> '" + row["canonical_name"] + "'",
            })
    return matches


def save_article(supabase, article, hoas):
    url = article.get("url", "")
    if not url:
        return None
    existing = supabase.table("news_items").select("id").eq("url", url).execute()
    if existing.data:
        print(f"  SKIP (duplicate): {article.get('title', '')[:60]}")
        return None

    row = {
        "title": (article.get("title") or "")[:500],
        "url": url,
        "source": article.get("source", "Google News"),
        "published_date": article.get("published_date"),
        "raw_content": "",
        "ai_summary": "",
        "ai_extracted_hoas": hoas,
        "status": "pending",
    }
    result = supabase.table("news_items").insert(row).execute()
    if not result.data:
        print(f"  ERROR saving: {article.get('title', '')[:60]}")
        return None
    news_id = result.data[0]["id"]
    print(f"  SAVED [{news_id[:8]}]: {article.get('title', '')[:60]}")
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
    print("Google News RSS Fetcher")
    supabase = get_supabase()

    total_fetched = 0
    total_saved = 0
    total_matched = 0

    for query in SEARCH_QUERIES:
        print(f"\n=== Query: {query} ===")
        articles = fetch_rss(query)
        print(f"Fetched {len(articles)} articles")
        total_fetched += len(articles)

        for article in articles:
            title = article.get("title") or ""
            hoas = ai_extract_hoas(title)
            news_id = save_article(supabase, article, hoas)
            if news_id:
                total_saved += 1
                if hoas:
                    matches = match_communities(supabase, hoas)
                    if matches:
                        save_community_matches(supabase, news_id, matches)
                        total_matched += len(matches)
            time.sleep(0.3)

        time.sleep(2)

    print(f"\nDone -- {total_fetched} fetched, {total_saved} saved, {total_matched} community matches")


if __name__ == "__main__":
    main()
