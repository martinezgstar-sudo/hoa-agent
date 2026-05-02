#!/usr/bin/env python3
"""
audit-site-links.py
Crawls a fixed set of HOA Agent pages, extracts every internal href, and
reports the HTTP status of each link. Saves a per-page log + summary.

Usage:
  python3 scripts/audit-site-links.py
  python3 scripts/audit-site-links.py --base https://www.hoa-agent.com
  python3 scripts/audit-site-links.py --base http://localhost:3000
"""

import argparse
import concurrent.futures
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

PAGES = [
    "/",
    "/search",
    "/city",
    "/city/west-palm-beach",
    "/city/boca-raton",
    "/city/jupiter",
    "/about",
    "/for-agents",
    "/pricing",
    "/advertise",
    "/press",
    "/terms",
    "/privacy",
    "/bni",
    "/reports",
    "/reports/hoa-fee-report-2026",
]


def fetch(url: str, timeout: int = 12) -> tuple[int, str]:
    """GET a URL, return (status, body)."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode("utf-8", errors="ignore") if r.status == 200 else ""
            return r.status, body
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception:
        return 0, ""


def head(url: str, timeout: int = 8) -> int:
    """HEAD a URL, return status code (or fall back to GET if HEAD blocked)."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA}, method="HEAD")
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status
    except urllib.error.HTTPError as e:
        # Many servers return 405 for HEAD — retry with GET
        if e.code in (405, 501):
            return fetch(url, timeout)[0]
        return e.code
    except Exception:
        # Network error — try GET as fallback
        s, _ = fetch(url, timeout)
        return s


def extract_internal_hrefs(html: str, base_host: str) -> list[str]:
    """Pull all internal hrefs from page HTML."""
    hrefs = re.findall(r'href=["\']([^"\']+)["\']', html)
    out: set[str] = set()
    for h in hrefs:
        if h.startswith("#") or h.startswith("mailto:") or h.startswith("tel:") or h.startswith("javascript:"):
            continue
        if h.startswith("/"):
            out.add(h)
        elif base_host in h:
            # Strip protocol+host to get just the path
            parsed = urllib.parse.urlparse(h)
            out.add(parsed.path + (("?" + parsed.query) if parsed.query else ""))
    return sorted(out)


def fetch_random_community_slugs(n: int = 5) -> list[str]:
    if not SUPABASE_URL or not SUPABASE_KEY:
        return []
    url = (
        f"{SUPABASE_URL}/rest/v1/communities"
        f"?select=slug&status=eq.published&limit={n * 5}"
    )
    try:
        req = urllib.request.Request(url, headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode())
        slugs = [d["slug"] for d in data if d.get("slug")]
        # Spread out: take every Nth so we don't all match the same prefix
        if len(slugs) > n:
            step = len(slugs) // n
            slugs = [slugs[i * step] for i in range(n)]
        return slugs[:n]
    except Exception as e:
        print(f"  (could not fetch community slugs: {e})", flush=True)
        return []


def status_label(code: int) -> str:
    if code == 200:
        return "OK"
    if 300 <= code < 400:
        return "REDIRECT"
    if code == 404:
        return "BROKEN"
    if code == 0:
        return "ERROR"
    return "OTHER"


