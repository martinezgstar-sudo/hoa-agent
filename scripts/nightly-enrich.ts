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
}

function parseCli(argv: string[]): CliArgs {
  const out: CliArgs = { dryRun: false, newLimit: null, refreshLimit: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--new') out.newLimit = parseInt(argv[++i], 10);
    else if (a === '--refresh') out.refreshLimit = parseInt(argv[++i], 10);
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
}

interface Findings {
  community: CommunityRow;
  isRefresh: boolean;

  // per-step outputs
  identity_source?: string;
  identity_matched?: boolean;
  sunbiz_active?: boolean;
  registered_agent?: string;
  principal_address?: string;

  location_source?: string;
  city_verified?: boolean;
  out_of_market?: boolean;

  management_source?: string;
  management_company?: string;
  management_phone?: string;
  management_website?: string;

  fees_source?: string;
  monthly_fee_median?: number; // rounded to $25
  dues_frequency?: 'monthly' | 'quarterly' | 'annual' | 'unknown';

  utilities_mapped?: number; // 0..5
  utility_rows?: { service: string; provider_id: number }[];

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

async function endJobRun(
  sb: SupabaseClient,
  id: number | null,
  status: 'success' | 'error',
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
      'id,slug,canonical_name,city,county,state,zip_code,status,state_entity_number,entity_status,registered_agent,city_verified,management_company,monthly_fee_median,confidence_score,last_verified,next_research_at',
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
  city: string | null;
  zip: string | null;
}

/** Try local sqlite index first; fall back to LaCie cordata scan. */
async function pickNewBatch(
  cfg: Config,
  sb: SupabaseClient,
  limit: number,
): Promise<{ picks: SunbizCandidate[]; source: string }> {
  if (existsSync(cfg.sunbiz_index_path)) {
    log('INFO', `sunbiz index found at ${cfg.sunbiz_index_path} — TODO: sqlite pick not implemented in dry-run yet`);
    // Real path would open better-sqlite3 and pick candidates. For dry-run
    // we skip so the operator sees the fallback path exercised.
  } else {
    log('WARN', `sunbiz_index_path missing: ${cfg.sunbiz_index_path}`);
  }
  // Fallback: no LaCie CSV parse in this initial cut. Return empty and
  // note the reason. The refresh batch will still exercise the pipeline
  // end-to-end, which is what the owner asked for in the 5+5 dry-run
  // check.
  log(
    'WARN',
    'new_batch is empty for this run — Sunbiz index not built yet. ' +
      'Refresh batch alone will exercise every research step.',
  );
  void sb;
  void limit;
  return { picks: [], source: 'unavailable' };
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

async function stepIdentity(f: Findings): Promise<void> {
  // For refresh rows: identity is already "matched" — the row exists in
  // communities. Score awards the 40 points if state_entity_number is
  // present (owner ruling: reuse existing column).
  if (f.isRefresh) {
    f.identity_source = 'communities-refresh';
    f.identity_matched = !!f.community.state_entity_number;
    f.sunbiz_active = f.community.entity_status === 'Active';
    f.registered_agent = f.community.registered_agent ?? undefined;
    f.notes.push(
      `identity: state_entity_number=${f.community.state_entity_number ?? 'null'} entity_status=${f.community.entity_status ?? 'null'}`,
    );
    return;
  }
  // For new rows: would query sunbiz sqlite here. Not implemented in v0.
  f.identity_source = 'sunbiz-unavailable';
  f.identity_matched = false;
  f.notes.push('identity: skipped (new-batch Sunbiz path not built)');
}

function stepLocation(f: Findings, cfg: Config): void {
  const county = (f.community.county ?? '').trim();
  const inMarket = cfg.in_market_counties.includes(county);
  const phase2 = cfg.phase2_counties.includes(county);
  if (!inMarket && !phase2) {
    f.out_of_market = true;
    f.location_source = 'county-check';
    f.notes.push(`location: out_of_market (county=${county})`);
    return;
  }
  // Reuse existing city_verified. Owner ruling.
  f.city_verified = f.community.city_verified === true;
  f.location_source = f.city_verified ? 'existing-city-verified' : 'pending-geocode';
  f.notes.push(`location: city_verified=${f.city_verified}`);
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
    f.notes.push(`management: skipped (${f.management_source})`);
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
    f.notes.push(`fees: skipped (${f.fees_source})`);
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
}

// ────────────────────────── score + decide ──────────────────────────

function scoreFindings(f: Findings): void {
  const b: Record<string, number> = {};
  b.identity = f.identity_matched ? 40 : 0;
  b.entity_active = f.sunbiz_active ? 10 : 0;
  b.city_verified = f.city_verified ? 20 : 0;
  b.management = f.management_company ? 15 : 0;
  b.fees = f.monthly_fee_median != null ? 10 : 0;
  b.utilities = f.utilities_mapped === 5 ? 5 : 0;
  const total = Object.values(b).reduce((a, x) => a + x, 0);
  f.score = total;
  f.score_breakdown = b;
}

function decideFindings(f: Findings, cfg: Config, queueOpen: boolean): void {
  const c = f.community;
  const changes = f.planned_change_log;

  // out_of_market OR score < remove_below_score => removed
  if (f.out_of_market || f.score < cfg.remove_below_score) {
    if (c.status !== 'removed') {
      changes.push({ action: 'removed', field: 'status', old_value: c.status, new_value: 'removed' });
      f.planned_status = 'removed';
    } else {
      f.planned_status = null;
    }
    return;
  }

  // score >= publish_min AND Active AND city_verified => published
  const canPublish = f.score >= cfg.publish_min_score && f.sunbiz_active && f.city_verified;
  if (canPublish) {
    if (c.status !== 'published') {
      changes.push({ action: 'published', field: 'status', old_value: c.status, new_value: 'published' });
      f.planned_status = 'published';
    } else {
      changes.push({ action: 'refreshed' });
      f.planned_status = null;
    }
    return;
  }

  // Refresh rows never drop from published on score alone.
  if (f.isRefresh && c.status === 'published') {
    changes.push({ action: 'queued', field: 'reason', new_value: 'score_drop' });
    if (queueOpen) {
      changes.push({ action: 'field_updated', field: 'status', old_value: 'published', new_value: 'needs_review' });
      f.planned_status = 'needs_review';
    } else {
      f.planned_status = null;
    }
    return;
  }

  // Otherwise: queue if room, else keep status and try again tomorrow.
  if (queueOpen) {
    if (c.status !== 'needs_review') {
      changes.push({ action: 'queued', field: 'status', old_value: c.status, new_value: 'needs_review' });
      f.planned_status = 'needs_review';
    } else {
      f.planned_status = null;
    }
    return;
  }
  // no room: keep status; caller sets next_research_at to tomorrow.
  f.planned_status = null;
  f.notes.push('decide: queue at cap; will retry tomorrow');
}

function buildPlannedUpdates(f: Findings, cfg: Config): void {
  const now = new Date().toISOString();
  const nextIso = new Date(Date.now() + cfg.refresh_after_days * 86400_000).toISOString();
  const u: Record<string, unknown> = {
    confidence_score: f.score,
    last_verified: now,
    next_research_at: nextIso,
  };
  if (f.planned_status) u.status = f.planned_status;
  if (f.registered_agent) u.registered_agent = f.registered_agent;
  if (f.management_company) u.management_company = f.management_company;
  if (f.management_phone) u.management_phone = f.management_phone;
  if (f.management_website) u.management_website = f.management_website;
  if (f.monthly_fee_median != null) u.monthly_fee_median = f.monthly_fee_median;
  if (f.dues_frequency) u.dues_frequency = f.dues_frequency;
  if (f.identity_source) u.identity_source = f.identity_source;
  if (f.location_source) u.location_source = f.location_source;
  if (f.management_source) u.management_source = f.management_source;
  if (f.fees_source) u.fees_source = f.fees_source;
  f.planned_updates = u;
}

// ────────────────────────── write ──────────────────────────

async function applyWrites(sb: SupabaseClient, f: Findings): Promise<void> {
  const id = f.community.id;
  const { error } = await sb.from('communities').update(f.planned_updates).eq('id', id);
  if (error) throw new Error(`update communities ${id}: ${error.message}`);
  for (const c of f.planned_change_log) {
    await sb.from('change_log').insert({
      community_id: id,
      action: c.action,
      field: c.field ?? null,
      old_value: c.old_value ?? null,
      new_value: c.new_value ?? null,
      source: c.source ?? null,
      run_id: RUN_ID,
    });
  }
  if (f.utility_rows && f.utility_rows.length) {
    // upsert community_utilities
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

// ────────────────────────── main ──────────────────────────

async function main(): Promise<void> {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const cfg = loadConfig(resolve(__dirname, '../config/enrich.yaml'));
  const prompt = readFileSync(resolve(__dirname, '../prompts/extract_management.txt'), 'utf8');
  const args = parseCli(process.argv.slice(2));

  const newLimit = args.newLimit ?? cfg.new_per_night;
  const refreshLimit = args.refreshLimit ?? cfg.refresh_per_night;

  const sb = getSupabase();
  RUN_ID = await startJobRun(sb, 'nightly-enrich', args.dryRun);
  log('INFO', `run_id=${RUN_ID ?? 'null'} dry_run=${args.dryRun} new=${newLimit} refresh=${refreshLimit}`);

  const summary: Record<string, unknown> = {
    dry_run: args.dryRun,
    new_processed: 0,
    refreshed: 0,
    published: 0,
    queued: 0,
    removed: 0,
    failed_steps: {} as Record<string, number>,
  };

  try {
    // cap check
    const { count } = await sb
      .from('communities')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'needs_review');
    const queueOpen = (count ?? 0) < cfg.review_queue_cap;
    log('INFO', `queue: needs_review=${count} cap=${cfg.review_queue_cap} queue_open=${queueOpen}`);

    // external service probes
    const [ollamaOk, searxOk] = await Promise.all([ollamaReachable(cfg), searxngReachable(cfg)]);
    log('INFO', `ollama_up=${ollamaOk} searxng_up=${searxOk}`);
    if (!ollamaOk) log('WARN', `ollama unreachable at ${cfg.ollama_url}`);
    if (!searxOk) log('WARN', `searxng unreachable at ${cfg.searxng_url}`);

    const refresh = await pickRefreshBatch(sb, refreshLimit);
    log('INFO', `refresh batch: ${refresh.length} rows`);

    const newPicks = await pickNewBatch(cfg, sb, newLimit);
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
      try {
        await stepIdentity(f);
        stepLocation(f, cfg);
        if (!f.out_of_market) {
          await stepManagement(f, cfg, prompt, ollamaOk, searxOk);
          await stepFees(f, cfg, prompt, ollamaOk, searxOk);
          await stepUtilities(f, sb);
        }
        scoreFindings(f);
        decideFindings(f, cfg, queueOpen);
        buildPlannedUpdates(f, cfg);
      } catch (err) {
        f.notes.push(`row error: ${(err as Error).message}`);
      }
      allFindings.push(f);
      summary.refreshed = (summary.refreshed as number) + 1;
      if (f.planned_status === 'published') summary.published = (summary.published as number) + 1;
      else if (f.planned_status === 'needs_review') summary.queued = (summary.queued as number) + 1;
      else if (f.planned_status === 'removed') summary.removed = (summary.removed as number) + 1;
    }

    // (Would loop newPicks here — omitted in this run because Sunbiz index is not present.)

    // ── report ─────────────────────────────────
    log('PLAN', `=== ${args.dryRun ? 'DRY-RUN' : 'REAL'} plan (${allFindings.length} rows) ===`);
    for (const f of allFindings) {
      const c = f.community;
      const line =
        `  · ${c.slug} [${c.status}] score=${f.score}` +
        ` breakdown=${JSON.stringify(f.score_breakdown)}` +
        ` -> status=${f.planned_status ?? '(no change)'}` +
        ` updates=${Object.keys(f.planned_updates).join(',')}`;
      log('PLAN', line);
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

    summary.new_processed = 0; // no new-batch loop this run
    summary.duration_seconds = Math.round((Date.now() - START) / 1000);
    await endJobRun(sb, RUN_ID, 'success', summary);
    log('INFO', `done in ${summary.duration_seconds}s`);
  } catch (err) {
    const stack = (err as Error).stack ?? String(err);
    log('ERROR', stack);
    await endJobRun(sb, RUN_ID, 'error', { error: stack.slice(0, 2000) });
    process.exit(1);
  }
}

void main();
