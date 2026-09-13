#!/usr/bin/env -S npx tsx
/**
 * check-anon-matrix.ts — v3 Phase 6 access-rule proof.
 *
 * With the anon publishable key (NEVER service-role): SELECT id from
 * every public table (limit 1) and CALL the three functions the owner
 * flagged. Print a matrix showing what returned rows / errored. Owner
 * ruling 2026-09-12: only these tables may return rows via anon —
 *
 *   communities            (SELECT WHERE status='published')
 *   community_utilities    (SELECT)
 *   utility_providers      (SELECT)
 *   community_comments     (SELECT WHERE status='approved')
 *
 * suggestions and fee_observations should REJECT anon SELECT after
 * the migration (INSERT stays open — this probe does not test INSERT).
 * All three RPCs (reporting_summary, complete_community, exec_sql)
 * should be denied.
 *
 * Usage: npx tsx scripts/check-anon-matrix.ts
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

// Every table listed in the pg_tables survey. Kept explicit so a new
// table in a future migration must be added here and reviewed.
const TABLES = [
  'ad_analytics','ad_categories','ad_events','ad_generation_sessions',
  'admin_login_attempts','advertiser_ads','advertiser_profiles',
  'advertiser_zip_categories','advertisers','agent_activity',
  'agent_deliverables','agent_review_queue_deprecated','agent_status',
  'assessment_signals','change_log','communities','community_comments',
  'community_research_log','community_suggestions_deprecated',
  'community_utilities','cron_runs','csp_reports','drafts',
  'fee_observations','job_health','job_runs','pending_community_data',
  'pending_fee_observations','research_stats','reviews',
  'social_autopilot_log','social_card_config','social_card_images',
  'social_queue','suggestions','utility_providers',
];

// Tables owner authorised for anon SELECT after the migration. All
// others should return 0 rows OR a policy-violation error.
const EXPECTED_ANON_READ: Record<string, string> = {
  communities:         'SELECT WHERE status=published',
  community_utilities: 'SELECT',
  utility_providers:   'SELECT',
  community_comments:  'SELECT WHERE status=approved',
};

interface Result { table: string; rows: number | null; error: string | null; expected: string }

async function probeTable(t: string): Promise<Result> {
  const { data, error } = await sb.from(t).select('*', { count: 'exact', head: false }).limit(1);
  return {
    table:    t,
    rows:     data ? data.length : null,
    error:    error ? error.message : null,
    expected: EXPECTED_ANON_READ[t] ?? 'DENY',
  };
}

async function probeRpc(name: string, args: Record<string, unknown> = {}): Promise<{ name: string; ok: boolean; error: string | null }> {
  const { error } = await sb.rpc(name, args);
  return { name, ok: !error, error: error ? error.message : null };
}

function pad(s: string, n: number): string { return (s + ' '.repeat(n)).slice(0, n) }

async function main() {
  console.log('');
  console.log('=== anon access matrix — tables ===');
  console.log(pad('table', 34) + '| ' + pad('rows', 6) + '| ' + pad('expected', 30) + '| status');
  console.log('-'.repeat(90));

  const results: Result[] = [];
  for (const t of TABLES) results.push(await probeTable(t));

  let violations = 0;
  for (const r of results) {
    const gotRows = r.rows != null && r.rows > 0;
    const denied  = r.error != null;
    const allowed = EXPECTED_ANON_READ[r.table] != null;
    let verdict: string;
    if (allowed) {
      // Anon-read allowed: rows OK, error is a mismatch.
      verdict = denied ? 'FAIL (denied but expected read)' : 'ok';
      if (denied) violations += 1;
    } else {
      // Anon-read NOT allowed: error OR 0 rows both count as "denied".
      verdict = gotRows ? 'LEAK (returned rows)' : 'ok';
      if (gotRows) violations += 1;
    }
    console.log(
      pad(r.table, 34) + '| ' +
      pad(String(r.rows ?? '—'), 6) + '| ' +
      pad(r.expected, 30) + '| ' +
      verdict + (r.error ? ` (${r.error.slice(0, 40)})` : '')
    );
  }

  console.log('');
  console.log('=== anon access matrix — functions ===');
  console.log(pad('function', 30) + '| status');
  console.log('-'.repeat(60));
  const rpcs = [
    { name: 'reporting_summary',  args: { tok: 'probe' } },
    { name: 'complete_community', args: { p_id: '00000000-0000-0000-0000-000000000000', p_status: 'published', p_score: 0, p_notes: {} } },
    { name: 'exec_sql',           args: { sql: 'select 1', returns_rows: false } },
  ];
  let rpcOk = 0;
  for (const r of rpcs) {
    const res = await probeRpc(r.name, r.args);
    const verdict = res.ok ? 'ALLOW (SHOULD DENY)' : 'denied (ok)';
    if (res.ok) rpcOk += 1;
    console.log(pad(r.name, 30) + '| ' + verdict + (res.error ? ` (${res.error.slice(0, 40)})` : ''));
  }

  console.log('');
  console.log(`SUMMARY: ${violations} table violation(s), ${rpcOk} function ALLOW result(s) (should be 0 for both).`);
  process.exit(violations + rpcOk > 0 ? 1 : 0);
}

void main();