def main():
    parser = argparse.ArgumentParser(description="HOA Agent site link audit")
    parser.add_argument("--base", default="https://www.hoa-agent.com",
                        help="Base URL to crawl (default: production)")
    parser.add_argument("--output", default=None, help="Output file (default: scripts/output/site-audit-<date>.txt)")
    args = parser.parse_args()

    base = args.base.rstrip("/")
    base_host = urllib.parse.urlparse(base).netloc

    out_dir = Path("scripts/output")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = Path(args.output) if args.output else out_dir / f"site-audit-{date.today().isoformat()}.txt"

    print(f"Auditing {base}", flush=True)
    print(f"Output: {out_file}", flush=True)

    pages = list(PAGES)
    community_slugs = fetch_random_community_slugs(5)
    for s in community_slugs:
        pages.append(f"/community/{s}")
    print(f"Pages to scan: {len(pages)} ({len(community_slugs)} community pages)\n", flush=True)

    lines: list[str] = []
    lines.append(f"HOA Agent — Site Link Audit")
    lines.append(f"Base: {base}")
    lines.append(f"Date: {date.today().isoformat()}")
    lines.append("=" * 60)

    counts = {"OK": 0, "BROKEN": 0, "REDIRECT": 0, "ERROR": 0, "OTHER": 0}
    broken: list[str] = []
    redirected: list[str] = []
    errored: list[str] = []
    total_links = 0
    seen_link_status: dict[str, int] = {}  # cache to avoid re-checking same URL

    for page_path in pages:
        page_url = base + page_path
        print(f"PAGE: {page_path}", flush=True)
        status, html = fetch(page_url, timeout=15)
        lines.append(f"\nPAGE: {page_path} (status {status})")

        if status != 200 or not html:
            lines.append(f"  [page itself returned {status} — skipping link extraction]")
            continue

        hrefs = extract_internal_hrefs(html, base_host)
        # Limit per page to keep audit time reasonable
        if len(hrefs) > 80:
            hrefs = hrefs[:80]
            lines.append(f"  (note: limited to first 80 internal links of {len(hrefs)})")

        # Check links concurrently
        def check(h: str) -> tuple[str, int]:
            full = base + h if h.startswith("/") else h
            cached = seen_link_status.get(full)
            if cached is not None:
                return h, cached
            code = head(full, timeout=8)
            seen_link_status[full] = code
            return h, code

        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
            results = list(ex.map(check, hrefs))

        for h, code in results:
            label = status_label(code)
            counts[label] += 1
            total_links += 1
            line = f"  {h} → {code} {label}"
            lines.append(line)
            if label == "BROKEN":
                broken.append(f"{page_path} → {h}")
                print(f"  BROKEN: {h}", flush=True)
            elif label == "REDIRECT":
                redirected.append(f"{page_path} → {h} ({code})")
            elif label == "ERROR":
                errored.append(f"{page_path} → {h}")

    # Summary
    lines.append("\n" + "=" * 60)
    lines.append("SUMMARY")
    lines.append(f"  Pages scanned       : {len(pages)}")
    lines.append(f"  Total links checked : {total_links}")
    lines.append(f"  200 OK              : {counts['OK']}")
    lines.append(f"  Redirects (3xx)     : {counts['REDIRECT']}")
    lines.append(f"  404 BROKEN          : {counts['BROKEN']}")
    lines.append(f"  Network errors      : {counts['ERROR']}")
    lines.append(f"  Other (4xx/5xx)     : {counts['OTHER']}")

    if broken:
        lines.append("\nBROKEN LINKS (404):")
        for b in broken:
            lines.append(f"  - {b}")

    if redirected:
        lines.append("\nREDIRECTS:")
        for r in redirected[:40]:
            lines.append(f"  - {r}")
        if len(redirected) > 40:
            lines.append(f"  ... and {len(redirected) - 40} more")

    if errored:
        lines.append("\nNETWORK ERRORS:")
        for e in errored[:20]:
            lines.append(f"  - {e}")

    out_file.write_text("\n".join(lines))

    print()
    print("=" * 60)
    print(f"  Total links checked : {total_links}")
    print(f"  200 OK              : {counts['OK']}")
    print(f"  404 BROKEN          : {counts['BROKEN']}")
    print(f"  Redirects           : {counts['REDIRECT']}")
    print(f"  Network errors      : {counts['ERROR']}")
    print(f"  Other               : {counts['OTHER']}")
    print(f"\nSaved to: {out_file}")

    # Exit non-zero if too many broken links (so the script can be used in CI)
    sys.exit(0 if counts["BROKEN"] < 20 else 1)


if __name__ == "__main__":
    main()
