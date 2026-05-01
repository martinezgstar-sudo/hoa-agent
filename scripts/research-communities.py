"""
Nightly community research script.
Finds communities with thin data and enriches them from public sources:
  - DuckDuckGo general web search
  - Florida Sunbiz entity search (search.sunbiz.org)
  - Florida DBPR community association manager search (myfloridalicense.com)
  - Community's own hoa_website (if populated)
  - Yelp via DuckDuckGo search
  - PBC Code Enforcement (via search)
  - Age-restricted (55+) and gated status detection
  - Board meeting date extraction
"""
import os
import sys
import time
import json
import re
import requests
from urllib.parse import urlencode, quote_plus
from datetime import datetime, timedelta
from dotenv import load_dotenv

try:
    from bs4 import BeautifulSoup
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from supabase import create_client

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

BATCH_SIZE = 35
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
        .select("id, canonical_name, city, zip_code, county, state, management_company, hoa_website, phone, email, unit_count, monthly_fee_min, monthly_fee_max, amenities, amenity_count, pet_restriction, rental_approval, str_restriction, age_restricted, gated, last_board_meeting, active_violations, subdivision_aliases")
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


_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": "Mozilla/5.0 (compatible; HOAAgent/1.0; +https://hoa-agent.com)"})


def web_search(query):
    """Use DuckDuckGo Instant Answer API as a free search fallback."""
    try:
        resp = _SESSION.get(
            "https://api.duckduckgo.com/",
            params={"q": query, "format": "json", "no_html": "1", "skip_disambig": "1"},
            timeout=15,
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


def search_sunbiz(name):
    """Search Florida Sunbiz for HOA entity. Returns list of result dicts."""
    try:
        url = (
            "https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults"
            "?inquirytype=EntityName&inquiryDirectionType=ForwardList"
            "&ListStartNumber=0&filingType=All+Filing+Types"
            f"&searchTerm={quote_plus(name)}"
        )
        resp = _SESSION.get(url, timeout=20)
        if not HAS_BS4:
            return [{"title": "Sunbiz", "snippet": resp.text[:2000], "url": url}]

        soup = BeautifulSoup(resp.text, "html.parser")
        results = []
        for row in soup.select("table.list tr")[1:6]:
            cols = row.find_all("td")
            if len(cols) >= 3:
                entity_name = cols[0].get_text(strip=True)
                doc_num = cols[1].get_text(strip=True)
                status = cols[2].get_text(strip=True)
                link_tag = cols[0].find("a")
                detail_url = ""
                if link_tag and link_tag.get("href"):
                    detail_url = "https://search.sunbiz.org" + link_tag["href"]
                results.append({
                    "title": entity_name,
                    "snippet": f"Sunbiz entity: {entity_name} | Doc#: {doc_num} | Status: {status}",
                    "url": detail_url or url,
                })
        return results[:3]
    except Exception as e:
        print(f"    Sunbiz search error: {e}")
        return []


def search_dbpr(name, city=""):
    """Search Florida DBPR for community association manager license. Returns list of dicts."""
    try:
        params = {
            "mode": "0",
            "SID": "",
            "brd": "",
            "typ": "",
            "btn": "Search",
            "LicTypeID": "0",
            "LicNum": "",
            "BusName": name,
            "FName": "",
            "MName": "",
            "LName": "",
            "City": city,
            "Zipcode": "",
            "CountyID": "0",
        }
        url = "https://www.myfloridalicense.com/wl11.asp?" + urlencode(params)
        resp = _SESSION.get(url, timeout=20)
        if not HAS_BS4:
            return [{"title": "DBPR", "snippet": resp.text[:2000], "url": url}]

        soup = BeautifulSoup(resp.text, "html.parser")
        results = []
        for row in soup.select("table tr")[1:6]:
            cols = row.find_all("td")
            if len(cols) >= 4:
                lic_name = cols[0].get_text(strip=True)
                lic_type = cols[1].get_text(strip=True)
                lic_num = cols[2].get_text(strip=True)
                lic_status = cols[3].get_text(strip=True)
                if lic_name:
                    results.append({
                        "title": lic_name,
                        "snippet": f"DBPR: {lic_name} | Type: {lic_type} | License: {lic_num} | Status: {lic_status}",
                        "url": url,
                    })
        return results[:3]
    except Exception as e:
        print(f"    DBPR search error: {e}")
        return []


def fetch_hoa_website(url):
    """Fetch the community's own website and return text snippet."""
    if not url or not url.startswith("http"):
        return []
    try:
        resp = _SESSION.get(url, timeout=20, allow_redirects=True)
        if not HAS_BS4:
            return [{"title": "HOA Website", "snippet": resp.text[:3000], "url": url}]
        soup = BeautifulSoup(resp.text, "html.parser")
        # Strip scripts/styles
        for tag in soup(["script", "style", "nav", "footer"]):
            tag.decompose()
        text = " ".join(soup.get_text(separator=" ").split())[:3000]
        return [{"title": "Official HOA Website", "snippet": text, "url": url}]
    except Exception as e:
        print(f"    HOA website fetch error: {e}")
        return []


def search_yelp(name, city):
    """Search Yelp via DuckDuckGo to extract contact info."""
    query = f"site:yelp.com {name} HOA {city} Florida"
    return web_search(query)


def search_nextdoor(name, city):
    """Search Nextdoor public posts mentioning the community via DuckDuckGo."""
    query = f'site:nextdoor.com "{name}" {city} Florida HOA'
    results = web_search(query)
    # Also try without quotes for broader match
    if not results:
        results = web_search(f"nextdoor {name} {city} Florida HOA residents")
    return results


def search_facebook_groups(name, city):
    """Search Facebook public groups mentioning the community via DuckDuckGo."""
    query = f'site:facebook.com "{name}" {city} Florida'
    results = web_search(query)
    if not results:
        results = web_search(f"facebook group {name} {city} Florida HOA residents")
    return results


def search_hoa_management_sites(name, city):
    """Search HOA management directory sites for community info."""
    results = web_search(f'site:hoamanagement.com "{name}"')
    if not results:
        results = web_search(f"hoamanagement.com {name} {city} Florida management company")
    return results


def search_pbc_code_enforcement(name, city):
    """Search PBC code enforcement records via DuckDuckGo."""
    results = web_search(f"{name} Palm Beach County code enforcement violation")
    # Also try the PBC complaint search portal
    try:
        pbc_url = (
            "https://www.pbcgov.org/pzb/code/CodeComplaintSearch.aspx"
            f"?owner={quote_plus(name)}"
        )
        resp = _SESSION.get(pbc_url, timeout=15)
        if resp.status_code == 200 and len(resp.text) > 500:
            snippet = resp.text[:2000] if not HAS_BS4 else BeautifulSoup(resp.text, "html.parser").get_text(separator=" ")[:2000]
            results.append({"title": "PBC Code Enforcement Search", "snippet": snippet, "url": pbc_url})
    except Exception:
        pass
    return results


def search_board_meetings(name, city):
    """Search for board meeting minutes to find last meeting date."""
    queries = [
        f"{name} HOA board meeting minutes {city}",
        f"{name} homeowners association annual meeting 2024 2025",
    ]
    results = []
    for q in queries:
        results.extend(web_search(q))
        time.sleep(0.5)
    return results


def search_age_gated_status(name, city):
    """Search for age-restricted (55+) and gated community status."""
    queries = [
        f"{name} 55+ age restricted community {city} Florida",
        f"{name} gated community {city} Florida guard gate",
    ]
    results = []
    for q in queries:
        results.extend(web_search(q))
        time.sleep(0.5)
    return results


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
                    "Return a JSON object with only the fields you found clear evidence for:\n"
                    "- management_company: string or null\n"
                    "- hoa_website: string (URL) or null\n"
                    "- phone: string or null\n"
                    "- email: string or null\n"
                    "- unit_count: integer or null\n"
                    "- monthly_fee_min: number (monthly dollar amount) or null\n"
                    "- monthly_fee_max: number (monthly dollar amount) or null\n"
                    "- amenities: comma-separated string or null\n"
                    "- amenity_count: integer count of distinct amenities or null\n"
                    "- pet_restriction: string describing pet policy or null\n"
                    "- rental_approval: string describing rental rules or null\n"
                    "- str_restriction: 'yes' if short-term rentals are banned, 'no' if allowed, or null\n"
                    "- age_restricted: true if this is a 55+ or adult-only community, false if not, null if unknown\n"
                    "- gated: true if this is a gated community with a gate or guard, false if not, null if unknown\n"
                    "- last_board_meeting: ISO date string (YYYY-MM-DD) of the most recent board meeting found, or null\n"
                    "- active_violations: integer count of active code enforcement violations found, or null\n\n"
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
    hoa_website = community.get("hoa_website", "")

    print(f"\nResearching: {name} ({city})")

    all_results = []
    sources_used = []

    # 1. DuckDuckGo general search
    ddg_queries = [
        f"{name} HOA {city} Florida",
        f"{name} homeowners association Palm Beach County management",
        f"{name} condominium association fees Florida",
    ]
    for query in ddg_queries:
        results = web_search(query)
        all_results.extend(results)
        if len(all_results) >= 12:
            break
        time.sleep(1)
    if all_results:
        sources_used.append("duckduckgo")

    # 2. Sunbiz entity search
    sunbiz_results = search_sunbiz(name)
    if sunbiz_results:
        all_results.extend(sunbiz_results)
        sources_used.append("sunbiz")
    time.sleep(1)

    # 3. DBPR community association manager search
    dbpr_results = search_dbpr(name, city)
    if dbpr_results:
        all_results.extend(dbpr_results)
        sources_used.append("dbpr")
    time.sleep(1)

    # 4. Community's own website (if populated)
    if hoa_website:
        print(f"  Fetching HOA website: {hoa_website}")
        site_results = fetch_hoa_website(hoa_website)
        if site_results:
            all_results.extend(site_results)
            sources_used.append("hoa_website")
        time.sleep(1)

    # 5. Yelp via DuckDuckGo
    yelp_results = search_yelp(name, city)
    if yelp_results:
        all_results.extend(yelp_results)
        sources_used.append("yelp_ddg")
    time.sleep(1)

    # 6. Nextdoor public posts
    nextdoor_results = search_nextdoor(name, city)
    if nextdoor_results:
        all_results.extend(nextdoor_results)
        sources_used.append("nextdoor")
    time.sleep(1)

    # 7. Facebook public groups
    fb_results = search_facebook_groups(name, city)
    if fb_results:
        all_results.extend(fb_results)
        sources_used.append("facebook_groups")
    time.sleep(1)

    # 8. HOA management directory sites
    mgmt_results = search_hoa_management_sites(name, city)
    if mgmt_results:
        all_results.extend(mgmt_results)
        sources_used.append("hoa_management_sites")
    time.sleep(1)

    # 10. PBC Code Enforcement violations
    pbc_results = search_pbc_code_enforcement(name, city)
    if pbc_results:
        all_results.extend(pbc_results)
        sources_used.append("pbc_code_enforcement")
    time.sleep(1)

    # 11. Board meeting date search
    meeting_results = search_board_meetings(name, city)
    if meeting_results:
        all_results.extend(meeting_results)
        sources_used.append("board_meetings")
    time.sleep(1)

    # 12. Age-restricted / gated status — only search if fields are unknown
    if community.get("age_restricted") is None or community.get("gated") is None:
        age_gate_results = search_age_gated_status(name, city)
        if age_gate_results:
            all_results.extend(age_gate_results)
            sources_used.append("age_gated_search")
        time.sleep(1)

    print(f"  Sources checked: {sources_used} ({len(all_results)} total results)")
    sources_checked = list({r.get("url", "") for r in all_results if r.get("url")})

    extracted = ai_extract_community_data(name, city, all_results)
    print(f"  Extracted fields: {list(extracted.keys())}")

    # Only update fields that are currently null/empty
    update_payload = {}
    fields_updated = []
    updatable_fields = [
        "management_company", "hoa_website", "phone", "email",
        "unit_count", "monthly_fee_min", "monthly_fee_max",
        "amenities", "amenity_count", "pet_restriction", "rental_approval", "str_restriction",
        "age_restricted", "gated", "last_board_meeting", "active_violations",
    ]
    for field in updatable_fields:
        extracted_val = extracted.get(field)
        if extracted_val is None:
            continue
        current_val = community.get(field)
        # For boolean fields, only update if currently null (not false)
        if field in ("age_restricted", "gated") and current_val is not None:
            continue
        # For all other fields, only update if currently null/empty
        if field not in ("age_restricted", "gated") and current_val:
            continue
        update_payload[field] = extracted_val
        fields_updated.append(field)

    if update_payload:
        supabase.table("communities").update(update_payload).eq("id", cid).execute()
        print(f"  Updated: {fields_updated}")
    else:
        print(f"  No new data found")

    # Log the research
    log_entry = {
        "community_id": cid,
        "researched_at": datetime.utcnow().isoformat(),
        "fields_updated": fields_updated,
        "sources_checked": sources_checked[:10],
        "notes": f"Sources: {sources_used}, {len(all_results)} results" + (f", updated: {fields_updated}" if fields_updated else ", no updates"),
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
