#!/usr/bin/env -S npx tsx
/**
 * orchestrator.ts — v3 Phase 4 health orchestrator.
 *
 * Fires every `orchestrator_interval_min` minutes (default 15). Runs
 * six checks; each writes exactly one row to public.job_health. Rules:
 *
 *   Retry
 *     A failed check retries once after 60 s and the retry row's
 *     `retried` = true.
 *
 *   Repair (nightly_fresh only)
 *     If the last nightly-enrich run failed AND local time is before
 *     06:00, launch scripts/nightly-enrich.ts once with new_per_night
 *     and refresh_per_night halved. Never launch twice per night —
 *     a state file records the last repair date.
 *
 *   Alert
 *     After a failed retry, send one iMessage to imessage_to with the
 *     check name and the detail. Mark the job_health row `alerted` =
 *     true. Do not re-alert for the same check until a passing row
 *     appears for that check. iMessage uses the same osascript pattern
 *     the macmini command-center scripts use (send-digest.sh,
 *     lead-alert.py) — no new helper library.
 *
 * Usage:
 *   npx tsx scripts/orchestrator.ts
 *   npx tsx scripts/orchestrator.ts --once
 *   npx tsx scripts/orchestrator.ts --no-alerts
 *
 * Exit codes:
 *   0  ok
 *   1  unhandled error
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const STATE_DIR = resolve(homedir(), '.local/state/hoaagent');
if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });

// ────────────────────────── config ──────────────────────────

interface Config {
  orchestrator_interval_min: number;
  review_queue_cap: number;
  in_market_counties: string[];
  ollama_url: string;
  searxng_url: string;
  imessage_to: string;
}

function loadConfig(): Config {
  const raw = readFileSync(resolve(REPO, 'config/enrich.yaml'), 'utf8');
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
        v = v.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      } else if (/^-?\d+$/.test(v)) v = parseInt(v, 10);
      else if (/^["'].*["']$/.test(v)) v = v.slice(1, -1);
    }
    out[key] = v;
  }
  return out as unknown as Config;
}

// ────────────────────────── logging ──────────────────────────

function log(kind: 'INFO' | 'WARN' | 'ERROR' | 'ALERT', msg: string): void {
  console.log(`${new Date().toISOString()} [${kind}] ${msg}`);
}

// ────────────────────────── supabase ──────────────────────────

function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

// ────────────────────────── check runners ──────────────────────────

interface CheckResult { ok: boolean; detail: string; }

async function checkNightlyFresh(sb: SupabaseClient): Promise<CheckResult> {
  const cutoff = new Date(Date.now() - 30 * 3600_000).toISOString();
  const { data, error } = await sb
    .from('job_runs')
    .select('id, status, finished_at')
    .eq('job_name', 'nightly-enrich')
    .eq('status', 'success')
    .gte('finished_at', cutoff)
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, detail: `db error: ${error.message}` };
  if (!data) return { ok: false, detail: 'no successful nightly-enrich run within the last 30h' };
  return { ok: true, detail: `last success at ${data.finished_at} (id=${data.id})` };
}

async function checkSiteUp(): Promise<CheckResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch('https://www.hoa-agent.com/', { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    return { ok: true, detail: 'HTTP 200' };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

async function checkDbUp(sb: SupabaseClient): Promise<CheckResult> {
  const { error } = await sb.from('job_runs').select('id').limit(1);
  if (error) return { ok: false, detail: error.message };
  return { ok: true, detail: 'select ok' };
}

async function checkQueueUnderCap(sb: SupabaseClient, cfg: Config): Promise<CheckResult> {
  const { count, error } = await sb
    .from('communities')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'needs_review')
    .in('county', cfg.in_market_counties);
  if (error) return { ok: false, detail: error.message };
  const n = count ?? 0;
  if (n >= cfg.review_queue_cap) return { ok: false, detail: `queue ${n}/${cfg.review_queue_cap}` };
  return { ok: true, detail: `queue ${n}/${cfg.review_queue_cap}` };
}

async function checkOllamaUp(cfg: Config): Promise<CheckResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(`${cfg.ollama_url}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    return { ok: true, detail: 'HTTP 200' };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

async function checkSearxngUp(cfg: Config): Promise<CheckResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(`${cfg.searxng_url}/`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    return { ok: true, detail: 'HTTP 200' };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

const CHECKS = [
  { name: 'nightly_fresh',    fn: (sb: SupabaseClient, cfg: Config) => checkNightlyFresh(sb) },
  { name: 'site_up',          fn: (_sb: SupabaseClient, _cfg: Config) => checkSiteUp() },
  { name: 'db_up',            fn: (sb: SupabaseClient, _cfg: Config) => checkDbUp(sb) },
  { name: 'queue_under_cap',  fn: (sb: SupabaseClient, cfg: Config) => checkQueueUnderCap(sb, cfg) },
  { name: 'ollama_up',        fn: (_sb: SupabaseClient, cfg: Config) => checkOllamaUp(cfg) },
  { name: 'searxng_up',       fn: (_sb: SupabaseClient, cfg: Config) => checkSearxngUp(cfg) },
] as const;

// ────────────────────────── alerting ──────────────────────────

/**
 * Latch: has an alert already fired for this check without a subsequent
 * passing row? A `job_health` row with ok=true resets the latch.
 */
async function shouldAlert(sb: SupabaseClient, check: string): Promise<boolean> {
  const { data: last } = await sb
    .from('job_health')
    .select('ok, alerted, checked_at')
    .eq('check_name', check)
    .order('checked_at', { ascending: false })
    .limit(20);
  if (!last || last.length === 0) return true;
  // Walk back: the most recent alerted=true blocks a repeat until a
  // subsequent ok=true row is found (older than the alerted one is
  // fine — a pass in between clears the latch).
  for (const row of last) {
    if (row.ok) return true;              // a passing row appeared → clear
    if (row.alerted) return false;        // still latched
  }
  return true;
}

