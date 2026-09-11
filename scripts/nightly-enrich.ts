#!/usr/bin/env -S npx tsx
/**
 * nightly-enrich.ts — v3 nightly research loop.
 *
 * Owned by v3. Do NOT import anything from the archived verify-watcher,
 * old enrichment pipeline, or LiteLLM. Plain TypeScript, run with tsx.
 *
 * Contract (from the v3 work order + owner rulings 2026-09-08):
 *   score:
 *     identity matched      -> 40  -> communities.identity_source
 *     entity_status='Active'-> 10  -> communities.entity_status (existing)
 *     city_verified=true    -> 20  -> communities.city_verified   (existing)
 *     management_company    -> 15  -> communities.management_company + _phone/_website
 *     monthly_fee_median    -> 10  -> $25-rounded, per CLAUDE.md rule 14
 *     all 5 utilities mapped-> 5   -> community_utilities rows
 *   confidence_score        -> total (0..100). Reuses existing smallint column.
 *   last_verified           -> now(). Reuses existing timestamptz column.
 *   next_research_at        -> now() + refresh_after_days days.
 *
 *   status transitions:
 *     out_of_market OR score < remove_below_score  -> removed
 *     score >= publish_min_score AND Active AND city_verified -> published
 *     else queue_open ? needs_review : keep + next_research_at=tomorrow
 *     refresh rows never drop from published on score alone —
 *       change_log queued(reason=score_drop), enter needs_review if queue_open
 *
 * Usage:
 *   npx tsx scripts/nightly-enrich.ts
 *   npx tsx scripts/nightly-enrich.ts --dry-run
 *   npx tsx scripts/nightly-enrich.ts --new 5 --refresh 5
 *   npx tsx scripts/nightly-enrich.ts --dry-run --new 5 --refresh 5
 *
 * Exit codes:
 *   0  success
 *   1  unhandled error (also written to job_runs)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { resolvePickup, pickupDelta, type PickupResult } from './lib/pickup-days.ts';

// ────────────────────────── config + CLI ──────────────────────────

interface Config {
  run_hour_local: number;
  new_per_night: number;
  refresh_per_night: number;
  refresh_after_days: number;
  review_queue_cap: number;
  publish_min_score: number;
  remove_below_score: number;
  in_market_counties: string[];
  phase2_counties: string[];
  ollama_url: string;
  ollama_model: string;
  searxng_url: string;
  sunbiz_index_path: string;
  imessage_to: string;
  orchestrator_interval_min: number;
  reporter_hour_local: number;
}

/** Tiny YAML reader — the config is flat scalars + two short lists. */
function loadConfig(path: string): Config {
  const raw = readFileSync(path, 'utf8');
  const out: Record<string, unknown> = {};
  for (const line of raw.split('\n')) {
    const clean = line.replace(/#.*$/, '').trimEnd();
    if (!clean || clean.startsWith('#')) continue;
    const m = clean.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    let v: unknown = rawVal.trim();
    if (typeof v === 'string') {
      if (/^\[.*\]$/.test(v)) {
        v = v
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      } else if (/^-?\d+$/.test(v)) {
        v = parseInt(v, 10);
      } else if (/^-?\d+\.\d+$/.test(v)) {
        v = parseFloat(v);
      } else if (/^["'].*["']$/.test(v)) {
        v = v.slice(1, -1);
      }
    }
    out[key] = v;
  }
  const cfg = out as unknown as Config;
  // ~ expansion on sunbiz_index_path
  cfg.sunbiz_index_path = cfg.sunbiz_index_path.replace(/^~/, homedir());
  return cfg;
}

interface CliArgs {
  dryRun: boolean;
  newLimit: number | null;
  refreshLimit: number | null;
  backfillPickup: boolean;
  backfillLimit: number | null;
  backfillBatchSize: number;
}

function parseCli(argv: string[]): CliArgs {
  const out: CliArgs = {
    dryRun: false,
    newLimit: null,
    refreshLimit: null,
    backfillPickup: false,
    backfillLimit: null,
    backfillBatchSize: 500,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--new') out.newLimit = parseInt(argv[++i], 10);
    else if (a === '--refresh') out.refreshLimit = parseInt(argv[++i], 10);
    else if (a === '--backfill-pickup') out.backfillPickup = true;
    else if (a === '--limit') out.backfillLimit = parseInt(argv[++i], 10);
    else if (a === '--batch-size') out.backfillBatchSize = parseInt(argv[++i], 10);
  }
  return out;
}

// ────────────────────────── logger ──────────────────────────

let RUN_ID: number | null = null;
const START = Date.now();
const LOG_LINES: string[] = [];

function log(kind: 'INFO' | 'WARN' | 'ERROR' | 'PLAN', msg: string): void {
  const t = new Date().toISOString();
  const line = `${t} [${kind}] ${msg}`;
  LOG_LINES.push(line);
  console.log(line);
}

// ────────────────────────── supabase ──────────────────────────

function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

// ────────────────────────── types ──────────────────────────

interface CommunityRow {
  id: string;
  slug: string;
  canonical_name: string;
  city: string | null;
  county: string;
  state: string;
  zip_code: string | null;
  status: string;
  state_entity_number: string | null;
  entity_status: string | null;
  registered_agent: string | null;
  city_verified: boolean | null;
  management_company: string | null;
  monthly_fee_median: number | null;
  confidence_score: number | null;
  last_verified: string | null;
  next_research_at: string | null;
  // Pickup — Phase 10b. Read into CommunityRow so stepUtilities can
  // compute a delta against the current row and only write when the
  // rule-resolved values differ.
  trash_pickup_days:     string | null;
  recycling_pickup_days: string | null;
  bulk_pickup_days:      string | null;
  trash_authority:       string | null;
  pickup_lookup_url:     string | null;
  pickup_source:         string | null;
  pickup_verified_at:    string | null;
}

interface Findings {
  community: CommunityRow;
  isRefresh: boolean;

  // per-step outputs
  identity_source?: string;
  identity_matched?: boolean;
  identity_skipped?: boolean;
  sunbiz_active?: boolean;
  registered_agent?: string;
  principal_address?: string;

  location_source?: string;
  city_verified?: boolean;
  out_of_market?: boolean;

  management_source?: string;
  management_skipped?: boolean;
  management_company?: string;
  management_phone?: string;
  management_website?: string;

  fees_source?: string;
  fees_skipped?: boolean;
  monthly_fee_median?: number; // rounded to $25
  dues_frequency?: 'monthly' | 'quarterly' | 'annual' | 'unknown';

  utilities_mapped?: number; // 0..5
  utility_rows?: { service: string; provider_id: number }[];

  // Pickup — Phase 10b. `pickup_delta` holds the fields that changed
  // vs the row's current values; only those are written to communities
  // and get change_log rows. `pickup_verified_at_iso` is set when at
  // least one pickup field changed OR the row had no prior verify
  // timestamp — this feeds the community page's footer ("Verified on
  // {date}" vs "Reported to HOA Agent").
  pickup_delta?: Partial<PickupResult>;
  pickup_verified_at_iso?: string;

  // scoring
  score: number;
  score_breakdown: Record<string, number>;

  // planned writes (never issued when --dry-run)
  planned_updates: Record<string, unknown>;
  planned_status: string | null;
  planned_change_log: {
    action: string;
    field?: string;
    old_value?: string | null;
    new_value?: string | null;
    source?: string;
    reason?: string;
  }[];

  notes: string[];
}

// ────────────────────────── job_runs lifecycle ──────────────────────────

async function startJobRun(sb: SupabaseClient, jobName: string, dry: boolean): Promise<number | null> {
  const summary = { started_by: 'nightly-enrich.ts', dry_run: dry };
  const { data, error } = await sb
    .from('job_runs')
    .insert({
      job_name: jobName,
      project: 'hoa-agent',
      trigger_type: 'manual',
      host: process.env.USER ?? 'unknown',
      started_at: new Date().toISOString(),
      status: 'running',
      summary: JSON.stringify(summary),
    })
    .select('id')
    .single();
  if (error) {
    log('WARN', `could not create job_runs row: ${error.message}`);
    return null;
  }
  return data?.id ?? null;
}

async function communityHasV3Baseline(sb: SupabaseClient, communityId: string): Promise<boolean> {
  // Owner ruling 2026-09-09: baseline = any prior change_log row with
  // action='refreshed' for this community. Old-pipeline confidence
  // scores are a different rubric and don't count. Absence means this
  // is the first v3 refresh — treat as baseline pass, never queue.
  if (!communityId) return false;
  try {
    const { count } = await sb
      .from('change_log')
      .select('id', { count: 'exact', head: true })
      .eq('community_id', communityId)
      .eq('action', 'refreshed');
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

async function countAttempts(sb: SupabaseClient, source: string): Promise<number> {
  // Track new-row attempt count via change_log entries tagged with
  // source='sunbiz-doc:<doc>'. Refresh rows can also count via
  // community_id but attempts are only load-bearing for new rows.
  try {
    const { count, error } = await sb
      .from('change_log')
      .select('id', { count: 'exact', head: true })
      .eq('action', 'attempted')
      .eq('source', source);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function endJobRun(
  sb: SupabaseClient,
  id: number | null,
  status: 'success' | 'failed',
  summary: Record<string, unknown>,
): Promise<void> {
  if (id == null) return;
  const now = new Date();
  const seconds = Math.round((now.getTime() - START) / 1000);
  await sb
    .from('job_runs')
    .update({
      finished_at: now.toISOString(),
      exit_code: status === 'success' ? 0 : 1,
      status,
      duration_seconds: seconds,
      summary: JSON.stringify(summary).slice(0, 4000),
    })
    .eq('id', id);
}

// ────────────────────────── batch pickers ──────────────────────────

async function pickRefreshBatch(sb: SupabaseClient, limit: number): Promise<CommunityRow[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from('communities')
    .select(
      'id,slug,canonical_name,city,county,state,zip_code,status,state_entity_number,entity_status,registered_agent,city_verified,management_company,monthly_fee_median,confidence_score,last_verified,next_research_at,trash_pickup_days,recycling_pickup_days,bulk_pickup_days,trash_authority,pickup_lookup_url,pickup_source,pickup_verified_at',
    )
    .eq('status', 'published')
    .or(`next_research_at.is.null,next_research_at.lte.${nowIso}`)
    .order('next_research_at', { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(`refresh pick: ${error.message}`);
  return (data ?? []) as CommunityRow[];
}

interface SunbizCandidate {
  document_number: string;
  name: string;
  status: string;
  filing_date: string | null;
  registered_agent: string | null;
  principal_address: string | null;
  principal_zip: string | null;
  city: string | null;
  zip: string | null;
}

/** Sunbiz index freshness check — owner ruling: index_fresh = built_at within 45 days. */
async function sunbizIndexFresh(
  cfg: Config,
): Promise<{ ok: boolean; reason: string; built_at?: string; age_days?: number }> {
  if (!existsSync(cfg.sunbiz_index_path)) {
    return { ok: false, reason: 'index_missing' };
  }
  try {
    const { execFileSync } = await import('node:child_process');
    const out = execFileSync(
      'sqlite3',
      [cfg.sunbiz_index_path, "SELECT COALESCE(MAX(built_at), '') FROM sunbiz_meta"],
      { encoding: 'utf8', timeout: 5000 },
    ).trim();
    if (!out) return { ok: false, reason: 'no_built_at' };
    const built = new Date(out);
    const ageDays = (Date.now() - built.getTime()) / 86400_000;
    if (ageDays > 45) return { ok: false, reason: 'stale_over_45d', built_at: out, age_days: ageDays };
    return { ok: true, reason: 'fresh', built_at: out, age_days: ageDays };
  } catch (err) {
    return { ok: false, reason: `probe_error(${(err as Error).message})` };
  }
}

// Owner ruling 2026-09-11: at the start of nightly-enrich, if the
// index is missing or built_at is older than 30 days AND the LaCie
// cordata path is readable, run the builder inline before the batch.
// Rebuild threshold (30d) is stricter than the freshness threshold
// (45d) so we heal the index before the identity step starts refusing.
// No new launchd job — this is the only self-heal path.
const REBUILD_AGE_THRESHOLD_DAYS = 30;
const CORDATA_PROBE_DIR = '/Volumes/LaCie/FL-Palm Beach County Data /cordata_extracted';

// Owner ruling 2026-09-11: an owner-authored JSON at
// data/start_service_urls.json holds candidate start-service URLs for
// the 21 provider names the auto-probe couldn't safely guess. At
// nightly start, for every non-empty entry, fetch the URL, keep it
// only when the final URL after redirects is a 200 on the provider's
// own domain, and write new_service_url + new_service_verified_at on
// every utility_providers row with that provider_name. Empty entries
// are skipped. Never overwrites an existing (already-verified) row.
async function applyStartServiceUrls(sb: SupabaseClient, repoRoot: string): Promise<{ tried: number; wrote: number; skipped_empty: number; skipped_bad: number }> {
  const path = resolve(repoRoot, 'data/start_service_urls.json');
  if (!existsSync(path)) return { tried: 0, wrote: 0, skipped_empty: 0, skipped_bad: 0 };
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>; }
  catch { return { tried: 0, wrote: 0, skipped_empty: 0, skipped_bad: 0 }; }

  const stripWww = (h: string) => h.replace(/^www\./i, '').toLowerCase();
  const sameDomain = (providerUrl: string, finalUrl: string): boolean => {
    try {
      const p = stripWww(new URL(providerUrl).hostname);
      const f = stripWww(new URL(finalUrl).hostname);
      return f === p || f.endsWith('.' + p);
    } catch { return false; }
  };

  let tried = 0, wrote = 0, skipped_empty = 0, skipped_bad = 0;
  for (const [providerName, val] of Object.entries(raw)) {
    if (providerName.startsWith('_')) continue;
    const url = String(val ?? '').trim();
    if (!url) { skipped_empty += 1; continue; }
    tried += 1;

    // Need a provider_url to same-domain-check against.
    const { data: rows, error } = await sb
      .from('utility_providers')
      .select('id, provider_url, new_service_url')
      .eq('provider_name', providerName);
    if (error || !rows || rows.length === 0) { skipped_bad += 1; continue; }
    const providerUrl = rows[0].provider_url as string | null;
    if (!providerUrl) { skipped_bad += 1; continue; }

    let final = url, status = 0;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'user-agent': 'HOA-Agent/nightly (+https://www.hoa-agent.com)' } });
      clearTimeout(timer);
      final = res.url; status = res.status;
    } catch { skipped_bad += 1; continue; }
    if (status !== 200 || !sameDomain(providerUrl, final)) { skipped_bad += 1; continue; }

    // Update ONLY rows still null — don't overwrite an owner-verified value.
    const ids = rows.filter((r) => (r.new_service_url as string | null) == null).map((r) => r.id);
    if (ids.length === 0) continue;
    const nowIso = new Date().toISOString();
    const { error: upErr } = await sb
      .from('utility_providers')
      .update({ new_service_url: final, new_service_verified_at: nowIso })
      .in('id', ids);
    if (upErr) { skipped_bad += 1; continue; }
    wrote += ids.length;
  }

  return { tried, wrote, skipped_empty, skipped_bad };
}

async function attemptIndexRebuild(
  cfg: Config,
  fresh: { ok: boolean; reason: string; age_days?: number },
): Promise<{ rebuilt: boolean; reason: string; duration_seconds?: number }> {
  const shouldTry = !fresh.ok || (fresh.age_days != null && fresh.age_days > REBUILD_AGE_THRESHOLD_DAYS);
  if (!shouldTry) return { rebuilt: false, reason: 'not_needed' };

  if (!existsSync(CORDATA_PROBE_DIR)) {
    return { rebuilt: false, reason: 'lacie_not_readable' };
  }

  const t0 = Date.now();
  try {
    const { execFileSync } = await import('node:child_process');
    const builderPath = resolve(dirname(fileURLToPath(import.meta.url)), 'build-sunbiz-index.ts');
    execFileSync('npx', ['tsx', builderPath], {
      encoding: 'utf8',
      timeout: 30 * 60_000,   // 30-min ceiling; typical run is ~5-8 min
      stdio:   ['ignore', 'inherit', 'inherit'],
    });
    return { rebuilt: true, reason: 'ok', duration_seconds: Math.round((Date.now() - t0) / 1000) };
  } catch (err) {
    return { rebuilt: false, reason: `builder_failed(${(err as Error).message.slice(0, 120)})` };
  }
}

/** Pick new candidates from the local Sunbiz sqlite. Empty when index down. */
async function pickNewBatch(
  cfg: Config,
  sb: SupabaseClient,
  limit: number,
  indexFresh: boolean,
): Promise<{ picks: SunbizCandidate[]; source: string }> {
  if (!indexFresh) {
    log(
      'WARN',
      'new_batch skipped — sunbiz index not fresh. Real run will refuse to publish new rows tonight.',
    );
    void sb;
    void limit;
    return { picks: [], source: 'index-not-fresh' };
  }
  try {
    const { execFileSync } = await import('node:child_process');
    // Owner ruling 2026-09-09: Active-only, newest filings first. The
    // old ORDER BY document_number ASC was serving up 1970s-era Inactive
    // rows that then all removed as entity_inactive.
    const query = `SELECT document_number, name, normalized_name, status, filing_date,
                          registered_agent, principal_address, principal_city, principal_zip, mailing_address
                   FROM sunbiz_pbc_associations
                   WHERE status = 'Active'
                   ORDER BY filing_date DESC NULLS LAST
                   LIMIT ${limit * 4};`;
    const raw = execFileSync(
      'sqlite3',
      [cfg.sunbiz_index_path, '-json', query],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 15000 },
    ).trim();
    if (!raw) return { picks: [], source: 'sqlite-empty' };
    const rows = JSON.parse(raw) as Array<Record<string, string | null>>;

    // Filter out anything already in communities.
    const docNums = rows.map((r) => r.document_number).filter(Boolean);
    const normNames = rows.map((r) => r.normalized_name).filter(Boolean);
    const existing = new Set<string>();
    if (docNums.length) {
      const { data } = await sb
        .from('communities')
        .select('state_entity_number')
        .in('state_entity_number', docNums as string[]);
      for (const r of data ?? []) if (r.state_entity_number) existing.add(r.state_entity_number);
    }
    const picks: SunbizCandidate[] = [];
    let filteredForName = 0;
    for (const r of rows) {
      if (r.document_number && existing.has(r.document_number)) continue;
      // Owner ruling 2026-09-09 (late): guard against a stale index by
      // re-running the tight name filter here. If an older index
      // predates the require/exclude rule, this catches leaks.
      if (!nameMatchesTight(r.name ?? '')) {
        filteredForName++;
        continue;
      }
      picks.push({
        document_number: r.document_number ?? '',
        name: r.name ?? '',
        status: r.status ?? '',
        filing_date: r.filing_date,
        registered_agent: r.registered_agent,
        principal_address: r.principal_address,
        principal_zip: r.principal_zip ?? null,
        city: r.principal_city ?? null,
        zip: r.principal_zip ?? null,
      });
      if (picks.length >= limit) break;
    }
    if (filteredForName > 0) log('INFO', `pickNewBatch: ${filteredForName} rows dropped by tight-name guard`);
    void normNames;
    return { picks, source: 'sqlite' };
  } catch (err) {
    log('WARN', `pickNewBatch error: ${(err as Error).message}`);
    return { picks: [], source: 'error' };
  }
}

// ────────────────────────── external services ──────────────────────────

async function ollamaReachable(cfg: Config): Promise<boolean> {
  try {
    const res = await fetch(`${cfg.ollama_url}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function searxngReachable(cfg: Config): Promise<boolean> {
  try {
    const res = await fetch(`${cfg.searxng_url}/`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

interface SearxResult {
  url: string;
  title: string;
  content?: string;
}

async function searxSearch(cfg: Config, q: string, k = 3): Promise<SearxResult[]> {
  const u = new URL(cfg.searxng_url + '/search');
  u.searchParams.set('q', q);
  u.searchParams.set('format', 'json');
  try {
    const res = await fetch(u.toString(), { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const body = (await res.json()) as { results?: SearxResult[] };
    return (body.results ?? []).slice(0, k);
  } catch (err) {
    log('WARN', `searxng error for "${q}": ${(err as Error).message}`);
    return [];
  }
}

async function fetchPageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    // strip scripts/styles and tags — the LLM prompt cares about text.
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 12000);
  } catch {
    return null;
  }
}

interface OllamaExtract {
  company: string | null;
  phone: string | null;
  website: string | null;
  dues_amount: number | null;
  dues_frequency: 'monthly' | 'quarterly' | 'annual' | 'unknown' | null;
  certainty: Record<string, number>;
}

async function ollamaExtract(
  cfg: Config,
  promptText: string,
  pageText: string,
): Promise<OllamaExtract | null> {
  try {
    const body = {
      model: cfg.ollama_model,
      stream: false,
      format: 'json',
      prompt: `${promptText}\nPAGE:\n${pageText}`,
      options: { temperature: 0 },
    };
    const res = await fetch(`${cfg.ollama_url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { response?: string };
    if (!j.response) return null;
    return JSON.parse(j.response) as OllamaExtract;
  } catch (err) {
    log('WARN', `ollama extract failed: ${(err as Error).message}`);
    return null;
  }
}

function digitsOnly(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '');
}

// ────────────────────────── research steps ──────────────────────────

// ────────────────────────── sunbiz name-match lookup ──────────────────────────

interface SunbizHit {
  document_number: string;
  name: string;
  status: string;
  filing_date: string | null;
  registered_agent: string | null;
  principal_address: string | null;
  principal_city: string | null;
  principal_zip: string | null;
  mailing_address: string | null;
}

// PBC ZIP → acceptable-city list, loaded at startup from
// data/pbc_zip_cities.json. Owner ruling 2026-09-09 (late): USPS
// acceptable city names per ZIP. A ZIP absent from the file resolves
// to out_of_market. city_verified passes when the normalized Sunbiz
// principal city appears in the list for that ZIP.
let PBC_ZIP_CITIES: Record<string, string[]> = {};

function loadZipCityDict(repoRoot: string): void {
  const path = resolve(repoRoot, 'data/pbc_zip_cities.json');
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, string[] | string>;
    const out: Record<string, string[]> = {};
    for (const [zip, val] of Object.entries(parsed)) {
      if (zip.startsWith('_')) continue; // metadata keys
      if (Array.isArray(val)) out[zip] = val.map((c) => c.toUpperCase().trim());
    }
    PBC_ZIP_CITIES = out;
    log('INFO', `pbc-zip-cities loaded: ${Object.keys(out).length} zips`);
  } catch (err) {
    throw new Error(`failed to load ${path}: ${(err as Error).message}`);
  }
}

function normalizeCity(s: string | null | undefined): string {
  return (s ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * Zip-city rule: ZIP is known AND the (normalized) city appears in the
 * acceptable-name list for that ZIP.
 */
function checkZipCity(zip: string | null, city: string | null): boolean {
  if (!zip) return false;
  const z = zip.trim().slice(0, 5);
  const list = PBC_ZIP_CITIES[z];
  if (!list) return false;
  const norm = normalizeCity(city);
  return list.includes(norm);
}

function zipInMarket(zip: string | null): boolean {
  if (!zip) return false;
  return Object.prototype.hasOwnProperty.call(PBC_ZIP_CITIES, zip.trim().slice(0, 5));
}

// ────────────────────────── new-row name-filter guard ──────────────────────────
// Duplicate of the tight filter used by build-sunbiz-index.ts so a
// stale index can't leak old rows into pickNewBatch. Kept in sync
// manually — small array, low change velocity.
const NAME_REQUIRE_ONE = [
  'HOMEOWNERS', 'OWNERS', 'CONDOMINIUM', 'CONDO', 'PROPERTY',
  'COMMUNITY', 'MASTER', 'RESIDENTS', 'TOWNHOME', 'TOWNHOMES',
  'VILLAS', 'ESTATES', 'NEIGHBORHOOD', 'RECREATION', 'MAINTENANCE',
];
const NAME_EXCLUDE_ANY = [
  'ALUMNI', 'CLUB', 'CLUBS', 'CHURCH', 'MINISTRY', 'MINISTRIES',
  'FOUNDATION', 'CHARITABLE', 'LEAGUE', 'SOCIETY', 'GUILD',
  'NURSES', 'MEDICAL', 'DENTAL', 'BAR ASSOCIATION', 'CHAMBER',
  'PROFESSIONAL', 'TRADE', 'BOOSTER', 'PTA', 'PTO', 'ATHLETIC',
  'BUSINESS',
];
const NAME_ASSOCIATION = /\bASSOCIATION\b/;
const NAME_REQ = new RegExp(
  '\\b(' + NAME_REQUIRE_ONE.map((t) => t.replace(/\s+/g, '\\s+')).join('|') + ')\\b',
);
const NAME_EXC = new RegExp(
  '\\b(' + NAME_EXCLUDE_ANY.map((t) => t.replace(/\s+/g, '\\s+')).join('|') + ')\\b',
);

function nameMatchesTight(name: string): boolean {
  const up = name.toUpperCase();
  if (!NAME_ASSOCIATION.test(up)) return false;
  if (!NAME_REQ.test(up)) return false;
  if (NAME_EXC.test(up)) return false;
  return true;
}

function normalizeForLookup(name: string): string {
  return name
    .toUpperCase()
    .replace(/,?\s+(INC|INCORPORATED|LLC|LTD|CO)\.?\s*$/i, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

async function sunbizLookupByName(
  cfg: Config,
  canonicalName: string,
  communityCity?: string | null,
): Promise<{ ok: boolean; hit?: SunbizHit; reason: string }> {
  if (!canonicalName?.trim()) return { ok: false, reason: 'empty_name' };
  const norm = normalizeForLookup(canonicalName);
  if (!norm) return { ok: false, reason: 'empty_normalized' };

  try {
    const { execFileSync } = await import('node:child_process');
    // Strict name-match — no fuzzy fallback (owner ruling 2026-09-09).
    // On multiple hits, break the tie by principal_city == community.city
    // (case-insensitive). Still ambiguous → unmatched.
    const query = `SELECT document_number, name, status, filing_date,
                          registered_agent, principal_address, principal_city, principal_zip, mailing_address
                   FROM sunbiz_pbc_associations
                   WHERE normalized_name = '${norm.replace(/'/g, "''")}'
                   LIMIT 20;`;
    const raw = execFileSync(
      'sqlite3',
      [cfg.sunbiz_index_path, '-json', query],
      { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 5000 },
    ).trim();
    const rows = raw ? (JSON.parse(raw) as SunbizHit[]) : [];

    if (rows.length === 0) return { ok: false, reason: 'unmatched' };
    if (rows.length === 1) return { ok: true, hit: rows[0], reason: 'single_match' };

    // Multi-hit tie-breaker: pick the one whose principal_city equals
    // the community city (case-insensitive, whitespace-normalized).
    const wantCity = (communityCity ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (wantCity) {
      const cityHits = rows.filter(
        (r) => (r.principal_city ?? '').toUpperCase().replace(/\s+/g, ' ').trim() === wantCity,
      );
      if (cityHits.length === 1) {
        return { ok: true, hit: cityHits[0], reason: 'city_tiebreaker' };
      }
    }
    return { ok: false, reason: `multiple_matches(${rows.length})` };
  } catch (err) {
    return { ok: false, reason: `probe_error(${(err as Error).message})` };
  }
}

async function stepIdentity(f: Findings, cfg: Config, sunbizAvailable: boolean): Promise<void> {
  // Refresh path
  //   - Row already has state_entity_number: trust DB values, do not
  //     re-hit Sunbiz. (Grandfathered.)
  //   - Row lacks state_entity_number: run the identity lookup now
  //     (owner ruling 2026-09-09 grandfather-with-backfill). On a single
  //     confident match, write the fields with identity_source =
  //     'sunbiz-name-match'. On zero or multiple matches, leave null
  //     and set identity_source = 'unmatched'.
  // New path
  //   - Always run the lookup. Sunbiz shell already carries
  //     state_entity_number from pickNewBatch, but we verify by name
  //     match to confirm the row isn't a duplicate of an existing PBC
  //     association under a different doc number.
  if (!sunbizAvailable) {
    f.identity_source = 'sunbiz-index-down';
    f.identity_skipped = true;
    f.notes.push(
      f.isRefresh
        ? 'identity: skipped (sunbiz index unavailable) — preserving existing values'
        : 'identity: skipped (sunbiz index unavailable) — new row will hold as draft',
    );
    return;
  }

  const c = f.community;

  // Refresh row that already has an identity — trust and move on.
  if (f.isRefresh && c.state_entity_number) {
    f.identity_source = 'communities-refresh';
    f.identity_matched = true;
    f.sunbiz_active = c.entity_status === 'Active';
    f.registered_agent = c.registered_agent ?? undefined;
    f.notes.push(
      `identity: existing state_entity_number=${c.state_entity_number} entity_status=${c.entity_status ?? 'null'} (grandfathered)`,
    );
    return;
  }

  // Refresh with null identity OR new row — do the lookup.
  const result = await sunbizLookupByName(cfg, c.canonical_name, c.city);
  if (result.ok && result.hit) {
    const h = result.hit;
    f.identity_source = 'sunbiz-name-match';
    f.identity_matched = true;
    f.sunbiz_active = h.status === 'Active';
    f.registered_agent = h.registered_agent ?? undefined;
    // For new rows, also carry across the doc number + status for
    // downstream write.
    if (!f.isRefresh) {
      // shell already carries state_entity_number from pickNewBatch;
      // overwrite with the confirmed lookup value in case of drift.
      c.state_entity_number = h.document_number;
      c.entity_status = h.status;
      c.registered_agent = h.registered_agent;
    }
    f.notes.push(
      `identity: single match doc=${h.document_number} status=${h.status}`,
    );
    return;
  }
  f.identity_source = 'unmatched';
  f.identity_matched = false;
  f.sunbiz_active = false;
  f.notes.push(`identity: ${result.reason}`);
}

function stepLocation(f: Findings, cfg: Config): void {
  const c = f.community;
  // Owner ruling 2026-09-09 (late): principal_zip is authoritative for
  // out_of_market on new rows. For refresh rows the DB county field is
  // trusted (already went through location verification when it was
  // published); a new v3 pass shouldn't demote a published PBC row
  // just because zip_code is null.
  const county = (c.county ?? '').trim();
  const inMarketByCounty = cfg.in_market_counties.includes(county);
  const inMarketByZip = zipInMarket(c.zip_code);

  const outOfMarket = f.isRefresh
    ? !inMarketByCounty && !inMarketByZip
    : !inMarketByZip;

  if (outOfMarket) {
    f.out_of_market = true;
    f.location_source = 'zip-out-of-market';
    f.notes.push(
      `location: out_of_market (zip=${c.zip_code ?? 'null'} county=${county || 'null'})`,
    );
    return;
  }

  const dbVerified = c.city_verified === true;
  const ruleVerified = checkZipCity(c.zip_code, c.city);
  f.city_verified = dbVerified || ruleVerified;
  f.location_source = 'pbc-zip-city-rule';
  f.notes.push(
    `location: city_verified=${f.city_verified} (rule=pbc-zip-city-rule; zip=${c.zip_code ?? 'null'} city=${c.city ?? 'null'})`,
  );
}

async function stepManagement(
  f: Findings,
  cfg: Config,
  prompt: string,
  ollamaOk: boolean,
  searxOk: boolean,
): Promise<void> {
  if (!ollamaOk || !searxOk) {
    f.management_source = ollamaOk ? 'searxng-down' : 'ollama-down';
    f.management_skipped = true;
    f.notes.push(`management: skipped (${f.management_source}) — preserving existing values`);
    return;
  }
  const q = `"${f.community.canonical_name}" ${f.community.city ?? ''} management`.trim();
  const hits = await searxSearch(cfg, q, 3);
  if (hits.length === 0) {
    f.management_source = 'searxng-no-results';
    f.notes.push('management: no search hits');
    return;
  }
  for (const hit of hits) {
    const text = await fetchPageText(hit.url);
    if (!text) continue;
    const extract = await ollamaExtract(cfg, prompt, text);
    if (!extract) continue;
    const accept = (v: unknown, key: string) => {
      const c = extract.certainty?.[key] ?? 0;
      if (c < 0.7 || v == null || v === '') return null;
      // verbatim rule: phone digits + website substring must appear in text
      if (key === 'phone' && typeof v === 'string') {
        return digitsOnly(v) && text.replace(/\D/g, '').includes(digitsOnly(v)) ? v : null;
      }
      if (key === 'website' && typeof v === 'string') {
        return text.includes(String(v).replace(/^https?:\/\//, '')) ? v : null;
      }
      return v;
    };
    const company = accept(extract.company, 'company') as string | null;
    const phone = accept(extract.phone, 'phone') as string | null;
    const website = accept(extract.website, 'website') as string | null;
    if (company || phone || website) {
      f.management_source = hit.url;
      if (company) f.management_company = company;
      if (phone) f.management_phone = phone;
      if (website) f.management_website = website;
      f.notes.push(`management: extracted from ${hit.url}`);
      return;
    }
  }
  f.management_source = 'no-verbatim-match';
  f.notes.push('management: no extract met certainty+verbatim rule');
}

async function stepFees(
  f: Findings,
  cfg: Config,
  prompt: string,
  ollamaOk: boolean,
  searxOk: boolean,
): Promise<void> {
  // Same Ollama pass — but here we care about dues_amount + dues_frequency.
  // The management step already populated any accepted fields via the same
  // extract; if it didn't, re-run one focused query.
  if (!ollamaOk || !searxOk) {
    f.fees_source = ollamaOk ? 'searxng-down' : 'ollama-down';
    f.fees_skipped = true;
    f.notes.push(`fees: skipped (${f.fees_source}) — preserving existing values`);
    return;
  }
  const q = `"${f.community.canonical_name}" ${f.community.city ?? ''} HOA fee`.trim();
  const hits = await searxSearch(cfg, q, 3);
  for (const hit of hits) {
    const text = await fetchPageText(hit.url);
    if (!text) continue;
    const extract = await ollamaExtract(cfg, prompt, text);
    if (!extract) continue;
    const c = extract.certainty ?? {};
    if ((c.dues_amount ?? 0) >= 0.7 && typeof extract.dues_amount === 'number') {
      // normalize to monthly + round to $25 (CLAUDE.md rule 14)
      let monthly = extract.dues_amount;
      if (extract.dues_frequency === 'quarterly') monthly = extract.dues_amount / 3;
      else if (extract.dues_frequency === 'annual') monthly = extract.dues_amount / 12;
      const rounded = Math.round(monthly / 25) * 25;
      const digits = String(Math.round(extract.dues_amount)).replace(/\D/g, '');
      // verbatim rule on the raw number
      if (digits && text.replace(/\D/g, '').includes(digits)) {
        f.fees_source = hit.url;
        f.monthly_fee_median = rounded;
        if (extract.dues_frequency) f.dues_frequency = extract.dues_frequency;
        f.notes.push(
          `fees: dues=${extract.dues_amount} ${extract.dues_frequency ?? '?'} -> monthly_fee_median=${rounded} (rounded to $25)`,
        );
        return;
      }
    }
  }
  f.fees_source = 'no-verbatim-match';
  f.notes.push('fees: no extract met certainty+verbatim rule');
}

async function stepUtilities(f: Findings, sb: SupabaseClient): Promise<void> {
  const city = f.community.city ?? null;
  const zip = f.community.zip_code ?? null;
  const services = ['electric', 'water', 'sewer', 'trash', 'gas'];
  const rows: { service: string; provider_id: number }[] = [];
  for (const svc of services) {
    // resolution order: exact (city,zip) → city → county default
    let pick: { id: number } | null = null;
    if (zip) {
      const { data } = await sb
        .from('utility_providers')
        .select('id')
        .eq('county', f.community.county)
        .eq('service', svc)
        .eq('city', city ?? '')
        .eq('zip', zip)
        .maybeSingle();
      pick = data ?? null;
    }
    if (!pick && city) {
      const { data } = await sb
        .from('utility_providers')
        .select('id')
        .eq('county', f.community.county)
        .eq('service', svc)
        .eq('city', city)
        .is('zip', null)
        .maybeSingle();
      pick = data ?? null;
    }
    if (!pick) {
      const { data } = await sb
        .from('utility_providers')
        .select('id')
        .eq('county', f.community.county)
        .eq('service', svc)
        .is('city', null)
        .is('zip', null)
        .maybeSingle();
      pick = data ?? null;
    }
    if (pick) rows.push({ service: svc, provider_id: pick.id });
  }
  f.utility_rows = rows;
  f.utilities_mapped = rows.length;
  f.notes.push(`utilities: mapped ${rows.length}/5 services`);

  // Phase 10b — pickup resolver. Rule-based, no network, no LLM.
  const next = resolvePickup(f.community.county, f.community.city);
  const current: Partial<PickupResult> = {
    trash_pickup_days:     f.community.trash_pickup_days,
    recycling_pickup_days: f.community.recycling_pickup_days,
    bulk_pickup_days:      f.community.bulk_pickup_days,
    trash_authority:       f.community.trash_authority,
    pickup_lookup_url:     f.community.pickup_lookup_url,
    pickup_source:         f.community.pickup_source,
  };
  const delta = pickupDelta(next, current);
  if (Object.keys(delta).length > 0) {
    f.pickup_delta = delta;
    f.pickup_verified_at_iso = new Date().toISOString();
    for (const [field, value] of Object.entries(delta)) {
      const oldValue = (current as Record<string, unknown>)[field] ?? null;
      f.planned_change_log.push({
        action:    'field_updated',
        field,
        old_value: oldValue == null ? null : String(oldValue),
        new_value: value  == null ? null : String(value),
        source:    next.pickup_source ?? 'pickup-resolver',
      });
    }
    f.notes.push(`pickup: ${Object.keys(delta).length} field(s) changed (source=${next.pickup_source})`);
  } else {
    f.notes.push(`pickup: no change`);
  }
}

// ────────────────────────── score + decide ──────────────────────────

function scoreFindings(f: Findings): void {
  // Owner ruling 2026-09-08: a skipped block preserves existing DB
  // values and does not contribute a zero. Each score component
  // therefore honours the freshly-observed value first, then falls
  // back to the DB row when the block was skipped (or when no new
  // value was accepted this run).
  const c = f.community;
  const b: Record<string, number> = {};

  const hasIdentity = f.identity_skipped
    ? !!c.state_entity_number
    : !!(f.identity_matched || c.state_entity_number);
  b.identity = hasIdentity ? 40 : 0;

  const active = f.identity_skipped
    ? c.entity_status === 'Active'
    : !!(f.sunbiz_active || c.entity_status === 'Active');
  b.entity_active = active ? 10 : 0;

  // Location step never depends on an external service — no skip case.
  b.city_verified = f.city_verified || c.city_verified === true ? 20 : 0;

  const hasMgmt = f.management_skipped
    ? !!c.management_company
    : !!(f.management_company || c.management_company);
  b.management = hasMgmt ? 15 : 0;

  const hasFees = f.fees_skipped
    ? c.monthly_fee_median != null
    : (f.monthly_fee_median != null || c.monthly_fee_median != null);
  b.fees = hasFees ? 10 : 0;

  b.utilities = f.utilities_mapped === 5 ? 5 : 0;

  f.score = Object.values(b).reduce((a, x) => a + x, 0);
  f.score_breakdown = b;
}

function anySkipped(f: Findings): boolean {
  return !!(f.identity_skipped || f.management_skipped || f.fees_skipped);
}

function decideFindings(
  f: Findings,
  cfg: Config,
  queueOpen: boolean,
  attemptCount: number,
  hasV3Baseline: boolean,
): void {
  // Owner rulings 2026-09-08 + 2026-09-09.
  //
  // Refresh rows:
  //   * Never removed here (Review-tab-only).
  //   * Queued when score < publish_min (any state) OR when the row
  //     has state_entity_number AND its entity_status leaves Active.
  //     Rows without state_entity_number skip the entity_inactive
  //     trigger — the identity backfill runs in this same pass, so
  //     next night the normal rule applies.
  //
  // New rows:
  //   * Removed only for out_of_market OR (identity known AND status
  //     Inactive). No removal by score alone.
  //   * Any skipped block → draft (retry tomorrow).
  //   * Full clean read: publish if score ≥ publish_min AND Active
  //     AND city_verified.
  //   * Active row under publish_min: needs_review if queue_open,
  //     else draft with next_research_at = +7 days.
  //   * After 3 attempts still under threshold, queue regardless of
  //     cap.
  const c = f.community;
  const changes = f.planned_change_log;

  const effectiveActive =
    f.identity_skipped ? c.entity_status === 'Active' : !!f.sunbiz_active;
  const cityVerified = f.city_verified || c.city_verified === true;
  const hasIdentity = !!c.state_entity_number;

  if (f.isRefresh) {
    // Owner ruling 2026-09-09 (evening): the first v3 refresh of any
    // row is a baseline pass, regardless of previous confidence_score.
    // Detected via change_log — a row with zero prior 'refreshed'
    // action rows has never been touched by the v3 loop. Old-pipeline
    // confidence numbers are a different rubric and shouldn't drive
    // score_drop.
    //
    // Once a row has been baselined, score_drop fires when
    // new_score <= previous_confidence_score - 15. entity_inactive
    // still requires a known identity + observed non-Active status
    // (identity_skipped still preserves).
    const prev = c.confidence_score ?? 0;
    const dropped = hasV3Baseline && prev > 0 && f.score <= prev - 15;
    const leftActive = hasIdentity && !effectiveActive && !f.identity_skipped;
    if (dropped || leftActive) {
      const reason = leftActive ? 'entity_inactive' : 'score_drop';
      const detail =
        reason === 'score_drop' ? `${prev}->${f.score}` : c.entity_status ?? '';
      changes.push({ action: 'queued', field: 'reason', new_value: `${reason}(${detail})` });
      if (queueOpen) {
        changes.push({
          action: 'field_updated',
          field: 'status',
          old_value: 'published',
          new_value: 'needs_review',
          reason,
        });
        f.planned_status = 'needs_review';
      } else {
        f.planned_status = null;
        f.notes.push(`decide: refresh row queued(reason=${reason}) but queue at cap — status unchanged`);
      }
      return;
    }
    if (!hasV3Baseline)
      f.notes.push(`decide: v3 baseline set (score=${f.score}) — no queue this pass, old scores ignored`);
    changes.push({ action: 'refreshed' });
    f.planned_status = null;
    return;
  }

  // ---- new row ladder ----

  if (f.out_of_market) {
    changes.push({ action: 'removed', field: 'status', old_value: c.status, new_value: 'removed', reason: 'out_of_market' });
    f.planned_status = 'removed';
    return;
  }

  // Owner ruling 2026-09-09: only remove a new row for Inactive when we
  // actually verified the identity this run. A skipped identity block
  // holds the row as draft (below).
  if (hasIdentity && !f.identity_skipped && !effectiveActive) {
    changes.push({ action: 'removed', field: 'status', old_value: c.status, new_value: 'removed', reason: 'entity_inactive' });
    f.planned_status = 'removed';
    return;
  }

  if (anySkipped(f)) {
    if (c.status !== 'draft') {
      changes.push({ action: 'field_updated', field: 'status', old_value: c.status, new_value: 'draft', reason: 'skipped_block' });
      f.planned_status = 'draft';
    } else {
      f.planned_status = null;
    }
    f.notes.push('decide: new row held as draft — one or more blocks skipped');
    return;
  }

  // Owner ruling 2026-09-09 (evening): publishing requires THREE
  // hard gates in addition to score >= publish_min:
  //   1. identity single match (identity_matched)
  //   2. entity_status Active
  //   3. city_verified true (via pbc-zip-city-rule)
  // Management + fees add to the score but never block publishing.
  const identityConfirmed = !!(f.identity_matched && !f.identity_skipped);
  const canPublish =
    f.score >= cfg.publish_min_score &&
    identityConfirmed &&
    effectiveActive &&
    cityVerified;
  if (canPublish) {
    changes.push({ action: 'published', field: 'status', old_value: c.status, new_value: 'published' });
    f.planned_status = 'published';
    return;
  }

  // Active but under publish_min. queue_open OR 3-strike escalation.
  const forceQueue = attemptCount >= 3;
  if (queueOpen || forceQueue) {
    if (c.status !== 'needs_review') {
      changes.push({
        action: 'queued',
        field: 'status',
        old_value: c.status,
        new_value: 'needs_review',
        reason: forceQueue && !queueOpen ? 'three_strike_force' : 'under_publish_min',
      });
      f.planned_status = 'needs_review';
    } else {
      f.planned_status = null;
    }
    return;
  }

  // Draft-hold with +7d.
  if (c.status !== 'draft') {
    changes.push({ action: 'field_updated', field: 'status', old_value: c.status, new_value: 'draft', reason: 'under_publish_min' });
    f.planned_status = 'draft';
  } else {
    f.planned_status = null;
  }
  f.notes.push(`decide: new row draft-held (attempt ${attemptCount + 1}, queue at cap) — next_research_at=+7d`);
}

function buildPlannedUpdates(f: Findings, cfg: Config): void {
  const now = new Date().toISOString();
  const tomorrowIso = new Date(Date.now() + 86400_000).toISOString();
  const sevenDaysIso = new Date(Date.now() + 7 * 86400_000).toISOString();
  const refreshIso = new Date(Date.now() + cfg.refresh_after_days * 86400_000).toISOString();

  // Owner rulings: skipped-block drafts retry tomorrow (fast recovery
  // when the down dependency comes back). Under-publish-min draft-holds
  // retry in 7 days per the 2026-09-09 correction. Refresh rows and
  // freshly-published rows go on the standard cadence.
  let nextAt = refreshIso;
  if (!f.isRefresh && f.planned_status === 'draft') {
    nextAt = anySkipped(f) ? tomorrowIso : sevenDaysIso;
  }

  const u: Record<string, unknown> = {
    confidence_score: f.score,
    last_verified: now,
    next_research_at: nextAt,
  };
  if (f.planned_status) u.status = f.planned_status;
  if (f.registered_agent) u.registered_agent = f.registered_agent;
  if (f.management_company) u.management_company = f.management_company;
  if (f.management_phone) u.management_phone = f.management_phone;
  if (f.management_website) u.management_website = f.management_website;
  if (f.monthly_fee_median != null) u.monthly_fee_median = f.monthly_fee_median;
  if (f.dues_frequency) u.dues_frequency = f.dues_frequency;
  if (f.identity_source) u.identity_source = f.identity_source;
  // Backfilled identity fields flow through to the row when the
  // name-match found a single hit.
  if (!f.isRefresh || (f.identity_source === 'sunbiz-name-match' && f.identity_matched)) {
    if (f.community.state_entity_number) u.state_entity_number = f.community.state_entity_number;
    if (f.community.entity_status) u.entity_status = f.community.entity_status;
    // registered_agent already handled above via f.registered_agent
  }
  if (f.location_source) u.location_source = f.location_source;
  if (f.management_source) u.management_source = f.management_source;
  if (f.fees_source) u.fees_source = f.fees_source;
  if (f.pickup_delta && Object.keys(f.pickup_delta).length > 0) {
    for (const [k, v] of Object.entries(f.pickup_delta)) u[k] = v;
    u.pickup_verified_at = f.pickup_verified_at_iso ?? now;
  }
  f.planned_updates = u;
}

// ────────────────────────── write ──────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

async function ensureUniqueSlug(sb: SupabaseClient, base: string): Promise<string> {
  if (!base) return `community-${Date.now()}`;
  let slug = base;
  for (let n = 2; n < 20; n++) {
    const { data } = await sb.from('communities').select('id').eq('slug', slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

async function applyWrites(sb: SupabaseClient, f: Findings): Promise<void> {
  let id = f.community.id;
  const isInsert = !id; // new-row shell has id === ''
  if (isInsert) {
    // Compose the insert payload. Owner ruling 2026-09-09: publish a
    // page with verified name, status, address, and utilities. So we
    // seed canonical_name / city / zip_code / county / state on the
    // insert alongside the planned updates.
    const c = f.community;
    const slug = await ensureUniqueSlug(sb, slugify(c.canonical_name));
    const payload = {
      slug,
      canonical_name: c.canonical_name,
      city: c.city,
      county: c.county,
      state: c.state,
      zip_code: c.zip_code,
      ...f.planned_updates,
      status: f.planned_status ?? 'draft',
    };
    const { data, error } = await sb
      .from('communities')
      .insert(payload)
      .select('id, slug')
      .single();
    if (error) throw new Error(`insert communities ${c.canonical_name}: ${error.message}`);
    id = data.id as string;
    f.community.id = id;
    f.community.slug = data.slug as string;
  } else {
    const { error } = await sb.from('communities').update(f.planned_updates).eq('id', id);
    if (error) throw new Error(`update communities ${id}: ${error.message}`);
  }
  for (const c of f.planned_change_log) {
    // Owner ruling: change_log reason lives in the `source` column
    // (schema has no `reason` column). If the change carries an
    // explicit source (e.g. 'sunbiz-doc:...' for attempts), we keep
    // that; otherwise the reason string is written as 'reason:<label>'.
    const src = c.source ?? (c.reason ? `reason:${c.reason}` : null);
    const { error: clErr } = await sb.from('change_log').insert({
      community_id: id,
      action: c.action,
      field: c.field ?? null,
      old_value: c.old_value ?? null,
      new_value: c.new_value ?? null,
      source: src,
      run_id: RUN_ID,
    });
    if (clErr) log('WARN', `change_log insert failed (${c.action}): ${clErr.message}`);
  }
  if (f.utility_rows && f.utility_rows.length) {
    for (const u of f.utility_rows) {
      await sb.from('community_utilities').upsert(
        {
          community_id: id,
          service: u.service,
          provider_id: u.provider_id,
          verified_at: new Date().toISOString(),
        },
        { onConflict: 'community_id,service' },
      );
    }
  }
}

// ────────────────────────── backfill (Phase 10b) ──────────────────────────

async function runBackfillPickup(
  sb: SupabaseClient,
  batchSize: number,
  limitTotal: number | null,
  dryRun: boolean,
): Promise<{ scanned: number; rows_updated: number; fields_written: number; sources: Record<string, number> }> {
  const summary = { scanned: 0, rows_updated: 0, fields_written: 0, sources: {} as Record<string, number> };
  let cursor: string | null = null;

  const pickupCols = 'id,slug,county,city,trash_pickup_days,recycling_pickup_days,bulk_pickup_days,trash_authority,pickup_lookup_url,pickup_source,pickup_verified_at';

  while (true) {
    if (limitTotal != null && summary.scanned >= limitTotal) break;
    const thisBatch = limitTotal == null
      ? batchSize
      : Math.min(batchSize, limitTotal - summary.scanned);

    let q = sb.from('communities').select(pickupCols).eq('status', 'published').order('id', { ascending: true }).limit(thisBatch);
    if (cursor) q = q.gt('id', cursor);
    const { data: rows, error } = await q;
    if (error) throw new Error(`backfill select: ${error.message}`);
    if (!rows || rows.length === 0) break;

    for (const raw of rows as unknown as Array<Record<string, unknown>>) {
      summary.scanned += 1;
      cursor = String(raw.id);
      const current: Partial<PickupResult> = {
        trash_pickup_days:     (raw.trash_pickup_days     as string | null) ?? null,
        recycling_pickup_days: (raw.recycling_pickup_days as string | null) ?? null,
        bulk_pickup_days:      (raw.bulk_pickup_days      as string | null) ?? null,
        trash_authority:       (raw.trash_authority       as string | null) ?? null,
        pickup_lookup_url:     (raw.pickup_lookup_url     as string | null) ?? null,
        pickup_source:         (raw.pickup_source         as string | null) ?? null,
      };
      const next = resolvePickup(raw.county as string | null, raw.city as string | null);
      const delta = pickupDelta(next, current);
      if (Object.keys(delta).length === 0) continue;

      const src = next.pickup_source ?? 'pickup-resolver';
      summary.sources[src] = (summary.sources[src] ?? 0) + 1;
      summary.rows_updated += 1;
      summary.fields_written += Object.keys(delta).length;

      if (dryRun) continue;

      const updatePayload: Record<string, unknown> = { ...delta, pickup_verified_at: new Date().toISOString() };
      const { error: upErr } = await sb.from('communities').update(updatePayload).eq('id', raw.id);
      if (upErr) {
        log('WARN', `backfill update ${raw.slug}: ${upErr.message}`);
        continue;
      }
      // Owner ruling (backfill-only): one change_log row per
      // community, not per field. field='pickup', new_value=the
      // authority name (the durable identity of what was written),
      // source='swa-directory' (or city-default:<city> once seeded).
      // Nightly refresh path keeps per-field rows — that write path
      // is untouched here.
      const { error: clErr } = await sb.from('change_log').insert({
        community_id: raw.id,
        action:       'field_updated',
        field:        'pickup',
        old_value:    null,
        new_value:    next.trash_authority ?? null,
        source:       src,
        run_id:       RUN_ID,
      });
      if (clErr) log('WARN', `backfill change_log ${raw.slug}: ${clErr.message}`);
    }

    log('INFO', `backfill batch: scanned=${summary.scanned} updated=${summary.rows_updated} fields=${summary.fields_written}`);
    if (rows.length < thisBatch) break;
  }

  return summary;
}

// ────────────────────────── main ──────────────────────────

async function main(): Promise<void> {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(__dirname, '..');
  const cfg = loadConfig(resolve(repoRoot, 'config/enrich.yaml'));
  const prompt = readFileSync(resolve(repoRoot, 'prompts/extract_management.txt'), 'utf8');
  loadZipCityDict(repoRoot);
  const args = parseCli(process.argv.slice(2));

  const newLimit = args.newLimit ?? cfg.new_per_night;
  const refreshLimit = args.refreshLimit ?? cfg.refresh_per_night;

  const sb = getSupabase();

  // Phase 10b — --backfill-pickup runs the pickup resolver over every
  // published row (or `--limit N` of them) in batches. Standalone
  // path; nothing else in the normal nightly flow runs on this call.
  if (args.backfillPickup) {
    RUN_ID = await startJobRun(sb, 'nightly-enrich:backfill-pickup', args.dryRun);
    log('INFO', `run_id=${RUN_ID ?? 'null'} backfill-pickup dry_run=${args.dryRun} limit=${args.backfillLimit ?? 'all'} batch=${args.backfillBatchSize}`);
    try {
      const bf = await runBackfillPickup(sb, args.backfillBatchSize, args.backfillLimit, args.dryRun);
      log('INFO', `backfill done: scanned=${bf.scanned} rows_updated=${bf.rows_updated} fields_written=${bf.fields_written} sources=${JSON.stringify(bf.sources)}`);
      await endJobRun(sb, RUN_ID, 'success', {
        mode: 'backfill-pickup',
        backfill: true,
        dry_run: args.dryRun,
        limit: args.backfillLimit,
        batch_size: args.backfillBatchSize,
        ...bf,
        duration_seconds: Math.round((Date.now() - START) / 1000),
      });
      return;
    } catch (err) {
      const stack = (err as Error).stack ?? String(err);
      log('ERROR', stack);
      await endJobRun(sb, RUN_ID, 'failed', { mode: 'backfill-pickup', error: stack.slice(0, 2000) });
      process.exit(1);
    }
  }

  RUN_ID = await startJobRun(sb, 'nightly-enrich', args.dryRun);
  log('INFO', `run_id=${RUN_ID ?? 'null'} dry_run=${args.dryRun} new=${newLimit} refresh=${refreshLimit}`);

  const summary: Record<string, unknown> = {
    dry_run: args.dryRun,
    new_processed: 0,
    refreshed: 0,
    published: 0,
    queued: 0,
    removed: 0,
    draft_held: 0,
    degraded: false,
    degraded_reasons: [] as string[],
    failed_steps: {} as Record<string, number>,
  };

  try {
    // Owner ruling 2026-09-08: cap counts in-market needs_review only.
    // The 400+ Broward + Miami-Dade needs_review rows are Phase 2
    // county backlog and MUST NOT throttle the Palm Beach loop.
    const inMarketCountiesCsv = cfg.in_market_counties.map((c) => `"${c}"`).join(',');
    const { count } = await sb
      .from('communities')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'needs_review')
      .in('county', cfg.in_market_counties);
    const queueOpen = (count ?? 0) < cfg.review_queue_cap;
    log(
      'INFO',
      `queue: needs_review(in-market=${inMarketCountiesCsv})=${count} cap=${cfg.review_queue_cap} queue_open=${queueOpen}`,
    );

    // external service probes
    const [ollamaOk, searxOk] = await Promise.all([ollamaReachable(cfg), searxngReachable(cfg)]);
    log('INFO', `ollama_up=${ollamaOk} searxng_up=${searxOk}`);
    if (!ollamaOk) {
      log('WARN', `ollama unreachable at ${cfg.ollama_url}`);
      (summary.degraded_reasons as string[]).push('ollama_down');
      summary.degraded = true;
    }
    if (!searxOk) {
      log('WARN', `searxng unreachable at ${cfg.searxng_url}`);
      (summary.degraded_reasons as string[]).push('searxng_down');
      summary.degraded = true;
    }

    // Sunbiz index freshness — owner ruling: index_fresh means built_at
    // within 45 days. Missing or older than 45d = degraded and identity
    // block reports skipped.
    let sunbizFresh = await sunbizIndexFresh(cfg);

    // Owner ruling 2026-09-11 — self-heal: if the index is missing or
    // older than 30 days AND LaCie is readable, rebuild inline before
    // the batch starts. Not readable => refresh only, degraded as now.
    const rebuild = await attemptIndexRebuild(cfg, sunbizFresh);
    summary.index_rebuilt        = rebuild.rebuilt;
    summary.index_rebuild_reason = rebuild.reason;
    if (rebuild.rebuilt) {
      log('INFO', `sunbiz index rebuilt inline (${rebuild.duration_seconds}s)`);
      sunbizFresh = await sunbizIndexFresh(cfg);
    } else if (rebuild.reason !== 'not_needed') {
      log('WARN', `sunbiz index rebuild skipped: ${rebuild.reason}`);
    }

    if (!sunbizFresh.ok) {
      log('WARN', `sunbiz index not fresh: ${sunbizFresh.reason}`);
      (summary.degraded_reasons as string[]).push(`sunbiz_${sunbizFresh.reason}`);
      summary.degraded = true;
    } else {
      log('INFO', `sunbiz index fresh: built_at=${sunbizFresh.built_at}`);
    }

    // Owner ruling 2026-09-11: pull owner-authored start-service URLs
    // from data/start_service_urls.json and write any that verify.
    const startServiceOutcome = await applyStartServiceUrls(sb, repoRoot);
    summary.start_service = startServiceOutcome;
    log(
      'INFO',
      `start_service: tried=${startServiceOutcome.tried} wrote=${startServiceOutcome.wrote} empty=${startServiceOutcome.skipped_empty} bad=${startServiceOutcome.skipped_bad}`,
    );

    const refresh = await pickRefreshBatch(sb, refreshLimit);
    log('INFO', `refresh batch: ${refresh.length} rows`);

    const newPicks = await pickNewBatch(cfg, sb, newLimit, sunbizFresh.ok);
    log('INFO', `new batch: ${newPicks.picks.length} rows (source=${newPicks.source})`);

    const allFindings: Findings[] = [];

    for (const c of refresh) {
      const f: Findings = {
        community: c,
        isRefresh: true,
        score: 0,
        score_breakdown: {},
        planned_updates: {},
        planned_status: null,
        planned_change_log: [],
        notes: [],
      };
      // Detect whether this row has ever been touched by v3 (any prior
      // 'refreshed' change_log entry). If not, decide() treats this pass
      // as baseline and never queues on score_drop.
      const hasV3Baseline = await communityHasV3Baseline(sb, c.id);
      try {
        await stepIdentity(f, cfg, sunbizFresh.ok);
        stepLocation(f, cfg);
        if (!f.out_of_market) {
          await stepManagement(f, cfg, prompt, ollamaOk, searxOk);
          await stepFees(f, cfg, prompt, ollamaOk, searxOk);
          await stepUtilities(f, sb);
        }
        scoreFindings(f);
        decideFindings(f, cfg, queueOpen, 0, hasV3Baseline);
        buildPlannedUpdates(f, cfg);
      } catch (err) {
        f.notes.push(`row error: ${(err as Error).message}`);
      }
      allFindings.push(f);
      summary.refreshed = (summary.refreshed as number) + 1;
      if (f.planned_status === 'published') summary.published = (summary.published as number) + 1;
      else if (f.planned_status === 'needs_review') summary.queued = (summary.queued as number) + 1;
      else if (f.planned_status === 'draft') summary.draft_held = (summary.draft_held as number) + 1;
      else if (f.planned_status === 'removed') summary.removed = (summary.removed as number) + 1;
    }

    // New-row loop. Skipped-block rule means most rows will draft-hold
    // until Ollama + SearXNG are up, so tonight's "5 new" surface may
    // still land as 5 draft rows.
    for (const cand of newPicks.picks) {
      // Compose a synthetic community shell for the new-row decide.
      // The row is not yet in `communities`; we scope the shell to the
      // fields decide/score/apply touch.
      const shell: CommunityRow = {
        id: '',                              // filled at insert time in a real run
        slug: '',                            // slug generation TBD (Phase 3 v2)
        canonical_name: cand.name,
        city: cand.city,
        county: cfg.in_market_counties[0],   // Sunbiz filter guaranteed in-market
        state: 'FL',
        zip_code: cand.zip,
        status: 'draft',
        state_entity_number: cand.document_number,
        entity_status: cand.status,
        registered_agent: cand.registered_agent,
        city_verified: null,
        management_company: null,
        monthly_fee_median: null,
        confidence_score: null,
        last_verified: null,
        next_research_at: null,
        trash_pickup_days:     null,
        recycling_pickup_days: null,
        bulk_pickup_days:      null,
        trash_authority:       null,
        pickup_lookup_url:     null,
        pickup_source:         null,
        pickup_verified_at:    null,
      };
      const f: Findings = {
        community: shell,
        isRefresh: false,
        score: 0,
        score_breakdown: {},
        planned_updates: {},
        planned_status: null,
        planned_change_log: [],
        notes: [],
      };
      // Owner ruling 2026-09-09: after 3 attempts still under
      // publish_min, force-queue regardless of cap. Track attempts via
      // change_log entries tagged `source=sunbiz-doc:<doc>` so we can
      // count them across nights even before the row is inserted.
      const attemptSource = `sunbiz-doc:${cand.document_number}`;
      const attempts = await countAttempts(sb, attemptSource);
      try {
        await stepIdentity(f, cfg, sunbizFresh.ok);
        stepLocation(f, cfg);
        if (!f.out_of_market) {
          await stepManagement(f, cfg, prompt, ollamaOk, searxOk);
          await stepFees(f, cfg, prompt, ollamaOk, searxOk);
          await stepUtilities(f, sb);
        }
        scoreFindings(f);
        // New rows have no v3 history yet — pass true so the baseline
        // branch (which is refresh-only) doesn't misfire.
        decideFindings(f, cfg, queueOpen, attempts, true);
        buildPlannedUpdates(f, cfg);
        // Always log an 'attempted' change_log row for new picks so
        // the 3-strike counter advances every night.
        f.planned_change_log.push({ action: 'attempted', source: attemptSource });
      } catch (err) {
        f.notes.push(`row error: ${(err as Error).message}`);
      }
      allFindings.push(f);
      summary.new_processed = (summary.new_processed as number) + 1;
      if (f.planned_status === 'published') summary.published = (summary.published as number) + 1;
      else if (f.planned_status === 'needs_review') summary.queued = (summary.queued as number) + 1;
      else if (f.planned_status === 'draft') summary.draft_held = (summary.draft_held as number) + 1;
      else if (f.planned_status === 'removed') summary.removed = (summary.removed as number) + 1;
    }

    // ── report ─────────────────────────────────
    log('PLAN', `=== ${args.dryRun ? 'DRY-RUN' : 'REAL'} plan (${allFindings.length} rows) ===`);
    log(
      'PLAN',
      '   idx | kind    | row / doc                                         | score | identity_source     | -> status',
    );
    log(
      'PLAN',
      '  -----+---------+---------------------------------------------------+-------+---------------------+---------------',
    );
    for (let i = 0; i < allFindings.length; i++) {
      const f = allFindings[i];
      const c = f.community;
      const kind = f.isRefresh ? 'refresh' : 'new';
      const label = c.slug || c.canonical_name || `doc:${c.state_entity_number ?? '(unknown)'}`;
      const idSrc = f.identity_source ?? '(unset)';
      const target = f.planned_status ?? '(no change)';
      log(
        'PLAN',
        `  ${String(i + 1).padStart(4)} | ${kind.padEnd(7)} | ${label.slice(0, 49).padEnd(49)} | ${String(f.score).padStart(5)} | ${idSrc.slice(0, 19).padEnd(19)} | ${target}`,
      );
    }
    log('PLAN', '  ---- per-row detail ----');
    for (let i = 0; i < allFindings.length; i++) {
      const f = allFindings[i];
      const c = f.community;
      const label = c.slug || c.canonical_name || `doc:${c.state_entity_number ?? '(unknown)'}`;
      log(
        'PLAN',
        `  [${i + 1}] ${label} — breakdown=${JSON.stringify(f.score_breakdown)} updates=${Object.keys(f.planned_updates).join(',')}`,
      );
      for (const n of f.notes) log('PLAN', `      ${n}`);
      for (const cl of f.planned_change_log)
        log('PLAN', `      change_log: ${JSON.stringify(cl)}`);
    }

    // ── apply (real run only) ─────────────────
    if (!args.dryRun) {
      for (const f of allFindings) {
        if (Object.keys(f.planned_updates).length === 0) continue;
        await applyWrites(sb, f);
      }
    }

    summary.duration_seconds = Math.round((Date.now() - START) / 1000);
    await endJobRun(sb, RUN_ID, 'success', summary);
    log('INFO', `done in ${summary.duration_seconds}s`);
  } catch (err) {
    const stack = (err as Error).stack ?? String(err);
    log('ERROR', stack);
    await endJobRun(sb, RUN_ID, 'failed', { error: stack.slice(0, 2000) });
    process.exit(1);
  }
}

void main();
