#!/usr/bin/env python3
"""
insert-wide-legal.py

Insert approved cases from wide-legal-approved-<date>.json into legal_cases.
Sorts by severity (high first). Then attempts to link the two HIGH-severity
cases (Hall v. Sausalito Place, Sherbrooke v. Chan) to their communities
via community_legal_cases + bumps litigation_count.

Schema used (only columns that exist):
  case_name, court, docket_number, date_filed, absolute_url, snippet,
  status, case_type, tags, ai_summary
  (court_listener_id left null — these are non-CourtListener sources)

Dedup: by case_name (these scraped cases don't have CourtListener IDs).

Usage:
  python3 scripts/insert-wide-legal.py
  python3 scripts/insert-wide-legal.py --dry-run
  python3 scripts/insert-wide-legal.py --file scripts/output/wide-legal-approved-2026-05-03.json
"""

import argparse
import json
import os
import sys
import warnings
from pathlib import Path
from typing import Optional, Tuple

warnings.filterwarnings('ignore')

import requests  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv('.env.local', override=True)

URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}


def case_name_already_in_db(case_name: str) -> bool:
    qn = requests.utils.quote(case_name, safe="")
    r = requests.get(f'{URL}/rest/v1/legal_cases?select=id&case_name=eq.{qn}', headers=H)
    return r.status_code == 200 and len(r.json()) > 0


def synthetic_court_listener_id(case_name: str) -> int:
    """Generate a stable, unique-by-case_name ID in a range that won't
    collide with real CourtListener IDs (those are ~8-digit ints).
    Use >= 10^11 to stay well above the real ID space.
    Hash is deterministic so re-running the script is idempotent.
    """
    import hashlib
    h = hashlib.md5(case_name.encode('utf-8')).hexdigest()
    return int(h[:12], 16) % (10**12) + 10**11


def insert_case(case: dict, dry_run: bool) -> Tuple[bool, str, Optional[str]]:
    """Returns (inserted, reason, new_case_id)."""
    title = (case.get('title') or '').strip()
    case_name = title.replace('&#39;', "'").replace('&amp;', '&')[:500]
    if not case_name:
        return False, 'missing case_name', None

    if case_name_already_in_db(case_name):
        return False, 'duplicate case_name', None

    ev = case.get('evaluation') or {}
    severity = ev.get('severity', 'low')
    case_type = ev.get('case_type', 'other')
    score = ev.get('score', 0)
    reason = ev.get('reason', '')

    payload = {
        'court_listener_id': synthetic_court_listener_id(case_name),
        'case_name': case_name,
        'court': case.get('source', 'wide_search'),
        'docket_number': case.get('case_number') or None,
        'absolute_url': case.get('url'),
        'snippet': (case.get('summary') or case.get('citation') or '')[:1000],
        'status': 'published',
        'case_type': case_type,
        'tags': [severity, f'score_{score}'],
        'ai_summary': f'{reason} [wide-net import 2026-05-03; severity={severity}; type={case_type}; score={score}]'[:1000],
    }

    if dry_run:
        return True, 'dry-run', None

    r = requests.post(
        f'{URL}/rest/v1/legal_cases',
        headers={**H, 'Prefer': 'return=representation'},
        json=payload,
    )
    if r.status_code in (200, 201):
        inserted = r.json()
        return True, 'inserted', inserted[0]['id'] if inserted else None
    return False, f'HTTP {r.status_code}: {r.text[:160]}', None


def find_community_by_name(pattern: str) -> Optional[dict]:
    """ILIKE search; return the first published match if any."""
    qp = requests.utils.quote(f'*{pattern}*', safe="")
    r = requests.get(
        f'{URL}/rest/v1/communities?select=id,canonical_name,slug,litigation_count'
        f'&canonical_name=ilike.{qp}&status=eq.published&limit=3',
        headers=H,
    )
    if r.status_code == 200 and r.json():
        return r.json()[0]
    return None


def link_community_to_case(community_id: str, case_id: str, reason: str, dry_run: bool) -> bool:
    if dry_run:
        return True
    r = requests.post(
        f'{URL}/rest/v1/community_legal_cases',
        headers={**H, 'Prefer': 'resolution=ignore-duplicates,return=minimal'},
        json={
            'community_id': community_id,
            'legal_case_id': case_id,
            'match_confidence': 0.95,
            'match_reason': reason[:500],
            'status': 'approved',
        },
    )
    return r.status_code in (200, 201, 204, 409)


