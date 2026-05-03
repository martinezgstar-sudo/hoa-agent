#!/usr/bin/env python3
"""
research-hoa-comprehensive.py
HOA Agent — Comprehensive community research pipeline.

Tiers:
  1 — Local LaCie files (Sunbiz cordata, PBCPAO CAMA/Parcels)
  2 — Government APIs  (CourtListener, NewsAPI)
  3 — Web search       (DuckDuckGo — 11 queries)
  4 — Listing sites    (Zillow / Realtor — fee observations only)
  5 — Browser          (Playwright — PBCPAO subdivision, DBPR)

Usage:
  python3 scripts/research-hoa-comprehensive.py --batch 10
  python3 scripts/research-hoa-comprehensive.py --community-id <uuid>
  python3 scripts/research-hoa-comprehensive.py --batch 5 --dry-run true

Options:
  --community-id   UUID of a specific community to research
  --batch          Number of communities to research (default: 10)
  --status         Community status filter (default: published)
  --dry-run        true/false — log without writing to DB (default: true)
  --output-dir     Directory for log files (default: scripts/output)
"""

import argparse
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime
from pathlib import Path
from typing import Any, Optional

# ── Constants ─────────────────────────────────────────────────────────────────

LACIE_PATH     = "/Volumes/LaCie/FL-Palm Beach County Data "
CORDATA_DIR    = LACIE_PATH + "/cordata_extracted"
PBCPAO_CSV     = LACIE_PATH + "/Property_Information_Table_-6553152689149400476.csv"

SUPABASE_URL   = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_ANON  = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
SUPABASE_SVC   = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
NEWS_API_KEY   = os.environ.get("NEWS_API_KEY", "")

# Fee sources we no longer fetch from. Existing observations in
# pending_fee_observations are preserved (admin can still review/reject
# them); only NEW fetches are blocked.
#   zillow → returns the fee-range filter slider values ($100, $200, $300,
#            $400, $500) as if they were real fees, polluting the queue.
SKIP_FEE_SOURCES = {"zillow", "zillow.com"}

# Auto-approvable field set
AUTO_APPROVE_FIELDS = {
    "entity_status", "state_entity_number", "registered_agent",
    "incorporation_date", "unit_count", "gated", "age_restricted",
    "street_address", "zip_code",
}

# Fields that ALWAYS require admin review
ADMIN_ONLY_FIELDS = {
    "monthly_fee_min", "monthly_fee_max", "monthly_fee_median",
    "management_company", "amenities", "pet_restriction",
    "rental_approval", "str_restriction", "vehicle_restriction",
    "website_url",
}

HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def fetch(url: str, timeout: int = 12, headers: Optional[dict] = None) -> str:
    try:
        h = dict(HTTP_HEADERS)
        if headers:
            h.update(headers)
        req = urllib.request.Request(url, headers=h)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", errors="ignore")
    except Exception as e:
        return f"ERROR:{e}"


def text_from_html(html: str) -> str:
    t = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", t).strip()


def round_fee(amount: float, direction: str = "nearest") -> float:
    """Round fee to nearest $25."""
    if direction == "down":
        return math.floor(amount / 25) * 25
    if direction == "up":
        return math.ceil(amount / 25) * 25
    # nearest
    return round(amount / 25) * 25


def is_slider_noise(fee_list) -> bool:
    """Detect Zillow-style fee-range filter slider values.

    Returns True when 3+ fees from the same source are all exact $100
    multiples and there are at least 3 of them — the signature of UI
    range-slider stops ($100/$200/$300/$400/$500), not real HOA fees.
    """
    fees = [float(f) for f in fee_list if f is not None]
    if len(fees) < 3:
        return False
    multiples_of_100 = [f for f in fees if f % 100 == 0]
    return len(multiples_of_100) >= 3 and len(multiples_of_100) == len(fees)


