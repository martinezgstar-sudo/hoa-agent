import os
import sys
import time
import json
import requests
from supabase import create_client, Client

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

NEGATIVE_KEYWORDS = [
    "fraud", "embezzle", "lawsuit", "sue", "stole", "theft", "arrested",
    "criminal", "fine", "penalty", "complaint", "investigation", "corruption",
    "misconduct", "illegal", "violation", "scam", "swindler", "bankrupt",
    "delinquent", "foreclosure", "special assessment", "failed", "negligent"
]

POSITIVE_KEYWORDS = [
    "award", "compliance", "clean", "reserve", "transparent", "community",
    "improvement", "renovation", "upgrade", "certified", "well-managed",
    "financial stability", "reserve fund", "praised", "recognized"
]

def get_supabase():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: Missing SUPABASE env vars")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def ai_match_community(title, body, community_name, city, zip_code):
    if not ANTHROPIC_API_KEY:
        return None
    snippet = body[:2000] if body else title
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
                "content": f"""Does this news article specifically mention or relate to this Florida HOA or condo association?

Community name: {community_name}
City: {city}
ZIP: {zip_code}

Article title: {title}
Article excerpt: {snippet}

Reply with only a JSON object with two fields:
- match: true or false
- confidence: a number from 0.0 to 1.0
- reason: one short sentence explaining why

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
        print(f"AI match error: {e}")
        return None

def ai_reputation_score(articles):
    if not ANTHROPIC_API_KEY or not articles:
        return None, None
    combined = "\n\n".join([
        f"Title: {a['title']}\nSummary: {a.get('ai_summary') or ''}"
        for a in articles[:10]
    ])
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
                "content": f"""You are analyzing news articles about a Florida HOA or condo association to determine its news reputation.

Articles:
{combined}

Based on the news coverage, score this association's reputation from 1 to 10 where:
1-3 = High Risk (fraud, lawsuits, criminal activity)
4-5 = Under Scrutiny (complaints, fines, disputes)
6-7 = Mixed (some issues, mostly neutral)
8-9 = Good Standing (neutral to positive coverage)
10 = Excellent (award-winning, praised)

Reply with only a JSON object:
- score: number from 1 to 10
- label: one of "High Risk", "Under Scrutiny", "Mixed", "Good Standing", "Excellent"
- summary: one sentence explaining the score

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
        result = json.loads(text)
        return result.get("score"), result.get("label"), result.get("summary")
    except Exception as e:
        print(f"AI reputation error: {e}")
        return None, None, None

def extract_hoas_from_article(title, body):
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
                "content": f"""Extract any specific Florida HOA or condo association names from this article.

Article title: {title}
Article excerpt: {snippet}

Return ONLY a JSON array of objects with:
- name: association name as written
- city: Florida city if mentioned, else null
- zip: zip code if mentioned, else null

If no specific association is named return [].
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
        print(f"HOA extraction error: {e}")
        return []

def match_to_database(supabase, hoa_list):
    matches = []
    for hoa in hoa_list:
        name = hoa.get("name", "").strip()
        if not name or len(name) < 5:
            continue
        result = (
            supabase.table("communities")
            .select("id, canonical_name, zip_code, city")
            .ilike("canonical_name", f"%{name}%")
            .eq("status", "active")
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
                "match_reason": f"Name match: '{name}' -> '{row['canonical_name']}'",
            })
    return matches

def process_articles(supabase):
    print("Fetching approved articles...")
    result = (
        supabase.table("news_items")
        .select("id, title, url, source, published_date, raw_content, ai_summary, ai_extracted_hoas")
        .eq("status", "approved")
        .order("published_date", desc=True)
        .execute()
    )
    articles = result.data or []
    print(f"Found {len(articles)} approved articles")

    total_matched = 0
    for article in articles:
        title = article.get("title") or ""
        body = article.get("raw_content") or article.get("ai_summary") or ""
        print(f"\nProcessing: {title[:70]}")

        existing = (
            supabase.table("community_news")
            .select("id")
            .eq("news_item_id", article["id"])
            .execute()
        )
        if existing.data:
            print("  Already has community matches — skipping extraction")
            continue

        hoas = extract_hoas_from_article(title, body)
        if not hoas:
            print("  No specific HOAs found")
            time.sleep(0.5)
            continue

        print(f"  Found {len(hoas)} HOA mentions: {[h.get('name') for h in hoas]}")
        matches = match_to_database(supabase, hoas)

        for m in matches:
            existing_match = (
                supabase.table("community_news")
                .select("id")
                .eq("news_item_id", article["id"])
                .eq("community_id", m["community_id"])
                .execute()
            )
            if existing_match.data:
                continue
            supabase.table("community_news").insert({
                "news_item_id": article["id"],
                "community_id": m["community_id"],
                "match_confidence": m["confidence"],
                "match_reason": m["match_reason"],
                "status": "approved" if m["confidence"] >= 0.85 else "pending",
            }).execute()
            print(f"  -> Matched: {m['community_name']} ({m['confidence']})")
            total_matched += 1

        time.sleep(0.5)

    print(f"\nExtraction done — {total_matched} new community matches")
    return total_matched

def update_reputation_scores(supabase):
    print("\nUpdating reputation scores...")
    result = (
        supabase.table("community_news")
        .select("community_id")
        .eq("status", "approved")
        .execute()
    )
    community_ids = list(set([r["community_id"] for r in (result.data or [])]))
    print(f"Found {len(community_ids)} communities with matched news")

    for community_id in community_ids:
        articles_result = (
            supabase.table("community_news")
            .select("news_items(id, title, ai_summary, published_date)")
            .eq("community_id", community_id)
            .eq("status", "approved")
            .execute()
        )
        articles = [r["news_items"] for r in (articles_result.data or []) if r.get("news_items")]
        if not articles:
            continue

        community_result = (
            supabase.table("communities")
            .select("canonical_name")
            .eq("id", community_id)
            .single()
            .execute()
        )
        name = (community_result.data or {}).get("canonical_name", "")
        print(f"\nScoring: {name} ({len(articles)} articles)")

        score, label, summary = ai_reputation_score(articles)
        if score is None:
            continue

        supabase.table("communities").update({
            "news_reputation_score": score,
            "news_reputation_label": label,
            "news_reputation_updated_at": "now()",
        }).eq("id", community_id).execute()
        print(f"  Score: {score}/10 — {label}")
        time.sleep(1)

    print("\nReputation scoring done")

def main():
    supabase = get_supabase()
    process_articles(supabase)
    update_reputation_scores(supabase)
    print("\nAll done.")

if __name__ == "__main__":
    main()