def bump_litigation_count(community_id: str, dry_run: bool) -> bool:
    if dry_run:
        return True
    # Read current
    r = requests.get(
        f'{URL}/rest/v1/communities?select=litigation_count&id=eq.{community_id}',
        headers=H,
    )
    if r.status_code != 200 or not r.json():
        return False
    cur = r.json()[0].get('litigation_count') or 0
    r2 = requests.patch(
        f'{URL}/rest/v1/communities?id=eq.{community_id}',
        headers={**H, 'Prefer': 'return=minimal'},
        json={'litigation_count': cur + 1},
    )
    return r2.status_code in (200, 204)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--file', default='scripts/output/wide-legal-approved-2026-05-03.json')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    fp = Path(args.file)
    if not fp.exists():
        print(f'ERROR: {fp} not found')
        sys.exit(1)

    data = json.load(open(fp))
    cases = data.get('cases', [])
    print(f'Loaded {len(cases)} cases from {fp.name}')

    # Sort by severity: high → medium → low
    sev_order = {'high': 0, 'medium': 1, 'low': 2, '': 3}
    cases.sort(key=lambda c: sev_order.get((c.get('evaluation') or {}).get('severity', ''), 3))

    high_sev = [c for c in cases if (c.get('evaluation') or {}).get('severity') == 'high']
    print(f'High severity cases: {len(high_sev)}')
    for c in high_sev:
        print(f"  - {c.get('title','')[:80]}")

    # Insert all
    counts = {'inserted': 0, 'skipped_duplicate': 0, 'skipped_invalid': 0, 'errors': 0,
              'community_links': 0, 'litigation_bumps': 0}
    case_id_by_title = {}
    error_samples = []

    print(f'\n=== Inserting {len(cases)} cases ===')
    for c in cases:
        ok, reason, new_id = insert_case(c, args.dry_run)
        if ok:
            counts['inserted'] += 1
            if new_id:
                case_id_by_title[c.get('title', '')] = new_id
        elif 'duplicate' in reason:
            counts['skipped_duplicate'] += 1
        elif 'missing' in reason:
            counts['skipped_invalid'] += 1
        else:
            counts['errors'] += 1
            if len(error_samples) < 5:
                error_samples.append(f'  {c.get("title","")[:60]} → {reason}')

    # Manual high-severity community linking
    print(f'\n=== High-severity community linking ===')
    for c in high_sev:
        title = c.get('title', '')
        case_id = case_id_by_title.get(title)
        if not case_id and not args.dry_run:
            # Re-fetch by case_name to get id (may have been already in DB or new)
            qn = requests.utils.quote(title.replace('&#39;', "'").replace('&amp;', '&')[:500], safe="")
            r = requests.get(f'{URL}/rest/v1/legal_cases?select=id&case_name=eq.{qn}', headers=H)
            if r.status_code == 200 and r.json():
                case_id = r.json()[0]['id']

        if not case_id:
            print(f'  SKIP: cannot find case_id for "{title[:50]}"')
            continue

        # Detect community pattern in title
        title_lower = title.lower()
        if 'sausalito' in title_lower:
            pattern = 'sausalito'
        elif 'sherbrooke' in title_lower:
            pattern = 'sherbrooke'
        else:
            # Generic: extract second part after "v." or first capitalized name before ASSOCIATION
            import re
            m = re.search(r'(?:v\.?\s+)?([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)\s+(?:HOMEOWNERS?|CONDOMINIUM|COMMUNITY)', title)
            pattern = m.group(1).strip() if m else None

        if not pattern:
            print(f'  SKIP: no community pattern detected for "{title[:50]}"')
            continue

        comm = find_community_by_name(pattern)
        if not comm:
            print(f'  NO MATCH for pattern "{pattern}" — case "{title[:50]}"')
            continue

        print(f'  MATCH: "{pattern}" → {comm["canonical_name"]} ({comm["slug"]})')
        link_ok = link_community_to_case(
            comm['id'], case_id,
            f'High-severity match for case "{title[:80]}"',
            args.dry_run,
        )
        if link_ok:
            counts['community_links'] += 1
            if bump_litigation_count(comm['id'], args.dry_run):
                counts['litigation_bumps'] += 1

    print()
    print('=== INSERT RESULTS ===')
    for k, v in counts.items():
        print(f'  {k:25s}: {v}')

    if error_samples:
        print('\nError samples:')
        for e in error_samples:
            print(e)

    if args.dry_run:
        print('\nDRY RUN — no DB writes performed.')


if __name__ == '__main__':
    main()
