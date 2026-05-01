"""
Build outreach contact list from management companies in communities table.
- Pulls all published communities with a management_company value
- Deduplicates by normalized company name
- Searches DuckDuckGo for contact emails
- Inserts into outreach_contacts table (if Supabase key is valid)
- Saves raw deduplicated list to scripts/output/outreach-contacts-raw.csv regardless
"""
import os
import sys
import re
import csv
import time
import json
import requests
from typing import Dict, List, Optional, Tuple
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
RAW_CSV = os.path.join(OUTPUT_DIR, "outreach-contacts-raw.csv")

# DuckDuckGo instant answer API (no key required)
DDG_URL = "https://api.duckduckgo.com/"

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")


def normalize_company(name: str) -> str:
    s = name.lower().strip()
    for remove in [", inc.", ", inc", " inc.", " inc", " llc", ", llc",
                   " ltd", ", ltd", " corp.", " corp", " management", " mgmt",
                   " services", " group", " realty", " properties"]:
        s = s.replace(remove, "")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return " ".join(s.split())


def get_supabase():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_KEY == "your_service_role_key_here":
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is missing or still a placeholder")
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def fetch_management_companies(supabase) -> List[Dict]:
    """Pull all published communities that have a management_company set."""
    result = (
        supabase.table("communities")
        .select("id, canonical_name, city, management_company, hoa_website, email, phone")
        .eq("status", "published")
        .not_.is_("management_company", "null")
        .execute()
    )
    return [r for r in (result.data or []) if (r.get("management_company") or "").strip()]


def deduplicate_companies(communities: List[Dict]) -> List[Dict]:
    """Group communities by normalized company name, keep richest contact info."""
    groups: Dict[str, Dict] = {}
    for c in communities:
        company = (c.get("management_company") or "").strip()
        key = normalize_company(company)
        if key not in groups:
            groups[key] = {
                "company_name": company,
                "normalized_key": key,
                "email": c.get("email") or "",
                "phone": c.get("phone") or "",
                "website": c.get("hoa_website") or "",
                "cities": [],
                "community_count": 0,
                "community_ids": [],
            }
        g = groups[key]
        g["community_count"] += 1
        g["community_ids"].append(c["id"])
        city = (c.get("city") or "").strip()
        if city and city not in g["cities"]:
            g["cities"].append(city)
        # Prefer non-empty values
        if not g["email"] and c.get("email"):
            g["email"] = c["email"]
        if not g["phone"] and c.get("phone"):
            g["phone"] = c["phone"]
        if not g["website"] and c.get("hoa_website"):
            g["website"] = c["hoa_website"]
    return list(groups.values())


def search_email_ddg(company_name: str) -> Optional[str]:
    """Try DuckDuckGo instant answer to find a contact email for a management company."""
    try:
        params = {
            "q": f"{company_name} Florida HOA management contact email",
            "format": "json",
            "no_html": "1",
            "skip_disambig": "1",
        }
        r = requests.get(DDG_URL, params=params, timeout=10,
                         headers={"User-Agent": "hoa-agent-research/1.0"})
        data = r.json()
        # Check AbstractText and RelatedTopics for email patterns
        sources = [
            data.get("AbstractText", ""),
            data.get("Answer", ""),
        ] + [t.get("Text", "") for t in data.get("RelatedTopics", [])[:5]]
        for text in sources:
            if not text:
                continue
            emails = EMAIL_RE.findall(text)
            if emails:
                return emails[0]
    except Exception:
        pass
    return None


def upsert_outreach_contact(supabase, company: Dict) -> bool:
    """Insert or update outreach_contacts row. Returns True if inserted."""
    try:
        existing = (
            supabase.table("outreach_contacts")
            .select("id")
            .eq("company_name", company["company_name"])
            .limit(1)
            .execute()
        )
        if existing.data:
            return False  # already exists
        supabase.table("outreach_contacts").insert({
            "company_name": company["company_name"],
            "email": company.get("email") or None,
            "phone": company.get("phone") or None,
            "website": company.get("website") or None,
            "cities": company.get("cities", []),
            "community_count": company.get("community_count", 0),
            "status": "pending",
        }).execute()
        return True
    except Exception as e:
        print(f"  Insert error for '{company['company_name']}': {e}")
        return False


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print("=== Build Outreach Contact List ===\n")

    # ── Step 1: Fetch from Supabase (may fail if key is placeholder) ─────────
    supabase = None
    communities: List[Dict] = []
    try:
        supabase = get_supabase()
        print("Fetching communities with management_company from Supabase...")
        communities = fetch_management_companies(supabase)
        print(f"  Found {len(communities)} communities with a management_company")
    except RuntimeError as e:
        print(f"WARNING: {e}")
        print("  Skipping Supabase fetch — cannot build company list without DB access.")
        print(f"  Set SUPABASE_SERVICE_ROLE_KEY in .env.local and re-run.\n")
        sys.exit(1)
    except Exception as e:
        print(f"WARNING: Supabase error: {e}")
        sys.exit(1)

    if not communities:
        print("  No communities with management_company found. Exiting.")
        sys.exit(0)

    # ── Step 2: Deduplicate ──────────────────────────────────────────────────
    companies = deduplicate_companies(communities)
    print(f"  Unique companies after deduplication: {len(companies)}")

    # ── Step 3: Email search ─────────────────────────────────────────────────
    print("\nSearching for contact emails (DuckDuckGo)...")
    found_emails = 0
    for i, company in enumerate(companies):
        if company["email"]:
            print(f"  [{i+1}/{len(companies)}] {company['company_name'][:50]} — already has email")
            found_emails += 1
            continue
        email = search_email_ddg(company["company_name"])
        if email:
            company["email"] = email
            found_emails += 1
            print(f"  [{i+1}/{len(companies)}] {company['company_name'][:50]} → {email}")
        else:
            print(f"  [{i+1}/{len(companies)}] {company['company_name'][:50]} — no email found")
        time.sleep(1.5)  # rate-limit DDG requests

    # ── Step 4: Save raw CSV (always, even if Supabase insert fails) ─────────
    fieldnames = ["company_name", "email", "phone", "website", "cities",
                  "community_count", "normalized_key"]
    with open(RAW_CSV, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for c in companies:
            row = dict(c)
            row["cities"] = ", ".join(c.get("cities", []))
            writer.writerow(row)
    print(f"\nRaw contact list saved to: {RAW_CSV}")

    # ── Step 5: Insert into Supabase outreach_contacts ───────────────────────
    inserted = 0
    skipped = 0
    if supabase:
        print("\nInserting into outreach_contacts table...")
        for company in companies:
            result = upsert_outreach_contact(supabase, company)
            if result:
                inserted += 1
            else:
                skipped += 1
        print(f"  Inserted: {inserted} | Already existed: {skipped}")

    # ── Summary ──────────────────────────────────────────────────────────────
    print("\n=== Summary ===")
    print(f"  Communities with management_company: {len(communities)}")
    print(f"  Unique companies: {len(companies)}")
    print(f"  Emails found: {found_emails}")
    print(f"  Inserted to Supabase: {inserted}")
    print(f"  Raw CSV: {RAW_CSV}")
    print("\nDone.")


if __name__ == "__main__":
    main()
