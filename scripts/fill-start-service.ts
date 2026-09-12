#!/usr/bin/env -S npx tsx
/**
 * fill-start-service.ts — v3 Phase 10c helper.
 *
 * Read every utility_providers row, probe a small set of well-known
 * "start service" / "new customer" paths under the provider's own
 * domain, and print (id, service, provider_name, provider_url,
 * candidate_or_null) — one line per row.
 *
 * Owner rule: keep a URL only when the final URL after redirects sits
 * on the provider's own domain AND the fetch returns 200. Otherwise
 * leave null and let the community page fall back to provider_url.
 *
 * DEFAULT MODE IS PRINT-ONLY. `--write` performs the actual writes
 * (owner approval required). Owner ruling 2026-09-10 says: print
 * first, stop, only write after approval.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Candidate paths, ordered from most-specific to most-generic. First
// hit that returns 200 on the provider's own domain AND lands on a
// URL whose final path contains a start-service keyword wins.
//
// Numeric-ID paths (Municode/CivicPlus /{id}/{name}) are omitted:
// those platforms 301-redirect any `/N/anything` to whatever canonical
// name lives at ID N on that site, producing false positives like
// /153/Start-Service → /153/Accessibility.
const CANDIDATE_PATHS = [
  '/help/starting-service.html',
  '/help/starting-service',
  '/starting-service',
  '/start-service',
  '/en/residential/start-service',
  '/residential/start-service',
  '/customer-service/start-service',
  '/service/start',
  '/service/new',
  '/new-service',
  '/new-customer',
  '/connect-service',
  '/customer-service/new-service',
  '/utilities/start-service',
  '/utilities/new-service',
  '/services/utility-billing/start-service',
  '/start-stop-service',
  '/start-stop-transfer-service',
];

// Keywords the FINAL URL path must contain to count as a legitimate
// start-service page. Guards against 301-to-random redirects.
const FINAL_PATH_KEYWORDS = [
  'start', 'new-customer', 'new-service', 'signup', 'sign-up',
  'startstop', 'start-stop', 'connect', 'enroll', 'customer-portal',
  'begin', 'get-service',
];

function finalPathLooksRight(finalUrl: string): boolean {
  try {
    const path = new URL(finalUrl).pathname.toLowerCase();
    if (path === '/' || path === '') return false;
    return FINAL_PATH_KEYWORDS.some((k) => path.includes(k));
  } catch {
    return false;
  }
}

const REQUEST_TIMEOUT_MS = 8000;
const USER_AGENT = 'HOA-Agent/10c-probe (+https://www.hoa-agent.com)';

function stripWww(host: string): string {
  return host.replace(/^www\./i, '').toLowerCase();
}

/** Same-domain check: final host equals provider host, or is a subdomain of it. */
function sameDomain(providerUrl: string, finalUrl: string): boolean {
  try {
    const p = stripWww(new URL(providerUrl).hostname);
    const f = stripWww(new URL(finalUrl).hostname);
    return f === p || f.endsWith('.' + p);
  } catch {
    return false;
  }
}

async function probe(url: string): Promise<{ ok: boolean; final: string; status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method:  'GET',
      redirect:'follow',
      signal:  controller.signal,
      headers: { 'user-agent': USER_AGENT, 'accept': 'text/html,*/*' },
    });
    return { ok: res.status === 200, final: res.url, status: res.status };
  } catch {
    return { ok: false, final: url, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

async function findStartServiceUrl(providerUrl: string): Promise<{ url: string | null; note: string }> {
  let origin: string;
  try { origin = new URL(providerUrl).origin; }
  catch { return { url: null, note: 'bad-provider-url' }; }

  for (const path of CANDIDATE_PATHS) {
    const candidate = origin + path;
    const res = await probe(candidate);
    if (res.ok && sameDomain(providerUrl, res.final) && finalPathLooksRight(res.final)) {
      return { url: res.final, note: `hit ${path}` };
    }
  }
  return { url: null, note: 'no-candidate' };
}

interface Provider {
  id: number;
  service: string;
  provider_name: string;
  provider_url: string | null;
  new_service_url: string | null;
}

function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const write = argv.includes('--write');
  const sb = getSupabase();

  const { data, error } = await sb
    .from('utility_providers')
    .select('id, service, provider_name, provider_url, new_service_url')
    .order('service', { ascending: true })
    .order('provider_name', { ascending: true });
  if (error) throw new Error(`select: ${error.message}`);
  const rows = (data ?? []) as Provider[];

  const results: { id: number; service: string; name: string; url: string | null; final: string | null; note: string }[] = [];

  for (const r of rows) {
    if (!r.provider_url) {
      results.push({ id: r.id, service: r.service, name: r.provider_name, url: null, final: null, note: 'no-provider-url' });
      continue;
    }
    const hit = await findStartServiceUrl(r.provider_url);
    results.push({
      id:      r.id,
      service: r.service,
      name:    r.provider_name,
      url:     r.provider_url,
      final:   hit.url,
      note:    hit.note,
    });
  }

  // Pretty-print the 45-row table.
  console.log('');
  console.log('id   | service   | provider_name                             | provider_url                                                | new_service_url                                              | note');
  console.log('-----+-----------+-------------------------------------------+-------------------------------------------------------------+--------------------------------------------------------------+-------------------');
  for (const r of results) {
    const line = [
      String(r.id).padEnd(4),
      (r.service ?? '').padEnd(9),
      (r.name ?? '').slice(0, 41).padEnd(41),
      (r.url ?? '').slice(0, 59).padEnd(59),
      (r.final ?? 'null').slice(0, 60).padEnd(60),
      r.note,
    ].join(' | ');
    console.log(line);
  }
  const hits = results.filter((r) => r.final).length;
  console.log('');
  console.log(`SUMMARY: ${hits}/${results.length} providers matched a start-service URL on their own domain.`);
  console.log(`WRITE:   ${write ? 'ENABLED — writing rows below' : 'DISABLED — pass --write after approval'}`);

  if (!write) return;

  // Owner-approved write path.
  let wrote = 0;
  const nowIso = new Date().toISOString();
  for (const r of results) {
    if (!r.final) continue;
    const { error: upErr } = await sb
      .from('utility_providers')
      .update({ new_service_url: r.final, new_service_verified_at: nowIso })
      .eq('id', r.id);
    if (upErr) {
      console.error(`WARN update id=${r.id}: ${upErr.message}`);
      continue;
    }
    wrote += 1;
  }
  console.log(`WROTE: ${wrote} rows.`);
}

void main().catch((err) => { console.error(err); process.exit(1); });
