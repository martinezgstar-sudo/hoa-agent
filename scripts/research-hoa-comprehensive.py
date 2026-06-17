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
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ── Constants ─────────────────────────────────────────────────────────────────

LACIE_PATH     = "/Volumes/LaCie/FL-Palm Beach County Data "
CORDATA_DIR    = LACIE_PATH + "/cordata_extracted"

SUPABASE_URL   = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_ANON  = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
SUPABASE_SVC   = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# AI extraction runs through the local `claude` CLI on the Claude subscription
# (CLAUDE_CODE_OAUTH_TOKEN), NOT the paid Anthropic API — matching the rest of
# this machine's cron infra (run.sh), which deliberately never bills the API.
AI_MODEL    = os.environ.get("AI_MODEL", "sonnet")
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
MAX_PDF_BYTES          = 10 * 1024 * 1024  # 10MB
PDF_CHAR_CAP           = 8000
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
    """One labelled chunk of text the AI is allowed to cite."""

    def __init__(self, source_type: str, source_url: str, text: str):
        self.source_type = source_type
        self.source_url  = source_url
        self.text        = text


# ── TIER: DuckDuckGo search ───────────────────────────────────────────────────

def ddg_search(query: str, max_results: int = 6) -> List[Tuple[str, str, str]]:
    """DuckDuckGo HTML scrape. Returns list of (url, title, snippet)."""
    q = urllib.parse.quote_plus(query)
    html = fetch(f"https://html.duckduckgo.com/html/?q={q}")
    if html.startswith("ERROR") or not html:
        return []
    results = []
    for href, title in re.findall(
        r'<a\s+class="result__a"\s+href="(/l/\?[^"]+)"[^>]*>(.*?)</a>',
        html, re.DOTALL
    )[:max_results]:
        real = re.search(r"uddg=(https?[^&]+)", href)
        url = urllib.parse.unquote(real.group(1)) if real else ""
        title_clean = re.sub(r"<[^>]+>", "", title).strip()
        snip_match = re.search(
            r'class="result__snippet"[^>]*>(.*?)</a>',
            html[html.find(href): html.find(href) + 3000], re.DOTALL
        )
        snip = re.sub(r"<[^>]+>", "", snip_match.group(1)).strip() if snip_match else ""
        if url:
            results.append((url, title_clean, snip))
    return results


def gather_search(name: str, city: str) -> Tuple[List[Evidence], List[Tuple[str, str, str]]]:
    """Run the search queries; return (evidence chunks, raw results for URL building)."""
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
    for q in queries:
        results = ddg_search(q, max_results=6)
        if not results:
            time.sleep(0.5)
            continue
        blob_parts = []
        for url, title, snippet in results:
            blob_parts.append(f"{title} — {snippet} ({url})")
            if url not in seen_urls:
                seen_urls.add(url)
                all_results.append((url, title, snippet))
        evidence.append(Evidence("search", f"ddg:{q}", " | ".join(blob_parts)[:4000]))
        time.sleep(0.7)
    return evidence, all_results


# ── TIER: local Sunbiz ────────────────────────────────────────────────────────
# The cordata corpus is ~17GB (10 × 1.7GB files) on a slow LaCie USB drive.
# Scanning it once PER COMMUNITY took ~210s each. Instead we scan it ONCE PER
# RUN for the whole batch: seed a single ripgrep/grep pass with every
# community's rarest name word, stream the matches, and stop as soon as every
# community has a hit. One bounded pass regardless of batch size.

# OFF by default: a full pass over the 17GB corpus on the LaCie USB drive costs
# minutes and can't fit a per-run budget alongside web+doc+AI work. Entity data
# still arrives via the Sunbiz *website* (search tier) + AI. Set SUNBIZ_LOCAL=1
# to opt in to the bounded one-pass local scan when the drive is mounted.
SUNBIZ_LOCAL    = os.environ.get("SUNBIZ_LOCAL", "0").lower() in {"1", "true", "yes"}
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
        return Evidence("sunbiz", f"local://LaCie/cordata#{doc_num}", text)
    except Exception:
        return None


