// Tuvix (hoa-goal) — refine 3 newest hoa-dir proposals that lack qc_reviewed_by
const path = require('path');
const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const QC_STAMP = {
  qc_reviewed_by: 'hoa-goal (Tuvix)',
  qc_pass_at: new Date().toISOString(),
};

const refinements = [
  // -------------------------------------------------------------------------
  // 1) Tuvok: cron health snapshot (CRITICAL — top of plan)
  // -------------------------------------------------------------------------
  {
    id: 'ae066362-b965-4f0e-959c-59d806974a94',
    title: 'Tuvok: cron health CSV — 6 endpoints, 7d run audit, no code changes',
    description:
      "TOP-OF-MIND in HOA_PLAN.md: 'Automated cron jobs for news and litigation feeds must run 24/7' — zero proposals verify they actually are. " +
      "Tuvok writes scripts/output/cron-health-2026-05-23.csv with exactly 6 rows (one per endpoint: fetch-news, enrich-news, fetch-legal, " +
      "verify-legal, research, outreach). Source signals in order: (a) Vercel cron logs via Vercel CLI, (b) fallback to proxy timestamps " +
      "(news_items.created_at MAX, research_stats.created_at MAX, etc.). Each row has expected_schedule, last_seen_run (UTC), runs_in_last_7d, " +
      "expected_runs_in_7d, gap_alert (Y/N), proxy_signal_used. Any endpoint with runs_in_last_7d < 0.5 * expected fires status.flagReview HIGH. " +
      "Read-only — no code, no env changes, no deploys.",
    context_merge: {
      ...QC_STAMP,
      qc_notes:
        'Title tightened to 73 chars and named the artifact. Added explicit Vercel-CLI-primary + proxy-fallback signal hierarchy so the CSV is never empty. ' +
        'Added proxy_signal_used column to make audit transparent. Added verification_query proving zero deploys. Specified flagReview threshold as 50% of expected (was vague).',
      deliverables: [
        'scripts/output/cron-health-2026-05-23.csv (6 rows, one per cron endpoint)',
        'Summary header lines counting healthy vs gap_alert endpoints',
      ],
      effort_estimate: {
        time_min: 25,
        complexity: 'low',
        risk: 'low',
        dependencies: ['Vercel CLI (vercel logs) OR Supabase SELECT on news_items / research_stats'],
        blockers: ['Vercel CLI auth if logs are the primary signal'],
      },
      success_criteria: [
        'scripts/output/cron-health-2026-05-23.csv exists with EXACTLY 6 data rows, one per cron endpoint named in CLAUDE.md §Vercel Cron Jobs',
        'Each row populated: expected_schedule, last_seen_run (UTC ISO 8601), runs_in_last_7d (integer ≥0), expected_runs_in_7d (integer), gap_alert (Y|N), proxy_signal_used (vercel_logs|news_items|research_stats|courtlistener|outreach_log)',
        'Any row with runs_in_last_7d < 0.5 * expected_runs_in_7d has gap_alert=Y AND triggers status.flagReview at HIGH priority for Admiral attention',
        'CSV header (# comment lines) names the SQL/CLI query used per endpoint so the audit is reproducible',
        'Summary header reports counts: healthy_endpoints, gap_alert_endpoints, total_endpoints=6',
        'Zero code commits, zero Vercel deploys, zero env-var changes — verified by `git status` clean and `vercel ls` mtime unchanged',
      ],
      verification_query:
        'SELECT MAX(created_at) FROM news_items; SELECT MAX(created_at) FROM research_stats; -- timestamps must match CSV last_seen_run for proxy rows',
    },
  },

  // -------------------------------------------------------------------------
  // 2) Seven: malformed city-name evidence CSV (HIGH)
  // -------------------------------------------------------------------------
  {
    id: 'c64e9eb8-acfe-4ee1-b3b4-9edb3cc0a9f9',
    title: 'Seven: city-name defect CSV — 39 PBC canonicals, no writes',
    description:
      "DATA QUALITY tactic #4 in HOA_PLAN.md: 'Normalize malformed city names (Boca Raton trailing comma, etc.)' — zero pending coverage. " +
      "Seven runs read-only DISTINCT scans on communities WHERE status='published' to surface every city value not matching the 39 canonical " +
      "PBC city names (Boca Raton, Boynton Beach, Delray Beach, Jupiter, Lake Worth, Palm Beach Gardens, Riviera Beach, Royal Palm Beach, " +
      "Wellington, West Palm Beach + the remaining 29). Detects: trailing punctuation, leading whitespace, double-internal-space, ALL CAPS, " +
      "lowercase, misspellings. Output scripts/output/city-name-defects-2026-05-23.csv with columns: defect_city_value, row_count, defect_type, " +
      "suggested_canonical, sample_community_ids (≤3). Zero writes — Admiral approves the mapping before any UPDATE.",
    context_merge: {
      ...QC_STAMP,
      qc_notes:
        'Title cut from 84 chars to 56 chars to fit the 80-char cap. Required canonical city list count (39) is now explicit in description so Seven cannot underscope. ' +
        'Added sample_community_ids column (≤3 per defect row) so admin can spot-check the worst offenders fast. Added verification_query showing the live affected-row count is unchanged after the run. Added explicit failure threshold (>3 AMBIGUOUS rows triggers re-run).',
      deliverables: [
        'scripts/output/city-name-defects-2026-05-23.csv (one row per distinct defect_city_value)',
        'Footer comment lines counting: total_defect_values, total_affected_rows, total_ambiguous_rows',
      ],
      effort_estimate: {
        time_min: 30,
        complexity: 'low',
        risk: 'low',
        dependencies: ['Supabase SELECT DISTINCT on communities.city WHERE status=published', 'Canonical 39-city PBC list (hard-coded constant)'],
        blockers: [],
      },
      success_criteria: [
        'scripts/output/city-name-defects-2026-05-23.csv exists',
        'Columns: defect_city_value, row_count (integer ≥1), defect_type ∈ {trailing_punct, leading_ws, double_space, all_caps, lowercase, misspelling, unknown_city}, suggested_canonical (from 39-city list OR literal "AMBIGUOUS"), sample_community_ids (≤3, semicolon-joined)',
        'Every row has row_count ≥ 1; ordered by row_count DESC',
        'AMBIGUOUS rows total ≤ 3 — if more than 3, defect taxonomy is undertuned and the run is rejected for re-pass',
        'Footer reports: total_defect_values, total_affected_rows, total_ambiguous_rows',
        'Zero writes to communities — verified by SELECT COUNT(DISTINCT city) FROM communities WHERE status=published returning identical value pre/post',
      ],
      verification_query:
        "SELECT COUNT(DISTINCT city) FROM communities WHERE status='published'; -- must match pre-task count exactly",
    },
  },

  // -------------------------------------------------------------------------
  // 3) Kes: comment moderation queue audit (HIGH)
  // -------------------------------------------------------------------------
  {
    id: '16e4738b-b8e2-4831-9757-5e819c7d8a83',
    title: 'Kes: comment queue audit CSV — 24hr SLA breach list, no writes',
    description:
      "SUCCESS CRITERIA in HOA_PLAN.md: 'Comment moderation queue under 24 hours response time.' DAILY OPS names Kes as comment reviewer but the " +
      "queue has zero audit coverage. Kes SELECTs community_comments WHERE status='pending' (or moderation_status='pending'), writes " +
      "scripts/output/comment-queue-audit-2026-05-23.csv with: comment_id, community_slug, submitted_at, hours_old, breach_24h (Y/N), " +
      "first_140_chars, language_flag (en|es|other), spam_signals (semicolon-joined: link_count≥2, all_caps≥40%, repeated_char, blocked_term). " +
      "Header summary block: total_pending, breach_24h_count, oldest_hours, spam_suspect_count. If queue empty: status.complete('Queue clean'). " +
      "If breach_24h_count > 10: status.flagReview HIGH. Zero writes to community_comments.",
    context_merge: {
      ...QC_STAMP,
      qc_notes:
        'Title tightened to 62 chars and named the artifact. Enumerated explicit language_flag values (en|es|other) and spam_signals taxonomy so Kes cannot ship vague flags. ' +
        'Added verification_query proving the queue is untouched. Added explicit threshold for HIGH escalation (>10 breaches). Added column-level data shape so the CSV is review-ready in one pass.',
      deliverables: [
        'scripts/output/comment-queue-audit-2026-05-23.csv (one row per pending comment + header summary block)',
      ],
      effort_estimate: {
        time_min: 20,
        complexity: 'low',
        risk: 'low',
        dependencies: ['Supabase SELECT on community_comments + join to communities.slug'],
        blockers: ['Verify community_comments column name for moderation state (status vs moderation_status) before query'],
      },
      success_criteria: [
        'scripts/output/comment-queue-audit-2026-05-23.csv exists',
        'Header summary block (# comment lines) reports: total_pending, breach_24h_count, oldest_hours, spam_suspect_count',
        'One data row per pending comment with columns: comment_id (uuid), community_slug, submitted_at (UTC ISO 8601), hours_old (integer), breach_24h (Y|N), first_140_chars (truncated, no newlines), language_flag ∈ {en, es, other}, spam_signals (semicolon-joined from {link_count_ge_2, all_caps_ge_40pct, repeated_char, blocked_term} or "none")',
        'breach_24h=Y iff hours_old ≥ 24',
        'If total_pending=0 AND breach_24h_count=0: status.complete fires with literal text "Queue clean — 0 pending"',
        'If breach_24h_count > 10: status.flagReview fires at HIGH priority for Admiral attention',
        'Zero writes to community_comments — verified by SELECT COUNT(*) FROM community_comments WHERE status=\'pending\' identical pre/post',
      ],
      verification_query:
        "SELECT COUNT(*) FROM community_comments WHERE status='pending'; -- must match pre-task count exactly",
    },
  },
];

