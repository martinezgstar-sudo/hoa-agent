#!/usr/bin/env python3
"""
audit-seo.py

Crawl key HOA Agent pages and grade each on SEO essentials:
  - title (50-60 chars, location keyword)
  - meta description (140-170 chars)
  - h1 (exactly one, primary keyword)
  - h2 count >= 2
  - og:title / og:description / og:image
  - canonical URL
  - JSON-LD schema present
  - internal links >= 3
  - word count >= 300
  - location mention >= 3 times
  - target keyword mention >= 3 times

Usage:
  python3 scripts/audit-seo.py
  python3 scripts/audit-seo.py --base http://localhost:3000
"""

import argparse
import json
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

PAGES = [
    ('/',                                'Palm Beach County HOA'),
    ('/search',                          'search HOA communities'),
    ('/city',                            'HOA communities by city'),
    ('/city/west-palm-beach',            'West Palm Beach HOA'),
    ('/city/boca-raton',                 'Boca Raton HOA'),
    ('/city/jupiter',                    'Jupiter HOA'),
    ('/about',                           'HOA intelligence platform'),
    ('/for-agents',                      'HOA data real estate agents'),
    ('/pricing',                         'HOA Agent pricing'),
    ('/reports/hoa-fee-report-2026',     'Palm Beach County HOA fee'),
]

LOCATION_TERMS = ['palm beach', 'west palm beach', 'boca', 'jupiter',
                  'delray', 'florida', 'pbc']


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.read().decode('utf-8', errors='ignore')
    except Exception as e:
        return f'ERROR:{e}'


def text_only(html: str) -> str:
    no_script = re.sub(r'<script[^>]*>[\s\S]*?</script>', ' ', html, flags=re.IGNORECASE)
    no_style = re.sub(r'<style[^>]*>[\s\S]*?</style>', ' ', no_script, flags=re.IGNORECASE)
    no_tags = re.sub(r'<[^>]+>', ' ', no_style)
    return re.sub(r'\s+', ' ', no_tags).strip()


def first(pattern: str, html: str, group: int = 1) -> str:
    m = re.search(pattern, html, re.IGNORECASE | re.DOTALL)
    return (m.group(group) or '').strip() if m else ''


def all_internal_links(html: str, host: str) -> list:
    hrefs = re.findall(r'href=["\']([^"\']+)["\']', html, re.IGNORECASE)
    out = set()
    for h in hrefs:
        if h.startswith('/'):
            out.add(h.split('#')[0].split('?')[0])
        elif host in h:
            p = urllib.parse.urlparse(h).path
            if p:
                out.add(p)
    return sorted(out)