def supabase_get(path: str, params: Optional[dict] = None) -> dict:
    """Read-only Supabase REST API call using anon key."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    html = fetch(url, headers={
        "apikey": SUPABASE_ANON,
        "Authorization": f"Bearer {SUPABASE_ANON}",
        "Accept": "application/json",
    })
    if html.startswith("ERROR"):
        return {"error": html}
    try:
        return json.loads(html)
    except Exception:
        return {"error": f"JSON parse failed: {html[:200]}"}


def supabase_post(table: str, payload: dict, dry_run: bool) -> dict:
    """Insert a row via service role key. No-ops in dry_run mode."""
    if dry_run:
        return {"dry_run": True, "payload": payload}
    if not SUPABASE_SVC or SUPABASE_SVC == "your_service_role_key_here":
        return {"error": "SUPABASE_SERVICE_ROLE_KEY not set — cannot write to DB"}
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    body = json.dumps(payload).encode()
    try:
        req = urllib.request.Request(url, data=body, method="POST", headers={
            "apikey": SUPABASE_SVC,
            "Authorization": f"Bearer {SUPABASE_SVC}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        })
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode())
    except Exception as e:
        return {"error": str(e)}


def supabase_update(table: str, match: dict, payload: dict, dry_run: bool) -> dict:
    """Update matching rows via service role key."""
    if dry_run:
        return {"dry_run": True, "match": match, "payload": payload}
    if not SUPABASE_SVC or SUPABASE_SVC == "your_service_role_key_here":
        return {"error": "SUPABASE_SERVICE_ROLE_KEY not set"}
    qs = "&".join(f"{k}=eq.{urllib.parse.quote(str(v))}" for k, v in match.items())
    url = f"{SUPABASE_URL}/rest/v1/{table}?{qs}"
    body = json.dumps(payload).encode()
    try:
        req = urllib.request.Request(url, data=body, method="PATCH", headers={
            "apikey": SUPABASE_SVC,
            "Authorization": f"Bearer {SUPABASE_SVC}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        })
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode())
    except Exception as e:
        return {"error": str(e)}


# ── Findings accumulator ──────────────────────────────────────────────────────

class CommunityFindings:
    """Collects all data found for one community during a research run."""

    def __init__(self, community: dict):
        self.community      = community
        self.community_id   = community["id"]
        self.name           = community.get("canonical_name", "")
        self.city           = community.get("city", "")

        self.auto_fields:    dict[str, dict] = {}  # field_name → {value, source_url, source_type, confidence}
        self.pending_fields: dict[str, list] = {}  # field_name → [{value, source_url, source_type, confidence}]
        self.fee_obs:        list[dict]      = []  # fee observations for pending_fee_observations
        self.sources_checked: list[str]      = []
        self.notes: list[str]                = []

    def add_auto(self, field: str, value: Any, source_url: str, source_type: str, confidence: float = 1.0):
        """Add a government-sourced, auto-approvable finding."""
        # Only add if field is in auto set AND community currently has null for it
        if field not in AUTO_APPROVE_FIELDS:
            return
        existing = self.community.get(field)
        if existing is not None and existing != "":
            return  # never overwrite
        self.auto_fields[field] = {
            "value": str(value),
            "source_url": source_url,
            "source_type": source_type,
            "confidence": confidence,
        }

    def add_pending(self, field: str, value: Any, source_url: str, source_type: str, confidence: float = 0.7):
        """Queue a finding for admin review."""
        if not value:
            return
        existing = self.community.get(field)
        if existing is not None and existing != "":
            return  # never overwrite
        self.pending_fields.setdefault(field, []).append({
            "value": str(value),
            "source_url": source_url,
            "source_type": source_type,
            "confidence": confidence,
        })

    def add_fee_obs(self, amount: float, source_url: str, source_type: str, listing_date: Optional[str] = None):
        """Record a fee observation (always goes to pending_fee_observations).

        Skips sources listed in SKIP_FEE_SOURCES (currently: zillow). Existing
        rows in the DB are untouched — only new fetches are gated.
        """
        if source_type and source_type.lower() in SKIP_FEE_SOURCES:
            return
        self.fee_obs.append({
            "fee_amount": amount,
            "fee_rounded_min":    round_fee(amount, "down"),
            "fee_rounded_max":    round_fee(amount, "up"),
            "fee_rounded_median": round_fee(amount),
            "source_url": source_url,
            "source_type": source_type,
            "listing_date": listing_date,
        })

    def filter_slider_noise(self) -> int:
        """Drop slider-noise fee observations (per source).

        Returns count of removed observations.
        """
        if not self.fee_obs:
            return 0
        # Group fees by source_type
        by_source: dict[str, list] = {}
        for obs in self.fee_obs:
            by_source.setdefault(obs["source_type"], []).append(obs)
        kept: list[dict] = []
        removed = 0
        for src, group in by_source.items():
            amounts = [g["fee_amount"] for g in group]
            if is_slider_noise(amounts):
                removed += len(group)
                self.note(f"Slider noise filtered: {len(group)} obs from {src}")
            else:
                kept.extend(group)
        self.fee_obs = kept
        return removed

    def log_source(self, description: str):
        self.sources_checked.append(description)

    def note(self, msg: str):
        self.notes.append(msg)

    def summary(self) -> dict:
        return {
            "community_id": self.community_id,
            "community_name": self.name,
            "auto_fields_found": len(self.auto_fields),
            "pending_fields_found": sum(len(v) for v in self.pending_fields.values()),
            "fee_observations": len(self.fee_obs),
            "auto_fields": {k: v["value"] for k, v in self.auto_fields.items()},
            "pending_fields": {k: [x["value"] for x in v] for k, v in self.pending_fields.items()},
            "sources_checked": len(self.sources_checked),
            "notes": self.notes,
        }


# ── TIER 1 — Local LaCie files ────────────────────────────────────────────────

def search_sunbiz_local(f: CommunityFindings) -> None:
    """Search local Sunbiz cordata files for the community entity."""
    if not os.path.isdir(CORDATA_DIR):
        f.log_source("Sunbiz local: LaCie drive not mounted at /Volumes/LaCie")
        f.note("LaCie drive not available — skipping Sunbiz local search")
        return

    name_upper = f.name.upper()
    # Build search terms — require match in the ENTITY NAME portion (cols 13-93)
    stop_words = {"HOMEOWNERS","ASSOCIATION","CONDOMINIUM","PROPERTY","OWNERS","THE","AND",
                  "INCORPORATED","INC","LLC","CORP","LTD","ESTATE","ESTATES","AT","OF","IN"}
    words = [w for w in re.split(r"\W+", name_upper) if len(w) > 3 and w not in stop_words]
    # Need at least 2 significant words; use first 3 for matching
    if len(words) < 2:
        f.log_source(f"Sunbiz local: name too short for reliable search ({f.name[:40]})")
        return
    search_words = words[:3]
    search_term = " ".join(search_words)

    log(f"  [Sunbiz local] searching for: {search_term!r}")
    found_line = None

    for fname in sorted(os.listdir(CORDATA_DIR)):
        if not fname.endswith(".txt"):
            continue
        fpath = os.path.join(CORDATA_DIR, fname)
        try:
            with open(fpath, "r", errors="ignore") as fh:
                for line in fh:
                    # Only match against the entity name field (cols 13–93 of the record)
                    entity_name_field = line[13:93].upper()
                    if all(w in entity_name_field for w in search_words):
                        found_line = line
                        break
        except Exception:
            pass
        if found_line:
            break

    f.log_source(f"Sunbiz local (cordata): {'found' if found_line else 'not found'} for {name_upper[:50]}")

    if not found_line:
        return

    # Parse the fixed-width cordata record
    try:
        doc_num  = found_line[:13].strip()
        ent_name = found_line[13:93].strip()
        rest     = found_line[93:]

        # Status indicator: A=Active, I=Inactive
        status_char = rest.strip()[:1] if rest.strip() else ""
        is_active   = status_char == "A"

        # Extract addresses (principal ~pos 13-80 within rest)
        addr_match = re.search(r"(\d{2,5}\s+[A-Z][A-Z\s]+(?:DR|DRIVE|BLVD|BOULEVARD|AVE|AVENUE|ST|STREET|RD|ROAD|LN|LANE|WAY|CT|COURT|PL|PLACE))\s+([A-Z][A-Z\s]+)\s+(FL)(\d{5})", rest, re.IGNORECASE)
        street  = addr_match.group(1).strip() if addr_match else None
        city    = addr_match.group(2).strip() if addr_match else None
        zipcode = addr_match.group(4)         if addr_match else None

        # Filing date: 8-digit run MMDDYYYY near doc_num area
        date_match = re.search(r"(\d{8})(?=\d{9})", rest)
        inc_date = None
        if date_match:
            d = date_match.group(1)
            if len(d) == 8:
                try:
                    inc_date = f"{d[4:8]}-{d[0:2]}-{d[2:4]}"
                except Exception:
                    pass

        # Registered agent: look for known management company patterns after "C " indicator
        ra_match = re.search(r"\bC([A-Z][A-Z\s&,\.]{5,60}?)\s+[CP]\d{4}", rest)
        if not ra_match:
            # Try pattern: "REGISTERED AGENTS" or company name after principal addr
            ra_match = re.search(r"([A-Z][A-Z\s&,\.]{5,50}(?:MANAGEMENT|SERVICES|REALTY|PROPERTY|GROUP|LLC|INC|CORP))\s", rest)
        registered_agent = ra_match.group(1).strip() if ra_match else None

        # Store findings
        source_url = f"local://LaCie/cordata — doc {doc_num}"
        source_type = "sunbiz_local"

        f.add_auto("state_entity_number", doc_num, source_url, source_type)
        f.add_auto("entity_status", "ACTIVE" if is_active else "INACTIVE", source_url, source_type)
        if inc_date:
            f.add_auto("incorporation_date", inc_date, source_url, source_type)
        if street:
            f.add_auto("street_address", street, source_url, source_type)
        if zipcode:
            f.add_auto("zip_code", zipcode, source_url, source_type)
        if registered_agent:
            f.add_auto("registered_agent", registered_agent.strip(), source_url, source_type)

        f.note(f"Sunbiz: {ent_name} | doc={doc_num} | status={'ACTIVE' if is_active else 'INACTIVE'} | ra={registered_agent}")
        log(f"  [Sunbiz local] HIT: {doc_num} {ent_name[:50]}")
    except Exception as e:
        f.note(f"Sunbiz parse error: {e}")
        log(f"  [Sunbiz local] parse error: {e}")


def search_pbcpao_local(f: CommunityFindings) -> None:
    """Search local PBCPAO CSV for subdivision parcel count (unit_count)."""
    if not os.path.isfile(PBCPAO_CSV):
        f.log_source("PBCPAO local: CSV not found at LaCie path")
        return

    import csv

    name_upper = f.name.upper()
    # Build a search term: first 25 chars of name, uppercase
    search_substr = name_upper[:25]

    log(f"  [PBCPAO local] scanning for: {search_substr!r}")
    count = 0
    try:
        with open(PBCPAO_CSV, "r", errors="ignore") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                subdiv = row.get("SUBDIV_NAME", "").upper()
                if search_substr[:15] in subdiv:
                    count += 1
    except Exception as e:
        f.log_source(f"PBCPAO local: error — {e}")
        return

    f.log_source(f"PBCPAO local CSV: {'found' if count > 0 else 'not found'} ({count} parcels)")
    if count > 0:
        f.add_auto(
            "unit_count", count,
            source_url="local://LaCie/Property_Information_Table",
            source_type="pbcpao_local",
            confidence=1.0,
        )
        f.note(f"PBCPAO: {count} parcels found → unit_count={count}")
        log(f"  [PBCPAO local] {count} parcels → unit_count={count}")


# ── TIER 2 — Government APIs ──────────────────────────────────────────────────

def search_courtlistener(f: CommunityFindings) -> None:
    """Check CourtListener for litigation involving this community."""
    q = urllib.parse.quote_plus(f'"{f.name}" Florida')
    url = f"https://www.courtlistener.com/api/rest/v4/search/?q={q}&type=o&court=flsd,flmd,flnd,fls1,fls11,fls12,fls3,fls4&format=json"
    html = fetch(url, timeout=15)
    f.log_source(f"CourtListener: {url[:80]}")

    if html.startswith("ERROR"):
        f.note(f"CourtListener error: {html[:100]}")
        return

    try:
        data = json.loads(html)
        count = data.get("count", 0)
        results = data.get("results", [])

        if count > 0:
            case_names = [r.get("caseName", "") for r in results[:3]]
            f.note(f"CourtListener: {count} cases — {', '.join(case_names)}")
            log(f"  [CourtListener] {count} cases found")
            # Queue litigation count for admin review
            f.add_pending(
                "litigation_count", count,
                source_url=f"https://www.courtlistener.com/?q={urllib.parse.quote_plus(f.name)}&type=o",
                source_type="courtlistener",
                confidence=0.85,
            )
        else:
            f.note("CourtListener: no cases found")
    except Exception as e:
        f.note(f"CourtListener parse error: {e}")


def search_newsapi(f: CommunityFindings) -> None:
    """Search NewsAPI for recent news about the community."""
    if not NEWS_API_KEY:
        f.log_source("NewsAPI: no API key configured")
        return

    q = urllib.parse.quote_plus(f'"{f.name}"')
    url = f"https://newsapi.org/v2/everything?q={q}&language=en&sortBy=relevancy&pageSize=5"
    html = fetch(url, timeout=15, headers={"X-Api-Key": NEWS_API_KEY})
    f.log_source(f"NewsAPI: {url[:80]}")

    if html.startswith("ERROR"):
        return
    try:
        data = json.loads(html)
        articles = data.get("articles", [])
        for art in articles[:3]:
            f.note(f"NewsAPI: {art.get('title','')} — {art.get('url','')[:60]}")
    except Exception:
        pass


# ── TIER 3 — DuckDuckGo web search ────────────────────────────────────────────

def ddg_search(query: str, max_results: int = 6) -> list[tuple[str, str, str]]:
    """
    DuckDuckGo HTML scrape.
    Returns list of (url, title, snippet).
    """
    q = urllib.parse.quote_plus(query)
    html = fetch(f"https://html.duckduckgo.com/html/?q={q}")
    if html.startswith("ERROR") or not html:
        return []

    results = []
    # Extract (href, title) pairs from result__a links
    for href, title in re.findall(
        r'<a\s+class="result__a"\s+href="(/l/\?[^"]+)"[^>]*>(.*?)</a>',
        html, re.DOTALL
    )[:max_results]:
        real = re.search(r"uddg=(https?[^&]+)", href)
        url = urllib.parse.unquote(real.group(1)) if real else ""
        title_clean = re.sub(r"<[^>]+>", "", title).strip()

        # Find snippet right after this link
        snip_match = re.search(
            r'class="result__snippet"[^>]*>(.*?)</a>',
            html[html.find(href): html.find(href) + 3000], re.DOTALL
        )
        snip = re.sub(r"<[^>]+>", "", snip_match.group(1)).strip() if snip_match else ""
        results.append((url, title_clean, snip))

    return results


def extract_from_text(text: str) -> dict[str, Any]:
    """Extract structured data from arbitrary text using regex."""
    out: dict[str, Any] = {}

    # Fees: require specific HOA context to avoid Zillow range slider noise
    # Valid patterns: "HOA fee: $350/mo", "monthly HOA $425", "$350 /month HOA"
    fee_matches = re.findall(
        r"(?:hoa\s+fee|monthly\s+(?:hoa|dues|fee)|hoa\s+dues|hoa\s+assessment)"
        r"[^\$\d]{0,30}\$\s*([\d,]+)",
        text, re.IGNORECASE
    )
    # Also: "$XXX /mo" only if preceded by relevant context within 100 chars
    for m in re.finditer(r"\$\s*([\d,]+)\s*/\s*(?:mo|month)\b", text, re.IGNORECASE):
        ctx = text[max(0, m.start()-100):m.start()]
        if re.search(r"hoa|dues|fee|assessment|homeowner", ctx, re.IGNORECASE):
            fee_matches.append(m.group(1))
    fees = []
    for fm in fee_matches:
        try:
            v = float(fm.replace(",", ""))
            # Plausible HOA fee range: $75–$5000/month
            if 75 <= v <= 5000:
                fees.append(v)
        except Exception:
            pass
    if fees:
        out["fees"] = sorted(set(fees))

    # Phone
    phones = re.findall(r"\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}", text)
    if phones:
        out["phone"] = phones[0]

    # Email
    emails = [e for e in re.findall(
        r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", text
    ) if not any(x in e.lower() for x in ["example", "noreply", "zillow", "trulia", "google"])]
    if emails:
        out["email"] = emails[0]

    # Management company
    mgmt = re.findall(
        r"(?:managed by|management company|management)[:\s]+([A-Za-z][A-Za-z\s&,\.]{4,60})",
        text, re.IGNORECASE
    )
    if mgmt:
        out["management_company"] = mgmt[0].strip()

    # Gated
    if re.search(r"\bgated\s+community\b|\bgated\s+entrance\b|\bsecurity\s+gate\b", text, re.IGNORECASE):
        out["gated"] = "Yes"

    # Age restricted
    if re.search(r"\b55\+\s*community\b|\bage-restricted\b|\bactive\s+adult\b", text, re.IGNORECASE):
        out["age_restricted"] = "55+"
    elif re.search(r"\ball\s+ages\b|\bno\s+age\s+restriction\b|\bfamilies\s+welcome\b", text, re.IGNORECASE):
        out["age_restricted"] = "No"

    # Amenities
    amenity_keywords = [
        "pool", "heated pool", "gym", "fitness center", "clubhouse",
        "tennis", "basketball", "playground", "dog park", "spa", "sauna",
        "volleyball", "bocce", "pickleball", "walking trail", "lake access",
    ]
    found_amenities = [a for a in amenity_keywords if a in text.lower()]
    if found_amenities:
        out["amenities"] = ", ".join(found_amenities)

    # Pet policy
    pet = re.search(
        r"pet[s]?\s+(?:allowed|welcome|permitted|ok|not allowed|prohibited|restricted)[^.]{0,80}",
        text, re.IGNORECASE
    )
    if pet:
        out["pet_restriction"] = pet.group(0).strip()

    # Rental restrictions
    rental = re.search(
        r"(?:rental|rent)[s]?\s+(?:allowed|prohibited|restricted|approval|permitted)[^.]{0,80}|"
        r"no\s+(?:short[- ]term\s+)?rentals[^.]{0,40}",
        text, re.IGNORECASE
    )
    if rental:
        out["rental_approval"] = rental.group(0).strip()

    return out


def run_ddg_searches(f: CommunityFindings) -> None:
    """Run all 11 DuckDuckGo queries for a community."""
    name = f.name
    city = f.city or "Florida"

    queries = [
        (f'"{name}" HOA {city} Florida management company',          "mgmt"),
        (f'"{name}" HOA fees monthly Florida',                        "fees"),
        (f'"{name}" homeowners association management contact',       "mgmt"),
        (f'"{name}" HOA pet policy Florida',                          "pets"),
        (f'"{name}" HOA reviews complaints',                          "reviews"),
        (f'"{name}" HOA rental restrictions Florida',                 "rental"),
        (f'"{name}" HOA amenities pool gate clubhouse',               "amenities"),
        (f'site:yelp.com "{name}" HOA',                               "yelp"),
        (f'site:facebook.com "{name}" HOA',                           "facebook"),
        (f'site:reddit.com "{name}" HOA',                             "reddit"),
        (f'site:hoamanagement.com "{name}"',                          "hoamanagement"),
    ]

    for query, qtype in queries:
        results = ddg_search(query)
        f.log_source(f"DDG ({qtype}): {query[:70]} → {len(results)} results")
        if not results:
            continue

        for url, title, snippet in results:
            combined = f"{title} {snippet}"
            extracted = extract_from_text(combined)

            # Handle fees separately — always to fee observations.
            # Zillow disabled (slider noise); add_fee_obs() drops it silently.
            for fee_val in extracted.get("fees", []):
                src_type = "realtor" if "realtor" in url.lower() else \
                           "trulia" if "trulia" in url.lower() else \
                           "redfin" if "redfin" in url.lower() else \
                           "homes_com" if "homes.com" in url.lower() else \
                           "web_search"
                f.add_fee_obs(fee_val, url, src_type)

            # Other extracted data — to pending (admin review)
            for field in ["management_company", "gated", "age_restricted",
                          "amenities", "pet_restriction", "rental_approval"]:
                if field in extracted:
                    confidence = 0.65 if qtype in {"reddit","reviews","facebook"} else 0.75
                    f.add_pending(field, extracted[field], url, f"duckduckgo_{qtype}", confidence)

        time.sleep(0.8)  # be polite to DDG

    # Attempt to fetch the most promising non-listing pages
    all_urls_seen: set[str] = set()
    for query, qtype in queries[:5]:  # only fetch for first 5 queries
        results = ddg_search(query, max_results=3)
        for url, _, _ in results:
            if url in all_urls_seen:
                continue
            all_urls_seen.add(url)
            skip = ["zillow","realtor","trulia","redfin","duckduckgo",
                    "bing.com","google.com","facebook","instagram","twitter",
                    "youtube","maps.google"]
            if any(s in url.lower() for s in skip):
                continue
            html = fetch(url, timeout=10)
            if html.startswith("ERROR"):
                continue
            page_text = text_from_html(html)
            # Check the page mentions our community
            if f.name[:15].upper() not in page_text.upper():
                continue
            extracted = extract_from_text(page_text)
            for fee_val in extracted.get("fees", []):
                f.add_fee_obs(fee_val, url, "web_page")
            for field in ["management_company", "amenities", "pet_restriction",
                          "rental_approval", "gated", "age_restricted", "website_url"]:
                if field in extracted:
                    f.add_pending(field, extracted[field], url, "web_page", 0.70)

        time.sleep(0.5)


# ── TIER 4 — Fee databases & directories (fee observations only) ────────────

# Sites we ask DDG to restrict to. Each query returns up to 6 results.
# All extracted fees go to pending_fee_observations (never auto-approved).
FEE_SITE_QUERIES: list[tuple[str, str]] = [
    # Source A — HOA fee databases
    ("livingin.com",         "site:livingin.com"),
    ("niche.com",            "site:niche.com"),
    ("bestplaces.net",       "site:bestplaces.net"),
    ("neighborhoodscout",    "site:neighborhoodscout.com"),
    # Source B — Real estate sites that publish HOA fee fields
    ("redfin.com",           "site:redfin.com"),
    ("homes.com",            "site:homes.com"),
    ("trulia.com",           "site:trulia.com"),
    # Source C — Florida-specific HOA directories
    ("floridahoa.org",       "site:floridahoa.org"),
    ("hoamanagement.com",    "site:hoamanagement.com"),
]


def search_listing_sites(f: CommunityFindings) -> None:
    """Search HOA fee databases + real estate sites for fee mentions.

    Replaces the old Zillow/Realtor scrape. Each source is queried via DDG
    with a site: filter, then results' titles+snippets are run through
    extract_from_text() (which requires HOA-context words near the dollar
    amount). All matches go to pending_fee_observations for admin review.

    After all sources are checked, slider-noise filter runs once to drop
    any source whose fees look like UI range-slider stops.
    """
    for src_name, site_filter in FEE_SITE_QUERIES:
        if src_name in SKIP_FEE_SOURCES:
            continue
        query = f'"{f.name}" HOA fee monthly {site_filter}'
        results = ddg_search(query, max_results=4)
        f.log_source(f"Fee DDG ({src_name}): {len(results)} results")
        if not results:
            time.sleep(0.4)
            continue
        for url, title, snippet in results:
            combined = f"{title} {snippet}"
            extracted = extract_from_text(combined)
            for fee_val in extracted.get("fees", []):
                # Only count fees in plausible HOA range
                if 50 <= fee_val <= 2500:
                    f.add_fee_obs(fee_val, url, src_name)
        time.sleep(0.5)

    # Run slider-noise detector across what was collected this round.
    removed = f.filter_slider_noise()
    if removed > 0:
        log(f"  [Tier 4] dropped {removed} slider-noise fee observations")


# ── TIER 5 — Browser sources (Playwright) ────────────────────────────────────

def search_browser_sources(f: CommunityFindings) -> None:
    """Playwright-based search for PBCPAO and DBPR."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        f.log_source("Playwright: not installed — skipping browser tier")
        f.note("Playwright not available. Install: pip3 install playwright && playwright install chromium")
        return

    log(f"  [Playwright] launching browser for PBCPAO + DBPR…")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(
            user_agent=HTTP_HEADERS["User-Agent"],
            viewport={"width": 1280, "height": 800},
        )
        page = ctx.new_page()
        page.set_default_timeout(20000)

        # ── PBCPAO subdivision search ────────────────────────────────────────
        # Only run if unit_count not already found locally
        if "unit_count" not in f.auto_fields and not f.community.get("unit_count"):
            try:
                page.goto("https://pbcpao.gov/", wait_until="domcontentloaded")
                page.wait_for_timeout(2000)
                # Try to find a subdivision search input
                search_input = page.query_selector("input[placeholder*='subdivision' i], input[name*='subdiv' i], input[id*='subdiv' i]")
                if search_input:
                    search_input.fill(f.name[:20])
                    page.keyboard.press("Enter")
                    page.wait_for_timeout(3000)
                    body = page.inner_text("body")
                    # Count parcels if table found
                    rows = re.findall(r"parcel", body, re.IGNORECASE)
                    if rows:
                        f.log_source(f"PBCPAO browser: {len(rows)} parcel mentions found")
                        f.note(f"PBCPAO browser found {len(rows)} parcel mentions")
                else:
                    f.log_source("PBCPAO browser: no subdivision input found on page")
            except Exception as e:
                f.log_source(f"PBCPAO browser: error — {e}")

        # ── DBPR manager license search ──────────────────────────────────────
        try:
            q = urllib.parse.quote_plus(f.name[:30])
            page.goto(
                f"https://www.myfloridalicense.com/wl11.asp?mode=0&SID=&brd=&typ=&"
                f"SearchType=LicNbr&LicNbr=&SearchValue={q}&city={(f.city or '').replace(' ','+')}"
                f"&county=&state=FL&zip=&applybutton=Apply+for+License",
                wait_until="domcontentloaded",
                timeout=20000,
            )
            page.wait_for_timeout(2500)
            body = page.inner_text("body")
            # Look for CAM (Community Association Manager) licenses
            cam_matches = re.findall(
                r"([A-Z][a-z]+,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+CAM\s+(\d{5,})",
                body
            )
            if cam_matches:
                mgr_name = cam_matches[0][0]
                lic_num  = cam_matches[0][1]
                f.add_pending(
                    "management_company", mgr_name,
                    source_url=f"https://www.myfloridalicense.com — CAM {lic_num}",
                    source_type="dbpr",
                    confidence=0.80,
                )
                f.note(f"DBPR: CAM manager {mgr_name} (lic {lic_num})")
                log(f"  [DBPR] CAM manager: {mgr_name}")
            else:
                f.log_source("DBPR: no CAM license found")
        except Exception as e:
            f.log_source(f"DBPR browser: error — {e}")

        browser.close()


