import os
import sys
import time
import json
import requests
from datetime import datetime, timedelta
from supabase import create_client, Client

NEWSAPI_KEY = os.environ.get("NEWSAPI_KEY", "")
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

NEWSAPI_ENDPOINT = "https://newsapi.org/v2/everything"
PAGE_SIZE = 100
MAX_PAGES = 1

FLORIDA_TAGS = [
    ("HB 1203", "hb_1203"),
    ("HB 1021", "hb_1021"),
    ("SB 4-D", "sb_4d"),
    ("SB 4D", "sb_4d"),
    ("HB 657", "hb_657"),
    ("Special Assessment", "special_assessment"),
    ("Board Fraud", "board_fraud"),
    ("Structural Integrity", "structural_integrity"),
    ("Surfside", "surfside"),
    ("reserve fund", "reserve_fund"),
    ("condo collapse", "condo_collapse"),
    ("homeowners association", "hoa_general"),
    ("condominium association", "condo_general"),
]

def get_supabase():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: Missing SUPABASE env vars")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def extract_tags(text):
    text_lower = text.lower()
    found = []
    for phrase, tag in FLORIDA_TAGS:
        if phrase.lower() in text_lower:
            found.append(tag)
    return list(set(found))

def fetch_newsapi_page(page, from_date, to_date):
    params = {
        "q": "(Florida HOA) OR (Florida \"homeowners association\") OR (Florida \"condo association\")",
        "language": "en",
        "sortBy": "publishedAt",
        "pageSize": PAGE_SIZE,
        "page": page,
        "from": from_date,
        "to": to_date,
        "apiKey": NEWSAPI_KEY,
    }
    resp = requests.get(NEWSAPI_ENDPOINT, params=params, timeout=30)
    if resp.status_code != 200:
        print(f"NewsAPI error {resp.status_code}: {resp.text[:300]}")
        return {}
    return resp.json()

def ai_extract_hoas(title, body):
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
                "content": f"""You are extracting Florida HOA and condo association names from a news article.

Article title: {title}
Article excerpt: {snippet}

Return ONLY a JSON array of objects. Each object must have:
- name: the association name as written in the article
- city: city in Florida if mentioned, else null
- zip: zip code if mentioned, else null

If no specific association is named return an empty array [].
Return only valid JSON, no explanation.""",
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
            .select("id, name, zip_code, city")
            .ilike("name", f"%{name}%")
            .eq("published", True)
            .limit(3)
            .execute()
        )
        for row in result.data:
            confidence = 0.7
            if hoa.get("zip") and str(hoa["zip"]) == str(row.get("zip_code", "")):
                confidence = 0.95
            elif hoa.get("city") and hoa["city"].lower() in (row.get("city") or "").lower():
                confidence = 0.85
            matches.append(
                {
                    "community_id": row["id"],
                    "community_name": row["name"],
                    "confidence": confidence,
                    "match_reason": f"Name match: '{name}' -> '{row['name']}'",
                }
            )
    return matches

def save_article(supabase, article, hoas):
    url = article.get("url", "")
    if not url or url == "https://removed.com":
        print(f"  SKIP (removed): {article.get('title', '')[:60]}")
        return None

    existing = supabase.table("news_items").select("id").eq("url", url).execute()
    if existing.data:
        print(f"  SKIP (duplicate): {article.get('title', '')[:60]}")
        return None

    source_name = (article.get("source") or {}).get("name", "NewsAPI")
    published = article.get("publishedAt")
    body = article.get("content") or article.get("description") or ""

    row = {
        "title": (article.get("title") or "")[:500],
        "url": url,
        "source": source_name,
        "published_date": published,
        "raw_content": body[:10000],
        "ai_summary": (article.get("description") or "")[:1000],
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
    for m in matches:
        supabase.table("community_news").insert(
            {
                "news_item_id": news_id,
                "community_id": m["community_id"],
                "match_confidence": m["confidence"],
                "match_reason": m["match_reason"],
                "status": "pending",
            }
        ).execute()
        print(f"    -> Matched: {m['community_name']} ({m['confidence']})")

def main():
    days_back = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    to_date = datetime.utcnow().strftime("%Y-%m-%d")
    from_date = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%d")

    print(f"NewsAPI Fetcher -- {from_date} to {to_date}")
    print(f"API Key: {NEWSAPI_KEY[:8]}...")

    supabase = get_supabase()
    total_saved = 0
    total_matched = 0

    for page in range(1, MAX_PAGES + 1):
        print(f"\n-- Page {page} --")
        data = fetch_newsapi_page(page, from_date, to_date)

        if data.get("status") != "ok":
            print(f"API error: {data.get('message', 'unknown')}")
            break

        articles = data.get("articles", [])
        total_results = data.get("totalResults", 0)
        print(f"{total_results} total results -- processing {len(articles)} articles")

        if not articles:
            print("No articles returned.")
            break

        for article in articles:
            title = article.get("title") or ""
            body = article.get("content") or article.get("description") or ""
            tags = extract_tags(title + " " + body)
            hoas = ai_extract_hoas(title, body)
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

    print(f"\nDone -- {total_saved} articles saved, {total_matched} community matches")

if __name__ == "__main__":
    main()
