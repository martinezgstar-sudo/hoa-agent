#!/usr/bin/env python3
"""
fetch-news-wide.py

Cast a wide net for HOA / condo news in Palm Beach County by pulling
multiple RSS feeds + DuckDuckGo, then ranking each result with Claude.

OUTPUT FILES ONLY — does NOT write to Supabase.
The user reviews scripts/output/wide-news-approved-<date>.json before
any data is added to the live news_articles table.

Usage:
  python3 scripts/fetch-news-wide.py
  python3 scripts/fetch-news-wide.py --limit-per-source 10  (faster dry run)
  python3 scripts/fetch-news-wide.py --no-ai               (skip Claude scoring)
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
    import feedparser
except ImportError:
    print("ERROR: feedparser not installed. Run: pip3 install feedparser")
    sys.exit(1)

# Anthropic is optional — script still produces results, just unranked
try:
    import anthropic
    HAVE_ANTHROPIC = True
except ImportError:
    HAVE_ANTHROPIC = False

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# ── Sources ───────────────────────────────────────────────────────────────────

GOOGLE_NEWS_FEEDS = [
    'https://news.google.com/rss/search?q=HOA+%22Palm+Beach+County%22&hl=en-US&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=homeowners+association+%22Palm+Beach%22&hl=en-US&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=condo+association+%22Palm+Beach%22+Florida&hl=en-US&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=HOA+lawsuit+%22Palm+Beach%22+Florida&hl=en-US&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=special+assessment+%22Palm+Beach+County%22&hl=en-US&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=HOA+fraud+%22Palm+Beach%22&hl=en-US&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=condominium+%22Palm+Beach%22+dispute&hl=en-US&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=HOA+%22West+Palm+Beach%22&hl=en-US&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=HOA+Boca+Raton+Florida&hl=en-US&gl=US&ceid=US:en',
    'https://news.google.com/rss/search?q=HOA+Jupiter+Florida&hl=en-US&gl=US&ceid=US:en',
]

LOCAL_NEWSPAPER_FEEDS = [
    'https://www.palmbeachpost.com/arcio/rss/',
    'https://www.sun-sentinel.com/arcio/rss/',
    'https://www.tcpalm.com/arcio/rss/',
    'https://www.miamiherald.com/news/local/community/feed',
    'https://www.wptv.com/news/rss',
    'https://www.wpbf.com/rss',
    'https://www.wflx.com/rss',
]

REDDIT_FEEDS = [
    'https://www.reddit.com/r/HOA/search.rss?q=palm+beach&sort=new',
    'https://www.reddit.com/r/florida/search.rss?q=HOA+palm+beach&sort=new',
    'https://www.reddit.com/r/palmbeach/new.rss',
    'https://www.reddit.com/r/boca/.rss',
    'https://www.reddit.com/r/WestPalmBeach/.rss',
]

STATE_FEEDS = [
    'https://www.myfloridahouse.gov/rss/bills.aspx',
    'https://flsenate.gov/rss/bills.rss',
]

COURT_FEEDS = [
    'https://www.flsd.uscourts.gov/rss.xml',
    'https://www.flmd.uscourts.gov/rss.xml',
    'https://www.flnd.uscourts.gov/rss.xml',
]

DDG_QUERIES = [
    'HOA "Palm Beach County" news 2026',
    'homeowners association "Palm Beach" lawsuit 2026',
    'condo association "Palm Beach" special assessment 2026',
    'HOA fraud "Palm Beach" Florida 2026',
    'HOA board recall "Palm Beach" 2026',
    'community association "Palm Beach" 2026',
]

# Filter keywords for local newspaper feeds (which include lots of unrelated)
HOA_KEYWORDS = re.compile(
    r"\b(HOA|homeowners?\s+association|condo(?:minium)?\s+association|"
    r"special\s+assessment|community\s+association|condo\s+board|"
    r"condo(?:minium)?)\b",
    re.IGNORECASE,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def safe_feedparse(url: str) -> Optional[Any]:
    """feedparser.parse with timeout-style protection via custom request."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=12) as r:
            data = r.read()
        return feedparser.parse(data)
    except Exception as e:
        log(f"  ERR fetching {url[:60]}…: {e}")
        return None


def domain_of(url: str) -> str:
    try:
        return urllib.parse.urlparse(url).netloc.replace("www.", "")
    except Exception:
        return ""


def collect_feeds(feeds: list, source_label: str, filter_re: Optional[re.Pattern] = None,
                  limit_per_source: int = 30) -> list[dict]:
    """Pull entries from a list of RSS feeds and normalize to dicts."""
    out: list[dict] = []
    for url in feeds:
        log(f"  Fetching {source_label}: {url[:70]}…")
        parsed = safe_feedparse(url)
        if not parsed or not getattr(parsed, "entries", None):
            continue
        kept = 0
        for entry in parsed.entries[:limit_per_source]:
            title = (entry.get("title") or "").strip()
            link = (entry.get("link") or "").strip()
            summary = (entry.get("summary") or "").strip()
            published = (entry.get("published") or entry.get("updated") or "").strip()
            if not title or not link:
                continue
            blob = f"{title} {summary}"
            if filter_re and not filter_re.search(blob):
                continue
            out.append({
                "title": title,
                "url": link,
                "summary": summary[:500],  # cap
                "published": published,
                "source": source_label,
                "feed": domain_of(url),
            })
            kept += 1
        log(f"    → {kept} kept (out of {len(parsed.entries)})")
        time.sleep(0.4)
    return out


