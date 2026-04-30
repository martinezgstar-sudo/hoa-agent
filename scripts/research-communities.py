"""
Nightly community research script.
Finds communities with thin data and enriches them from public sources.
"""
import os
import sys
import time
import json
import re
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from supabase import create_client

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

BATCH_SIZE = 20
SEARCH_COOLDOWN = 30  # days before re-researching a community


def get_supabase():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: Missing SUPABASE env vars")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def ensure_research_log_table(supabase):
    """Create community_research_log table if it doesn't exist via RPC or direct SQL."""
    try:
        supabase.table("community_research_log").select("id").limit(1).execute()
        print("community_research_log table exists")
    except Exception:
        print("community_research_log table may not exist — will attempt creation via API route")


def get_recently_researched_ids(supabase):
    cutoff = (datetime.utcnow() - timedelta(days=SEARCH_COOLDOWN)).isoformat()
    result = (
        supabase.table("community_research_log")
        .select("community_id")
        .gte("researched_at", cutoff)
        .execute()
    )
    return set(r["community_id"] for r in (result.data or []))


def get_thin_communities(supabase, exclude_ids, limit=BATCH_SIZE):
    result = (
        supabase.table("communities")
        .select("id, canonical_name, city, zip_code, county, state, management_company, hoa_website, phone, email, unit_count, monthly_fee_min, amenities, subdivision_aliases")
        .eq("status", "published")
        .execute()
    )
    all_communities = result.data or []

    def thinness_score(c):
        missing = sum([
            not c.get("management_company"),
            not c.get("hoa_website"),
            not c.get("phone"),
            not c.get("email"),
            not c.get("unit_count"),
            not c.get("monthly_fee_min"),
            not c.get("amenities"),
        ])
        return missing

    filtered = [c for c in all_communities if c["id"] not in exclude_ids]
    filtered.sort(key=thinness_score, reverse=True)
    return filtered[:limit]


def web_search(query):
    """Use DuckDuckGo Instant Answer API as a free search fallback."""
    try:
        resp = requests.get(
            "https://api.duckduckgo.com/",
            params={"q": query, "format": "json", "no_html": "1", "skip_disambig": "1"},
            timeout=15,
            headers={"User-Agent": "HOAAgent/1.0"},
        )
        data = resp.json()
        results = []
        if data.get("AbstractText"):
            results.append({"title": data.get("Heading", ""), "snippet": data["AbstractText"], "url": data.get("AbstractURL", "")})
        for r in data.get("RelatedTopics", [])[:5]:
            if isinstance(r, dict) and r.get("Text"):
                results.append({"title": r.get("Text", "")[:100], "snippet": r.get("Text", ""), "url": r.get("FirstURL", "")})
        return results
    except Exception as e:
        print(f"    Search error: {e}")
        return []


def ai_extract_community_data(community_name, city, search_results):
    if not ANTHROPIC_API_KEY or not search_results:
        return {}

    combined = "\n\n".join([
        f"Source: {r.get('url', '')}\nTitle: {r.get('title', '')}\nText: {r.get('snippet', '')}"
        for r in search_results[:8]
    ])

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
                    "Extract HOA details for " + community_name + " in " + city + ", Florida from these search results.\n\n"
                    + combined + "\n\n"
                    "Return a JSON object with only the fields you found evidence for:\n"
                    "- management_company: string or null\n"
                    "- hoa_website: string (URL) or null\n"
                    "- phone: string or null\n"
                    "- email: string or null\n"
                    "- unit_count: integer or null\n"
                    "- monthly_fee_min: number or null\n"
                    "- amenities: comma-separated string or null\n"
                    "- pet_restriction: string or null\n"
                    "- rental_approval: string or null\n\n"
                    "Only include fields you are confident about. Return only valid JSON."
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
        print(f"    AI extraction error: {e}")
        return {}


def research_community(supabase, community):
    cid = community["id"]
    name = community.get("canonical_name", "")
    city = community.get("city", "West Palm Beach")
    county = community.get("county", "Palm Beach")

    print(f"\nResearching: {name} ({city})")

    queries = [
        f"{name} HOA {city}",
        f"{name} homeowners association Palm Beach County",
        f"{name} condominium association Florida",
        f"{name} management company Florida",
        f"{name} HOA fees Florida",
    ]

    all_results = []
    for query in queries:
        results = web_search(query)
        all_results.extend(results)
        if len(all_results) >= 15:
            break
        time.sleep(1)

    sources_checked = [r.get("url", "") for r in all_results if r.get("url")]

    extracted = ai_extract_community_data(name, city, all_results)
    print(f"  Extracted: {list(extracted.keys())}")

    # Only update fields that are currently null/empty
    update_payload = {}
    fields_updated = []
    updatable_fields = [
        "management_company", "hoa_website", "phone", "email",
        "unit_count", "monthly_fee_min", "amenities", "pet_restriction", "rental_approval",
    ]
    for field in updatable_fields:
        if extracted.get(field) is not None and not community.get(field):
            update_payload[field] = extracted[field]
            fields_updated.append(field)

    if update_payload:
        supabase.table("communities").update(update_payload).eq("id", cid).execute()
        print(f"  Updated fields: {fields_updated}")
    else:
        print(f"  No new data found")

    # Log the research
    log_entry = {
        "community_id": cid,
        "researched_at": datetime.utcnow().isoformat(),
        "fields_updated": fields_updated,
        "sources_checked": sources_checked[:10],
        "notes": f"Searched {len(queries)} queries, found {len(all_results)} results" + (f", updated: {fields_updated}" if fields_updated else ", no updates"),
    }
    try:
        supabase.table("community_research_log").insert(log_entry).execute()
    except Exception as e:
        print(f"  Log insert error: {e}")

    return fields_updated


def main():
    print(f"Nightly Community Research -- {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC")

    if not ANTHROPIC_API_KEY:
        print("WARNING: ANTHROPIC_API_KEY not set — AI extraction disabled")

    supabase = get_supabase()
    ensure_research_log_table(supabase)

    recently_researched = get_recently_researched_ids(supabase)
    print(f"Excluding {len(recently_researched)} recently researched communities")

    communities = get_thin_communities(supabase, recently_researched)
    print(f"Selected {len(communities)} communities to research")

    total_updated = 0
    for community in communities:
        fields = research_community(supabase, community)
        if fields:
            total_updated += 1
        time.sleep(2)

    print(f"\nDone -- {len(communities)} researched, {total_updated} updated with new data")


if __name__ == "__main__":
    main()
