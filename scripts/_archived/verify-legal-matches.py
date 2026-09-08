import os
import sys
import time
import json
import requests
from supabase import create_client, Client

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

def get_supabase():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: Missing SUPABASE env vars")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def ai_verify_match(case_name, snippet, community_name, city):
    if not ANTHROPIC_API_KEY:
        return False, 0.0
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    payload = {
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 128,
        "messages": [
            {
                "role": "user",
                "content": f"""Does this court case specifically involve this Florida HOA or condo association?

Case name: {case_name}
Case excerpt: {snippet[:500] if snippet else 'none'}
Community name: {community_name}
City: {city}

Reply with only a JSON object:
- match: true or false
- confidence: 0.0 to 1.0
- reason: one short sentence

Return only valid JSON.""",
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
        return result.get("match", False), result.get("confidence", 0.0)
    except Exception as e:
        print(f"AI error: {e}")
        return False, 0.0

def main():
    supabase = get_supabase()

    result = (
        supabase.table("community_legal_cases")
        .select("id, legal_case_id, community_id, match_reason")
        .eq("status", "pending")
        .execute()
    )
    pending = result.data or []
    print(f"Found {len(pending)} pending matches to verify")

    approved = 0
    rejected = 0

    for match in pending:
        case_result = (
            supabase.table("legal_cases")
            .select("case_name, snippet")
            .eq("id", match["legal_case_id"])
            .single()
            .execute()
        )
        case = case_result.data or {}

        community_result = (
            supabase.table("communities")
            .select("canonical_name, city")
            .eq("id", match["community_id"])
            .single()
            .execute()
        )
        community = community_result.data or {}

        case_name = case.get("case_name", "")
        snippet = case.get("snippet", "")
        community_name = community.get("canonical_name", "")
        city = community.get("city", "")

        print(f"\nVerifying: {case_name[:60]}")
        print(f"  -> Community: {community_name[:50]}")

        is_match, confidence = ai_verify_match(case_name, snippet, community_name, city)

        if is_match and confidence >= 0.75:
            supabase.table("community_legal_cases").update({
                "status": "approved",
                "match_confidence": confidence,
            }).eq("id", match["id"]).execute()
            print(f"  APPROVED (confidence: {confidence})")
            approved += 1
        else:
            supabase.table("community_legal_cases").update({
                "status": "rejected",
                "match_confidence": confidence,
            }).eq("id", match["id"]).execute()
            print(f"  REJECTED (confidence: {confidence})")
            rejected += 1

        time.sleep(0.5)

    print(f"\nDone -- {approved} approved, {rejected} rejected")

    print("\nUpdating litigation counts...")
    communities_result = supabase.table("communities").select("id").execute()
    for c in (communities_result.data or []):
        count_result = (
            supabase.table("community_legal_cases")
            .select("id")
            .eq("community_id", c["id"])
            .eq("status", "approved")
            .execute()
        )
        count = len(count_result.data or [])
        if count > 0:
            supabase.table("communities").update({
                "litigation_count": count
            }).eq("id", c["id"]).execute()
            print(f"  Updated: {count} cases")

    print("All done.")

if __name__ == "__main__":
    main()
