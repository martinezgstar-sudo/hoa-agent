const { createClient } = require('@supabase/supabase-js');
const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
require('dotenv').config({ path: '/Users/izzymartinez/Documents/hoa-agent/.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  await status.start('hoa-dir', 'Janeway: file 3 gap-targeted proposals (stale-baseline, reviews-feasibility, Kes invite-copy)', 3);

  const proposals = [
    {
      agent_id: 'hoa-dir',
      company: 'hoa-agent',
      priority: 'high',
      title: 'Stale-rows baseline audit — 4,282 rows >30d, bucket by city + completeness, CSV only',
      description: "Plan §Success Criteria says 'Every record refreshed within the last 30 days', but 4,282 of 8,006 published rows (53%) have updated_at older than 30 days. The current queued 'Stale-refresh batch 200' only addresses 4.7% of the backlog with no visibility into the full shape. Tuvok produces a baseline CSV: bucket all stale rows by city, by days-since-update (30-60, 60-90, 90-180, 180+), and by data-completeness tier (COMPLETE/PARTIAL/STUB). Output to scripts/output/stale-baseline-2026-05-21.csv plus a 1-page summary. ZERO database writes — this is a measurement task that unblocks a real stale-refresh strategy.",
      status: 'pending',
      context: {
        assigns_to: 'Tuvok',
        assigns_to_agent_id: 'hoa-updater',
        estimated_time: 45,
        why_now: '53% of published rows are stale; current 200-row batch is a drop in the bucket; no baseline exists to plan capacity against the 30-day success criterion',
        source: 'HOA_PLAN.md §SUCCESS CRITERIA + §DATA QUALITY tactic 6 (refresh stale records over 30 days old)',
        scope: 'read-only audit; output CSV + summary; no DB writes',
        precondition_query: "SELECT count(*) FROM communities WHERE status='published' AND updated_at < now() - interval '30 days'",
        gate_check_query: 'CSV row count equals precondition count exactly',
        output_files: ['scripts/output/stale-baseline-2026-05-21.csv', 'scripts/output/stale-baseline-summary-2026-05-21.md'],
        write_mode: 'csv_only',
        rollback_plan: 'N/A (no writes)',
        success_criteria: 'CSV produced with one row per stale community; bucket counts add up to total; summary lists top 10 cities by stale count and worst completeness tier'
      }
    },
    {
      agent_id: 'hoa-dir',
      company: 'hoa-agent',
      priority: 'medium',
      title: 'Reviews data-source feasibility scan — 0 reviews system-wide, identify path forward',
      description: "Platform shows review_avg and review_count columns on every community card but the reviews table is empty (0 rows). No proposal in queue addresses this. Seven of Nine investigates 3 candidate sources: (1) Google Reviews via Places API for HOA Places entries, (2) Yelp Fusion API for property managers / HOAs, (3) Nextdoor — likely public-only / manual. For each source, document: legality of scraping/API ToS, coverage rate against a sample of 20 PBC communities, technical cost, and per-record cost. Output a recommendation memo (scripts/output/reviews-source-feasibility-2026-05-21.md) with one preferred path. ZERO DB writes, ZERO API calls beyond exploratory test of one community per source.",
      status: 'pending',
      context: {
        assigns_to: 'Seven of Nine',
        assigns_to_agent_id: 'hoa-research',
        estimated_time: 60,
        why_now: 'Reviews columns are displayed on every community page but are universally empty; no proposal exists to source them; without reviews the platform has zero user-generated trust signal',
        source: 'HOA_PLAN.md §CURRENT STATE (review schema present) + §SUCCESS CRITERIA (user-trust signals) gap',
        scope: 'research + recommendation memo only; no DB writes',
        output_files: ['scripts/output/reviews-source-feasibility-2026-05-21.md'],
        write_mode: 'memo_only',
        rollback_plan: 'N/A (no writes)',
        success_criteria: 'Memo names a preferred source with: ToS verdict (green/yellow/red), coverage % against 20-community sample, $/record estimate, technical effort in days, and 3 risks'
      }
    },
    {
      agent_id: 'hoa-dir',
      company: 'hoa-agent',
      priority: 'medium',
      title: 'Kes resident comment-invite copy pilot — 5 variants for top 50 community pages, no sends',
      description: "Plan §Growth Focus #2 calls Kes the 'Comment Growth' officer but she has been doing community_suggestions moderation only (last activity 2026-05-20: 6 suggestions reviewed). community_comments total is 19 system-wide. Kes drafts 5 invite-to-comment copy variants (short / story-prompt / question-prompt / fee-disclosure / amenity-praise) targeting residents of the top 50 highest-data-completeness PBC community pages. Output: scripts/output/kes-invite-copy-variants-2026-05-21.md with the 5 variants + 50-community target list + recommended channel mix (page CTA / email if email exists / outreach response). ZERO sends, ZERO live publishes — copy + targeting only for Admiral approval.",
      status: 'pending',
      context: {
        assigns_to: 'Kes',
        assigns_to_agent_id: 'hoa-comments',
        estimated_time: 50,
        why_now: 'Kes role is comment growth but recent activity is only moderation; 19 total comments across 8,006 communities means engagement is effectively zero; copy must exist before any send/test can be scheduled',
        source: 'HOA_PLAN.md §GROWTH FOCUS #2 (social outreach) + Kes role definition (Comment Growth)',
        scope: 'copy drafts + target list only; no sends, no live changes',
        precondition_query: 'SELECT count(*) FROM community_comments',
        output_files: ['scripts/output/kes-invite-copy-variants-2026-05-21.md'],
        write_mode: 'copy_only',
        rollback_plan: 'N/A (no sends)',
        success_criteria: '5 distinct copy variants (≤80 words each), 50-community target CSV with completeness score, recommended channel for each variant'
      }
    }
  ];

  for (let i = 0; i < proposals.length; i++) {
    const { data, error } = await supabase.from('agent_review_queue').insert(proposals[i]).select('id, title').single();
    if (error) {
      console.error('Insert failed:', error.message, JSON.stringify(proposals[i].title));
      await status.error('hoa-dir', `Insert ${i+1}/3 failed: ${error.message}`);
      process.exit(1);
    }
    console.log(`Filed [${proposals[i].priority}]: ${data.title} (${data.id})`);
    await status.progress('hoa-dir', i+1, `Filed: ${proposals[i].title}`);
  }

  await status.complete('hoa-dir', 'Janeway filed 3 gap-targeted proposals: stale-rows baseline audit (HIGH/Tuvok — 53% of rows >30d stale), reviews data-source feasibility scan (MED/Seven — 0 reviews system-wide), Kes resident comment-invite copy pilot (MED/Kes — comment growth role had only moderation activity).');
  console.log('\nAll 3 proposals filed.');
})();
