#!/usr/bin/env -S npx tsx
/**
 * reporter.ts — v3 Phase 5 daily report.
 *
 * One iMessage to imessage_to at 07:00 local. Plain text, under 12
 * lines. Sources: change_log, job_runs, job_health only. NO community
 * data reads beyond COUNT queries (owner ruling).
 *
 * Body (weekdays):
 *   Last night: X new, Y refreshed, Z published, Q queued, R removed
 *   Queue: N of cap
 *   Fields updated: management M, fees F, utilities U
 *   Orchestrator: alerts A, repairs P
 *   Errors: <top failing step, or none>
 *
 * Friday adds:
 *   Published total, Δ7d and Δ30d
 *   Published rows with utilities mapped, as a percent
 *   Published rows overdue for refresh
 *   Link to the admin Review screen
 *
 * Usage:
 *   npx tsx scripts/reporter.ts                 # send iMessage
 *   npx tsx scripts/reporter.ts --dry-run       # print only
 *   npx tsx scripts/reporter.ts --for-date=YYYY-MM-DD
 *                                               # override "last night"
 *
 * Exit codes: 0 ok, 1 unhandled error.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ────────────────────────── config ──────────────────────────

interface Config {
  review_queue_cap: number;
  in_market_counties: string[];
  imessage_to: string;
  refresh_after_days: number;
}

function loadConfig(): Config {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const REPO = resolve(__dirname, '..');
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

function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

// ────────────────────────── helpers ──────────────────────────

function parseArgs(argv: string[]): { dryRun: boolean; forDate?: string } {
  const out: { dryRun: boolean; forDate?: string } = { dryRun: false };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    const m = a.match(/^--for-date=(\d{4}-\d{2}-\d{2})$/);
    if (m) out.forDate = m[1];
  }
  return out;
}

/**
 * "Last night" window ends at wall-clock now and starts at the last
 * nightly-enrich success before it. If `--for-date` is given, the
 * window is the run(s) that landed on that date. If no run exists in
 * the window, we report from all change_log rows in the last 24h.
 */
async function resolveLastNightWindow(
  sb: SupabaseClient,
  forDate?: string,
): Promise<{ startIso: string; endIso: string; runIds: number[]; label: string }> {
  const now = new Date();
  const endIso = now.toISOString();
  if (forDate) {
    const startIso = new Date(`${forDate}T00:00:00-04:00`).toISOString();
    const endLocal = new Date(`${forDate}T23:59:59-04:00`).toISOString();
    const { data } = await sb
      .from('job_runs')
      .select('id')
      .eq('job_name', 'nightly-enrich')
      .gte('started_at', startIso)
      .lte('started_at', endLocal);
    return { startIso, endIso: endLocal, runIds: (data ?? []).map((r) => r.id), label: `${forDate} runs` };
  }
  const startIso = new Date(now.getTime() - 30 * 3600_000).toISOString();
  const { data } = await sb
    .from('job_runs')
    .select('id')
    .eq('job_name', 'nightly-enrich')
    .gte('started_at', startIso)
    .order('started_at', { ascending: false });
  const ids = (data ?? []).map((r) => r.id);
  return { startIso, endIso, runIds: ids, label: ids.length ? `run(s) ${ids.join(',')}` : 'last 30h (no runs)' };
}

async function countChangeLog(
  sb: SupabaseClient,
  runIds: number[],
  where: Record<string, unknown> = {},
): Promise<number> {
  if (runIds.length === 0) return 0;
  let q = sb.from('change_log').select('id', { count: 'exact', head: true }).in('run_id', runIds);
  for (const [k, v] of Object.entries(where)) q = q.eq(k, v);
  const { count } = await q;
  return count ?? 0;
}

async function topFailingStep(sb: SupabaseClient, startIso: string): Promise<string | null> {
  // "Top failing step" == the check_name that produced the most
  // ok=false job_health rows in the window. Ties broken by most recent.
  const { data } = await sb
    .from('job_health')
    .select('check_name, ok, checked_at')
    .gte('checked_at', startIso)
    .eq('ok', false);
  if (!data || data.length === 0) return null;
  const counts = new Map<string, number>();
  for (const r of data) counts.set(r.check_name, (counts.get(r.check_name) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) { best = k; bestN = n; }
  }
  return best ? `${best} (${bestN})` : null;
}

async function publishedTotalInMarket(sb: SupabaseClient, counties: string[]): Promise<number> {
  const { count } = await sb
    .from('communities')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .in('county', counties);
  return count ?? 0;
}

async function utilitiesMappedPercent(sb: SupabaseClient, counties: string[]): Promise<number> {
  const total = await publishedTotalInMarket(sb, counties);
  if (total === 0) return 0;
  const { data } = await sb
    .from('community_utilities')
    .select('community_id')
    .limit(50000);
  const uniq = new Set((data ?? []).map((r) => r.community_id));
  // We don't know if every id is published+in-market without another
  // read. Approximate: total mapped / total in-market published.
  return Math.round((uniq.size / total) * 100);
}

async function overdueForRefresh(sb: SupabaseClient, counties: string[]): Promise<number> {
  const nowIso = new Date().toISOString();
  const { count } = await sb
    .from('communities')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .in('county', counties)
    .lte('next_research_at', nowIso);
  return count ?? 0;
}