# ── Write findings to DB ──────────────────────────────────────────────────────

def write_findings(f: CommunityFindings, dry_run: bool, output_lines: list[str]) -> dict:
    """
    Persist all findings:
    - Auto-approvable → update communities directly (or dry-run log)
    - Pending data    → insert to pending_community_data
    - Fee obs         → insert to pending_fee_observations
    - Research log    → insert to community_research_log
    """
    auto_approved  = 0
    pending_queued = 0
    fees_queued    = 0

    # ── Auto-approve (direct update) ──────────────────────────────────────
    for field, info in f.auto_fields.items():
        result = supabase_update(
            "communities",
            {"id": f.community_id},
            {field: info["value"]},
            dry_run,
        )
        status = "DRY_RUN" if dry_run else ("OK" if "error" not in result else f"ERR:{result.get('error','')}")
        line = f"  AUTO-APPROVE  {field} = {info['value']!r}  [{info['source_type']}]  [{status}]"
        output_lines.append(line)
        log(line)
        auto_approved += 1

    # ── Pending community data ─────────────────────────────────────────────
    for field, observations in f.pending_fields.items():
        # Pick the best observation (highest confidence)
        best = max(observations, key=lambda x: x["confidence"])
        row = {
            "community_id":   f.community_id,
            "field_name":     field,
            "proposed_value": best["value"],
            "source_url":     best["source_url"],
            "source_type":    best["source_type"],
            "confidence":     best["confidence"],
            "auto_approvable": field in AUTO_APPROVE_FIELDS,
            "status":         "pending",
        }
        result = supabase_post("pending_community_data", row, dry_run)
        status = "DRY_RUN" if dry_run else ("OK" if "error" not in result else f"ERR:{result.get('error','')}")
        val_repr = repr(best['value'])[:60]
        line = f"  PENDING       {field} = {val_repr}  [{best['source_type']}]  [{status}]"
        output_lines.append(line)
        log(line)
        pending_queued += 1

    # ── Fee observations ───────────────────────────────────────────────────
    for obs in f.fee_obs:
        row = {
            "community_id":       f.community_id,
            "fee_amount":         obs["fee_amount"],
            "fee_rounded_min":    obs["fee_rounded_min"],
            "fee_rounded_max":    obs["fee_rounded_max"],
            "fee_rounded_median": obs["fee_rounded_median"],
            "source_url":         obs["source_url"],
            "source_type":        obs["source_type"],
            "listing_date":       obs.get("listing_date"),
            "status":             "pending",
        }
        result = supabase_post("pending_fee_observations", row, dry_run)
        status = "DRY_RUN" if dry_run else ("OK" if "error" not in result else f"ERR:{result.get('error','')}")
        line = f"  FEE OBS       ${obs['fee_amount']}  (rnd ${obs['fee_rounded_median']})  [{obs['source_type']}]  [{status}]"
        output_lines.append(line)
        log(line)
        fees_queued += 1

    # ── Research log ──────────────────────────────────────────────────────
    log_row = {
        "community_id":   f.community_id,
        "researched_at":  datetime.utcnow().isoformat() + "Z",
        "fields_updated": list(f.auto_fields.keys()),
        "sources_checked": f.sources_checked,
        "notes": "; ".join(f.notes),
    }
    supabase_post("community_research_log", log_row, dry_run)

    return {
        "auto_approved":  auto_approved,
        "pending_queued": pending_queued,
        "fees_queued":    fees_queued,
    }