def sunbiz_prescan(communities: List[dict]) -> Dict[str, Evidence]:
    """Single batch-wide pass over the cordata corpus. Returns
    {community_id -> Evidence} for every community that matched."""
    out: Dict[str, Evidence] = {}
    if not SUNBIZ_LOCAL or not os.path.isdir(CORDATA_DIR):
        return out
    files = [os.path.join(CORDATA_DIR, fn) for fn in sorted(os.listdir(CORDATA_DIR))
             if fn.endswith(".txt")]
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


def build_candidate_urls(website_url: Optional[str],
                         search_results: List[Tuple[str, str, str]]) -> List[str]:
    """Candidate pages to scan for document links: the community's own website
    plus the official / management-company domains found in the top results."""
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

    if website_url:
        add(website_url.strip())
    for url, _title, _snip in search_results:
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


def download_pdf(url: str, dest_dir: str, timeout: int = 15) -> Optional[str]:
    """Stream a PDF to disk. Skip >10MB, non-200, or HTML login pages."""
    try:
        req = urllib.request.Request(url, headers=HTTP_HEADERS)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            if getattr(r, "status", 200) != 200:
                return None
            ctype = (r.headers.get("Content-Type") or "").lower()
            if "html" in ctype:
                return None  # login / interstitial page, not a real PDF
            first = r.read(5)
            if not first.startswith(b"%PDF"):
                return None  # not actually a PDF
            data = bytearray(first)
            while True:
                chunk = r.read(65536)
                if not chunk:
                    break
                data.extend(chunk)
                if len(data) > MAX_PDF_BYTES:
                    return None  # too big — skip
            fname = re.sub(r"[^A-Za-z0-9._-]", "_", url.split("/")[-1] or "doc")[:80]
            if not fname.lower().endswith(".pdf"):
                fname += ".pdf"
            path = os.path.join(dest_dir, fname)
            with open(path, "wb") as fh:
                fh.write(data)
            return path
    except Exception:
        return None


def extract_pdf_text(path: str) -> str:
    """Extract up to PDF_CHAR_CAP chars of text from a PDF via pdfplumber."""
    pdfplumber = ensure_pdfplumber()
    if not pdfplumber:
        return ""
    out = []
    total = 0
    try:
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                txt = page.extract_text() or ""
                if not txt:
                    continue
                out.append(txt)
                total += len(txt)
                if total >= PDF_CHAR_CAP:
                    break
    except Exception:
        return ""
    return re.sub(r"\s+", " ", " ".join(out)).strip()[:PDF_CHAR_CAP]


def read_documents(name: str, website_url: Optional[str],
                   search_results: List[Tuple[str, str, str]],
                   notes: List[str]) -> Tuple[List[Evidence], List[str]]:
    """Fetch candidate pages, follow document links, download + read PDFs.

    Bounded by DOC_FETCH_BUDGET_SECS so one slow site cannot stall the run.
    Returns (evidence chunks, list of PDF URLs actually read).
    """
    deadline = time.monotonic() + DOC_FETCH_BUDGET_SECS
    evidence: List[Evidence] = []
    pdfs_read: List[str] = []
    combined_pdf_chars = 0
    tmp_dir = tempfile.mkdtemp(prefix="hoa_pdf_")

    candidates = build_candidate_urls(website_url, search_results)
    notes.append(f"doc candidates: {len(candidates)}")
    own_domain = domain_of(website_url) if website_url else ""
    name_token = (name.split()[0].upper() if name.split() else "")

    doc_links: List[str] = []
    for url in candidates:
        if time.monotonic() > deadline:
            notes.append("doc budget hit (page scan)")
            break
        html = fetch(url, timeout=15)
        if html.startswith("ERROR") or not html:
            continue
        # Keep the page as website evidence. The community's OWN website is
        # always kept; third-party search-result pages are kept only when the
        # community name appears (avoids unrelated-page noise).
        page_text = text_from_html(html)
        is_own = bool(own_domain) and own_domain in domain_of(url)
        if is_own or (len(name_token) > 2 and name_token in page_text.upper()):
            evidence.append(Evidence("website", url, page_text[:PAGE_TEXT_CHAR_CAP]))
        for link in find_document_links(html, url):
            if link not in doc_links:
                doc_links.append(link)

    # Download + read up to MAX_PDFS_PER_COMMUNITY PDFs.
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
        path = download_pdf(link, tmp_dir)
        if not path:
            continue
        text = extract_pdf_text(path)
        try:
            os.remove(path)
        except Exception:
            pass
        if not text:
            continue
        remaining = PDF_COMBINED_CHAR_CAP - combined_pdf_chars
        text = text[:remaining]
        combined_pdf_chars += len(text)
        pdfs_read.append(link)
        evidence.append(Evidence("pdf", link, text))

    try:
        os.rmdir(tmp_dir)
    except Exception:
        pass
    return evidence, pdfs_read


