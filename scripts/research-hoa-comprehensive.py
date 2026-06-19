#!/usr/bin/env python3
"""
research-hoa-comprehensive.py
HOA Agent — Deep, PROPOSE-ONLY community enricher.

This script NEVER writes to the communities table. It enriches a small
number of communities per run and stages every finding for admin approval:

  - Fee fields (monthly_fee_min/max/median) -> pending_fee_observations
  - Every other field                       -> pending_community_data
                                               (auto_approvable=false, status='pending')

The existing admin pending page + approval API already apply approved
values to communities. This script only proposes.

Per community it:
  1. Gathers evidence — DuckDuckGo search, local Sunbiz, DBPR (Playwright).
  2. Reads documents — builds candidate URLs from website_url + official /
     management-company domains in the top results, fetches each page,
     follows links to governing documents / budgets / rules, downloads up
     to 5 PDFs, and extracts their text with pdfplumber.
  3. AI extraction — passes the page text + PDF text + search results to
     Claude and asks for every real field, citing only what the documents
     or sources state, converting annual fees to monthly.
  4. Stages — validates, dedupes against existing pending/approved rows and
     against the community's current (non-null) values, then inserts.

Usage:
  python3 scripts/research-hoa-comprehensive.py --batch 10 --require-website true --dry-run false
  python3 scripts/research-hoa-comprehensive.py --community-id <uuid> --dry-run true

Options:
  --community-id    UUID of a specific community to enrich
  --batch           Number of communities (default: 10)
  --status          Community status filter (default: published)
  --require-website true/false — only pick communities with website_url set
                    (default: false; nightly cron passes false, demo passes true)
  --dry-run         true/false — gather + log without inserting (default: true)
  --output-dir      Directory for log files (default: scripts/output)
"""

import argparse
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# The sequential provider-chain (search + document fetch) lives in scripts/lib.
# Put this script's own dir on sys.path so `lib.enrich_chain` imports whether the
# script is run from the repo root or from within scripts/.
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)
from lib.enrich_chain import build_chains, Chains  # noqa: E402

# ── Constants ─────────────────────────────────────────────────────────────────

LACIE_PATH     = "/Volumes/LaCie/FL-Palm Beach County Data "
CORDATA_DIR    = LACIE_PATH + "/cordata_extracted"

SUPABASE_URL   = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_ANON  = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
SUPABASE_SVC   = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# AI extraction runs through the local `claude` CLI on the Claude subscription
# (CLAUDE_CODE_OAUTH_TOKEN), NOT the paid Anthropic API — matching the rest of
# this machine's cron infra (run.sh), which deliberately never bills the API.
# Haiku is the extraction model: the machine is 16GB / memory-bound, so we keep
# the model cheap and instead feed it only short, BM25/keyword-filtered text.
AI_MODEL    = os.environ.get("AI_MODEL", "haiku")
CLAUDE_BIN  = os.environ.get("CLAUDE_BIN", "claude")
AI_HAS_AUTH = bool(os.environ.get("CLAUDE_CODE_OAUTH_TOKEN")) or os.path.exists(
    os.path.expanduser("~/.claude/.credentials.json"))

# Every real column this enricher may propose. Names are the EXACT
# communities columns (see CLAUDE.md). Nothing outside this set is staged.
FEE_FIELDS = {"monthly_fee_min", "monthly_fee_max", "monthly_fee_median"}

ALLOWED_FIELDS = {
    "management_company", "website_url", "legal_name", "entity_status",
    "state_entity_number", "registered_agent", "registered_agent_address",
    "incorporation_date", "unit_count",
    "monthly_fee_min", "monthly_fee_max", "monthly_fee_median",
    "amenities", "pet_restriction", "rental_approval", "str_restriction",
    "vehicle_restriction", "subdivision_names",
    "is_gated", "is_55_plus", "is_age_restricted",
    "phone", "email",
}

# Field type buckets used for validation.
BOOL_FIELDS    = {"is_gated", "is_55_plus", "is_age_restricted"}
INT_FIELDS     = {"unit_count"}
NUMERIC_FIELDS = FEE_FIELDS  # numeric, positive
DATE_FIELDS    = {"incorporation_date"}

# source_type must be one of these (per staging spec).
ALLOWED_SOURCE_TYPES = {"pdf", "website", "search", "sunbiz", "dbpr"}

# Target field terms for the BM25 / keyword relevance pre-filter. Only text
# matching these (plus a small surrounding window) is ever sent to Claude.
# Multi-word entries are matched as phrases. Order/content per spec.
FIELD_TERMS = [
    "fee", "assessment", "dues", "pet", "rental", "lease", "short-term",
    "vehicle", "parking", "amenity", "amenities", "pool", "clubhouse", "gate",
    "gated", "board", "management", "manager", "unit", "units",
    "registered agent",
]
# Single space-joined query handed to crawl4ai's built-in BM25 filter (server
# side) and used as the term set for the local keyword chunk filter.
FIELD_QUERY = " ".join(FIELD_TERMS)

# Hard input caps (chars). Per-source cap matches the PDF cap; the combined cap
# bounds the total text sent to Claude per community. Highest-relevance chunks
# are preferred when trimming to fit.
PER_SOURCE_CHAR_CAP   = 8000
COMBINED_CHAR_CAP     = 12000
CHUNK_SIZE            = 350   # ~chars per scored segment in the local filter
CHUNK_WINDOW          = 1     # neighbour segments kept around each match
CHARS_PER_TOKEN       = 4     # rough token estimate for reporting

# Substrings of links/text that flag a governing/financial document worth reading.
DOC_KEYWORDS = [
    "document", "governing", "declaration", "ccr", "cc&r", "rules",
    "regulation", "bylaw", "budget", "financial", "amenities", "fee",
    "assessment",
]

# Domains we never treat as the community's "official / management" site.
NON_OFFICIAL_DOMAINS = [
    "zillow", "realtor", "trulia", "redfin", "homes.com", "movoto",
    "facebook", "instagram", "twitter", "x.com", "youtube", "tiktok",
    "linkedin", "pinterest", "yelp", "reddit", "google.", "bing.com",
    "duckduckgo", "wikipedia", "niche.com", "bestplaces", "neighborhoodscout",
    "apartments.com", "rent.com", "loopnet",
]

# Per-community wall-clock budget for the document-fetch phase (seconds).
DOC_FETCH_BUDGET_SECS = 60
MAX_PDFS_PER_COMMUNITY = 5
PDF_COMBINED_CHAR_CAP  = 20000
PAGE_TEXT_CHAR_CAP     = 8000
MAX_CANDIDATE_PAGES    = 6

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


def fetch(url: str, timeout: int = 15, headers: Optional[dict] = None) -> str:
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
    # Drop scripts/styles before stripping tags so we don't keep JS noise.
    html = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", html)
    t = re.sub(r"<[^>]+>", " ", html)
    t = t.replace("&nbsp;", " ").replace("&amp;", "&")
    return re.sub(r"\s+", " ", t).strip()


def round_fee(amount: float, direction: str = "nearest") -> float:
    """Round fee to nearest $25."""
    if direction == "down":
        return math.floor(amount / 25) * 25
    if direction == "up":
        return math.ceil(amount / 25) * 25
    return round(amount / 25) * 25


def domain_of(url: str) -> str:
    try:
        host = urllib.parse.urlparse(url).netloc.lower()
        return host[4:] if host.startswith("www.") else host
    except Exception:
        return ""


# ── Supabase REST ─────────────────────────────────────────────────────────────

def supabase_get(path: str, params: Optional[dict] = None) -> Any:
    """Read-only Supabase REST call. Uses the service-role key when available
    (this is a trusted local/cron script), falling back to the anon key."""
    key = SUPABASE_SVC if (SUPABASE_SVC and SUPABASE_SVC != "your_service_role_key_here") else SUPABASE_ANON
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    html = fetch(url, headers={
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    })
    if html.startswith("ERROR"):
        return {"error": html}
    try:
        return json.loads(html)
    except Exception:
        return {"error": f"JSON parse failed: {html[:200]}"}


def supabase_post(table: str, payload: dict, dry_run: bool) -> dict:
    """Insert a row via the service-role key. No-ops in dry_run mode."""
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


# ── Evidence container ────────────────────────────────────────────────────────

class Evidence:
    """One labelled chunk of text the AI is allowed to cite.

    `fields` optionally carries structured values parsed WITHOUT an LLM (e.g.
    Sunbiz entity data) so they can be staged via the direct-pattern path with
    zero Claude tokens. `relevance` is set by the keyword filter."""

    def __init__(self, source_type: str, source_url: str, text: str,
                 fields: Optional[dict] = None):
        self.source_type = source_type
        self.source_url  = source_url
        self.text        = text
        self.fields      = fields or {}
        self.relevance   = 0.0


# ── TIER: DuckDuckGo search ───────────────────────────────────────────────────

MAX_RESULTS_PER_QUERY = 10  # results kept per query for evidence / URL building


def gather_search(name: str, city: str, chains: Chains
                  ) -> Tuple[List[Evidence], List[Tuple[str, str, str]], List[dict]]:
    """Run the search queries through the provider chain.

    Each query is sent to chains.search(), which tries every present provider
    strictly in order (searxng → serper → google_cse → tavily → jina_search →
    ddg_lite) and returns the FIRST non-empty result plus the provider that
    answered. Returns:
      - evidence chunks (one per query that returned results)
      - raw (url, title, snippet) results for candidate-URL building
      - per-query provider log: [{query, provider, results, cached}]
    """
    queries = [
        f'"{name}" HOA {city} Florida management company',
        f'"{name}" HOA fees monthly Florida',
        f'"{name}" homeowners association {city} official website',
        f'"{name}" HOA documents declaration rules {city} Florida',
        f'"{name}" HOA amenities pet rental restrictions {city}',
        f'"{name}" Florida Division of Corporations Sunbiz registered agent',
    ]
    evidence: List[Evidence] = []
    all_results: List[Tuple[str, str, str]] = []
    seen_urls = set()
    query_log: List[dict] = []
    for q in queries:
        if chains.all_search_exhausted():
            query_log.append({"query": q, "provider": None, "results": 0,
                              "cached": False, "exhausted": True})
            continue
        results, provider, cached = chains.search(q)
        results = results[:MAX_RESULTS_PER_QUERY]
        query_log.append({"query": q, "provider": provider, "results": len(results),
                          "cached": cached, "exhausted": False})
        if not results:
            continue
        blob_parts = []
        for url, title, snippet in results:
            blob_parts.append(f"{title} — {snippet} ({url})")
            if url not in seen_urls:
                seen_urls.add(url)
                all_results.append((url, title, snippet))
        evidence.append(Evidence("search", f"{provider}:{q}", " | ".join(blob_parts)[:4000]))
    return evidence, all_results, query_log


