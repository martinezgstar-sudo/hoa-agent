#!/usr/bin/env python3
"""
web-cross-reference.py — Phase D1 of the North-Star plan.

Cross-references a single community against public web sources to validate
existing DB fields (management_company, news_reputation_score, litigation_count,
website_url, monthly_fee_median).

Output: structured JSON per community with finding type, value, source URL.
Designed to be consumed by research-hoa-comprehensive.py as a Tier 4
cross-check (use the corroborate_findings() entry point).

Usage:
    python3 scripts/web-cross-reference.py --community-id <uuid>
    python3 scripts/web-cross-reference.py --slug <slug>
    python3 scripts/web-cross-reference.py --batch 5 --random  # 5 random verified rows

Output files:
    logs/web-xref/<community_id>.json
"""
import argparse, json, os, re, sys, time, urllib.parse, urllib.request, random
from pathlib import Path

# ── env ──────────────────────────────────────────────────────────────────────
env = {}
with open(os.path.expanduser('~/Documents/hoa-agent/.env.local')) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
URL = env['NEXT_PUBLIC_SUPABASE_URL']
KEY = env['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}

OUT_DIR = Path(os.path.expanduser('~/Agents/hoa-agent/logs/web-xref-samples'))
OUT_DIR.mkdir(parents=True, exist_ok=True)

UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 '
      '(KHTML, like Gecko) Version/17.0 Safari/605.1.15')

# ── helpers ─────────────────────────────────────────────────────────────────
def fetch(url, timeout=15):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode(errors='ignore')
    except Exception as e:
        return f"ERROR: {e}"

def ddg_search(query):
    """DuckDuckGo HTML result page (no JS), returns list of {title, url, snippet}."""
    q = urllib.parse.quote_plus(query)
    html = fetch(f"https://html.duckduckgo.com/html/?q={q}")
    if html.startswith('ERROR'): return []
    results = []
    for m in re.finditer(
        r'<a\s+rel="nofollow"\s+class="result__a"\s+href="([^"]+)"[^>]*>(.*?)</a>',
        html, re.S):
        url = m.group(1)
        title = re.sub(r'<[^>]+>', '', m.group(2)).strip()
        # DuckDuckGo wraps URLs: //duckduckgo.com/l/?uddg=...
        if 'uddg=' in url:
            real = urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get('uddg', [''])[0]
            url = urllib.parse.unquote(real)
        if url.startswith('//'): url = 'https:' + url
        results.append({'title': title, 'url': url})
        if len(results) >= 10: break
    return results

def supabase_get_community(community_id=None, slug=None):
    select = ('id,canonical_name,city,county,zip_code,status,management_company,'
              'website_url,monthly_fee_median,litigation_count,'
              'news_reputation_score,unit_count,verification_status')
    if community_id:
        q = f"id=eq.{community_id}"
    elif slug:
        q = f"slug=eq.{slug}"
    else: return None
    req = urllib.request.Request(f"{URL}/rest/v1/communities?{q}&select={select}",
                                  headers=H)
    with urllib.request.urlopen(req, timeout=20) as r:
        rows = json.loads(r.read())
    return rows[0] if rows else None

def supabase_pick_random(n, verified_only=False):
    select = ('id,canonical_name,city,county,zip_code,status,management_company,'
              'website_url,monthly_fee_median,litigation_count,'
              'news_reputation_score,unit_count,verification_status')
    qs = f"select={select}&limit=500&order=id.asc"
    if verified_only:
        qs += "&verification_status=eq.verified"
    qs += "&status=eq.published"
    req = urllib.request.Request(f"{URL}/rest/v1/communities?{qs}", headers=H)
    with urllib.request.urlopen(req, timeout=30) as r:
        pool = json.loads(r.read())
    return random.sample(pool, min(n, len(pool)))