# ── AI EXTRACTION ─────────────────────────────────────────────────────────────

EXTRACT_SYSTEM = (
    "You are a precise data-extraction engine for a Florida HOA database. "
    "Extract ONLY facts explicitly stated in the supplied evidence. Never "
    "infer, guess, or use outside knowledge. Every value you return MUST be "
    "directly supported by one evidence chunk, and you MUST cite that chunk's "
    "exact source_url and source_type. Convert any annual/yearly fee or dues "
    "figure to a MONTHLY amount (divide by 12) before returning it. "
    "Respond with strict JSON only — no prose, no code fences."
)


def ai_extract(name: str, city: str, evidence: List[Evidence]) -> List[dict]:
    """Extract real fields with citations via the `claude` CLI (subscription).
    Returns list of {field_name, value, source_url, source_type, confidence,
    evidence}."""
    if not evidence:
        return []

    chunks = []
    budget = 60000  # cap total evidence chars sent
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
        return []
    if proc.returncode != 0:
        log(f"  [ai] claude CLI exit {proc.returncode}: {(proc.stderr or '')[:160]}")
        return []
    text = (proc.stdout or "").strip()
    # Strip code fences if present, then grab the outermost JSON object.
    text = text.strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return []
    try:
        parsed = json.loads(m.group(0))
    except Exception:
        return []
    fields = parsed.get("fields", [])
    return fields if isinstance(fields, list) else []


# ── VALIDATION ────────────────────────────────────────────────────────────────

def validate_field(field: str, raw_value: Any) -> Optional[str]:
    """Validate + normalize one proposed value. Returns a clean string, or
    None if it fails validation (caller drops it)."""
    if raw_value is None:
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


def enrich_community(community: dict, dry_run: bool, output_lines: List[str],
                     sunbiz_ev: Optional[Evidence] = None) -> dict:
    name = community.get("canonical_name", "Unknown")
    cid  = community.get("id", "")
    city = community.get("city", "") or ""
    website = community.get("website_url")

    log(f"\n{'─'*60}")
    log(f"Enriching: {name} [{cid[:8]}…]")
    log(f"{'─'*60}")
    output_lines.append(f"\n=== {name} ({cid}) ===")

    notes: List[str] = []
    evidence: List[Evidence] = []

    # 1 — Gather as today: search, Sunbiz, DBPR.
    log("  [gather] DuckDuckGo search…")
    search_ev, search_results = gather_search(name, city)
    evidence.extend(search_ev)

    if sunbiz_ev:
        evidence.append(sunbiz_ev)
        notes.append("sunbiz: hit")

    log("  [gather] DBPR (Playwright)…")
    dbpr = gather_dbpr(name, city)
    if dbpr:
        evidence.append(dbpr)
        notes.append("dbpr: hit")

    # 2 — Document reading (60s budget).
    log("  [docs] reading documents…")
    doc_ev, pdfs_read = read_documents(name, website, search_results, notes)
    evidence.extend(doc_ev)
    log(f"  [docs] PDFs read: {len(pdfs_read)}")
    for p in pdfs_read:
        output_lines.append(f"  PDF READ   {p}")
        log(f"    PDF: {p}")

    # 3 — AI extraction over all evidence.
    log(f"  [ai] extracting from {len(evidence)} evidence chunks…")
    raw_fields = ai_extract(name, city, evidence)
    log(f"  [ai] returned {len(raw_fields)} candidate fields")

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
    output_lines.append(
        f"  TOTALS: pending_community_data={pcd_inserted} "
        f"fee_obs={fee_inserted} | by field: {field_breakdown}"
    )
    log(f"  DONE: pcd={pcd_inserted} fee={fee_inserted} pdfs={len(pdfs_read)}")

    return {
        "community_id": cid,
        "name": name,
        "pcd_inserted": pcd_inserted,
        "fee_inserted": fee_inserted,
        "pdfs_read": len(pdfs_read),
        "counts_by_field": counts_by_field,
        "counts_by_source": counts_by_source,
    }


