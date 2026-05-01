"""
Link unmatched Palm Beach articles to their communities.
Searches news_items for articles mentioning each community by name,
inserts missing community_news rows, then re-runs reputation scoring.
Does NOT modify news_items or communities schema.
"""
import os
import sys
import time
from dotenv import load_dotenv
from typing import Optional, List, Dict

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))
from supabase import create_client

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# Communities to manually check and link
TARGET_COMMUNITIES = [
    "Joggers Run",
    "Black Diamond",
    "La Clara",
    "Riverwalk",
    "Atlantic Cloisters",
]


def get_supabase():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_KEY == "your_service_role_key_here":
        print("ERROR: SUPABASE_SERVICE_ROLE_KEY is missing or is still a placeholder.")
        print("  Set it in .env.local and re-run.")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def find_community(supabase, name: str) -> Optional[Dict]:
    result = (
        supabase.table("communities")
        .select("id, canonical_name, city, slug, status")
        .ilike("canonical_name", f"%{name}%")
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if rows:
        return rows[0]
    # Try exact match as fallback
    result2 = (
        supabase.table("communities")
        .select("id, canonical_name, city, slug, status")
        .eq("canonical_name", name)
        .limit(1)
        .execute()
    )
    rows2 = result2.data or []
    return rows2[0] if rows2 else None


def find_matching_articles(supabase, community_name: str) -> List[Dict]:
    """Search news_items title and raw_content for community name mentions."""
    # Search by title
    r1 = (
        supabase.table("news_items")
        .select("id, title, url, source, published_date, status")
        .ilike("title", f"%{community_name}%")
        .in_("status", ["approved", "pending"])
        .execute()
    )
    by_title = {r["id"]: r for r in (r1.data or [])}

    # Search by raw_content
    r2 = (
        supabase.table("news_items")
        .select("id, title, url, source, published_date, status")
        .ilike("raw_content", f"%{community_name}%")
        .in_("status", ["approved", "pending"])
        .execute()
    )
    by_content = {r["id"]: r for r in (r2.data or [])}

    # Merge
    combined = {**by_content, **by_title}
    return list(combined.values())


def already_linked(supabase, news_id: str, community_id: str) -> bool:
    r = (
        supabase.table("community_news")
        .select("id")
        .eq("news_item_id", news_id)
        .eq("community_id", community_id)
        .execute()
    )
    return bool(r.data)


def link_article(supabase, news_id: str, community_id: str,
                 community_name: str, article_title: str) -> bool:
    if already_linked(supabase, news_id, community_id):
        print(f"    [already linked] {article_title[:60]}")
        return False
    supabase.table("community_news").insert({
        "news_item_id": news_id,
        "community_id": community_id,
        "match_confidence": 0.90,
        "match_reason": f"Manual link: community name '{community_name}' found in article",
        "status": "approved",
    }).execute()
    supabase.table("news_items").update({"status": "approved"}).eq("id", news_id).execute()
    print(f"    [LINKED] {article_title[:60]}")
    return True


def rescore_community(supabase, community_id: str, community_name: str):
    """Re-import the reputation scoring logic inline to avoid circular dependency."""
    import json
    import requests
    ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
    if not ANTHROPIC_API_KEY:
        print(f"  Skipping reputation score (no ANTHROPIC_API_KEY)")
        return

    articles_result = (
        supabase.table("community_news")
        .select("news_items(id, title, ai_summary, published_date)")
        .eq("community_id", community_id)
        .eq("status", "approved")
        .execute()
    )
    articles = [r["news_items"] for r in (articles_result.data or []) if r.get("news_items")]
    if not articles:
        return

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
        "messages": [{
            "role": "user",
            "content": (
                "You are analyzing news articles about a Florida HOA or condo association "
                "to determine its news reputation.\n\nArticles:\n" + combined +
                "\n\nScore from 1-10 where 1-3=High Risk, 4-5=Under Scrutiny, "
                "6-7=Mixed, 8-9=Good Standing, 10=Excellent.\n"
                "Reply with only JSON: {\"score\": N, \"label\": \"...\", \"summary\": \"...\"}"
            ),
        }],
    }
    try:
        resp = requests.post("https://api.anthropic.com/v1/messages",
                             headers=headers, json=payload, timeout=30)
        data = resp.json()
        text = data["content"][0]["text"].strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        result = json.loads(text.strip())
        score = result.get("score")
        label = result.get("label")
        summary = result.get("summary")
        supabase.table("communities").update({
            "news_reputation_score": score,
            "news_reputation_label": label,
            "news_reputation_updated_at": "now()",
        }).eq("id", community_id).execute()
        print(f"  Reputation score updated: {score}/10 — {label}")
    except Exception as e:
        print(f"  Reputation scoring error: {e}")


def main():
    print("=== Link Unmatched Palm Beach Articles ===\n")
    supabase = get_supabase()

    total_linked = 0
    rescored: List[str] = []

    for name in TARGET_COMMUNITIES:
        print(f"\n--- {name} ---")

        community = find_community(supabase, name)
        if not community:
            print(f"  Community not found in DB: '{name}'")
            continue
        print(f"  Found: {community['canonical_name']} (id={community['id'][:8]}...)")

        articles = find_matching_articles(supabase, name)
        if not articles:
            print(f"  No articles mention '{name}' in title or content")
            continue
        print(f"  Found {len(articles)} article(s) mentioning '{name}':")

        newly_linked = 0
        for article in articles:
            linked = link_article(supabase, article["id"], community["id"],
                                  name, article.get("title", ""))
            if linked:
                newly_linked += 1
                total_linked += 1

        if newly_linked > 0:
            rescored.append(community["id"])
            print(f"  Linked {newly_linked} new article(s)")
        else:
            print(f"  All articles already linked")

        time.sleep(0.5)

    # Re-run reputation scoring for communities that got new links
    if rescored:
        print(f"\n=== Re-scoring {len(rescored)} communities ===")
        for community_id in rescored:
            r = (supabase.table("communities")
                 .select("canonical_name")
                 .eq("id", community_id)
                 .single()
                 .execute())
            cname = (r.data or {}).get("canonical_name", community_id)
            print(f"\nScoring: {cname}")
            rescore_community(supabase, community_id, cname)
            time.sleep(1)

    print(f"\n=== Summary ===")
    print(f"  Communities checked: {len(TARGET_COMMUNITIES)}")
    print(f"  New article links:   {total_linked}")
    print(f"  Communities re-scored: {len(rescored)}")
    print("\nDone.")


if __name__ == "__main__":
    main()