# ── Research one community ────────────────────────────────────────────────────

def research_community(community: dict, dry_run: bool) -> dict:
    name = community.get("canonical_name", "Unknown")
    cid  = community.get("id", "")
    log(f"\n{'─'*60}")
    log(f"Researching: {name} [{cid[:8]}…]")
    log(f"{'─'*60}")

    f = CommunityFindings(community)
    output_lines: list[str] = [f"\n=== {name} ==="]

    # ── Tier 1 ────────────────────────────────────────────────────────────
    log("  [Tier 1] Local LaCie files…")
    search_sunbiz_local(f)
    search_pbcpao_local(f)

    # ── Tier 2 ────────────────────────────────────────────────────────────
    log("  [Tier 2] Government APIs…")
    search_courtlistener(f)
    search_newsapi(f)

    # ── Tier 3 ────────────────────────────────────────────────────────────
    log("  [Tier 3] DuckDuckGo searches…")
    run_ddg_searches(f)

    # ── Tier 4 ────────────────────────────────────────────────────────────
    log("  [Tier 4] Listing sites (fee obs only)…")
    search_listing_sites(f)

    # ── Tier 5 ────────────────────────────────────────────────────────────
    log("  [Tier 5] Browser sources (Playwright)…")
    search_browser_sources(f)

    # ── Write / log ────────────────────────────────────────────────────────
    counts = write_findings(f, dry_run, output_lines)
    summary = f.summary()

    output_lines.append(f"\n  TOTALS: auto={counts['auto_approved']} | pending={counts['pending_queued']} | fee_obs={counts['fees_queued']}")
    output_lines.append(f"  Sources checked: {len(f.sources_checked)}")
    if f.notes:
        output_lines.append("  Notes: " + "; ".join(f.notes[:5]))

    log(f"  DONE: auto={counts['auto_approved']} | pending={counts['pending_queued']} | fee_obs={counts['fees_queued']}")
    return {"summary": summary, "output_lines": output_lines, **counts}