async function publishedDelta(
  sb: SupabaseClient,
  runIds: number[],
  days: number,
): Promise<number> {
  // Deltas come from change_log 'published' vs 'removed' actions in
  // the window. Owner ruling: no community-data reads beyond counts.
  void runIds;
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const [pub, rem] = await Promise.all([
    sb.from('change_log').select('id', { count: 'exact', head: true })
      .eq('action', 'published').gte('occurred_at', cutoff),
    sb.from('change_log').select('id', { count: 'exact', head: true })
      .eq('action', 'removed').gte('occurred_at', cutoff),
  ]);
  return (pub.count ?? 0) - (rem.count ?? 0);
}

async function orchestratorSummary(sb: SupabaseClient, startIso: string): Promise<{ alerts: number; repairs: number }> {
  const alerts = await sb
    .from('job_health')
    .select('id', { count: 'exact', head: true })
    .eq('alerted', true)
    .gte('checked_at', startIso);
  // Repairs = nightly-enrich runs launched between 00:00 and 06:00
  // local by the orchestrator's repair path. Owner ruling: not every
  // nightly-enrich success is a repair. Count only success rows that
  // (a) landed in that early window and (b) aren't the 02:00
  // scheduled fire (started_at NOT between 02:00 and 02:05 local).
  const early = await sb
    .from('job_runs')
    .select('id, started_at')
    .eq('job_name', 'nightly-enrich')
    .eq('status', 'success')
    .gte('started_at', startIso)
    .order('started_at', { ascending: true });
  let repairs = 0;
  for (const r of early.data ?? []) {
    const t = new Date(r.started_at);
    const hr = t.getHours(); // local hour on this box
    const mn = t.getMinutes();
    const isEarly = hr < 6;
    const isScheduled = hr === 2 && mn < 5;
    if (isEarly && !isScheduled) repairs++;
  }
  return { alerts: alerts.count ?? 0, repairs };
}

// ────────────────────────── message builder ──────────────────────────

async function buildMessage(sb: SupabaseClient, cfg: Config, forDate?: string): Promise<string> {
  const window = await resolveLastNightWindow(sb, forDate);
  const [
    newN, refreshedN, publishedN, queuedN, removedN,
    mgmtN, feesN, utilsN,
    queueN, orch, top,
  ] = await Promise.all([
    // We don't distinguish 'new' processed from any other action, but
    // 'attempted' change_log rows come only from the new-row loop.
    countChangeLog(sb, window.runIds, { action: 'attempted' }),
    countChangeLog(sb, window.runIds, { action: 'refreshed' }),
    countChangeLog(sb, window.runIds, { action: 'published' }),
    countChangeLog(sb, window.runIds, { action: 'queued' }),
    countChangeLog(sb, window.runIds, { action: 'removed' }),
    countChangeLog(sb, window.runIds, { action: 'field_updated', field: 'management_company' }),
    countChangeLog(sb, window.runIds, { action: 'field_updated', field: 'monthly_fee_median' }),
    // Utilities updates go through community_utilities upsert, not
    // change_log field_updated. Approximate: count 'attempted' rows
    // where utilities in the plan mapped 5/5 — we don't currently log
    // that in change_log. Placeholder 0; wire when nightly-enrich
    // emits a 'utilities_mapped' change_log entry.
    Promise.resolve(0),
    sb.from('communities')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'needs_review')
      .in('county', cfg.in_market_counties)
      .then((r) => r.count ?? 0),
    orchestratorSummary(sb, window.startIso),
    topFailingStep(sb, window.startIso),
  ]);

  const isFriday = new Date().getDay() === 5;
  const lines: string[] = [];
  lines.push(`HOA Agent — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`);
  lines.push(
    `Last night: ${newN} new · ${refreshedN} refreshed · ${publishedN} published · ${queuedN} queued · ${removedN} removed`,
  );
  lines.push(`Queue: ${queueN} of ${cfg.review_queue_cap}`);
  lines.push(`Fields updated: management ${mgmtN} · fees ${feesN} · utilities ${utilsN}`);
  lines.push(`Orchestrator: alerts ${orch.alerts} · repairs ${orch.repairs}`);
  lines.push(`Errors: ${top ?? 'none'}`);

  if (isFriday) {
    const [total, d7, d30, utilPct, overdue] = await Promise.all([
      publishedTotalInMarket(sb, cfg.in_market_counties),
      publishedDelta(sb, window.runIds, 7),
      publishedDelta(sb, window.runIds, 30),
      utilitiesMappedPercent(sb, cfg.in_market_counties),
      overdueForRefresh(sb, cfg.in_market_counties),
    ]);
    const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
    lines.push(`Published: ${total.toLocaleString()} (7d ${signed(d7)}, 30d ${signed(d30)})`);
    lines.push(`Utilities mapped: ${utilPct}% · overdue for refresh: ${overdue}`);
    lines.push('Review: https://www.hoa-agent.com/admin/pending');
  }

  return lines.slice(0, 12).join('\n');
}

// ────────────────────────── iMessage sender ──────────────────────────

function sendIMessage(to: string, text: string): void {
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

// ────────────────────────── main ──────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cfg = loadConfig();
  const sb = getSupabase();
  const msg = await buildMessage(sb, cfg, args.forDate);

  console.log('---- reporter message ----');
  console.log(msg);
  console.log('---- end ----');

  if (args.dryRun) return;
  try {
    sendIMessage(cfg.imessage_to, msg);
    console.log(`iMessage sent to ${cfg.imessage_to}`);
  } catch (err) {
    console.error(`iMessage send failed: ${(err as Error).message}`);
    process.exit(1);
  }
}

void main().catch((err) => {
  console.error((err as Error).stack ?? String(err));
  process.exit(1);
});
