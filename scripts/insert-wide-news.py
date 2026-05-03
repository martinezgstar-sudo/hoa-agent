#!/usr/bin/env python3
"""
insert-wide-news.py

Insert approved articles from the wide-news-approved-<date>.json file into
news_items, deduping by URL. Articles with AI score >= 8 land as
status='approved' (visible immediately on community/news pages once linked).
Articles with score 7-7.x land as status='pending' for admin review.

Schema used (only columns that exist in production):
  title, url, source, published_date, ai_summary,
  status, admin_notes, gdelt_tone (left null)

Usage:
  python3 scripts/insert-wide-news.py
  python3 scripts/insert-wide-news.py --min-score 8   (skip pending bucket)
  python3 scripts/insert-wide-news.py --dry-run        (no DB writes)
  python3 scripts/insert-wide-news.py --file scripts/output/wide-news-approved-2026-05-03.json
"""

import argparse
import json
import os
import sys
import warnings
from datetime import datetime
from pathlib import Path

warnings.filterwarnings('ignore')

import requests  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv('.env.local', override=True)

URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
HEADERS = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}


def url_already_in_db(url: str) -> bool:
    r = requests.get(
        f'{URL}/rest/v1/news_items?select=id&url=eq.{requests.utils.quote(url, safe="")}',
        headers=HEADERS,
    )
    return r.status_code == 200 and len(r.json()) > 0


def insert_article(art: dict, status: str, dry_run: bool) -> tuple[bool, str]:
    """Insert single article. Returns (inserted, reason_if_skipped)."""
    title = (art.get('title') or '').strip()
    url_v = (art.get('url') or '').strip()
    if not title or not url_v:
        return False, 'missing title/url'

    if url_already_in_db(url_v):
        return False, 'duplicate URL'

    summary = (art.get('summary') or '')[:1000]  # cap for DB
    source = art.get('source') or art.get('feed') or 'wide_search'
    pub = art.get('published') or None

    # Try to parse a normalized published_date
    pub_iso = None
    if pub:
        # feedparser strings come in many shapes; try ISO first then RFC822
        for fmt in (
            '%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%dT%H:%M:%S',
            '%a, %d %b %Y %H:%M:%S %z', '%a, %d %b %Y %H:%M:%S %Z',
            '%Y-%m-%d',
        ):
            try:
                pub_iso = datetime.strptime(pub, fmt).isoformat()
                break
            except (ValueError, TypeError):
                continue

    ev = art.get('evaluation') or {}
    score = ev.get('score')
    reason = ev.get('reason', '')
    article_type = ev.get('article_type', '')

    payload = {
        'title': title[:500],
        'url': url_v,
        'source': source[:120] if source else None,
        'published_date': pub_iso,
        'ai_summary': summary,
        'status': status,
        'admin_notes': f'wide-net import 2026-05-03; score={score}; type={article_type}; {reason}'[:500],
    }

    if dry_run:
        return True, 'dry-run'

    r = requests.post(
        f'{URL}/rest/v1/news_items',
        headers={**HEADERS, 'Prefer': 'return=minimal'},
        json=payload,
    )
    if r.status_code in (200, 201, 204):
        return True, 'inserted'
    return False, f'HTTP {r.status_code}: {r.text[:120]}'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--file', default='scripts/output/wide-news-approved-2026-05-03.json')
    parser.add_argument('--min-score', type=int, default=7)
    parser.add_argument('--auto-approve-threshold', type=int, default=8,
                        help='Score >= this lands as approved; below = pending')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--limit', type=int, default=None, help='Insert at most N articles')
    args = parser.parse_args()

    fp = Path(args.file)
    if not fp.exists():
        print(f'ERROR: {fp} not found')
        sys.exit(1)

    data = json.load(open(fp))
    arts = data.get('articles', [])
    print(f'Loaded {len(arts)} articles from {fp.name}')

    # Filter by min score
    eligible = [
        a for a in arts
        if (a.get('evaluation') or {}).get('score') is not None
        and (a.get('evaluation') or {}).get('score') >= args.min_score
    ]
    print(f'Score >= {args.min_score}: {len(eligible)}')

    if args.limit:
        eligible = eligible[:args.limit]
        print(f'Limited to first {args.limit}')

    counts = {
        'inserted_approved': 0,
        'inserted_pending': 0,
        'skipped_duplicate': 0,
        'skipped_invalid': 0,
        'errors': 0,
    }
    error_samples = []
    inserted_titles = []

    for i, art in enumerate(eligible, 1):
        score = (art.get('evaluation') or {}).get('score', 0)
        status = 'approved' if score >= args.auto_approve_threshold else 'pending'
        ok, reason = insert_article(art, status, args.dry_run)
        if ok:
            if status == 'approved':
                counts['inserted_approved'] += 1
            else:
                counts['inserted_pending'] += 1
            if len(inserted_titles) < 10:
                inserted_titles.append(f'  [{score}] {art.get("title","")[:80]} ({status})')
        else:
            if 'duplicate' in reason:
                counts['skipped_duplicate'] += 1
            elif 'missing' in reason:
                counts['skipped_invalid'] += 1
            else:
                counts['errors'] += 1
                if len(error_samples) < 5:
                    error_samples.append(f'  {art.get("title","")[:60]} → {reason}')
        if i % 25 == 0:
            print(f'  Progress: {i}/{len(eligible)}')

    print()
    print('=== INSERT RESULTS ===')
    for k, v in counts.items():
        print(f'  {k:25s}: {v}')

    if inserted_titles:
        print('\nFirst inserted articles:')
        for t in inserted_titles:
            print(t)

    if error_samples:
        print('\nError samples:')
        for e in error_samples:
            print(e)

    print()
    if args.dry_run:
        print('DRY RUN — no DB writes performed.')
    else:
        print('To run AI community matching, run:')
        print('  python3 scripts/enrich-news-reputation.py')


if __name__ == '__main__':
    main()