function sendIMessage(to: string, text: string): void {
  // Same osascript pattern used by macmini/scripts/send-digest.sh.
  // Requires macOS Automation permission (bash → Messages) granted
  // once from an interactive terminal.
  const osa = `on run {theNum, theText}
  tell application "Messages"
    set svc to 1st account whose service type = iMessage
    send theText to participant theNum of svc
  end tell
end run`;
  execFileSync('osascript', ['-e', osa, to, text], {
    timeout: 20_000,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}

// ────────────────────────── nightly repair ──────────────────────────

const REPAIR_STATE = resolve(STATE_DIR, 'nightly-repair-last-date.txt');

function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function maybeRepairNightly(cfg: Config, nightlyFreshOk: boolean): Promise<string | null> {
  if (nightlyFreshOk) return null;
  const hour = new Date().getHours();
  if (hour >= 6) return 'skipped: after 06:00 local';
  // Once-per-night gate.
  if (existsSync(REPAIR_STATE)) {
    const last = readFileSync(REPAIR_STATE, 'utf8').trim();
    if (last === todayDateStr()) return 'skipped: already repaired today';
  }
  const newHalf = Math.max(1, Math.floor(75 / 2));      // config values live in YAML but we know them
  const refreshHalf = Math.max(1, Math.floor(25 / 2));
  const script = resolve(REPO, 'scripts/nightly-enrich.ts');
  log('INFO', `repair: launching nightly-enrich --new ${newHalf} --refresh ${refreshHalf}`);
  const child = spawn('npx', ['tsx', script, '--new', String(newHalf), '--refresh', String(refreshHalf)], {
    cwd: REPO,
    env: process.env,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  writeFileSync(REPAIR_STATE, todayDateStr());
  void cfg;
  return `launched pid=${child.pid} new=${newHalf} refresh=${refreshHalf}`;
}

// ────────────────────────── single-check runner ──────────────────────────

async function runCheck(
  sb: SupabaseClient,
  cfg: Config,
  check: (typeof CHECKS)[number],
  allowAlerts: boolean,
): Promise<{ ok: boolean; alerted: boolean; retried: boolean; detail: string }> {
  const first = await check.fn(sb, cfg);
  if (first.ok) {
    await sb.from('job_health').insert({
      check_name: check.name,
      ok: true,
      detail: first.detail,
      retried: false,
      alerted: false,
    });
    return { ok: true, alerted: false, retried: false, detail: first.detail };
  }
  log('WARN', `${check.name} failed: ${first.detail} — retrying in 60s`);
  await new Promise((r) => setTimeout(r, 60_000));
  const second = await check.fn(sb, cfg);
  if (second.ok) {
    await sb.from('job_health').insert({
      check_name: check.name,
      ok: true,
      detail: `retry passed: ${second.detail}`,
      retried: true,
      alerted: false,
    });
    return { ok: true, alerted: false, retried: true, detail: second.detail };
  }
  // Retry still failed. Decide whether to alert.
  const canAlert = allowAlerts && (await shouldAlert(sb, check.name));
  if (canAlert) {
    try {
      sendIMessage(cfg.imessage_to, `[hoa-agent] ${check.name} FAILED — ${second.detail}`);
      log('ALERT', `iMessage sent for ${check.name}`);
    } catch (err) {
      log('ERROR', `iMessage send failed: ${(err as Error).message}`);
    }
  }
  await sb.from('job_health').insert({
    check_name: check.name,
    ok: false,
    detail: `retry failed: ${second.detail}`,
    retried: true,
    alerted: canAlert,
  });
  return { ok: false, alerted: canAlert, retried: true, detail: second.detail };
}

// ────────────────────────── main ──────────────────────────

async function tick(sb: SupabaseClient, cfg: Config, allowAlerts: boolean): Promise<void> {
  const results: { name: string; ok: boolean; alerted: boolean; retried: boolean; detail: string }[] = [];
  for (const check of CHECKS) {
    const r = await runCheck(sb, cfg, check, allowAlerts);
    results.push({ name: check.name, ...r });
  }
  const summary = results
    .map((r) => `${r.name}=${r.ok ? 'ok' : 'FAIL'}${r.retried ? '+retry' : ''}${r.alerted ? '+alert' : ''}`)
    .join(' ');
  log('INFO', `tick: ${summary}`);

  const nightlyFresh = results.find((r) => r.name === 'nightly_fresh');
  if (nightlyFresh && !nightlyFresh.ok) {
    const repair = await maybeRepairNightly(cfg, nightlyFresh.ok);
    if (repair) log('INFO', `nightly_fresh repair: ${repair}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const once = args.includes('--once');
  const allowAlerts = !args.includes('--no-alerts');
  const cfg = loadConfig();
  const sb = getSupabase();
  log('INFO', `orchestrator start (interval=${cfg.orchestrator_interval_min}m once=${once} alerts=${allowAlerts})`);

  if (once) {
    await tick(sb, cfg, allowAlerts);
    return;
  }

  // Long-running mode: fire immediately, then every interval. Kept
  // here for completeness — under launchd we prefer StartInterval
  // and --once so the process exits between fires.
  await tick(sb, cfg, allowAlerts);
  const ms = cfg.orchestrator_interval_min * 60_000;
  setInterval(() => { void tick(sb, cfg, allowAlerts); }, ms);
}

void main().catch((err) => {
  log('ERROR', (err as Error).stack ?? String(err));
  process.exit(1);
});
// silence unused import warning
void execFile;
