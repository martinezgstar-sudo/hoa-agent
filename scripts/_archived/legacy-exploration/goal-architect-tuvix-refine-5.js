const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const refinements = [
  {
    id: 'bec5792b-d7f3-42be-98d1-9899c60aac19',
    priority: 'high',
    title: "Tuvok: 7-day cron health audit — 4 routes × 7 days CSV + P0 gap list (read-only)",
    description:
      "Audit the last 7 days (2026-05-17 → 2026-05-23 UTC inclusive) of the four Vercel crons by querying insert timestamps: /api/cron/fetch-news (11:00 UTC daily) → news_items.created_at; /api/cron/enrich-news (12:00 UTC daily) → news_items.created_at WHERE reputation_score IS NOT NULL; /api/cron/fetch-legal (08:00 UTC Sunday only) → legal_cases.created_at; /api/cron/verify-legal (09:00 UTC Sunday only) → community_legal_cases.created_at. Emit scripts/output/cron-health-2026-05-24.csv with EXACTLY these columns in order: date (YYYY-MM-DD), cron_route, expected_to_run (true|false), rows_inserted (integer), gap_flag (true if expected_to_run=true AND rows_inserted=0), p0_flag (true if gap_flag=true AND cron is daily — i.e. news routes). Append a header comment with the verification SQL used and total row counts per route per day. Also emit scripts/output/cron-health-2026-05-24-p0.md listing each P0 row as a one-line incident card (route | date | last_known_good | suggested_next_step) — empty file with explicit 'no P0s' line if none found. Zero writes; this proposal alone does NOT trigger any cron re-run — Admiral approves remediation.",
    context: {
      source: "CLAUDE.md TOP-OF-MIND ISSUES #1+#2 + Vercel Cron Jobs section + HOA_PLAN.md OPERATIONS > DAILY",
      why_now: "TOP-OF-MIND #1 (CourtListener integration pending) and #2 (cron jobs need to run 24/7) both unaddressed in the 144-row pending queue. No agent has checked whether the 4 scheduled crons actually fired in the last 7 days; silent failure means stale news/legal data sitewide. High priority because a daily-news cron gap is a P0 incident.",
      no_writes: true,
      assigns_to: 'Tuvok',
      assigns_to_agent_id: 'hoa-updater',
      output_paths: [
        'scripts/output/cron-health-2026-05-24.csv',
        'scripts/output/cron-health-2026-05-24-p0.md',
      ],
      lookback_days: 7,
      lookback_window: '2026-05-17 to 2026-05-23 UTC',
      cron_routes: [
        { route: '/api/cron/fetch-news', schedule_utc: '11:00 daily', table: 'news_items' },
        { route: '/api/cron/enrich-news', schedule_utc: '12:00 daily', table: 'news_items (reputation_score not null)' },
        { route: '/api/cron/fetch-legal', schedule_utc: '08:00 Sunday only', table: 'legal_cases' },
        { route: '/api/cron/verify-legal', schedule_utc: '09:00 Sunday only', table: 'community_legal_cases' },
      ],
      estimated_time: 45,
      effort_estimate: {
        minutes: 45,
        breakdown:
          '5m schedule lookup from vercel.json/route headers, 20m four GROUP BY date queries + cross-join scaffold for missing days, 10m CSV emit + header comment, 5m P0 markdown emit, 5m QA SELECTs proving zero writes',
      },
      success_criteria: [
        'scripts/output/cron-health-2026-05-24.csv exists with all 6 columns in the specified order',
        'CSV has exactly 4 routes × 7 days = 28 rows (one per route per UTC day, including days where cron is NOT expected to run with expected_to_run=false and rows_inserted=actual)',
        'Header comment contains the verification SQL used per route + total inserts per route across the 7-day window',
        'gap_flag=true on every row where expected_to_run=true AND rows_inserted=0; false otherwise',
        'p0_flag=true on every gap_flag=true row that is a DAILY cron (fetch-news, enrich-news); false on Sunday-only routes',
        'scripts/output/cron-health-2026-05-24-p0.md exists; either lists 1 line per P0 row OR a single line "No P0 cron gaps in 2026-05-17..2026-05-23 window."',
        'Zero writes confirmed: SELECT count(*) FROM news_items, legal_cases, community_legal_cases identical at start vs end of run (snapshot logged in script stdout)',
      ],
    },
  },
  {
    id: 'd5b01a1d-912a-48fa-a80f-15be41044f01',
    priority: 'medium',
    title: "Tuvok: city-name anomaly audit CSV — 5 anomaly types + per-bucket counts (read-only)",
    description:
      "Run the following read-only SQL against communities WHERE status='published' to surface every city-name anomaly: trailing_space (city LIKE '% '), leading_space (city LIKE ' %'), comma (city LIKE '%,%'), lowercase_start (city ~ '^[a-z]'), digit (city ~ '[0-9]'). Emit scripts/output/city-name-anomalies-2026-05-24.csv with EXACTLY these columns in order: id (uuid), canonical_name, current_city (raw, byte-for-byte), proposed_city (trimmed + comma-stripped + title-cased), anomaly_type (one of {trailing_space, leading_space, comma, lowercase_start, digit}; if multiple, pipe-join), confidence (0.95 single-anomaly trim/case, 0.80 comma-strip, 0.60 digit anomaly because likely indicates non-city data). Begin the CSV with a 4-line header comment: total rows, per-bucket counts for all 5 anomaly types, exact SQL used, and a one-line statement that this is a prerequisite for any UPDATE per CLAUDE.md ABSOLUTE RULES (snapshot + small-sample-first). Zero writes; do NOT update communities.city. Cap output at 500 rows — if more found, write the top 500 by row id and append a 'truncated_total=N' line.",
    context: {
      source: "HOA_PLAN.md DATA QUALITY tactic #4 ('Normalize malformed city names — Boca Raton trailing comma, etc.')",
      why_now: "Explicit PLAN tactic with zero queue coverage. City-name typos directly affect /city/[slug] routing and the 72-page city-filter SEO matrix already shipped. Audit is a prerequisite for any safe UPDATE per ABSOLUTE RULES. Medium priority — read-only, not blocking other work.",
      no_writes: true,
      assigns_to: 'Tuvok',
      assigns_to_agent_id: 'hoa-updater',
      output_path: 'scripts/output/city-name-anomalies-2026-05-24.csv',
      output_cap: 500,
      anomaly_types: ['trailing_space', 'leading_space', 'comma', 'lowercase_start', 'digit'],
      estimated_time: 25,
      effort_estimate: {
        minutes: 25,
        breakdown:
          '5m SQL design (5 OR-branches with anomaly_type cast in SELECT), 10m run + normalize proposed_city, 5m CSV emit + 4-line header comment, 5m QA: zero-write SELECT proof + cap check',
      },
      success_criteria: [
        'scripts/output/city-name-anomalies-2026-05-24.csv exists with all 6 columns in the specified order',
        'Header comment includes total row count, per-bucket count for ALL 5 anomaly types (even if 0), and the exact SQL used',
        'Every row has anomaly_type populated with at least one of the 5 allowed values (pipe-joined if multiple)',
        'proposed_city is non-empty and differs from current_city on every row',
        'confidence is one of {0.95, 0.80, 0.60} per the rule (0.60 for any row containing digit anomaly)',
        'Row count ≤ 500; if truncated, last line of CSV reads "# truncated_total=<N>"',
        "Zero writes confirmed: SELECT count(*) FROM communities WHERE status='published' identical at start vs end (logged in stdout)",
        'Header comment explicitly cites prerequisite for ABSOLUTE RULES snapshot + small-sample-first',
      ],
    },
  },
  {
    id: '2b44e189-019e-416b-ad96-dd010d218563',
    priority: 'medium',
    title: "Kes: comment SLA dashboard markdown — 4 age buckets + 7d intake (read-only)",
    description:
      "SELECT community_comments WHERE status='pending' (current snapshot) and WHERE created_at >= now() - interval '7 days' (intake series). Emit scripts/output/comment-sla-2026-05-24.md with these EXACT sections in order: (1) 'Snapshot 2026-05-24' header listing total pending count + oldest pending age in hours; (2) 'Age Buckets' table with rows for <24h, 24-48h, 48-72h, >72h and columns count, pct_of_pending; (3) 'Daily Intake 2026-05-17..2026-05-23' table with rows per UTC day and columns intake_count, approved_count, removed_count; (4) 'Per-Page Intake Leaders' table top-10 community_slug by 7d intake_count; (5) 'Admiral Flags' section listing every age bucket >48h that holds >5 entries as a one-line action card (bucket | count | oldest age | recommended_action: 'Kes draft replies' | 'admin manual review'). Append verification SQL at the bottom: SELECT count(*) FROM community_comments WHERE status='pending' (matches header total). Zero writes; this is dashboard only — reply drafts live in the separate proposal dc6463da. Distinct from existing audit 16e4738b (enumerated breaches) — this measures the trend.",
    context: {
      source: "HOA_PLAN.md SUCCESS CRITERIA ('Comment moderation queue under 24 hours response time') + CLAUDE.md TOP-OF-MIND ISSUES (comment SLA repeated as 'never exceed 24 hours')",
      why_now: "SUCCESS CRITERIA explicitly calls out 24-hour SLA but no proposal measures the trend. Reply-drafts proposal dc6463da addresses the symptom (old pending) not the volume + age distribution. Medium priority because read-only dashboard that complements existing reply-drafts queue.",
      no_writes: true,
      assigns_to: 'Kes',
      assigns_to_agent_id: 'hoa-comments',
      output_path: 'scripts/output/comment-sla-2026-05-24.md',
      sibling_proposals: ['dc6463da-2049-4b3e-9f18-7d0707ebfc56 (reply drafts)', '16e4738b (existing breach audit)'],
      lookback_window: '2026-05-17 to 2026-05-23 UTC',
      estimated_time: 25,
      effort_estimate: {
        minutes: 25,
        breakdown:
          '5m three SQL queries (snapshot, intake series, per-page leaders), 10m markdown writeup with 5 sections, 5m flag-card logic for >48h buckets >5 entries, 5m verification SELECT + QA',
      },
      success_criteria: [
        'scripts/output/comment-sla-2026-05-24.md exists with all 5 sections in the specified order',
        'Header total pending count matches the verification SELECT at bottom of file (exact integer equality)',
        'Age Buckets table has exactly 4 rows: <24h, 24-48h, 48-72h, >72h (zero-row buckets present with count=0)',
        'Daily Intake table has exactly 7 rows (one per UTC day 2026-05-17..2026-05-23, including days with intake_count=0)',
        'Per-Page Intake Leaders table has up to 10 rows (fewer only if fewer than 10 distinct slugs received comments)',
        "Admiral Flags section lists every >48h or >72h bucket holding >5 entries as a one-line card OR a single line 'No SLA-breach buckets exceed threshold.' if none",
        'Verification SQL at bottom of file is runnable as-is and returns the same total pending count shown in header',
        'Zero writes confirmed: SELECT count(*) FROM community_comments identical at start vs end (logged in stdout)',
      ],
    },
  },
];

(async () => {
  await status.start('hoa-goal', 'Refining 3 latest hoa-dir proposals (Tuvok cron / Tuvok city / Kes SLA)', 3);
  let refined = 0;
  for (const r of refinements) {
    const { error } = await supabase
      .from('agent_review_queue')
      .update({
        title: r.title,
        description: r.description,
        priority: r.priority,
        context: r.context,
      })
      .eq('id', r.id);
    if (error) {
      console.error('Failed to update', r.id, error);
      await status.error('hoa-goal', `Update failed for ${r.id}: ${error.message}`);
      process.exit(1);
    }
    refined++;
    await status.progress('hoa-goal', refined, `Refined ${refined}/3: ${r.title.slice(0, 70)}`);
    console.log(`OK ${r.id} — ${r.title}`);
  }
  await status.complete(
    'hoa-goal',
    `Refined ${refined} hoa-dir proposals with measurable success_criteria + effort_estimate (Tuvok cron-health, Tuvok city-anomalies, Kes SLA dashboard)`
  );
  console.log('Done.');
})();
