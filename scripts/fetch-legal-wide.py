#!/usr/bin/env python3
"""
fetch-legal-wide.py

Cast a wide net for HOA / condo litigation in Palm Beach County beyond
CourtListener. Pulls from Google Scholar, Justia, DDG, and (best-effort)
Florida court portals via Playwright.

OUTPUT FILES ONLY — does NOT write to Supabase.
The user reviews scripts/output/wide-legal-approved-<date>.json before
any data is added to community_legal_cases.

Usage:
  python3 scripts/fetch-legal-wide.py
  python3 scripts/fetch-legal-wide.py --no-ai             (skip Claude scoring)
  python3 scripts/fetch-legal-wide.py --skip-playwright   (skip court portals)
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime
from pathlib import Path
from typing import Any, Optional

try:
    import anthropic
    HAVE_ANTHROPIC = True
except ImportError:
    HAVE_ANTHROPIC = False

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

DDG_QUERIES = [
    '"Palm Beach County" HOA lawsuit court case 2024 OR 2025 OR 2026',
    '"Palm Beach" condominium association litigation ruling',
    '"Palm Beach" HOA fraud criminal charges',
    '"Palm Beach County" community association judgment',
    '"Palm Beach" HOA special assessment lawsuit filed',
    '"Palm Beach" condo association board recall court',
    '"Palm Beach" HOA lien foreclosure judgment 2025',
    '"Palm Beach" HOA embezzlement charges Florida',
    '"Palm Beach" condo association bulk buyer lawsuit',
    '"Palm Beach" HOA discrimination complaint Florida',
]

GOOGLE_SCHOLAR_QUERIES = [
    'homeowners+association+%22Palm+Beach%22',
    '%22condominium+association%22+%22Palm+Beach%22',
    '%22HOA%22+fraud+%22Palm+Beach%22+Florida',
    '%22community+association%22+%22Palm+Beach%22+board',
]

JUSTIA_QUERIES = [
    'homeowners+association+palm+beach',
    'condominium+association+palm+beach',
    'HOA+special+assessment+palm+beach',
]

# Case-number patterns we look for in scraped text
CASE_NUMBER_RE = re.compile(
    r"(?:case\s*(?:no\.?|number|#)?\s*[:\-]?\s*)?"
    r"(\d{2,4}[-\s]?(?:CA|cv|CV|ca|civ|CIV)[-\s]?\d{3,8}(?:[-\s]?[A-Z]{1,3})?)",
    re.IGNORECASE,
)

# ── Helpers ───────────────────────────────────────────────────────────────────

def log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def fetch(url: str, timeout: int = 12, headers: Optional[dict] = None) -> str:
    h = {"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"}
    if headers:
        h.update(headers)
    try:
        req = urllib.request.Request(url, headers=h)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", errors="ignore")
    except Exception as e:
        return f"ERROR:{e}"


def text_only(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).strip()


def domain_of(url: str) -> str:
    try:
        return urllib.parse.urlparse(url).netloc.replace("www.", "")
    except Exception:
        return ""


def ddg_search(query: str, max_results: int = 8) -> list[dict]:
    q = urllib.parse.quote_plus(query)
    html = fetch(f"https://html.duckduckgo.com/html/?q={q}")
    if html.startswith("ERROR"):
        return []
    out = []
    link_re = re.compile(r'<a\s+class="result__a"\s+href="(/l/\?[^"]+)"[^>]*>([\s\S]*?)</a>')
    for href, title in link_re.findall(html)[:max_results]:
        m = re.search(r"uddg=(https?[^&]+)", href)
        real = urllib.parse.unquote(m.group(1)) if m else ""
        title_clean = re.sub(r"<[^>]+>", "", title).strip()
        idx = html.find(href)
        snip_m = re.search(r'class="result__snippet"[^>]*>([\s\S]*?)</a>', html[idx:idx + 3000])
        snippet = re.sub(r"<[^>]+>", "", snip_m.group(1)).strip() if snip_m else ""
        if real:
            # extract case number if present
            blob = f"{title_clean} {snippet}"
            m_case = CASE_NUMBER_RE.search(blob)
            out.append({
                "title": title_clean,
                "url": real,
                "summary": snippet,
                "source": "duckduckgo",
                "feed": domain_of(real),
                "case_number": m_case.group(1) if m_case else None,
            })
    return out


# ── Source 2: Google Scholar (FL state courts) ────────────────────────────────

def fetch_google_scholar(query_encoded: str) -> list[dict]:
    """as_sdt=4,10 narrows to Florida state courts; as_ylo=2020 limits date."""
    url = (
        "https://scholar.google.com/scholar?"
        f"q={query_encoded}&as_sdt=4,10&as_ylo=2020"
    )
    html = fetch(url, timeout=15)
    if html.startswith("ERROR"):
        log(f"  Google Scholar error: {html[:80]}")
        return []
    out = []
    # Each result is in <div class="gs_r gs_or gs_scl"> with a link inside h3
    block_re = re.compile(r'<div class="gs_r[^"]*"[^>]*>([\s\S]*?)</div>\s*</div>', re.IGNORECASE)
    title_re = re.compile(r'<h3[^>]*class="gs_rt"[^>]*>(?:<a[^>]*href="([^"]+)"[^>]*>)?(.*?)</h3>', re.DOTALL)
    snip_re = re.compile(r'<div class="gs_rs"[^>]*>([\s\S]*?)</div>', re.IGNORECASE)
    citation_re = re.compile(r'<div class="gs_a"[^>]*>([\s\S]*?)</div>', re.IGNORECASE)
    for block in block_re.findall(html)[:20]:
        tm = title_re.search(block)
        if not tm:
            continue
        link = tm.group(1) or ""
        title = re.sub(r"<[^>]+>", "", tm.group(2)).strip()
        snip = snip_re.search(block)
        cit = citation_re.search(block)
        snippet = re.sub(r"<[^>]+>", "", snip.group(1)).strip() if snip else ""
        citation = re.sub(r"<[^>]+>", "", cit.group(1)).strip() if cit else ""
        if not title:
            continue
        m_case = CASE_NUMBER_RE.search(f"{title} {snippet} {citation}")
        out.append({
            "title": title[:300],
            "url": link or f"https://scholar.google.com/scholar?q={query_encoded}",
            "summary": snippet[:500],
            "citation": citation[:200],
            "source": "google_scholar",
            "feed": "scholar.google.com",
            "case_number": m_case.group(1) if m_case else None,
        })
    return out


# ── Source 3: Justia ─────────────────────────────────────────────────────────

def fetch_justia(query: str) -> list[dict]:
    url = f"https://law.justia.com/cases/florida/?q={query}&year=2020-2026"
    html = fetch(url, timeout=15)
    if html.startswith("ERROR"):
        log(f"  Justia error: {html[:80]}")
        return []
    out = []
    # Result card pattern: <li class="..." > ... <a href="...">title</a> ... </li>
    a_re = re.compile(r'<a\s+href="(/cases/[^"]+)"[^>]*>(.*?)</a>', re.DOTALL)
    for href, title in a_re.findall(html)[:30]:
        title_clean = re.sub(r"<[^>]+>", "", title).strip()
        if len(title_clean) < 10:
            continue
        full_url = "https://law.justia.com" + href
        out.append({
            "title": title_clean[:300],
            "url": full_url,
            "summary": "",
            "source": "justia",
            "feed": "law.justia.com",
            "case_number": None,
        })
    return out


# ── Source 1 + 5 + 6: Playwright-based portals (best effort) ─────────────────

def fetch_playwright_portals() -> list[dict]:
    """Try FL Courts e-filing + PBC Clerk + FL AG. Skips silently if unavailable."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        log("  Playwright not installed — skipping portal sources")
        return []

    out = []
    log("  Launching headless browser…")
    with sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(headless=True)
        except Exception as e:
            log(f"  Browser launch failed: {e}")
            return []

        try:
            ctx = browser.new_context(user_agent=UA, viewport={"width": 1280, "height": 900})
            page = ctx.new_page()
            page.set_default_timeout(15000)

            # Just probe whether the FL Courts portal loads at all.
            try:
                page.goto("https://www.myflcourtaccess.com", wait_until="domcontentloaded")
                body = page.inner_text("body")[:500]
                if "login" in body.lower() or "sign in" in body.lower():
                    log("  FL Courts portal requires login — skipping")
                else:
                    log("  FL Courts portal accessible (no scraping logic implemented in this version)")
            except Exception as e:
                log(f"  FL Courts probe error: {e}")

            # PBC Clerk
            try:
                page.goto("https://appsgp.mypalmbeachclerk.com/eCaseView/", wait_until="domcontentloaded")
                body = page.inner_text("body")[:500]
                log(f"  PBC Clerk loaded — {len(body)} chars body (search form scraping not implemented yet)")
            except Exception as e:
                log(f"  PBC Clerk error: {e}")

            # FL AG complaints page
            try:
                page.goto("https://myfloridalegal.com/complaints", wait_until="domcontentloaded")
                body = page.inner_text("body")[:1500]
                if re.search(r"(HOA|condo|association)", body, re.IGNORECASE):
                    log("  FL AG complaints page accessible (no specific case-extraction logic)")
            except Exception as e:
                log(f"  FL AG error: {e}")

        finally:
            browser.close()

    log("  Portal probes done. (Detailed scraping requires per-portal session/cookie logic — left as TODO.)")
    return out


