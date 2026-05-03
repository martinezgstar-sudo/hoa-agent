#!/usr/bin/env python3
"""
submit-indexnow.py

One-time bulk submission of all HOA Agent URLs to IndexNow (Bing + ChatGPT
search + Copilot + Yandex). Subsequent updates can use the lib/indexnow.ts
helper from a Vercel API route or trigger.

Requires:
  INDEXNOW_KEY in .env.local (32-hex)
  public/<INDEXNOW_KEY>.txt verification file at https://www.hoa-agent.com/<KEY>.txt
  NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

Usage:
  python3 scripts/submit-indexnow.py
  python3 scripts/submit-indexnow.py --dry-run
  python3 scripts/submit-indexnow.py --batch 5000
"""

import argparse
import os
import sys
import warnings
import requests
from typing import List

warnings.filterwarnings('ignore')
from dotenv import load_dotenv  # noqa: E402

load_dotenv('.env.local', override=True)

HOST = "www.hoa-agent.com"
SITE = f"https://{HOST}"

# Static URLs that always go in
STATIC_URLS = [
    f"{SITE}/", f"{SITE}/search", f"{SITE}/city", f"{SITE}/about",
    f"{SITE}/about/team", f"{SITE}/for-agents", f"{SITE}/pricing",
    f"{SITE}/press", f"{SITE}/advertise",
    f"{SITE}/reports", f"{SITE}/reports/hoa-fee-report-2026",
    f"{SITE}/methodology", f"{SITE}/editorial-standards", f"{SITE}/corrections",
    f"{SITE}/guides", f"{SITE}/florida-hoa-law", f"{SITE}/management",
]

GUIDE_SLUGS = [
    "how-to-read-hoa-documents",
    "what-is-a-special-assessment",
    "florida-hoa-vs-condo-association",
    "how-to-evaluate-hoa-before-buying",
    "palm-beach-county-hoa-fees",
]

CITY_SLUGS = [
    "west-palm-beach", "boca-raton", "jupiter", "palm-beach-gardens",
    "lake-worth", "delray-beach", "boynton-beach", "royal-palm-beach", "wellington",
]

CITY_FILTERS = [
    "condos", "single-family", "townhomes", "pet-friendly",
    "affordable", "high-fee", "with-litigation", "good-standing",
]


def fetch_all_community_slugs() -> List[str]:
    url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    h = {'apikey': key, 'Authorization': f'Bearer {key}'}
    out: List[str] = []
    offset = 0
    PAGE = 1000
    while offset < 25000:
        r = requests.get(
            f'{url}/rest/v1/communities?select=slug&status=eq.published'
            f'&order=canonical_name.asc&limit={PAGE}&offset={offset}',
            headers=h,
        )
        if r.status_code != 200:
            print(f'  Supabase fetch error at offset {offset}: {r.status_code}')
            break
        rows = r.json()
        if not rows:
            break
        for row in rows:
            if row.get('slug'):
                out.append(row['slug'])
        if len(rows) < PAGE:
            break
        offset += PAGE
    return out


def fetch_all_management_slugs() -> List[str]:
    url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    h = {'apikey': key, 'Authorization': f'Bearer {key}'}
    seen = set()
    offset = 0
    PAGE = 1000
    while offset < 10000:
        r = requests.get(
            f'{url}/rest/v1/communities?select=management_company&status=eq.published'
            f'&management_company=not.is.null&limit={PAGE}&offset={offset}',
            headers=h,
        )
        if r.status_code != 200:
            break
        rows = r.json()
        if not rows:
            break
        for row in rows:
            m = (row.get('management_company') or '').strip()
            if m:
                slug = m.lower().replace(' ', '-')
                slug = ''.join(c if c.isalnum() or c == '-' else '-' for c in slug)
                slug = '-'.join([s for s in slug.split('-') if s])[:80]
                if slug:
                    seen.add(slug)
        if len(rows) < PAGE:
            break
        offset += PAGE
    return sorted(seen)


def submit(batch: List[str]) -> dict:
    key = os.getenv('INDEXNOW_KEY')
    if not key:
        return {'ok': False, 'error': 'INDEXNOW_KEY not set'}
    res = requests.post(
        'https://api.indexnow.org/indexnow',
        headers={'Content-Type': 'application/json'},
        json={
            'host': HOST,
            'key': key,
            'keyLocation': f'https://{HOST}/{key}.txt',
            'urlList': batch,
        },
        timeout=30,
    )
    return {'ok': res.ok, 'status': res.status_code, 'body': res.text[:200]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='Print URLs without submitting')
    parser.add_argument('--batch', type=int, default=10000, help='URLs per request (max 10000)')
    args = parser.parse_args()

    if not os.getenv('INDEXNOW_KEY'):
        print('ERROR: INDEXNOW_KEY not in .env.local')
        sys.exit(1)

    print('Fetching slugs from Supabase…')
    community_slugs = fetch_all_community_slugs()
    management_slugs = fetch_all_management_slugs()
    print(f'  {len(community_slugs)} community slugs')
    print(f'  {len(management_slugs)} management slugs')

    urls = list(STATIC_URLS)
    urls.extend(f'{SITE}/guides/{s}' for s in GUIDE_SLUGS)
    urls.extend(f'{SITE}/city/{s}' for s in CITY_SLUGS)
    for s in CITY_SLUGS:
        for f in CITY_FILTERS:
            urls.append(f'{SITE}/city/{s}/{f}')
    urls.extend(f'{SITE}/community/{s}' for s in community_slugs)
    urls.extend(f'{SITE}/management/{s}' for s in management_slugs)

    print(f'\nTotal URLs to submit: {len(urls)}')
    if args.dry_run:
        for u in urls[:30]:
            print(' ', u)
        print(f'  … and {len(urls) - 30} more')
        return

    submitted = 0
    for i in range(0, len(urls), args.batch):
        chunk = urls[i:i + args.batch]
        print(f'\nSubmitting batch {i // args.batch + 1} ({len(chunk)} URLs)…')
        result = submit(chunk)
        print(f'  result: {result}')
        if result.get('ok'):
            submitted += len(chunk)

    print(f'\nDone. Submitted {submitted} URLs to IndexNow.')


if __name__ == '__main__':
    main()