# ── TIER: local Sunbiz ────────────────────────────────────────────────────────
# The cordata corpus is ~17GB (10 × 1.7GB files) on a slow LaCie USB drive.
# Scanning it once PER COMMUNITY took ~210s each. Instead we scan it ONCE PER
# RUN for the whole batch: seed a single ripgrep/grep pass with every
# community's rarest name word, stream the matches, and stop as soon as every
# community has a hit. One bounded pass regardless of batch size.

# ON by default: local Sunbiz stages real entity fields (legal_name /
# entity_status / state_entity_number) at ZERO token cost via direct-pattern
# parsing — exactly what we rely on when Claude is skipped. It's one bounded
# pass over the corpus per batch (not per community). Set SUNBIZ_LOCAL=0 to skip
# it (e.g. when the LaCie drive is unmounted); the prescan is also a no-op then.
SUNBIZ_LOCAL    = os.environ.get("SUNBIZ_LOCAL", "1").lower() in {"1", "true", "yes"}
SUNBIZ_TIMEOUT  = int(os.environ.get("SUNBIZ_TIMEOUT", "180"))
_SUNBIZ_STOP = {"HOMEOWNERS", "ASSOCIATION", "CONDOMINIUM", "PROPERTY", "OWNERS",
                "THE", "AND", "INCORPORATED", "INC", "LLC", "CORP", "LTD",
                "ESTATE", "ESTATES", "AT", "OF", "IN"}


def sunbiz_search_words(name: str) -> List[str]:
    """Significant entity-name words to match a community against cordata."""
    words = [w for w in re.split(r"\W+", (name or "").upper())
             if len(w) > 3 and w not in _SUNBIZ_STOP]
    return words[:3]


def parse_sunbiz_line(line: str) -> Optional[Evidence]:
    """Parse one fixed-width cordata record into a labelled evidence chunk."""
    try:
        doc_num   = line[:12].strip()
        ent_name  = line[12:204].strip()
        rest      = line[205:]
        status_ch = line[204] if len(line) > 204 else ""
        is_active = status_ch == "A"
        text = (
            f"Florida Division of Corporations (Sunbiz) record.\n"
            f"Legal entity name: {ent_name}\n"
            f"State document/entity number: {doc_num}\n"
            f"Entity status: {'Active' if is_active else 'Inactive'}\n"
            f"Raw record tail: {rest[:600].strip()}"
        )
        # Structured fields for the direct-pattern (no-LLM) staging path.
        fields = {
            "legal_name":          ent_name or None,
            "state_entity_number": doc_num or None,
            "entity_status":       "Active" if is_active else "Inactive",
        }
        return Evidence("sunbiz", f"local://LaCie/cordata#{doc_num}", text,
                        fields={k: v for k, v in fields.items() if v})
    except Exception:
        return None


def sunbiz_prescan(communities: List[dict]) -> Dict[str, Evidence]:
    """Single batch-wide pass over the cordata corpus. Returns
    {community_id -> Evidence} for every community that matched."""
    out: Dict[str, Evidence] = {}
    if not SUNBIZ_LOCAL or not os.path.isdir(CORDATA_DIR):
        return out
    # Listing the corpus can raise PermissionError when the LaCie volume is
    # TCC-blocked (e.g. under launchd without Full Disk Access). Degrade
    # gracefully — local Sunbiz just no-ops, the rest of the chain runs.
    try:
        files = [os.path.join(CORDATA_DIR, fn) for fn in sorted(os.listdir(CORDATA_DIR))
                 if fn.endswith(".txt")]
    except OSError as e:
        log(f"  [sunbiz] corpus not accessible ({e}); skipping local Sunbiz")
        return out
    if not files:
        return out

    remaining: Dict[str, List[str]] = {}
    for c in communities:
        sw = sunbiz_search_words(c.get("canonical_name", ""))
        if len(sw) >= 2:
            remaining[c["id"]] = sw
    if not remaining:
        return out

    seeds = sorted({max(sw, key=len) for sw in remaining.values()})
    rg = "rg" if _which("rg") else None
    if rg:
        cmd = ["rg", "-i", "-F", "-I", "--no-line-number"]
        for s in seeds:
            cmd += ["-e", s]
        cmd += files
    else:
        cmd = ["grep", "-i", "-h", "-F"]
        for s in seeds:
            cmd += ["-e", s]
        cmd += files

    log(f"  [sunbiz] one-pass cordata scan for {len(remaining)} communities "
        f"({len(seeds)} seeds, {'rg' if rg else 'grep'}, cap {SUNBIZ_TIMEOUT}s)…")
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                text=True, encoding="utf-8", errors="ignore")
    except Exception as e:
        log(f"  [sunbiz] scan failed to start: {e}")
        return out

    # Hard wall-clock cap via a watchdog. A blocking `for line in proc.stdout`
    # will not honour a deadline check when rg is reading 17GB and emitting
    # nothing (rare seeds), so we kill the process from a timer thread; that
    # closes stdout and ends the loop with whatever matched so far.
    def _kill():
        try:
            proc.kill()
        except Exception:
            pass
    watchdog = threading.Timer(SUNBIZ_TIMEOUT, _kill)
    watchdog.start()
    try:
        for line in proc.stdout:
            if not remaining:
                break
            namefield = line[12:204].upper()
            matched = [cid for cid, sw in remaining.items()
                       if all(w in namefield for w in sw)]
            for cid in matched:
                ev = parse_sunbiz_line(line)
                if ev:
                    out[cid] = ev
                del remaining[cid]
    except Exception:
        pass
    finally:
        watchdog.cancel()
        _kill()
    log(f"  [sunbiz] matched {len(out)}/{len(out) + len(remaining)} communities")
    return out


def _which(binary: str) -> bool:
    from shutil import which
    return which(binary) is not None


# ── TIER: DBPR (Playwright) ───────────────────────────────────────────────────