# ── AI evaluation ────────────────────────────────────────────────────────────

def score_with_claude(case: dict, client) -> dict:
    user_msg = (
        f'Case title: {case.get("title", "")[:300]}\n'
        f'Source: {case.get("source", "")} ({case.get("feed", "")})\n'
        f'Citation: {case.get("citation", "")[:200]}\n'
        f'Case number: {case.get("case_number") or "—"}\n'
        f'Summary: {case.get("summary", "")[:400]}\n\n'
        'Is this a legal case involving an HOA or condo association in Palm Beach County Florida?\n'
        'Does it relate to: assessment disputes, board misconduct, fraud, lien foreclosure, '
        'discrimination, or resident vs HOA conflicts?\n\n'
        'Return JSON only:\n'
        '{\n'
        '  "relevant": true/false,\n'
        '  "score": 1-10,\n'
        '  "reason": "one sentence",\n'
        '  "community_mentioned": "name or null",\n'
        '  "case_type": "fraud|assessment|foreclosure|board|discrimination|other",\n'
        '  "severity": "low|medium|high"\n'
        '}'
    )
    try:
        resp = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=200,
            system="You evaluate legal cases for relevance to HOA and condo disputes in Palm Beach County Florida. Return JSON only.",
            messages=[{"role": "user", "content": user_msg}],
        )
        text = resp.content[0].text if resp.content else ""
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE)
        return json.loads(text)
    except json.JSONDecodeError:
        return {"relevant": False, "score": 0, "reason": "JSON parse failed",
                "community_mentioned": None, "case_type": "other", "severity": "low"}
    except Exception as e:
        return {"relevant": False, "score": 0, "reason": f"API error: {e}",
                "community_mentioned": None, "case_type": "other", "severity": "low"}


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-ai", action="store_true")
    parser.add_argument("--skip-playwright", action="store_true")
    parser.add_argument("--output-dir", default="scripts/output")
    args = parser.parse_args()

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()

    log(f"Wide Legal Search — output dir: {out_dir}")

    all_cases: list[dict] = []
    source_stats: dict[str, dict[str, int]] = {}

    # ── Source 1 + 5 + 6: Portals (Playwright) ──────────────────────────────
    if not args.skip_playwright:
        log("\n=== Sources 1/5/6: FL Courts + PBC Clerk + FL AG (Playwright probes) ===")
        portal_cases = fetch_playwright_portals()
        source_stats["portals"] = {"found": len(portal_cases)}
        all_cases.extend(portal_cases)
    else:
        source_stats["portals"] = {"found": 0, "skipped": True}

    # ── Source 2: Google Scholar ────────────────────────────────────────────
    log("\n=== Source 2: Google Scholar (FL state courts) ===")
    scholar_cases: list[dict] = []
    for q in GOOGLE_SCHOLAR_QUERIES:
        log(f"  Query: {urllib.parse.unquote_plus(q)}")
        scholar_cases.extend(fetch_google_scholar(q))
        time.sleep(2.0)  # Scholar throttles aggressively
    source_stats["google_scholar"] = {"found": len(scholar_cases)}
    all_cases.extend(scholar_cases)

    # ── Source 3: Justia ────────────────────────────────────────────────────
    log("\n=== Source 3: Justia ===")
    justia_cases: list[dict] = []
    for q in JUSTIA_QUERIES:
        log(f"  Query: {q}")
        justia_cases.extend(fetch_justia(q))
        time.sleep(0.8)
    source_stats["justia"] = {"found": len(justia_cases)}
    all_cases.extend(justia_cases)

    # ── Source 4: DuckDuckGo ────────────────────────────────────────────────
    log("\n=== Source 4: DuckDuckGo legal search ===")
    ddg_cases: list[dict] = []
    for q in DDG_QUERIES:
        log(f"  DDG: {q[:60]}")
        ddg_cases.extend(ddg_search(q, max_results=8))
        time.sleep(0.6)
    source_stats["duckduckgo"] = {"found": len(ddg_cases)}
    all_cases.extend(ddg_cases)

    # ── Deduplicate (by case_number when present, else by URL) ─────────────
    seen_keys: set[str] = set()
    unique: list[dict] = []
    for c in all_cases:
        key = c.get("case_number") or c.get("url", "")
        if key and key not in seen_keys:
            seen_keys.add(key)
            unique.append(c)
    log(f"\nCollected {len(all_cases)} cases total ({len(unique)} unique after dedup)")

    # ── AI evaluation ───────────────────────────────────────────────────────
    if args.no_ai or not HAVE_ANTHROPIC or not os.environ.get("ANTHROPIC_API_KEY"):
        log("\nSkipping AI scoring (--no-ai, missing anthropic, or no API key)")
        for c in unique:
            c["evaluation"] = {"relevant": None, "score": None, "reason": "not evaluated",
                               "community_mentioned": None, "case_type": "other", "severity": "low"}
        approved = []
    else:
        log("\n=== AI evaluation phase (Claude) ===")
        client = anthropic.Anthropic()
        for i, c in enumerate(unique, 1):
            if i % 10 == 0:
                log(f"  Scored {i}/{len(unique)}")
            c["evaluation"] = score_with_claude(c, client)
            time.sleep(0.3)
        approved = [c for c in unique
                    if c["evaluation"].get("relevant")
                    and (c["evaluation"].get("score") or 0) >= 7]
        for src in source_stats:
            source_stats[src]["passed"] = sum(
                1 for c in approved if c.get("source") == src
            )
        log(f"\n{len(approved)} cases passed (relevant=true & score>=7)")

    # ── Save outputs ────────────────────────────────────────────────────────
    all_path = out_dir / f"wide-legal-results-{today}.json"
    approved_path = out_dir / f"wide-legal-approved-{today}.json"

    all_path.write_text(json.dumps({
        "generated_at": datetime.now().isoformat(),
        "source_stats": source_stats,
        "cases": unique,
    }, indent=2))

    approved_path.write_text(json.dumps({
        "generated_at": datetime.now().isoformat(),
        "filter": "relevant=true AND score>=7",
        "count": len(approved) if not (args.no_ai or not HAVE_ANTHROPIC) else "n/a (AI skipped)",
        "cases": approved,
    }, indent=2))

    # ── Summary ─────────────────────────────────────────────────────────────
    print()
    print("=== WIDE LITIGATION SEARCH RESULTS ===")
    print("Source breakdown:")
    for src, stats in source_stats.items():
        passed = f", {stats['passed']} passed filter" if "passed" in stats else ""
        skipped = " (SKIPPED)" if stats.get("skipped") else ""
        print(f"  {src:15s}: {stats['found']:4d} cases found{passed}{skipped}")
    print()
    print(f"Total found:    {len(all_cases)}")
    print(f"After dedup:    {len(unique)}")
    if not (args.no_ai or not HAVE_ANTHROPIC):
        print(f"Passed filter:  {len(approved)}")
        print(f"Discarded:      {len(unique) - len(approved)}")
        print()
        print("Top 10 highest scoring cases:")
        top = sorted(approved, key=lambda c: c["evaluation"].get("score", 0), reverse=True)[:10]
        for i, c in enumerate(top, 1):
            sc = c["evaluation"].get("score")
            t = c.get("title", "")[:80]
            ct = c["evaluation"].get("case_type", "?")
            sv = c["evaluation"].get("severity", "?")
            print(f"  {i:2d}. [{sc}] [{ct}/{sv}] {t}")
        print()
        high = [c for c in approved if c["evaluation"].get("severity") == "high"]
        if high:
            print(f"High severity cases ({len(high)}):")
            for c in high[:10]:
                t = c.get("title", "")[:80]
                u = c.get("url", "")[:60]
                print(f"  - {t}")
                print(f"    {u}")
    print()
    print(f"All cases:      {all_path}")
    print(f"Approved cases: {approved_path}")


if __name__ == "__main__":
    main()