def ddg_search(query: str, max_results: int = 6) -> list[dict]:
    q = urllib.parse.quote_plus(query)
    url = f"https://html.duckduckgo.com/html/?q={q}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=12) as r:
            html = r.read().decode("utf-8", errors="ignore")
    except Exception as e:
        log(f"  DDG error: {e}")
        return []
    out = []
    link_re = re.compile(r'<a\s+class="result__a"\s+href="(/l/\?[^"]+)"[^>]*>([\s\S]*?)</a>')
    for href, title in link_re.findall(html)[:max_results]:
        m = re.search(r"uddg=(https?[^&]+)", href)
        real = urllib.parse.unquote(m.group(1)) if m else ""
        title_clean = re.sub(r"<[^>]+>", "", title).strip()
        # snippet
        idx = html.find(href)
        window = html[idx:idx + 3000]
        snip_m = re.search(r'class="result__snippet"[^>]*>([\s\S]*?)</a>', window)
        snippet = re.sub(r"<[^>]+>", "", snip_m.group(1)).strip() if snip_m else ""
        if real:
            out.append({
                "title": title_clean,
                "url": real,
                "summary": snippet,
                "source": "duckduckgo",
                "feed": domain_of(real),
            })
    return out


# ── AI evaluation ────────────────────────────────────────────────────────────