# ── per-community cross-reference ───────────────────────────────────────────
def cross_reference(community):
    name = community['canonical_name']
    city = community.get('city') or 'Palm Beach County'
    out = {
        'community_id': community['id'],
        'canonical_name': name,
        'city': city,
        'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'current_values': {k: community.get(k) for k in
                           ('management_company','website_url',
                            'monthly_fee_median','litigation_count',
                            'news_reputation_score','unit_count')},
        'findings': [],
    }

    # 1. management company website
    if community.get('management_company'):
        mc = community['management_company']
        out['findings'].append({
            'check': 'management_company_website',
            'query': f'"{mc}" management Florida',
            'results': ddg_search(f'"{mc}" management Florida')[:5],
        })
        time.sleep(1)

    # 2. community website
    out['findings'].append({
        'check': 'community_website',
        'query': f'"{name}" HOA "{city}" Florida',
        'results': ddg_search(f'"{name}" HOA "{city}" Florida')[:5],
    })
    time.sleep(1)

    # 3. news mentions
    out['findings'].append({
        'check': 'news_mentions',
        'query': f'"{name}" "{city}" news',
        'results': ddg_search(f'"{name}" "{city}" news')[:5],
    })
    time.sleep(1)

    # 4. litigation references
    out['findings'].append({
        'check': 'litigation_references',
        'query': f'"{name}" lawsuit Florida HOA',
        'results': ddg_search(f'"{name}" lawsuit Florida HOA')[:5],
    })
    time.sleep(1)

    # 5. HOA fee mentions in listings
    out['findings'].append({
        'check': 'fee_mentions',
        'query': f'"{name}" {city} HOA fee monthly',
        'results': ddg_search(f'"{name}" {city} HOA fee monthly')[:5],
    })

    return out

def corroborate_findings(community, raw):
    """Boil down findings to corroborate/contradict signals.

    Public entry point for research-hoa-comprehensive.py Tier 4 use.
    """
    signals = {'corroborate': [], 'contradict': [], 'new_evidence': []}
    name_l = community['canonical_name'].lower()
    for f in raw['findings']:
        check = f['check']
        for r in f.get('results', []):
            title = (r.get('title') or '').lower()
            url = (r.get('url') or '')
            if check == 'community_website' and name_l in title and ('hoa' in title or 'community' in title):
                signals['corroborate'].append({'field': 'website_url', 'evidence': url})
            if check == 'litigation_references' and ('lawsuit' in title or 'complaint' in title or 'court' in url):
                signals['new_evidence'].append({'field': 'litigation_count',
                                                  'evidence': url})
            if check == 'news_mentions' and ('.com' in url or 'news' in url):
                signals['new_evidence'].append({'field': 'news_reputation_score',
                                                  'evidence': url})
    return signals

# ── main ─────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--community-id')
    ap.add_argument('--slug')
    ap.add_argument('--batch', type=int, default=0)
    ap.add_argument('--random', action='store_true')
    ap.add_argument('--verified-only', action='store_true')
    args = ap.parse_args()

    targets = []
    if args.community_id:
        c = supabase_get_community(community_id=args.community_id)
        if c: targets = [c]
    elif args.slug:
        c = supabase_get_community(slug=args.slug)
        if c: targets = [c]
    elif args.batch > 0:
        targets = supabase_pick_random(args.batch, verified_only=args.verified_only)
    else:
        ap.error('Provide --community-id, --slug, or --batch N')

    print(f"Cross-referencing {len(targets)} communities…")
    for c in targets:
        print(f"\n--- {c['canonical_name']} ({c['id'][:8]}) ---")
        result = cross_reference(c)
        result['corroboration'] = corroborate_findings(c, result)
        out_path = OUT_DIR / f"{c['id']}.json"
        out_path.write_text(json.dumps(result, indent=2))
        n = sum(len(f.get('results', [])) for f in result['findings'])
        print(f"  saved → {out_path}  ({n} raw results, "
              f"{len(result['corroboration']['corroborate'])} corroborate, "
              f"{len(result['corroboration']['new_evidence'])} new-evidence)")

if __name__ == '__main__':
    main()