def audit_page(base: str, path: str, target_keyword: str) -> dict:
    url = base + path
    html = fetch(url)
    if html.startswith('ERROR'):
        return {'path': path, 'error': html, 'score': 0}

    text = text_only(html)
    title = first(r'<title[^>]*>([^<]*)</title>', html)
    desc = first(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)', html)
    if not desc:
        desc = first(r'<meta[^>]+content=["\']([^"\']*)["\'][^>]+name=["\']description["\']', html)

    h1s = re.findall(r'<h1[^>]*>([\s\S]*?)</h1>', html, re.IGNORECASE)
    h2s = re.findall(r'<h2[^>]*>([\s\S]*?)</h2>', html, re.IGNORECASE)
    og_title = first(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']*)', html)
    og_desc = first(r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']*)', html)
    og_image = first(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']*)', html)
    canonical = first(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']*)', html)
    jsonld_count = len(re.findall(r'application/ld\+json', html, re.IGNORECASE))

    host = urllib.parse.urlparse(base).netloc
    internal_links = all_internal_links(html, host)
    word_count = len(text.split())
    text_lower = text.lower()
    location_hits = sum(text_lower.count(t) for t in LOCATION_TERMS)
    keyword_hits = text_lower.count(target_keyword.lower())

    issues = []
    score = 100
    if not title:
        issues.append('missing <title>'); score -= 25
    elif not (40 <= len(title) <= 70):
        issues.append(f'title length {len(title)} (target 50-60)'); score -= 5
    if not desc:
        issues.append('missing meta description'); score -= 15
    elif not (120 <= len(desc) <= 180):
        issues.append(f'desc length {len(desc)} (target 140-170)'); score -= 5
    if len(h1s) != 1:
        issues.append(f'h1 count = {len(h1s)} (target 1)'); score -= 10
    if len(h2s) < 2:
        issues.append(f'h2 count = {len(h2s)} (target >=2)'); score -= 5
    if not og_title: issues.append('missing og:title'); score -= 5
    if not og_desc: issues.append('missing og:description'); score -= 5
    if not og_image: issues.append('missing og:image'); score -= 5
    if not canonical: issues.append('missing canonical'); score -= 5
    if jsonld_count == 0: issues.append('no JSON-LD schema'); score -= 10
    if len(internal_links) < 3: issues.append(f'internal links {len(internal_links)} (target >=3)'); score -= 5
    if word_count < 300: issues.append(f'word count {word_count} (target >=300)'); score -= 5
    if location_hits < 3: issues.append(f'location mentions {location_hits} (target >=3)'); score -= 5
    if keyword_hits < 3: issues.append(f'target keyword "{target_keyword}" appears {keyword_hits}x (target >=3)'); score -= 5

    return {
        'path': path,
        'target_keyword': target_keyword,
        'title': title[:80],
        'title_len': len(title),
        'desc_len': len(desc),
        'h1_count': len(h1s),
        'h2_count': len(h2s),
        'og_title': bool(og_title),
        'og_desc': bool(og_desc),
        'og_image': bool(og_image),
        'canonical': canonical[:80],
        'jsonld_count': jsonld_count,
        'internal_links': len(internal_links),
        'word_count': word_count,
        'location_hits': location_hits,
        'keyword_hits': keyword_hits,
        'score': max(0, score),
        'issues': issues,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='https://www.hoa-agent.com')
    args = parser.parse_args()
    base = args.base.rstrip('/')

    out_dir = Path('scripts/output')
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f'seo-audit-{date.today().isoformat()}.txt'

    print(f'SEO audit — {base}')
    print('=' * 70)

    results = []
    for path, kw in PAGES:
        print(f'  {path} ({kw}) …', end=' ', flush=True)
        r = audit_page(base, path, kw)
        results.append(r)
        if r.get('error'):
            print(f'ERROR: {r["error"][:60]}')
        else:
            print(f'score {r["score"]}/100')

    lines = [f'SEO Audit — {base}',
             f'Date: {date.today().isoformat()}',
             '=' * 70]
    for r in results:
        lines.append('')
        lines.append(f'PAGE: {r["path"]}')
        if r.get('error'):
            lines.append(f'  ERROR: {r["error"]}')
            continue
        lines.append(f'  Score: {r["score"]}/100')
        lines.append(f'  Title: "{r["title"]}" ({r["title_len"]} chars)')
        lines.append(f'  Desc length: {r["desc_len"]}, h1: {r["h1_count"]}, h2: {r["h2_count"]}, JSON-LD: {r["jsonld_count"]}')
        lines.append(f'  OG: title={r["og_title"]} desc={r["og_desc"]} image={r["og_image"]}, canonical={"yes" if r["canonical"] else "no"}')
        lines.append(f'  Words: {r["word_count"]}, internal links: {r["internal_links"]}, '
                     f'location hits: {r["location_hits"]}, target keyword hits: {r["keyword_hits"]}')
        if r['issues']:
            lines.append('  Issues:')
            for i in r['issues']:
                lines.append(f'    - {i}')

    avg = sum(r.get('score', 0) for r in results) / max(1, len(results))
    lines.append('')
    lines.append('=' * 70)
    lines.append(f'AVERAGE SCORE: {avg:.0f}/100')

    out_file.write_text('\n'.join(lines))
    print(f'\nSaved: {out_file}')
    print(f'Average score: {avg:.0f}/100')

    # Critical-issues summary to console
    print('\nCritical issues (score < 70):')
    for r in sorted(results, key=lambda x: x.get('score', 0)):
        if r.get('score', 100) < 70:
            print(f'  {r["path"]:40s} score={r.get("score","?"):>3}  issues={len(r.get("issues",[]))}')


if __name__ == '__main__':
    main()
