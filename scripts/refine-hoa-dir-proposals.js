// Goal Architect refinement of 3 unrefined hoa-dir captain proposals.
// Run as hoa-goal. Updates title, description, context in-place.

const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });
const { createClient } = require('@supabase/supabase-js');
const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const NOW = new Date().toISOString();

const refinements = [
  // 1. WPB street_address CAMA backfill pilot
  {
    id: '84e59d93-fa93-4efc-8f68-2a9a874c84d2',
    title: 'WPB street_address CAMA pilot — 275 rows, 2-signal CSV, no DB writes',
    description: "West Palm Beach has 275 published rows missing street_address — 25% of the WPB roster and the single largest street-address gap site-wide. Seven of Nine matches canonical_name (and master_hoa_id where present) against LaCie PBC CAMA + Property tables, then proposes street_address values backed by 2 independent signals (CAMA address + Sunbiz registered-agent address agreement, OR CAMA + community website footer). Output is a per-row evidence CSV only — zero DB writes; Tuvok reviews before any UPDATE. If the 2-signal match rate falls below 30%, stop and log the blocker rather than padding with weak matches.",
    context_patch: {
      refined_at: NOW,
      refined_by: 'hoa-goal',
      effort_estimate: '90 min (60 min LaCie match + 30 min CSV build + audit)',
      write_mode: 'csv_only',
      stop_before: 'any communities UPDATE',
      no_db_writes: true,
      precondition_query: "SELECT id, canonical_name, master_hoa_id, zip_code FROM communities WHERE status='published' AND city='West Palm Beach' AND (street_address IS NULL OR street_address='') ORDER BY canonical_name; -- expect 275 rows",
      blocker_handling: "If 2-signal match rate < 30%, halt before writing CSV body and append a blockers section to the CSV header naming the failed signal sources. Do NOT pad with single-signal guesses.",
      output_files: [
        'scripts/output/wpb-street-address-pilot-2026-05-21.csv',
        'scripts/output/wpb-street-address-pilot-2026-05-21-blockers.md'
      ],
      success_criteria: [
        'Precondition query returns ~275 rows (±5%); all are queried against LaCie CAMA + Property tables',
        '≥30% match rate (≥83 of 275 rows) reach 2-signal confidence; below that, stop and write blockers.md',
        "CSV columns: id, canonical_name, proposed_street_address, source_1, source_1_url_or_path, source_2, source_2_url_or_path, confidence_0_to_1, zip_agreement_flag",
        'Every accepted row has source_1 != source_2 (no double-counting one source)',
        'Zero writes to communities.street_address; git diff shows only scripts/output/* changes',
        'Rows where CAMA street ZIP disagrees with stored ZIP are flagged zip_agreement_flag=mismatch for Tuvok',
      ],
      sharpened_success_criteria: "Admiral can hand the CSV to Tuvok and approve UPDATEs row-by-row, confident every accepted row has two independent verifiable sources."
    }
  },

  // 2. monthly_fee_median backfill pilot — 200 rows
  {
    id: 'c58b3b09-4f6a-4cf3-afce-c9e29ad374c2',
    title: 'monthly_fee_median pilot — 200 rows to pending_fee_observations only',
    description: "monthly_fee_median is filled on 106 of 8,007 published rows (1.32%) — the worst critical-field coverage in the DB and the only HOA_PLAN success-criteria field with no active proposal. Seven of Nine runs a 200-row pilot across WPB / Boca Raton / Delray Beach (highest mgmt-data quality), collecting fee_min/median/max from listing sites + community websites, rounding to nearest $25 (CLAUDE.md fee rule), and dropping any source with 3+ exact-$100 multiples (slider-noise filter). All writes go to pending_fee_observations ONLY — never to communities.monthly_fee_*. Snapshot pending_fee_observations before the run. Pilot acceptance/rejection by admin determines scale-up.",
    context_patch: {
      refined_at: NOW,
      refined_by: 'hoa-goal',
      effort_estimate: '120 min (~36 sec/row including verification + slider-noise audit)',
      write_mode: 'pending_fee_observations_only',
      stop_before: 'any write to communities.monthly_fee_min/median/max',
      precondition_query: "SELECT id, canonical_name, city FROM communities WHERE status='published' AND city IN ('West Palm Beach','Boca Raton','Delray Beach') AND monthly_fee_median IS NULL ORDER BY review_count DESC NULLS LAST LIMIT 200;",
      snapshot_path: '/Users/izzymartinez/Agents/hoa-agent/logs/snapshots/pending_fee_observations_2026-05-21.json',
      slider_noise_rule: 'Drop any single source that contributes 3+ exact-$100 multiples within the 200-row pilot. Log dropped source names in CSV header notes.',
      output_files: [
        'scripts/output/monthly-fee-pilot-2026-05-21.csv',
        '/Users/izzymartinez/Agents/hoa-agent/logs/snapshots/pending_fee_observations_2026-05-21.json'
      ],
      success_criteria: [
        'Snapshot of pending_fee_observations saved BEFORE first write (verify file exists and parses as JSON)',
        '200 rows researched across WPB / Boca / Delray; per-city distribution noted in CSV header',
        'pending_fee_observations row count increases by N where 100 ≤ N ≤ 200 (some rows may legitimately yield no fee data — those are skipped, not zero-filled)',
        'communities.monthly_fee_min / _median / _max row checksums unchanged before vs after run (SELECT count + md5 over the three columns)',
        'All fees stored are exact multiples of $25; any source contributing 3+ exact-$100 multiples is dropped entirely',
        'Per-row source provenance recorded as one of: zillow | realtor | community_website | onlyinyourstate | mgmt_company_site | other',
        'Per-row evidence CSV at scripts/output/monthly-fee-pilot-2026-05-21.csv with id, canonical_name, fee_min, fee_median, fee_max, source, source_url, slider_noise_flag',
      ],
      sharpened_success_criteria: "Admin can open /admin/pending, see the 200 new pending_fee_observations rows with provenance, and approve/reject in bulk — every row traceable to one named source URL."
    }
  },

  // 3. News-cron health audit
  {
    id: 'f09c0fe4-b005-4966-9658-aeaf24dab2d2',
    title: 'News-cron audit — diagnose 8× slowdown (314→12 inserts), name fix',
    description: "news_items inserts dropped from ~10/day (314 rows / 30d) to ~1.2/day (12 rows / 10d) — an 8× slowdown that mirrors the legal-cron silence already filed. Tuvok performs a read-only diagnosis: confirm /api/cron/fetch-news fired at 11:00 UTC on each of the last 10 days (Vercel cron logs), per-source row counts for NewsAPI / Guardian / GDELT over the last 10 days, HTTP status / quota state per source, and any keyword-filter or dedup-regression changes in the last 30 days of git history. Output is a diagnosis report + a named fix proposal with effort estimate. No DB writes, no cron triggers, no remediation in this pass.",
    context_patch: {
      refined_at: NOW,
      refined_by: 'hoa-goal',
      effort_estimate: '45 min (15 min Vercel logs + 20 min per-source API probe + 10 min writeup)',
      write_mode: 'read_only_diagnosis',
      stop_before: 'any cron trigger, retry, or config change',
      no_db_writes: true,
      decision_rubric: {
        cron_not_firing: 'Vercel cron logs show <10 invocations in last 10 days',
        api_quota_exhausted: 'Any source returned 429 / "insufficient_quota" / "exceeded" in last 10d',
        filter_regression: 'API returns data but insert dedup-filter rejects >90% — check community_news.dedupe_key collisions',
        upstream_silence: 'All 3 sources return <5 results/day on known-active PBC keywords over 7d consecutive',
        env_var_drift: 'NEWSAPI_KEY / GUARDIAN_API_KEY / cron secret rotated without redeploy'
      },
      output_files: [
        'scripts/output/news-cron-audit-2026-05-21.md'
      ],
      success_criteria: [
        'Report names exactly one root cause (or explicitly: "multiple causes contributing — primary is X") from the decision rubric',
        'Vercel cron invocation log excerpt included for /api/cron/fetch-news (last 10 runs minimum), with timestamps and HTTP status',
        'Per-source 10-day row count breakdown: NewsAPI vs Guardian vs GDELT vs Google News RSS, with delta vs 30d baseline',
        'HTTP status sample per source (last response code + body excerpt) showing 200 vs 429 vs other',
        'Last 30d git log filtered to scripts/fetch-news* and app/api/cron/fetch-news/* — flag any change touching dedup or keyword logic',
        'Named fix proposal with effort_estimate, write_mode, and rollback_plan — formatted as a hoa-dir-style proposal that can be filed directly to agent_review_queue',
        'Zero DB writes confirmed by absence of communities/news_items modification timestamps in the audit window',
      ],
      sharpened_success_criteria: "Admiral reads the report and can choose between the fix proposal or 'wait' within 3 minutes — every root-cause claim backed by a quoted log line or row count."
    }
  }
];