def score_with_claude(article: dict, client) -> dict:
    """Ask Claude if the article is relevant. Returns dict with relevant, score, reason, etc."""
    user_msg = (
        f'Article title: {article.get("title", "")[:200]}\n'
        f'Summary: {article.get("summary", "")[:300]}\n'
        f'Source: {article.get("source", "")} ({article.get("feed", "")})\n\n'
        'Is this relevant to HOA or condo community residents in Palm Beach County Florida?\n'
        'Does it mention a specific community, lawsuit, assessment, board issue, or local HOA news?\n\n'
        'Return JSON only:\n'
        '{\n'
        '  "relevant": true/false,\n'
        '  "score": 1-10,\n'
        '  "reason": "one sentence",\n'
        '  "community_mentioned": "name or null",\n'
        '  "article_type": "news|legal|legislative|reddit|opinion"\n'
        '}'
    )
    try:
        resp = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=200,
            system="You evaluate news articles for relevance to HOA and condo communities in Palm Beach County Florida. Return JSON only.",
            messages=[{"role": "user", "content": user_msg}],
        )
        text = resp.content[0].text if resp.content else ""
        # Strip markdown fences if present
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE)
        return json.loads(text)
    except json.JSONDecodeError:
        return {"relevant": False, "score": 0, "reason": "JSON parse failed",
                "community_mentioned": None, "article_type": "unknown"}
    except Exception as e:
        return {"relevant": False, "score": 0, "reason": f"API error: {e}",
                "community_mentioned": None, "article_type": "unknown"}


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit-per-source", type=int, default=30)
    parser.add_argument("--no-ai", action="store_true", help="Skip Claude scoring (raw collection only)")
    parser.add_argument("--output-dir", default="scripts/output")
    parser.add_argument("--sources-only", default="",
                        help="Comma-separated subset to run (google_news, local_news, reddit, legislative, court_rss, duckduckgo)")
    parser.add_argument("--ddg-delay", type=float, default=0.6,
                        help="Seconds between DDG queries (raise to 5+ to avoid rate limits)")
    parser.add_argument("--output-suffix", default="",
                        help="Append to output filename, e.g. '-retry'")
    args = parser.parse_args()

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    today = date.today().isoformat()

    only = {s.strip() for s in args.sources_only.split(",") if s.strip()}
    def want(src: str) -> bool:
        return not only or src in only

    log(f"Wide News Search — output dir: {out_dir}")
    if only:
        log(f"  Sources filter: {sorted(only)}")
        log(f"  DDG delay: {args.ddg_delay}s")

    # ── Collection phase ────────────────────────────────────────────────────
    all_articles: list[dict] = []
    source_stats: dict[str, dict[str, int]] = {}

    if want("google_news"):
        log("\n=== Source 1: Google News RSS ===")
        a = collect_feeds(GOOGLE_NEWS_FEEDS, "google_news", limit_per_source=args.limit_per_source)
        source_stats["google_news"] = {"found": len(a)}
        all_articles.extend(a)

    if want("local_news"):
        log("\n=== Source 2: Local newspaper RSS (filtered for HOA/condo) ===")
        a = collect_feeds(LOCAL_NEWSPAPER_FEEDS, "local_news", filter_re=HOA_KEYWORDS,
                          limit_per_source=args.limit_per_source)
        source_stats["local_news"] = {"found": len(a)}
        all_articles.extend(a)

    if want("reddit"):
        log("\n=== Source 3: Reddit RSS ===")
        a = collect_feeds(REDDIT_FEEDS, "reddit", limit_per_source=args.limit_per_source)
        source_stats["reddit"] = {"found": len(a)}
        all_articles.extend(a)

    if want("legislative"):
        log("\n=== Source 4: FL state government bills RSS ===")
        a = collect_feeds(STATE_FEEDS, "legislative", filter_re=HOA_KEYWORDS,
                          limit_per_source=args.limit_per_source)
        source_stats["legislative"] = {"found": len(a)}
        all_articles.extend(a)

    if want("court_rss"):
        log("\n=== Source 5: FL Federal Court RSS ===")
        a = collect_feeds(COURT_FEEDS, "court_rss", filter_re=HOA_KEYWORDS,
                          limit_per_source=args.limit_per_source)
        source_stats["court_rss"] = {"found": len(a)}
        all_articles.extend(a)

    if want("duckduckgo"):
        log("\n=== Source 6: DuckDuckGo news search ===")
        ddg_articles: list[dict] = []
        for q in DDG_QUERIES:
            log(f"  DDG: {q}")
            ddg_articles.extend(ddg_search(q, max_results=6))
            time.sleep(args.ddg_delay)
        source_stats["duckduckgo"] = {"found": len(ddg_articles)}
        all_articles.extend(ddg_articles)

    # ── Deduplicate by URL ──────────────────────────────────────────────────
    seen_urls: set[str] = set()
    unique: list[dict] = []
    for art in all_articles:
        u = art.get("url", "")
        if u and u not in seen_urls:
            seen_urls.add(u)
            unique.append(art)
    log(f"\nCollected {len(all_articles)} articles total ({len(unique)} unique after dedup)")

    # ── AI evaluation ───────────────────────────────────────────────────────
    if args.no_ai or not HAVE_ANTHROPIC or not os.environ.get("ANTHROPIC_API_KEY"):
        log("\nSkipping AI scoring (--no-ai flag, missing anthropic, or no API key)")
        for art in unique:
            art["evaluation"] = {"relevant": None, "score": None, "reason": "not evaluated",
                                 "community_mentioned": None, "article_type": "unknown"}
        approved = []
    else:
        log("\n=== AI evaluation phase (Claude) ===")
        client = anthropic.Anthropic()
        for i, art in enumerate(unique, 1):
            if i % 10 == 0:
                log(f"  Scored {i}/{len(unique)}")
            art["evaluation"] = score_with_claude(art, client)
            time.sleep(0.3)  # gentle on the API
        approved = [a for a in unique
                    if a["evaluation"].get("relevant")
                    and (a["evaluation"].get("score") or 0) >= 6]
        for src in source_stats:
            source_stats[src]["passed"] = sum(
                1 for a in approved if a.get("source") == src
            )
        log(f"\n{len(approved)} articles passed (relevant=true & score>=6)")

    # ── Save outputs ────────────────────────────────────────────────────────
    suffix = args.output_suffix
    all_path = out_dir / f"wide-news-results{suffix}-{today}.json"
    approved_path = out_dir / f"wide-news-approved{suffix}-{today}.json"

    all_path.write_text(json.dumps({
        "generated_at": datetime.now().isoformat(),
        "source_stats": source_stats,
        "articles": unique,
    }, indent=2))

    approved_path.write_text(json.dumps({
        "generated_at": datetime.now().isoformat(),
        "filter": "relevant=true AND score>=6",
        "count": len(approved) if not (args.no_ai or not HAVE_ANTHROPIC) else "n/a (AI skipped)",
        "articles": approved,
    }, indent=2))

    # ── Summary print ───────────────────────────────────────────────────────
    print()
    print("=== WIDE NEWS SEARCH RESULTS ===")
    print("Source breakdown:")
    for src, stats in source_stats.items():
        passed_str = f", {stats['passed']} passed filter" if "passed" in stats else ""
        print(f"  {src:15s}: {stats['found']:4d} articles found{passed_str}")
    print()
    print(f"Total found:    {len(all_articles)}")
    print(f"After dedup:    {len(unique)}")
    if not (args.no_ai or not HAVE_ANTHROPIC):
        print(f"Passed filter:  {len(approved)}")
        print(f"Discarded:      {len(unique) - len(approved)}")
        print()
        print("Top 10 highest scoring articles:")
        top = sorted(approved,
                     key=lambda a: a["evaluation"].get("score", 0),
                     reverse=True)[:10]
        for i, art in enumerate(top, 1):
            sc = art["evaluation"].get("score")
            t = art.get("title", "")[:80]
            s = art.get("source", "")
            u = art.get("url", "")[:60]
            print(f"  {i:2d}. [{sc}] {t}")
            print(f"        {s} — {u}")
    print()
    print(f"All articles:      {all_path}")
    print(f"Approved articles: {approved_path}")


if __name__ == "__main__":
    main()