# ── Fetch communities from Supabase ──────────────────────────────────────────

def fetch_communities(community_id: Optional[str], batch: int, status: str) -> list[dict]:
    """Fetch communities to research from Supabase."""
    if community_id:
        data = supabase_get("communities", {"id": f"eq.{community_id}", "limit": "1",
            "select": "id,canonical_name,slug,city,status,management_company,unit_count,monthly_fee_min,amenities"})
        return data if isinstance(data, list) else []

    # Fetch thinnest communities (most null fields)
    data = supabase_get("communities", {
        "status":           f"eq.{status}",
        "management_company": "is.null",
        "order":            "canonical_name.asc",
        "limit":            str(batch * 4),  # fetch extra so we can skip CAMA junk
        "select":           "id,canonical_name,slug,city,status,management_company,unit_count,monthly_fee_min,amenities",
    })
    if not isinstance(data, list):
        log(f"Error fetching communities: {data}")
        return []

    # Skip obvious CAMA artifacts (asterisks, all-caps junk)
    clean = [
        c for c in data
        if "*" not in c.get("canonical_name", "")
        and c.get("canonical_name", "").strip()
    ]
    return clean[:batch]


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="HOA comprehensive research script")
    parser.add_argument("--community-id", help="UUID of specific community")
    parser.add_argument("--batch", type=int, default=10, help="Number of communities (default: 10)")
    parser.add_argument("--status", default="published", help="Community status filter")
    parser.add_argument("--dry-run", default="true", help="true/false (default: true)")
    parser.add_argument("--output-dir", default="scripts/output", help="Output directory")
    args = parser.parse_args()

    dry_run = args.dry_run.lower() not in {"false", "0", "no"}
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    log_file = output_dir / f"research-log-{date.today().isoformat()}.txt"

    log(f"HOA Research Pipeline")
    log(f"Mode: {'DRY RUN' if dry_run else 'LIVE'} | Batch: {args.batch} | Status: {args.status}")
    log(f"Output: {log_file}")
    log(f"LaCie: {'mounted' if os.path.isdir(LACIE_PATH) else 'NOT MOUNTED'}")

    communities = fetch_communities(args.community_id, args.batch, args.status)
    if not communities:
        log("No communities found to research. Check Supabase connection.")
        sys.exit(1)

    log(f"\nFetched {len(communities)} communities to research")

    all_output_lines = [
        f"HOA Research Run — {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        f"Mode: {'DRY RUN' if dry_run else 'LIVE'}",
        f"Communities: {len(communities)}",
        "=" * 60,
    ]

    totals = {"auto_approved": 0, "pending_queued": 0, "fees_queued": 0}

    for community in communities:
        result = research_community(community, dry_run)
        all_output_lines.extend(result["output_lines"])
        for k in totals:
            totals[k] += result.get(k, 0)

    # Summary footer
    all_output_lines.append("\n" + "=" * 60)
    all_output_lines.append("GRAND TOTALS")
    all_output_lines.append(f"  Communities researched : {len(communities)}")
    all_output_lines.append(f"  Auto-approved          : {totals['auto_approved']}")
    all_output_lines.append(f"  Queued for admin review: {totals['pending_queued']}")
    all_output_lines.append(f"  Fee observations       : {totals['fees_queued']}")
    all_output_lines.append("=" * 60)

    # Write log file
    with open(log_file, "w") as fh:
        fh.write("\n".join(all_output_lines))
    log(f"\nLog saved to: {log_file}")

    # Also write to dry-run-research.txt if in dry run mode
    if dry_run:
        dry_file = output_dir / "dry-run-research.txt"
        with open(dry_file, "w") as fh:
            fh.write("\n".join(all_output_lines))
        log(f"Dry-run output saved to: {dry_file}")

    log("\nDone.")


if __name__ == "__main__":
    main()