# ── Fetch communities ─────────────────────────────────────────────────────────

SELECT_COLS = ",".join(["id", "canonical_name", "slug", "city", "status"]
                       + sorted(ALLOWED_FIELDS))


def fetch_communities(community_id: Optional[str], batch: int, status: str,
                      require_website: bool) -> List[dict]:
    if community_id:
        data = supabase_get("communities", {
            "id": f"eq.{community_id}", "limit": "1", "select": SELECT_COLS})
        return data if isinstance(data, list) else []

    params = {
        "status": f"eq.{status}",
        "management_company": "is.null",
        "order": "updated_at.asc",
        "limit": str(batch * 4),
        "select": SELECT_COLS,
    }
    if require_website:
        params["website_url"] = "not.is.null"
    data = supabase_get("communities", params)
    if not isinstance(data, list):
        log(f"Error fetching communities: {data}")
        return []
    clean = [
        c for c in data
        if "*" not in c.get("canonical_name", "")
        and c.get("canonical_name", "").strip()
        and (not require_website or (c.get("website_url") or "").strip())
    ]
    return clean[:batch]


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="HOA propose-only deep enricher")
    parser.add_argument("--community-id", help="UUID of specific community")
    parser.add_argument("--batch", type=int, default=10, help="Number of communities")
    parser.add_argument("--status", default="published", help="Community status filter")
    parser.add_argument("--require-website", default="false",
                        help="true/false — only pick communities with website_url set")
    parser.add_argument("--dry-run", default="true", help="true/false (default: true)")
    parser.add_argument("--output-dir", default="scripts/output", help="Output directory")
    args = parser.parse_args()

    dry_run = args.dry_run.lower() not in {"false", "0", "no"}
    require_website = args.require_website.lower() in {"true", "1", "yes"}
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    log_file = output_dir / f"enrich-log-{date.today().isoformat()}.txt"

    log("HOA Propose-Only Deep Enricher")
    log(f"Mode: {'DRY RUN' if dry_run else 'LIVE'} | Batch: {args.batch} | "
        f"Status: {args.status} | require_website={require_website}")
    log(f"AI: claude CLI model={AI_MODEL} "
        f"({'auth ok' if AI_HAS_AUTH else 'NO OAUTH TOKEN — extraction will fail'})")
    log(f"LaCie: {'mounted' if os.path.isdir(LACIE_PATH) else 'NOT MOUNTED'}")
    log(f"Output: {log_file}")

    communities = fetch_communities(args.community_id, args.batch, args.status, require_website)
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

    # One batch-wide pass over the 17GB cordata corpus (instead of per community).
    sunbiz_map = sunbiz_prescan(communities)

    for community in communities:
        try:
            res = enrich_community(community, dry_run, out,
                                   sunbiz_ev=sunbiz_map.get(community["id"]))
        except Exception as e:
            log(f"  ERROR enriching {community.get('canonical_name')}: {e}")
            out.append(f"  ERROR: {community.get('canonical_name')}: {e}")
            continue
        total_pcd  += res["pcd_inserted"]
        total_fee  += res["fee_inserted"]
        total_pdfs += res["pdfs_read"]
        for k, v in res["counts_by_field"].items():
            grand_field[k] = grand_field.get(k, 0) + v
        for k, v in res["counts_by_source"].items():
            grand_source[k] = grand_source.get(k, 0) + v

    out.append("\n" + "=" * 60)
    out.append("GRAND TOTALS")
    out.append(f"  Communities enriched      : {len(communities)}")
    out.append(f"  PDFs read                 : {total_pdfs}")
    out.append(f"  pending_community_data rows: {total_pcd}")
    out.append(f"  pending_fee_observations  : {total_fee}")
    out.append(f"  By field : " + (", ".join(f"{k}={v}" for k, v in sorted(grand_field.items())) or "none"))
    out.append(f"  By source: " + (", ".join(f"{k}={v}" for k, v in sorted(grand_source.items())) or "none"))
    out.append("=" * 60)

    with open(log_file, "w") as fh:
        fh.write("\n".join(out))
    log(f"\nLog saved to: {log_file}")
    print("\n".join(out[-12:]))
    log("Done.")


if __name__ == "__main__":
    main()