def gather_dbpr(name: str, city: str) -> Optional[Evidence]:
    """Playwright DBPR CAM-license lookup; return evidence chunk if any text found."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            ctx = browser.new_context(
                user_agent=HTTP_HEADERS["User-Agent"],
                viewport={"width": 1280, "height": 800},
            )
            page = ctx.new_page()
            page.set_default_timeout(20000)
            q = urllib.parse.quote_plus(name[:30])
            page.goto(
                f"https://www.myfloridalicense.com/wl11.asp?mode=0&SID=&brd=&typ=&"
                f"SearchType=Name&SearchValue={q}&city={(city or '').replace(' ', '+')}"
                f"&county=&state=FL&zip=",
                wait_until="domcontentloaded",
                timeout=20000,
            )
            page.wait_for_timeout(2500)
            body = page.inner_text("body")
            browser.close()
            body = re.sub(r"\s+", " ", body or "").strip()
            if body and "CAM" in body.upper():
                return Evidence(
                    "dbpr",
                    "https://www.myfloridalicense.com/wl11.asp",
                    f"Florida DBPR license search results for '{name}':\n{body[:3000]}",
                )
    except Exception:
        return None
    return None


# ── DOCUMENT READING ──────────────────────────────────────────────────────────

_pdfplumber = None


def ensure_pdfplumber():
    """Import pdfplumber, pip-installing it on first use if missing."""
    global _pdfplumber
    if _pdfplumber is not None:
        return _pdfplumber
    try:
        import pdfplumber  # noqa
        _pdfplumber = pdfplumber
        return _pdfplumber
    except ImportError:
        log("  [docs] pdfplumber missing — pip installing…")
        try:
            subprocess.run(
                [sys.executable, "-m", "pip", "install", "--quiet", "pdfplumber"],
                check=True,
            )
            import pdfplumber  # noqa
            _pdfplumber = pdfplumber
            return _pdfplumber
        except Exception as e:
            log(f"  [docs] pdfplumber install failed: {e}")
            return None


# Hints that a search result is an official HOA / management-company page worth
# scanning for documents (used to rank results when there is no stored website).
OFFICIAL_HINTS = [
    "hoa", "homeowner", "association", "propertymanagement", "property-management",
    "communit", "poa", "condo", "masterassociation", "master-association",
    "documents", "governing", "declaration", "bylaw", "ccr", "cc&r",
]


def build_candidate_urls(website_url: Optional[str],
                         search_results: List[Tuple[str, str, str]],
                         name: str = "") -> List[str]:
    """Candidate pages to scan for document links.

    A stored website_url is preferred but NOT required: when it is absent we
    derive candidates from the search results, ranking the ones that look like
    the community's official site or its management company first so PDF
    discovery has something real to act on."""
    candidates: List[str] = []
    seen_domains = set()

    def add(url: str):
        if not url or not url.lower().startswith("http"):
            return
        d = domain_of(url)
        if not d or d in seen_domains:
            return
        if any(bad in url.lower() for bad in NON_OFFICIAL_DOMAINS):
            return
        seen_domains.add(d)
        candidates.append(url)

    # The community's own site always goes first when we have one.
    if website_url:
        add(website_url.strip())

    # Rank search results: prefer pages whose url/title/snippet name the
    # community or read like an official/management/documents page.
    name_tokens = [t for t in re.sub(r"[^a-z0-9 ]", " ", (name or "").lower()).split()
                   if len(t) > 3][:4]

    def score(result: Tuple[str, str, str]) -> int:
        url, title, snippet = result
        hay = f"{url} {title} {snippet}".lower()
        s = 0
        s += sum(2 for tok in name_tokens if tok in hay)
        s += sum(1 for h in OFFICIAL_HINTS if h in hay)
        # A document link in the result url itself is the strongest signal.
        if url.lower().split("?")[0].endswith(".pdf"):
            s += 5
        return s

    for url, _title, _snip in sorted(search_results, key=score, reverse=True):
        if len(candidates) >= MAX_CANDIDATE_PAGES:
            break
        add(url)
    return candidates[:MAX_CANDIDATE_PAGES]


def find_document_links(html: str, base_url: str) -> List[str]:
    """Find links to governing documents / budgets / rules on a page."""
    links: List[str] = []
    seen = set()
    for href, text in re.findall(r'<a\s+[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
                                 html, re.DOTALL | re.IGNORECASE):
        text_clean = re.sub(r"<[^>]+>", "", text).strip().lower()
        href_low = href.lower()
        is_pdf = href_low.split("?")[0].endswith(".pdf")
        kw_hit = any(k in href_low or k in text_clean for k in DOC_KEYWORDS)
        if not (is_pdf or kw_hit):
            continue
        absolute = urllib.parse.urljoin(base_url, href)
        if not absolute.lower().startswith("http"):
            continue
        if absolute in seen:
            continue
        seen.add(absolute)
        # PDFs first — they carry the real governing-document text.
        links.insert(0, absolute) if is_pdf else links.append(absolute)
    return links


def find_markdown_doc_links(text: str, base_url: str) -> List[str]:
    """Find governing-document / PDF links in Jina-Reader markdown output.

    When a page is fetched via Jina Reader the body is markdown, not HTML, so
    the <a href> regex finds nothing. Pull links from [label](url) syntax and
    apply the same keyword/PDF filter used for HTML pages."""
    links: List[str] = []
    seen = set()
    for label, href in re.findall(r"\[([^\]]*)\]\((https?://[^)\s]+)\)", text):
        href_low = href.lower()
        is_pdf = href_low.split("?")[0].endswith(".pdf")
        kw_hit = any(k in href_low or k in label.lower() for k in DOC_KEYWORDS)
        if not (is_pdf or kw_hit):
            continue
        absolute = urllib.parse.urljoin(base_url, href)
        if not absolute.lower().startswith("http") or absolute in seen:
            continue
        seen.add(absolute)
        links.insert(0, absolute) if is_pdf else links.append(absolute)
    return links


def read_documents(name: str, website_url: Optional[str],
                   search_results: List[Tuple[str, str, str]],
                   notes: List[str], chains: Chains
                   ) -> Tuple[List[Evidence], List[str], List[dict]]:
    """Fetch candidate pages, follow document links, read PDFs — via the fetch
    chain (requests browser-UA → Jina Reader fallback; pdfplumber for PDF bytes).

    Each page and PDF is fetched with chains.fetch(), which records which method
    succeeded ('requests' | 'jina-reader' | 'cache'). Bounded by
    DOC_FETCH_BUDGET_SECS so one slow site cannot stall the run.

    Returns (evidence chunks, PDF URLs actually read, fetch log) where fetch log
    is [{url, method, kind, from_cache}] for every page/PDF the chain answered.
    """
    deadline = time.monotonic() + DOC_FETCH_BUDGET_SECS
    evidence: List[Evidence] = []
    pdfs_read: List[str] = []
    fetch_log: List[dict] = []
    combined_pdf_chars = 0

    candidates = build_candidate_urls(website_url, search_results, name)
    notes.append(f"doc candidates: {len(candidates)}"
                 + (" (from search; no stored website)" if not website_url else ""))
    src = "stored website + search" if website_url else "search only"
    log(f"    [docs] {len(candidates)} candidate page(s) [{src}]: "
        + (", ".join(candidates) if candidates else "none"))
    own_domain = domain_of(website_url) if website_url else ""
    name_token = (name.split()[0].upper() if name.split() else "")

    doc_links: List[str] = []
    for url in candidates:
        if time.monotonic() > deadline:
            notes.append("doc budget hit (page scan)")
            break
        # bm25_query only affects the crawl4ai fallback tier (it returns BM25-
        # filtered markdown server-side); requests/jina ignore it and return the
        # full body so document-link discovery still works.
        res = chains.fetch(url, bm25_query=FIELD_QUERY)
        if not res.ok:
            log(f"    [docs] fetch FAIL {url}")
            continue
        cache_tag = " (cache)" if res.from_cache else ""
        log(f"    [docs] fetched {url} ({len(res.content)}b) via {res.method}"
            f"/{res.kind}{cache_tag}")
        fetch_log.append({"url": url, "method": res.method, "kind": res.kind,
                          "from_cache": res.from_cache})
        # An HTML body keeps its tags for link discovery; Jina Reader / PDF text
        # is already plain. Keep the OWN website always; third-party pages only
        # when the community name appears (avoids unrelated-page noise).
        if res.kind == "html":
            page_text = text_from_html(res.content)
            page_links = find_document_links(res.content, url)
        else:  # "text" (jina markdown) or "pdf_text"
            page_text = res.content
            page_links = find_markdown_doc_links(res.content, url)
        is_own = bool(own_domain) and own_domain in domain_of(url)
        if is_own or (len(name_token) > 2 and name_token in page_text.upper()):
            evidence.append(Evidence("website", url, page_text[:PAGE_TEXT_CHAR_CAP]))
        for link in page_links:
            if link not in doc_links:
                doc_links.append(link)

    pdf_links = [l for l in doc_links if l.lower().split("?")[0].endswith(".pdf")]
    log(f"    [docs] doc links: {len(doc_links)} (pdf: {len(pdf_links)})"
        + (": " + ", ".join(pdf_links[:8]) if pdf_links else ""))

    # Read up to MAX_PDFS_PER_COMMUNITY PDFs through the fetch chain — it detects
    # PDF bytes (content-type / %PDF / .pdf) and extracts text with pdfplumber.
    for link in doc_links:
        if len(pdfs_read) >= MAX_PDFS_PER_COMMUNITY:
            break
        if combined_pdf_chars >= PDF_COMBINED_CHAR_CAP:
            break
        if time.monotonic() > deadline:
            notes.append("doc budget hit (pdf download)")
            break
        if not link.lower().split("?")[0].endswith(".pdf"):
            continue
        res = chains.fetch(link)
        if not res.ok or res.kind != "pdf_text":
            log(f"    [docs] PDF skip (unreadable/blocked): {link}")
            continue
        cache_tag = " (cache)" if res.from_cache else ""
        fetch_log.append({"url": link, "method": res.method, "kind": res.kind,
                          "from_cache": res.from_cache})
        remaining = PDF_COMBINED_CHAR_CAP - combined_pdf_chars
        text = res.content[:remaining]
        combined_pdf_chars += len(text)
        pdfs_read.append(link)
        log(f"    [docs] PDF read {link} via {res.method}{cache_tag}")
        evidence.append(Evidence("pdf", link, text))

    return evidence, pdfs_read, fetch_log


# ── AI EXTRACTION ─────────────────────────────────────────────────────────────

# ── RELEVANCE PRE-FILTER (BM25 / keyword chunk filter) ────────────────────────
# Reduces the text sent to Claude to only field-relevant chunks. crawl4ai does
# this server-side via its BM25 filter (see enrich_chain.fetch bm25_query); this
# is the "equivalent keyword chunk filter" for requests/jina/pdf/search text.

def _chunk_text(text: str, size: int = CHUNK_SIZE) -> List[str]:
    """Split text into ~`size`-char segments, breaking on whitespace so words
    aren't cut. PDF text is whitespace-collapsed to one line, so size-based
    chunking (not newline-based) is required to score it."""
    text = text or ""
    if len(text) <= size:
        return [text] if text.strip() else []
    out, i, n = [], 0, len(text)
    while i < n:
        end = min(i + size, n)
        if end < n:
            sp = text.find(" ", end)
            if sp != -1 and sp - end < 80:
                end = sp
        seg = text[i:end]
        if seg.strip():
            out.append(seg)
        i = end
    return out


def _bm25_scores(chunks: List[str], terms: List[str]) -> List[float]:
    """BM25 score per chunk over the query terms (phrase-aware substring tf)."""
    k1, b = 1.5, 0.75
    lows = [c.lower() for c in chunks]
    N = len(chunks) or 1
    lens = [max(1, len(c)) for c in chunks]
    avgdl = sum(lens) / N
    df: Dict[str, int] = {}
    tfs: List[Dict[str, int]] = []
    for c in lows:
        tf: Dict[str, int] = {}
        for t in terms:
            cnt = c.count(t)
            if cnt:
                tf[t] = cnt
        tfs.append(tf)
        for t in tf:
            df[t] = df.get(t, 0) + 1
    idf = {t: math.log(1 + (N - df.get(t, 0) + 0.5) / (df.get(t, 0) + 0.5))
           for t in terms}
    scores = []
    for i, tf in enumerate(tfs):
        s, dl = 0.0, lens[i]
        for t, cnt in tf.items():
            denom = cnt + k1 * (1 - b + b * dl / avgdl)
            s += idf[t] * (cnt * (k1 + 1)) / denom
        scores.append(s)
    return scores


def relevance_filter(text: str, terms: List[str] = FIELD_TERMS,
                     cap: int = PER_SOURCE_CHAR_CAP,
                     window: int = CHUNK_WINDOW) -> Tuple[str, float]:
    """Keep only chunks matching the field terms plus a small surrounding
    window, ordered so the highest-relevance chunks survive the cap. Returns
    (kept_text, total_relevance_score). Empty string when nothing matches."""
    chunks = _chunk_text(text)
    if not chunks:
        return "", 0.0
    lc_terms = [t.lower() for t in terms]
    scores = _bm25_scores(chunks, lc_terms)
    hits = [i for i, s in enumerate(scores) if s > 0]
    if not hits:
        return "", 0.0
    keep = set()
    for i in hits:
        for j in range(max(0, i - window), min(len(chunks), i + window + 1)):
            keep.add(j)
    # Fill the cap with the highest-scoring chunks first…
    selected, total = [], 0
    for i in sorted(keep, key=lambda i: scores[i], reverse=True):
        seg = chunks[i]
        if total + len(seg) > cap:
            seg = seg[:max(0, cap - total)]
        if not seg:
            break
        selected.append((i, seg))
        total += len(seg)
        if total >= cap:
            break
    # …but emit them in document order for readability.
    selected.sort(key=lambda x: x[0])
    kept = " … ".join(s for _, s in selected).strip()
    return kept, sum(scores[i] for i in keep)


def filter_evidence_for_extraction(
        evidence: List[Evidence]) -> Tuple[List[Evidence], int, int]:
    """Apply the keyword relevance filter to web/pdf/search/dbpr evidence and
    trim the combined text to COMBINED_CHAR_CAP, preferring high-relevance
    chunks. Sunbiz is handled by the direct-pattern path, never sent to Claude.
    Returns (filtered_evidence, chars_before, chars_after)."""
    chars_before = 0
    scored: List[Evidence] = []
    for ev in evidence:
        if ev.source_type == "sunbiz":
            continue  # direct-pattern only — zero tokens
        chars_before += len(ev.text or "")
        kept, score = relevance_filter(ev.text)
        if not kept:
            continue
        fe = Evidence(ev.source_type, ev.source_url, kept)
        fe.relevance = score
        scored.append(fe)
    # Combined cap: highest-relevance evidence first, truncate the boundary one.
    scored.sort(key=lambda e: e.relevance, reverse=True)
    out: List[Evidence] = []
    total = 0
    for fe in scored:
        if total >= COMBINED_CHAR_CAP:
            break
        room = COMBINED_CHAR_CAP - total
        if len(fe.text) > room:
            fe.text = fe.text[:room]
        out.append(fe)
        total += len(fe.text)
    chars_after = sum(len(e.text) for e in out)
    return out, chars_before, chars_after


# ── DIRECT-PATTERN EXTRACTION (no LLM, zero tokens) ───────────────────────────

def direct_pattern_extract(evidence: List[Evidence]) -> List[dict]:
    """Stage high-confidence structured fields WITHOUT calling Claude. Currently
    the Sunbiz entity record (legal_name / entity_status / state_entity_number),
    parsed deterministically in parse_sunbiz_line. This is what we "rely on"
    when there are no relevant web chunks to send to Claude."""
    out: List[dict] = []
    for ev in evidence:
        for field, value in (ev.fields or {}).items():
            if field not in ALLOWED_FIELDS:
                continue
            out.append({
                "field_name":  field,
                "value":       value,
                "source_url":  ev.source_url,
                "source_type": ev.source_type if ev.source_type in ALLOWED_SOURCE_TYPES else "search",
                "confidence":  0.95,
                "evidence":    "direct-pattern (no LLM)",
            })
    return out


# ── EXTRACTION GATE: only spend Claude tokens on real signal ──────────────────
# Search snippets routinely contain field *keywords* with no actual data, so a
# keyword hit alone is not enough to call Claude. We call Claude only when the
# filtered text carries (a) a real fetched page/PDF body ABOUT this community, or
# (b) a concrete data signal — a $ amount near a fee term, a phone/email, or a
# management-company name. Snippet-only keyword noise is skipped; Sunbiz +
# direct-pattern still stage real fields at zero token cost.

BODY_SOURCES = {"website", "pdf", "dbpr"}  # actual fetched bodies (not snippets)

_FEE_TERMS = (r"(?:fee|fees|dues|assessment|assessments|maintenance|monthly|"
              r"quarterly|annually|annual|per\s+month|/mo)")
DOLLAR_NEAR_FEE = re.compile(
    r"(?is)(?:\$\s?\d[\d,]*(?:\.\d{1,2})?[^.\n]{0,40}?\b" + _FEE_TERMS + r"\b"
    r"|\b" + _FEE_TERMS + r"\b[^.\n]{0,40}?\$\s?\d[\d,]*)")
PHONE_RE = re.compile(r"(?<!\d)(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}(?!\d)")
EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")
_MGMT_GENERIC = {"association", "associations", "community", "communities",
                 "homeowners", "property", "properties", "condominium", "condo",
                 "the", "hoa", "owners", "master", "village", "club", "your",
                 "our", "this", "florida", "management", "real", "home", "homes"}
_MGMT_RE = re.compile(
    r"\b([A-Z][A-Za-z&'.\-]+)(?:\s+[A-Z][A-Za-z&'.\-]+){0,3}\s+"
    r"(?:Management|Mgmt|Realty)\b")
_MANAGED_BY = re.compile(r"(?i)\bmanaged by\s+[A-Z]")


def has_mgmt_signal(text: str) -> bool:
    """A management-company NAME (not the generic word 'management')."""
    if _MANAGED_BY.search(text):
        return True
    for mm in _MGMT_RE.finditer(text):
        if mm.group(1).lower() not in _MGMT_GENERIC:
            return True
    return False


def strong_signals(text: str) -> List[str]:
    """Concrete data signals present in the text (not just field keywords)."""
    sig = []
    if DOLLAR_NEAR_FEE.search(text): sig.append("fee$")
    if PHONE_RE.search(text):        sig.append("phone")
    if EMAIL_RE.search(text):        sig.append("email")
    if has_mgmt_signal(text):        sig.append("mgmt")
    return sig


def _name_tokens(name: str) -> List[str]:
    return [w for w in re.split(r"\W+", (name or "").upper())
            if len(w) > 3 and w not in _SUNBIZ_STOP]


def _body_is_relevant(name: str, filtered_ev: List[Evidence]) -> bool:
    """True when a real page/PDF body actually names this community (so junk
    PDFs / unrelated pages that merely mention 'fee' don't count)."""
    toks = _name_tokens(name)
    if not toks:
        return False
    need = 2 if len(toks) >= 2 else 1
    for ev in filtered_ev:
        if ev.source_type not in BODY_SOURCES:
            continue
        up = ev.text.upper()
        if sum(1 for t in toks if t in up) >= need:
            return True
    return False


def extraction_gate(name: str,
                    filtered_ev: List[Evidence]) -> Tuple[bool, bool, List[str]]:
    """Decide whether the filtered evidence is worth a Claude call.
    Returns (should_call, has_body, signals). has_body indicates a real fetched
    page/PDF body is present (vs. snippets only). should_call is True when a real
    body names the community OR a concrete data signal is present anywhere."""
    if not filtered_ev:
        return False, False, []
    has_body = any(ev.source_type in BODY_SOURCES for ev in filtered_ev)
    sigs = strong_signals("\n".join(ev.text for ev in filtered_ev))
    should_call = bool(sigs) or _body_is_relevant(name, filtered_ev)
    return should_call, has_body, sigs


# ── CSS-SCHEMA REUSE for repeat-layout domains (one-time, then zero tokens) ───
# When crawl4ai can produce a reusable JSON-CSS extraction schema for a domain,
# we store it and reuse it on later pages of that domain via crawl4ai's /crawl
# json_css strategy — those pages then extract with NO Claude call. Generation
# is one-time per domain (gated behind seeing the domain repeat). Everything is
# fully defensive: any failure returns None and the caller uses the normal path.

REPO_DIR  = os.path.dirname(_SCRIPT_DIR)
STATE_DIR = os.environ.get("ENRICH_STATE_DIR") or os.path.join(REPO_DIR, ".enrich_state")
CSS_SCHEMA_DIR = os.path.join(STATE_DIR, "css_schemas")
CSS_SCHEMA_MIN_REPEAT = int(os.environ.get("CSS_SCHEMA_MIN_REPEAT", "2"))

# Map a few common JSON-CSS schema field names to our allowlist columns.
CSS_FIELD_MAP = {
    "management_company": "management_company", "management": "management_company",
    "phone": "phone", "telephone": "phone", "email": "email",
    "fee": "monthly_fee_median", "monthly_fee": "monthly_fee_median",
    "units": "unit_count", "unit_count": "unit_count",
    "amenities": "amenities", "website": "website_url",
}


def _claude_cli(prompt: str, timeout: int = 150) -> str:
    """Run the `claude` CLI (Haiku, subscription auth) and return stdout text,
    or '' on any failure. ANTHROPIC_API_KEY is stripped so the CLI never bills
    the paid API."""
    child_env = dict(os.environ)
    child_env.pop("ANTHROPIC_API_KEY", None)
    child_env.pop("ANTHROPIC_AUTH_TOKEN", None)
    try:
        proc = subprocess.run(
            [CLAUDE_BIN, "--model", AI_MODEL, "-p"],
            input=prompt, capture_output=True, text=True,
            timeout=timeout, env=child_env,
        )
    except Exception as e:
        log(f"  [ai] claude CLI call failed: {e}")
        return ""
    if proc.returncode != 0:
        log(f"  [ai] claude CLI exit {proc.returncode}: {(proc.stderr or '')[:160]}")
        return ""
    return (proc.stdout or "").strip()


class DomainSchemaStore:
    """Per-domain JSON-CSS schema cache with reuse via crawl4ai /crawl."""

    def __init__(self, chains):
        self.chains = chains
        try:
            os.makedirs(CSS_SCHEMA_DIR, exist_ok=True)
        except Exception:
            pass
        self._seen_path = os.path.join(CSS_SCHEMA_DIR, "_seen.json")
        self._seen = self._load_seen()

    def _load_seen(self) -> Dict[str, int]:
        try:
            with open(self._seen_path) as fh:
                return json.load(fh)
        except Exception:
            return {}

    def _save_seen(self):
        try:
            tmp = self._seen_path + ".tmp"
            with open(tmp, "w") as fh:
                json.dump(self._seen, fh)
            os.replace(tmp, self._seen_path)
        except Exception:
            pass

    def _schema_path(self, domain: str) -> str:
        safe = re.sub(r"[^a-z0-9.-]", "_", domain.lower())
        return os.path.join(CSS_SCHEMA_DIR, safe + ".json")

    def get_schema(self, domain: str) -> Optional[dict]:
        try:
            with open(self._schema_path(domain)) as fh:
                return json.load(fh)
        except Exception:
            return None

    def note_domain(self, domain: str) -> int:
        if not domain:
            return 0
        self._seen[domain] = self._seen.get(domain, 0) + 1
        self._save_seen()
        return self._seen[domain]

    def reuse(self, url: str) -> Optional[List[dict]]:
        """If a stored schema exists for url's domain, extract with crawl4ai's
        json_css strategy (no Claude). Returns staged-style field dicts or None."""
        domain = domain_of(url)
        schema = self.get_schema(domain) if domain else None
        if not schema:
            return None
        base = (self.chains.cfg.get("crawl4ai_url") or "").rstrip("/")
        token = self.chains.cfg.get("crawl4ai_token") or ""
        if not base:
            return None
        body = json.dumps({
            "urls": [url],
            "crawler_config": {"type": "CrawlerRunConfig", "params": {
                "extraction_strategy": {"type": "JsonCssExtractionStrategy",
                                        "params": {"schema": schema}}}},
        }).encode()
        try:
            from lib.enrich_chain import _http
            headers = {"Content-Type": "application/json"}
            if token:
                headers["Authorization"] = f"Bearer {token}"
            status, _h, resp = _http("POST", base + "/crawl", headers=headers,
                                     data=body, timeout=40)
            if status != 200:
                return None
            data = json.loads(resp.decode("utf-8", "ignore"))
            results = data.get("results") or data.get("result") or []
            if not results:
                return None
            extracted = results[0].get("extracted_content")
            rows = json.loads(extracted) if isinstance(extracted, str) else extracted
            if isinstance(rows, dict):
                rows = [rows]
            out: List[dict] = []
            for row in (rows or []):
                if not isinstance(row, dict):
                    continue
                for k, v in row.items():
                    col = CSS_FIELD_MAP.get(k.lower())
                    if not col or v in (None, ""):
                        continue
                    out.append({"field_name": col, "value": v, "source_url": url,
                                "source_type": "website", "confidence": 0.8,
                                "evidence": "json-css schema (no LLM)"})
            return out or None
        except Exception:
            return None

    def maybe_generate(self, url: str, name: str = "") -> bool:
        """One-time per domain: once a domain repeats (>= CSS_SCHEMA_MIN_REPEAT
        sightings), generate a reusable JSON-CSS schema with a SINGLE Haiku call
        over the page HTML and store it. Later pages on that domain then extract
        with no Claude call via reuse(). Returns True if newly generated.
        Defensive — any failure is a no-op and the normal path is used."""
        domain = domain_of(url)
        if not domain or self.get_schema(domain):
            return False
        if self._seen.get(domain, 0) < CSS_SCHEMA_MIN_REPEAT:
            return False
        try:
            html = self._fetch_html(url)
            if not html or len(html) < 500:
                return False
            schema = self._gen_schema_via_llm(html[:6000], name)
            if not schema:
                return False
            with open(self._schema_path(domain), "w") as fh:
                json.dump(schema, fh)
            log(f"  [css] generated reusable JSON-CSS schema for {domain}")
            return True
        except Exception:
            return False

    def _fetch_html(self, url: str) -> str:
        base = (self.chains.cfg.get("crawl4ai_url") or "").rstrip("/")
        token = self.chains.cfg.get("crawl4ai_token") or ""
        if not base:
            return ""
        from lib.enrich_chain import _http
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        status, _h, resp = _http("POST", base + "/html", headers=headers,
                                 data=json.dumps({"url": url}).encode(), timeout=40)
        if status != 200:
            return ""
        d = json.loads(resp.decode("utf-8", "ignore"))
        return d.get("html") or d.get("cleaned_html") or ""

    def _gen_schema_via_llm(self, html: str, name: str) -> Optional[dict]:
        prompt = (
            "You generate a reusable JSON-CSS extraction schema for crawl4ai's "
            "JsonCssExtractionStrategy from a sample HTML page of a Florida HOA "
            "or property-management site. Output STRICT JSON only with shape:\n"
            '{"name":"hoa","baseSelector":"<css>","fields":[{"name":"management_company",'
            '"selector":"<css>","type":"text"}, ...]}\n'
            "Field names MUST be from: management_company, phone, email, fee, "
            "units, amenities, website. Use stable CSS selectors that will match "
            "the same layout on other pages of this domain. No prose, no fences.\n\n"
            f"Community context: {name}\n\nHTML SAMPLE:\n{html}"
        )
        out = _claude_cli(prompt, timeout=120)
        if not out:
            return None
        out = re.sub(r"^```(?:json)?|```$", "", out, flags=re.MULTILINE).strip()
        m = re.search(r"\{.*\}", out, re.DOTALL)
        if not m:
            return None
        try:
            sch = json.loads(m.group(0))
        except Exception:
            return None
        if isinstance(sch, dict) and sch.get("baseSelector") and isinstance(sch.get("fields"), list):
            return sch
        return None


EXTRACT_SYSTEM = (
    "You are a precise data-extraction engine for a Florida HOA database. "
    "Extract ONLY facts explicitly stated in the supplied evidence. Never "
    "infer, guess, or use outside knowledge. Every value you return MUST be "
    "directly supported by one evidence chunk, and you MUST cite that chunk's "
    "exact source_url and source_type. Convert any annual/yearly fee or dues "
    "figure to a MONTHLY amount (divide by 12) before returning it. "
    "Respond with strict JSON only — no prose, no code fences."
)


def ai_extract(name: str, city: str, evidence: List[Evidence],
               chains) -> Tuple[List[dict], int, bool]:
    """Extract fields via the `claude` CLI (Haiku on the subscription).

    `evidence` is already keyword-filtered and capped to COMBINED_CHAR_CAP. The
    result is cached by a hash of the input text + model + field list, so the
    same document is never sent to Claude twice across runs.

    Returns (fields, input_tokens_estimate, was_called). input_tokens_estimate
    is 0 when the call is served from cache (no tokens spent)."""
    if not evidence:
        return [], 0, False

    chunks = []
    budget = COMBINED_CHAR_CAP  # already trimmed, this is a final safety bound
    for i, ev in enumerate(evidence):
        block = (f"=== EVIDENCE [{i}] source_type={ev.source_type} "
                 f"source_url={ev.source_url} ===\n{ev.text}\n")
        if budget - len(block) < 0:
            block = block[:budget]
        chunks.append(block)
        budget -= len(block)
        if budget <= 0:
            break

    field_list = ", ".join(sorted(ALLOWED_FIELDS))
    user = (
        f"Community: {name} in {city or 'Florida'}, Palm Beach County, Florida.\n\n"
        f"Extract any of these EXACT fields that the evidence explicitly states:\n"
        f"{field_list}\n\n"
        "Rules:\n"
        "- monthly_fee_min / monthly_fee_max / monthly_fee_median are MONTHLY "
        "USD numbers (convert annual dues by dividing by 12).\n"
        "- is_gated / is_55_plus / is_age_restricted are booleans true or false.\n"
        "- incorporation_date is YYYY-MM-DD.\n"
        "- subdivision_names is a comma-separated string.\n"
        "- unit_count is a positive integer.\n"
        "- Only include a field if an evidence chunk explicitly states it. "
        "Omit everything you are unsure about.\n"
        "- source_type MUST be exactly one of: pdf, website, search, sunbiz, dbpr "
        "(matching the chunk you used). source_url MUST be that chunk's url.\n\n"
        'Return JSON of this shape:\n'
        '{"fields":[{"field_name":"...","value":"...","source_url":"...",'
        '"source_type":"...","confidence":0.0,"evidence":"<=120 char quote"}]}\n\n'
        "EVIDENCE:\n" + "\n".join(chunks)
    )

    prompt = EXTRACT_SYSTEM + "\n\n" + user
    tokens_est = max(1, len(prompt) // CHARS_PER_TOKEN)

    # Extraction cache: keyed by a hash of (model + field list + prompt). The
    # same filtered document is never sent to Claude twice across runs — a hit
    # costs zero tokens.
    cache_key = hashlib.sha1(
        f"{AI_MODEL}|{field_list}|{prompt}".encode("utf-8")).hexdigest()
    cached = chains.cache.get("extract", cache_key)
    if cached is not None and isinstance(cached.get("fields"), list):
        log(f"  [ai] extraction cache HIT ({len(cached['fields'])} fields, 0 tokens)")
        return cached["fields"], 0, False

    # Run the `claude` CLI on the subscription. Strip ANTHROPIC_API_KEY from the
    # child env so the CLI authenticates via CLAUDE_CODE_OAUTH_TOKEN, never the
    # (billed) API.
    child_env = dict(os.environ)
    child_env.pop("ANTHROPIC_API_KEY", None)
    child_env.pop("ANTHROPIC_AUTH_TOKEN", None)
    try:
        proc = subprocess.run(
            [CLAUDE_BIN, "--model", AI_MODEL, "-p"],
            input=prompt, capture_output=True, text=True,
            timeout=150, env=child_env,
        )
    except Exception as e:
        log(f"  [ai] claude CLI call failed: {e}")
        return [], tokens_est, True
    if proc.returncode != 0:
        log(f"  [ai] claude CLI exit {proc.returncode}: {(proc.stderr or '')[:160]}")
        return [], tokens_est, True
    text = (proc.stdout or "").strip()
    # Strip code fences if present, then grab the outermost JSON object.
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return [], tokens_est, True
    try:
        parsed = json.loads(m.group(0))
    except Exception:
        return [], tokens_est, True
    fields = parsed.get("fields", [])
    fields = fields if isinstance(fields, list) else []
    chains.cache.put("extract", cache_key, {"fields": fields})
    return fields, tokens_est, True


# ── VALIDATION ────────────────────────────────────────────────────────────────

# Junk "no value" sentinels the LLM sometimes emits as a string — never stage
# these (they pollute the pending queue). Matched case-insensitively after strip.
_NULL_SENTINELS = {
    "none", "n/a", "na", "n.a.", "null", "nil", "unknown", "tbd", "tba",
    "not available", "not applicable", "not listed", "not provided",
    "not specified", "none provided", "none listed", "none found",
    "-", "--", "—", "n/a.", "none.", "unknown.",
}


def validate_field(field: str, raw_value: Any) -> Optional[str]:
    """Validate + normalize one proposed value. Returns a clean string, or
    None if it fails validation (caller drops it)."""
    if raw_value is None:
        return None
    # Reject LLM "no value" sentinels for any non-numeric field (numeric/bool
    # fields have their own parsers below that already reject these).
    if (isinstance(raw_value, str)
            and field not in BOOL_FIELDS and field not in NUMERIC_FIELDS
            and field not in INT_FIELDS
            and raw_value.strip().lower() in _NULL_SENTINELS):
        return None

    if field in BOOL_FIELDS:
        if isinstance(raw_value, bool):
            return "true" if raw_value else "false"
        v = str(raw_value).strip().lower()
        if v in {"true", "yes", "1"}:
            return "true"
        if v in {"false", "no", "0"}:
            return "false"
        return None

    if field in INT_FIELDS:
        try:
            n = int(round(float(str(raw_value).replace(",", "").strip())))
        except Exception:
            return None
        if n <= 0 or n > 200000:
            return None
        return str(n)

    if field in NUMERIC_FIELDS:
        try:
            n = float(str(raw_value).replace(",", "").replace("$", "").strip())
        except Exception:
            return None
        if n <= 0 or n > 100000:
            return None
        return str(n)

    if field in DATE_FIELDS:
        v = str(raw_value).strip()[:10]
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            return None
        try:
            datetime.strptime(v, "%Y-%m-%d")
        except Exception:
            return None
        return v

    if field == "email":
        v = str(raw_value).strip()
        if (" " in v or "@" not in v or "." not in v.split("@")[-1]
                or len(v) >= 200 or len(v) < 5):
            return None
        return v

    if field == "phone":
        v = str(raw_value).strip()
        digits = re.sub(r"\D", "", v)
        if len(digits) < 10:
            return None
        return v[:500]

    # Default: free text — trimmed, under 500 chars.
    v = str(raw_value).strip()
    if not v:
        return None
    return v[:500]


# ── Community current-value + dedupe lookups ──────────────────────────────────

def existing_pending_fields(community_id: str) -> set:
    """field_names already pending or approved in pending_community_data."""
    rows = supabase_get("pending_community_data", {
        "community_id": f"eq.{community_id}",
        "status": "in.(pending,approved)",
        "select": "field_name,status",
    })
    if not isinstance(rows, list):
        return set()
    return {r.get("field_name") for r in rows if r.get("field_name")}


def has_pending_fee(community_id: str) -> bool:
    """True if a pending/approved fee observation already exists."""
    rows = supabase_get("pending_fee_observations", {
        "community_id": f"eq.{community_id}",
        "status": "in.(pending,approved)",
        "select": "id",
        "limit": "1",
    })
    return isinstance(rows, list) and len(rows) > 0


# ── Enrich one community ──────────────────────────────────────────────────────

def is_empty(val: Any) -> bool:
    return val is None or (isinstance(val, str) and val.strip() == "")


def fmt_quota(chains: Chains) -> str:
    """Compact one-line per-provider quota snapshot: search providers (with
    caps/exhaustion) plus the uncapped document-fetch methods."""
    names = chains.present_search_names() + ["requests", "crawl4ai", "jina_reader"]
    snap = chains.quota.snapshot(names)
    parts = []
    for n in names:
        s = snap.get(n, {})
        cap = s.get("cap")
        capstr = f"/{cap}{s.get('window','')[:1]}" if cap else ""
        ex = " EXHAUSTED" if s.get("exhausted") else ""
        parts.append(f"{n}={s.get('day',0)}d,{s.get('month',0)}m{capstr}{ex}")
    return " | ".join(parts)


def _deferred_result(cid: str, name: str) -> dict:
    return {
        "community_id": cid, "name": name, "status": "deferred",
        "pcd_inserted": 0, "fee_inserted": 0, "pdfs_read": 0,
        "counts_by_field": {}, "counts_by_source": {},
    }


def enrich_community(community: dict, dry_run: bool, output_lines: List[str],
                     chains: Chains, sunbiz_ev: Optional[Evidence] = None,
                     schema_store: Optional["DomainSchemaStore"] = None) -> dict:
    name = community.get("canonical_name", "Unknown")
    cid  = community.get("id", "")
    city = community.get("city", "") or ""
    website = community.get("website_url")

    log(f"\n{'─'*60}")
    log(f"Enriching: {name} [{cid[:8]}…]")
    log(f"{'─'*60}")
    output_lines.append(f"\n=== {name} ({cid}) ===")

    # DONE-vs-DEFERRED: if every search provider is spent (quota / limit walls),
    # we cannot gather web evidence — defer this community to a later run rather
    # than logging it as researched (which would suppress it for
    # skip_researched_days). With a local uncapped SearXNG this never triggers.
    if chains.all_search_exhausted():
        log("  [defer] all search providers exhausted — deferring to a later run")
        output_lines.append("  DEFERRED: all search providers exhausted")
        return _deferred_result(cid, name)

    notes: List[str] = []
    evidence: List[Evidence] = []

    # 1 — Gather: search chain (per-query provider), local Sunbiz, DBPR.
    log("  [gather] search chain…")
    search_ev, search_results, query_log = gather_search(name, city, chains)
    evidence.extend(search_ev)
    for q in query_log:
        if q.get("exhausted"):
            tag = "EXHAUSTED"
        else:
            tag = (f"{q['provider'] or 'none'}"
                   f"{' (cache)' if q['cached'] else ''} → {q['results']}")
        output_lines.append(f"  SEARCH   [{tag}]  {q['query']}")
        log(f"    search [{tag}] {q['query'][:55]}")

    if sunbiz_ev:
        evidence.append(sunbiz_ev)
        notes.append("sunbiz: hit")

    log("  [gather] DBPR (Playwright)…")
    dbpr = gather_dbpr(name, city)
    if dbpr:
        evidence.append(dbpr)
        notes.append("dbpr: hit")

    # 2 — Document reading via the fetch chain (60s budget).
    log("  [docs] reading documents…")
    doc_ev, pdfs_read, fetch_log = read_documents(name, website, search_results,
                                                  notes, chains)
    evidence.extend(doc_ev)
    for f in fetch_log:
        cache_tag = " (cache)" if f["from_cache"] else ""
        output_lines.append(
            f"  FETCH    {f['method']}/{f['kind']}{cache_tag}  {f['url']}")
    log(f"  [docs] PDFs read: {len(pdfs_read)}")
    for p in pdfs_read:
        output_lines.append(f"  PDF READ   {p}")
        log(f"    PDF: {p}")

    # DEFER-NOT-FAIL: if nothing usable was gathered anywhere (search, docs, and
    # Sunbiz all empty) we could not complete this community — defer it so it
    # returns later instead of being logged as researched-empty.
    if not evidence:
        log("  [defer] no usable evidence (search/docs/sunbiz all empty)")
        output_lines.append("  DEFERRED: no usable evidence gathered")
        return _deferred_result(cid, name)

    # 3 — Extract, cheapest-first so empty/irrelevant pages cost zero tokens:
    #   (a) direct-pattern (Sunbiz structured fields)  — no LLM, always
    #   (b) CSS-schema reuse for repeat-layout domains — no LLM when available
    #   (c) Claude (Haiku) over BM25/keyword-filtered evidence — only if there
    #       are field-relevant chunks; otherwise skipped entirely.
    direct_fields = direct_pattern_extract(evidence)

    css_fields: List[dict] = []
    if schema_store is not None:
        seen_domains = set()
        for wurl in [e.source_url for e in evidence if e.source_type == "website"]:
            d = domain_of(wurl)
            if not d or d in seen_domains:
                continue
            seen_domains.add(d)
            reused = schema_store.reuse(wurl)
            if reused:
                css_fields.extend(reused)
                notes.append(f"css-schema reuse: {d}")
            else:
                # Count the sighting; generate a reusable schema once it repeats.
                schema_store.note_domain(d)
                if schema_store.maybe_generate(wurl, name):
                    notes.append(f"css-schema generated: {d}")

    # Pre-filter: keep only field-relevant chunks (per-source + combined caps).
    filtered_ev, chars_before, chars_after = filter_evidence_for_extraction(evidence)

    # Spend gate: real page/PDF body about this community, or a concrete data
    # signal — otherwise skip Claude (thin snippet keywords are not enough).
    should_call, has_body, sigs = extraction_gate(name, filtered_ev)
    source_kind = "page/pdf" if has_body else ("snippets" if filtered_ev else "none")

    claude_fields: List[dict] = []
    ai_tokens, ai_called, ai_skipped = 0, False, False
    if should_call:
        log(f"  [ai] extracting [{source_kind}, signals="
            f"{','.join(sigs) or 'none'}] from {len(filtered_ev)} chunk(s) "
            f"({chars_after} chars, was {chars_before})…")
        claude_fields, ai_tokens, ai_called = ai_extract(name, city, filtered_ev, chains)
        log(f"  [ai] {'CALLED' if ai_called else 'cache-hit'} → {len(claude_fields)} "
            f"fields, ~{ai_tokens} input tokens")
    else:
        ai_skipped = True
        reason = ("only thin snippets, no data signal" if filtered_ev
                  else "no relevant chunks")
        log(f"  [ai] SKIPPED — {reason}; relying on Sunbiz/direct-pattern (0 tokens)")
        notes.append(f"claude skipped: {reason}")

    raw_fields: List[dict] = direct_fields + css_fields + claude_fields
    claude_state = ("CALLED" if ai_called else ("cache-hit" if not ai_skipped else "SKIPPED"))
    output_lines.append(
        f"  FILTER   chars {chars_before} -> {chars_after} | source={source_kind} | "
        f"signals={','.join(sigs) or 'none'} (caps {PER_SOURCE_CHAR_CAP}/src, {COMBINED_CHAR_CAP} comb.)")
    output_lines.append(
        f"  CLAUDE   {claude_state} | ~{ai_tokens} input tokens | "
        f"direct={len(direct_fields)} css={len(css_fields)} claude={len(claude_fields)}")

    # 4 — Stage: validate, dedupe, only-if-currently-null.
    pending_existing = existing_pending_fields(cid)
    fee_blocked = has_pending_fee(cid) or not all(
        is_empty(community.get(c)) for c in FEE_FIELDS
    )
    staged_this_run: set = set()

    counts_by_field: Dict[str, int] = {}
    counts_by_source: Dict[str, int] = {}
    pcd_inserted = 0
    fee_inserted = 0

    # Collect fee numbers separately so we emit ONE fee observation.
    fee_values: Dict[str, float] = {}
    fee_source_url = ""
    fee_source_type = ""

    for item in raw_fields:
        if not isinstance(item, dict):
            continue
        field = (item.get("field_name") or "").strip()
        if field not in ALLOWED_FIELDS:
            continue
        src_type = (item.get("source_type") or "").strip().lower()
        if src_type not in ALLOWED_SOURCE_TYPES:
            src_type = "search"
        src_url = (item.get("source_url") or "").strip()[:500]
        try:
            confidence = float(item.get("confidence", 0.7))
        except Exception:
            confidence = 0.7
        confidence = max(0.0, min(1.0, confidence))

        clean = validate_field(field, item.get("value"))
        if clean is None:
            output_lines.append(f"  DROP(invalid)  {field} = {item.get('value')!r}")
            continue

        # Only propose where the community's current value is null/empty.
        if not is_empty(community.get(field)):
            continue

        if field in FEE_FIELDS:
            if fee_blocked:
                continue
            fee_values[field] = float(clean)
            if not fee_source_url:
                fee_source_url, fee_source_type = src_url, src_type
            continue

        # Dedupe non-fee fields against pending/approved + this run.
        if field in pending_existing or field in staged_this_run:
            output_lines.append(f"  SKIP(dup)      {field}")
            continue

        row = {
            "community_id":    cid,
            "field_name":      field,
            "proposed_value":  clean,
            "source_url":      src_url,
            "source_type":     src_type,
            "confidence":      confidence,
            "auto_approvable": False,
            "status":          "pending",
        }
        result = supabase_post("pending_community_data", row, dry_run)
        ok = dry_run or "error" not in result
        status = "DRY_RUN" if dry_run else ("OK" if ok else f"ERR:{result.get('error','')}")
        output_lines.append(
            f"  PENDING   {field} = {clean[:60]!r}  [{src_type}]  [{status}]"
        )
        log(f"    PENDING {field} [{src_type}] {status}")
        if ok:
            staged_this_run.add(field)
            pcd_inserted += 1
            counts_by_field[field] = counts_by_field.get(field, 0) + 1
            counts_by_source[src_type] = counts_by_source.get(src_type, 0) + 1

    # Emit a single fee observation if any monthly fee numbers came back.
    if fee_values and not fee_blocked:
        vals = sorted(fee_values.values())
        fmin = fee_values.get("monthly_fee_min", vals[0])
        fmax = fee_values.get("monthly_fee_max", vals[-1])
        fmed = fee_values.get("monthly_fee_median", round((fmin + fmax) / 2, 2))
        amount = fmed
        fee_row = {
            "community_id":       cid,
            "fee_amount":         amount,
            "fee_rounded_min":    round_fee(fmin, "down"),
            "fee_rounded_max":    round_fee(fmax, "up"),
            "fee_rounded_median": round_fee(fmed),
            "source_url":         fee_source_url,
            "source_type":        fee_source_type or "search",
            "listing_date":       date.today().isoformat(),
            "status":             "pending",
        }
        result = supabase_post("pending_fee_observations", fee_row, dry_run)
        ok = dry_run or "error" not in result
        status = "DRY_RUN" if dry_run else ("OK" if ok else f"ERR:{result.get('error','')}")
        output_lines.append(
            f"  FEE OBS   ${amount} (rnd ${fee_row['fee_rounded_median']}) "
            f"[{fee_row['source_type']}]  [{status}]"
        )
        log(f"    FEE OBS ${amount} {status}")
        if ok:
            fee_inserted += 1
            counts_by_source[fee_row["source_type"]] = \
                counts_by_source.get(fee_row["source_type"], 0) + 1

    # Research log (audit trail) — also propose-only by nature.
    log_row = {
        "community_id":    cid,
        "researched_at":   datetime.utcnow().isoformat() + "Z",
        "fields_updated":  sorted(staged_this_run),
        "sources_checked": [ev.source_type for ev in evidence],
        "notes": (f"PDFs read: {len(pdfs_read)}; proposals: "
                  f"{pcd_inserted} field + {fee_inserted} fee; " + "; ".join(notes))[:1000],
    }
    supabase_post("community_research_log", log_row, dry_run)

    field_breakdown = ", ".join(f"{k}={v}" for k, v in sorted(counts_by_field.items())) or "none"
    staged_total = pcd_inserted + fee_inserted
    output_lines.append(
        f"  TOTALS: staged={staged_total} (pending_community_data={pcd_inserted} "
        f"fee_obs={fee_inserted}) | by field: {field_breakdown}"
    )
    log(f"  DONE: staged={staged_total} pcd={pcd_inserted} fee={fee_inserted} "
        f"pdfs={len(pdfs_read)} | filter {chars_before}->{chars_after} chars | "
        f"claude={claude_state} ~{ai_tokens} tok")

    # Running per-provider quota snapshot after this community.
    qsnap = fmt_quota(chains)
    output_lines.append(f"  QUOTA: {qsnap}")
    log(f"  QUOTA: {qsnap}")

    return {
        "community_id": cid,
        "name": name,
        "status": "done",
        "pcd_inserted": pcd_inserted,
        "fee_inserted": fee_inserted,
        "pdfs_read": len(pdfs_read),
        "counts_by_field": counts_by_field,
        "counts_by_source": counts_by_source,
        "chars_before": chars_before,
        "chars_after": chars_after,
        "ai_tokens": ai_tokens,
        "claude_state": claude_state,   # CALLED | cache-hit | SKIPPED
        "source_kind": source_kind,     # page/pdf | snippets | none
        "staged_total": staged_total,
    }


# ── Fetch communities ─────────────────────────────────────────────────────────

SELECT_COLS = ",".join(["id", "canonical_name", "slug", "city", "status"]
                       + sorted(ALLOWED_FIELDS))


def recently_enriched_ids(days: int) -> set:
    """community_ids this enricher already logged within `days` (so successive
    runs advance through the backlog instead of re-hitting the same rows).
    Scoped to THIS script's own log rows via the "PDFs read:" notes prefix, so
    a community another job touched is still eligible here."""
    if days <= 0:
        return set()
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat() + "Z"
    rows = supabase_get("community_research_log", {
        "researched_at": f"gte.{cutoff}",
        "notes": "like.PDFs read*",
        "select": "community_id",
        "limit": "50000",
    })
    if not isinstance(rows, list):
        return set()
    return {r.get("community_id") for r in rows if r.get("community_id")}


def fetch_communities(community_id: Optional[str], batch: int, status: str,
                      require_website: bool, without_website: bool = False,
                      skip_researched_days: int = 14) -> List[dict]:
    if community_id:
        data = supabase_get("communities", {
            "id": f"eq.{community_id}", "limit": "1", "select": SELECT_COLS})
        return data if isinstance(data, list) else []

    # Pull a generous pool ordered oldest-touched-first, then in Python prefer
    # communities this enricher hasn't already worked recently.
    params = {
        "status": f"eq.{status}",
        "management_company": "is.null",
        "order": "updated_at.asc",
        "limit": str(max(batch * 8, 60)),
        "select": SELECT_COLS,
    }
    # A stored website is NOT required. require_website keeps the old opt-in
    # behaviour; without_website targets rows that have no stored site (used to
    # prove search-derived enrichment works without one).
    if require_website:
        params["website_url"] = "not.is.null"
    elif without_website:
        params["website_url"] = "is.null"
    data = supabase_get("communities", params)
    if not isinstance(data, list):
        log(f"Error fetching communities: {data}")
        return []
    pool = [
        c for c in data
        if "*" not in c.get("canonical_name", "")
        and c.get("canonical_name", "").strip()
        and (not require_website or (c.get("website_url") or "").strip())
    ]

    recent = recently_enriched_ids(skip_researched_days)
    fresh = [c for c in pool if c.get("id") not in recent]
    stale = [c for c in pool if c.get("id") in recent]
    if recent:
        log(f"Selection: {len(pool)} in pool, {len(pool) - len(fresh)} already "
            f"enriched in last {skip_researched_days}d → preferring {len(fresh)} fresh")
    # Prefer fresh; backfill with recently-seen only if we'd otherwise be short.
    return (fresh + stale)[:batch]


# ── Continuous loop service (checkpointed, defer-not-fail) ────────────────────

CHECKPOINT_PATH = os.path.join(STATE_DIR, "loop_checkpoint.json")


def load_checkpoint() -> dict:
    try:
        with open(CHECKPOINT_PATH) as fh:
            cp = json.load(fh)
    except Exception:
        cp = {}
    cp.setdefault("started_at", datetime.utcnow().isoformat() + "Z")
    for k in ("processed", "deferred", "staged_pcd", "staged_fee", "tokens",
              "iterations"):
        cp.setdefault(k, 0)
    cp.setdefault("deferred_backoff", {})   # community_id -> epoch until eligible
    cp.setdefault("last_community_id", None)
    cp.setdefault("last_community_name", None)
    return cp


def save_checkpoint(cp: dict) -> None:
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        tmp = CHECKPOINT_PATH + ".tmp"
        with open(tmp, "w") as fh:
            json.dump(cp, fh, indent=2)
        os.replace(tmp, CHECKPOINT_PATH)
    except Exception as e:
        log(f"  [checkpoint] save failed: {e}")


def enrich_loop(args, dry_run: bool, chains: Chains,
                schema_store: "DomainSchemaStore") -> None:
    """Process communities one at a time, continuously. Picks a working set
    (one bounded Sunbiz scan per set), runs the full gated chain per community,
    checkpoints after each, sleeps, and recycles. Defer-not-fail: communities
    that can't be completed are backed off, not logged researched-empty."""
    sleep_secs = int(os.environ.get("LOOP_SLEEP_SECS", "5"))
    idle_secs  = int(os.environ.get("LOOP_IDLE_SECS", "300"))
    work_batch = int(os.environ.get("LOOP_BATCH", "25"))
    backoff_secs = int(os.environ.get("LOOP_DEFER_BACKOFF_SECS", str(6 * 3600)))
    loop_max   = args.loop_max
    require_website = args.require_website.lower() in {"true", "1", "yes"}
    without_website = args.without_website.lower() in {"true", "1", "yes"}

    cp = load_checkpoint()
    log(f"LOOP START | sleep={sleep_secs}s idle={idle_secs}s work_batch={work_batch} "
        f"defer_backoff={backoff_secs}s skip_days={args.skip_researched_days} "
        f"dry_run={dry_run} loop_max={loop_max or '∞'}")
    log(f"Resuming checkpoint: processed={cp['processed']} deferred={cp['deferred']} "
        f"staged_pcd={cp['staged_pcd']} staged_fee={cp['staged_fee']} "
        f"tokens={cp['tokens']} iterations={cp['iterations']}")

    processed_this_run = 0
    while True:
        now = time.time()
        # Drop expired backoffs so deferred communities become eligible again.
        cp["deferred_backoff"] = {k: v for k, v in cp["deferred_backoff"].items()
                                  if v > now}
        working = fetch_communities(None, work_batch, args.status,
                                    require_website, without_website,
                                    args.skip_researched_days)
        working = [c for c in working if c.get("id") not in cp["deferred_backoff"]]
        if not working:
            log(f"[idle] no due communities (or all backed off); sleeping {idle_secs}s")
            time.sleep(idle_secs)
            continue

        # One bounded Sunbiz corpus pass for the whole working set (not per row).
        sunbiz_map = sunbiz_prescan(working)

        for community in working:
            cid  = community.get("id")
            name = community.get("canonical_name", "?")
            out_lines: List[str] = []
            try:
                res = enrich_community(community, dry_run, out_lines, chains,
                                       sunbiz_ev=sunbiz_map.get(cid),
                                       schema_store=schema_store)
            except Exception as e:
                # Defer-not-fail: no research_log was written, so it returns later.
                log(f"[defer] {name[:40]} — exception: {e}")
                cp["deferred"] += 1
                cp["deferred_backoff"][cid] = time.time() + backoff_secs
                cp["iterations"] += 1
                cp["last_community_id"], cp["last_community_name"] = cid, name
                cp["last_finished_at"] = datetime.utcnow().isoformat() + "Z"
                save_checkpoint(cp)
                processed_this_run += 1
                if loop_max and processed_this_run >= loop_max:
                    log("LOOP reached loop_max; exiting.")
                    return
                time.sleep(sleep_secs)
                continue

            for ln in out_lines:
                print(ln, flush=True)

            if res.get("status") == "deferred":
                cp["deferred"] += 1
                cp["deferred_backoff"][cid] = time.time() + backoff_secs
                log(f"[defer] {name[:40]} — backing off {backoff_secs}s")
            else:
                cp["processed"] += 1
                cp["staged_pcd"] += res.get("pcd_inserted", 0)
                cp["staged_fee"] += res.get("fee_inserted", 0)
                cp["tokens"]     += res.get("ai_tokens", 0)
                log(f"[done] {name[:40]} | staged={res.get('staged_total', 0)} "
                    f"(pcd={res.get('pcd_inserted',0)} fee={res.get('fee_inserted',0)}) "
                    f"| claude={res.get('claude_state')} ~{res.get('ai_tokens',0)}t "
                    f"src={res.get('source_kind')}")
            cp["iterations"] += 1
            cp["last_community_id"], cp["last_community_name"] = cid, name
            cp["last_finished_at"] = datetime.utcnow().isoformat() + "Z"
            save_checkpoint(cp)
            processed_this_run += 1

            if loop_max and processed_this_run >= loop_max:
                log(f"LOOP reached loop_max={loop_max}; exiting. Totals: "
                    f"processed={cp['processed']} deferred={cp['deferred']} "
                    f"staged_pcd={cp['staged_pcd']} staged_fee={cp['staged_fee']} "
                    f"tokens={cp['tokens']}")
                return
            time.sleep(sleep_secs)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="HOA propose-only deep enricher")
    parser.add_argument("--community-id", help="UUID of specific community")
    parser.add_argument("--batch", type=int, default=10, help="Number of communities")
    parser.add_argument("--status", default="published", help="Community status filter")
    parser.add_argument("--require-website", default="false",
                        help="true/false — only pick communities with website_url set")
    parser.add_argument("--without-website", default="false",
                        help="true/false — only pick communities with NO website_url "
                             "(proves search-derived enrichment)")
    parser.add_argument("--skip-researched-days", type=int, default=14,
                        help="Skip communities this enricher logged within N days "
                             "(0 disables; default 14) so runs advance the backlog")
    parser.add_argument("--dry-run", default="true", help="true/false (default: true)")
    parser.add_argument("--output-dir", default="scripts/output", help="Output directory")
    parser.add_argument("--loop", action="store_true",
                        help="Run continuously as a service: one community at a "
                             "time, checkpointed, defer-not-fail. Pacing via env "
                             "LOOP_SLEEP_SECS / LOOP_IDLE_SECS / LOOP_BATCH.")
    parser.add_argument("--loop-max", type=int, default=0,
                        help="Stop after N communities in loop mode (0 = forever; "
                             "use a small N to smoke-test the loop)")
    args = parser.parse_args()

    dry_run = args.dry_run.lower() not in {"false", "0", "no"}
    require_website = args.require_website.lower() in {"true", "1", "yes"}
    without_website = args.without_website.lower() in {"true", "1", "yes"}
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    log_file = output_dir / f"enrich-log-{date.today().isoformat()}.txt"

    log("HOA Propose-Only Deep Enricher")
    log(f"Mode: {'DRY RUN' if dry_run else 'LIVE'} | Batch: {args.batch} | "
        f"Status: {args.status} | require_website={require_website} | "
        f"without_website={without_website} | skip_researched_days={args.skip_researched_days}")
    log(f"AI: claude CLI model={AI_MODEL} "
        f"({'auth ok' if AI_HAS_AUTH else 'NO OAUTH TOKEN — extraction will fail'})")
    log(f"LaCie: {'mounted' if os.path.isdir(LACIE_PATH) else 'NOT MOUNTED'}")
    log(f"Output: {log_file}")

    # Build the provider chains once (search + document fetch, with persisted
    # per-provider quota) and warm up pdfplumber so the fetch chain can extract
    # PDF text. The chain only imports pdfplumber — this installs it if missing.
    chains = build_chains()
    ensure_pdfplumber()
    log(f"Search providers present (in order): {chains.present_search_names()}")
    log(f"Quota at start: {fmt_quota(chains)}")
    log(f"State dir: {STATE_DIR}")

    # Per-domain JSON-CSS schema store (reuse + one-time generation).
    schema_store = DomainSchemaStore(chains)

    # Continuous service mode: never returns (until --loop-max), checkpointed.
    if args.loop:
        enrich_loop(args, dry_run, chains, schema_store)
        return

    communities = fetch_communities(args.community_id, args.batch, args.status,
                                     require_website, without_website,
                                     args.skip_researched_days)
    if not communities:
        log("No communities found to enrich. Check Supabase connection / filters.")
        sys.exit(1)
    log(f"\nFetched {len(communities)} communities to enrich")

    out: List[str] = [
        f"HOA Deep Enrich Run — {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        f"Mode: {'DRY RUN' if dry_run else 'LIVE'} | require_website={require_website}",
        f"Communities: {len(communities)}",
        "=" * 60,
    ]

    grand_field: Dict[str, int] = {}
    grand_source: Dict[str, int] = {}
    total_pcd = total_fee = total_pdfs = 0
    done = deferred = 0
    total_tokens = total_before = total_after = 0
    claude_calls = claude_cache = claude_skips = 0
    per_community: List[dict] = []

    # One batch-wide pass over the 17GB cordata corpus (instead of per community).
    sunbiz_map = sunbiz_prescan(communities)

    for community in communities:
        try:
            res = enrich_community(community, dry_run, out, chains,
                                   sunbiz_ev=sunbiz_map.get(community["id"]),
                                   schema_store=schema_store)
        except Exception as e:
            log(f"  ERROR enriching {community.get('canonical_name')}: {e}")
            out.append(f"  ERROR: {community.get('canonical_name')}: {e}")
            continue
        if res.get("status") == "deferred":
            deferred += 1
            # Search providers are exhausted for the rest of the window; the
            # remaining communities would all defer too — stop the run.
            log("  [defer] stopping run — every remaining community would defer")
            break
        done += 1
        total_pcd  += res["pcd_inserted"]
        total_fee  += res["fee_inserted"]
        total_pdfs += res["pdfs_read"]
        total_tokens += res.get("ai_tokens", 0)
        total_before += res.get("chars_before", 0)
        total_after  += res.get("chars_after", 0)
        st = res.get("claude_state")
        claude_calls  += 1 if st == "CALLED" else 0
        claude_cache  += 1 if st == "cache-hit" else 0
        claude_skips  += 1 if st == "SKIPPED" else 0
        per_community.append(res)
        for k, v in res["counts_by_field"].items():
            grand_field[k] = grand_field.get(k, 0) + v
        for k, v in res["counts_by_source"].items():
            grand_source[k] = grand_source.get(k, 0) + v

    # Per-community summary the user asked for: chars before/after, Claude
    # called/skipped, fields staged.
    out.append("\n" + "=" * 60)
    out.append("PER-COMMUNITY (source | chars before→after | claude | staged)")
    for r in per_community:
        out.append(
            f"  {r['name'][:30]:30} | {r.get('source_kind','?'):<8} | "
            f"{r['chars_before']:>6} -> {r['chars_after']:>5} | "
            f"{r['claude_state']:<9} ~{r['ai_tokens']:>4}t | staged={r['staged_total']}")

    out.append("\n" + "=" * 60)
    out.append("GRAND TOTALS")
    out.append(f"  Communities done          : {done}")
    out.append(f"  Communities deferred      : {deferred}")
    out.append(f"  PDFs read                 : {total_pdfs}")
    out.append(f"  pending_community_data rows: {total_pcd}")
    out.append(f"  pending_fee_observations  : {total_fee}")
    out.append(f"  By field : " + (", ".join(f"{k}={v}" for k, v in sorted(grand_field.items())) or "none"))
    out.append(f"  By source: " + (", ".join(f"{k}={v}" for k, v in sorted(grand_source.items())) or "none"))
    out.append("  " + "-" * 56)
    out.append(f"  Extraction model          : claude {AI_MODEL}")
    out.append(f"  Text chars  before filter : {total_before}")
    out.append(f"  Text chars  after  filter : {total_after}"
               + (f"  ({100*total_after//total_before}% kept)" if total_before else ""))
    out.append(f"  Claude calls / cache / skip: {claude_calls} / {claude_cache} / {claude_skips}")
    out.append(f"  EST. CLAUDE INPUT TOKENS   : {total_tokens}  "
               f"(~{CHARS_PER_TOKEN} chars/token, billed calls only)")
    out.append(f"  Final quota: {fmt_quota(chains)}")
    out.append("=" * 60)

    with open(log_file, "w") as fh:
        fh.write("\n".join(out))
    log(f"\nLog saved to: {log_file}")
    print("\n".join(out[-(len(per_community) + 18):]))
    log("Done.")


if __name__ == "__main__":
    main()