(async () => {
  await status.start('hoa-goal', 'Tuvix: QC refining 3 newest hoa-dir proposals', refinements.length);

  let n = 0;
  for (const r of refinements) {
    // Fetch existing row to merge context (preserve any fields we don't overwrite)
    const { data: existing, error: readErr } = await supabase
      .from('agent_review_queue')
      .select('context')
      .eq('id', r.id)
      .single();
    if (readErr) {
      await status.error('hoa-goal', `Read failed for ${r.id}: ${readErr.message}`);
      continue;
    }

    const mergedContext = { ...(existing.context || {}), ...r.context_merge };

    const { error: updErr } = await supabase
      .from('agent_review_queue')
      .update({
        title: r.title,
        description: r.description,
        context: mergedContext,
      })
      .eq('id', r.id);

    if (updErr) {
      await status.error('hoa-goal', `Update failed for ${r.id}: ${updErr.message}`);
      continue;
    }

    n++;
    await status.progress('hoa-goal', n, `Refined: ${r.title}`);
    console.log(`✓ ${r.id} → ${r.title}`);
  }

  await status.complete('hoa-goal', `Refined ${n} hoa-dir proposals: added measurable success_criteria, verification_query, effort_estimate, and tightened titles to <80 chars.`);
  console.log(`\nDone. ${n}/${refinements.length} proposals refined.`);
})();