(async () => {
  await status.start('hoa-goal', 'Refining 3 unrefined hoa-dir proposals (WPB street_address, fee pilot, news-cron audit)', refinements.length);

  let i = 0;
  for (const r of refinements) {
    // Fetch current row to merge context
    const { data: current, error: fetchErr } = await sb
      .from('agent_review_queue')
      .select('context, title')
      .eq('id', r.id)
      .single();

    if (fetchErr) {
      await status.error('hoa-goal', `Failed to fetch ${r.id}: ${fetchErr.message}`);
      console.error('FETCH ERR', r.id, fetchErr);
      continue;
    }

    const oldTitle = current.title;
    const mergedContext = { ...current.context, ...r.context_patch };

    const { error: updErr } = await sb
      .from('agent_review_queue')
      .update({
        title: r.title,
        description: r.description,
        context: mergedContext,
        updated_at: NOW
      })
      .eq('id', r.id);

    if (updErr) {
      await status.error('hoa-goal', `Failed to update ${r.id}: ${updErr.message}`);
      console.error('UPDATE ERR', r.id, updErr);
      continue;
    }

    i++;
    await status.progress('hoa-goal', i, `Refined ${r.id.slice(0,8)}: "${oldTitle.slice(0,50)}..." → "${r.title.slice(0,50)}..."`);
    console.log(`OK ${r.id}: ${r.title}`);
  }

  await status.complete('hoa-goal', `Refined ${i} of ${refinements.length} hoa-dir proposals: tightened titles, added effort_estimate + measurable success_criteria, decision rubrics where applicable.`);
  console.log(`DONE refined=${i}`);
})();
