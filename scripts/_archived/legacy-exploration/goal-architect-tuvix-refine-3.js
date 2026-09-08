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
    id: '2555bc06-72e6-4b58-99be-9f2122d0df28',
    priority: 'high',
    title: 'Seven: rank 3 June-spotlight candidates w/ scores (due 2026-05-28)',
    description: "Select 3 ranked June-2026 spotlight candidates from communities WHERE status='published'. Score each on a 0-100 composite: 40pts data-completeness (>=3 critical fields filled), 30pts notable-angle (55+ confirmed OR is_gated=true OR master_hoa_id-target OR unit_count>500), 30pts news-recency (>=1 community_news row in last 90d). Output one markdown file per candidate at docs/spotlight-candidates-june-2026/<slug>.md containing: canonical_name, slug, city, score breakdown, completeness snapshot, 2 news hooks with URLs, recommended Neelix caption seed (<=280 chars). No INSERT/UPDATE. Deliverable due 2026-05-28 so Neelix has 3 days to prep the social pack before 06-01.",
    context: {
      source: "HOA_PLAN.md OPERATIONS MONTHLY 'End of month: Recommend which community to spotlight next month'",
      why_now: "May 31 is 7 days out. Without picks by 05-28, Neelix loses 3-day buffer to prep June social pack (week-23+). Spotlight has zero queue coverage.",
      no_writes: true,
      assigns_to: 'Seven of Nine',
      assigns_to_agent_id: 'hoa-research',
      candidates: 3,
      output_path: 'docs/spotlight-candidates-june-2026/',
      hard_deadline: '2026-05-28T23:59:00-04:00',
      estimated_time: 90,
      effort_estimate: { minutes: 90, breakdown: '20m query + scoring, 50m write-ups (15m/candidate + 5m caption), 20m QA' },
      success_criteria: [
        'docs/spotlight-candidates-june-2026/ contains exactly 3 markdown files, one per candidate',
        "All 3 candidates verified status='published' AND county='Palm Beach'",
        'Each file shows composite score (0-100) with 3-line breakdown (completeness/angle/news)',
        'Each file includes 2 community_news article URLs from last 90 days',
        'Top-ranked candidate ships with a <=280-char caption seed for Neelix',
        'Delivered by 2026-05-28 23:59 ET'
      ]
    }
  },
  {
    id: '75cbc0f8-2e69-45d6-be48-f4c035e54717',
    priority: 'medium',
    title: 'Neelix: brand-mention monitoring SOP — 8 queries × 5 channels',
    description: "Author docs/social-monitoring-brief-2026-05-24.md as a runnable SOP, not a draft. Required sections: (1) 8 exact query strings — brand 'HOA Agent', domain 'hoa-agent.com', founder 'Izzy Martinez', 3 named competitors (HOA-USA, Condo.com, BoardSpace), 2 category terms ('Florida HOA database', 'Palm Beach HOA reviews'); (2) 5 channels with native search URLs: Facebook, Instagram, LinkedIn, Reddit, Google News; (3) cadence table — daily for brand/domain/founder, weekly for competitors/category; (4) escalation rules — branded mention reply <=4h, competitor mention log-only, attack/legal escalate to Admiral immediately; (5) CSV template path scripts/output/social-mentions-template.csv with header row only. No automation, no API keys, no writes to Supabase.",
    context: {
      source: "HOA_PLAN.md SOCIAL OUTREACH tactic #6 'Monitor mentions of HOA Agent across social channels'",
      why_now: 'Brand-mention monitoring is one of two untouched SOCIAL tactics. We have no awareness if hoa-agent.com is being discussed, copied, or attacked on social.',
      assigns_to: 'Neelix',
      assigns_to_agent_id: 'hoa-social',
      output_path: 'docs/social-monitoring-brief-2026-05-24.md',
      deliverable_type: 'monitoring_sop',
      estimated_time: 60,
      effort_estimate: { minutes: 60, breakdown: '15m query string drafting, 20m channel URL collection, 15m cadence + escalation rules, 10m CSV template' },
      success_criteria: [
        'docs/social-monitoring-brief-2026-05-24.md exists and renders cleanly',
        'Exactly 8 query strings listed with quote-wrapped exact phrases',
        'Exactly 5 channels with working native search URLs',
        'Cadence table differentiates daily (brand/domain/founder) vs weekly (competitor/category)',
        'Escalation table covers >=3 mention classes with response SLAs',
        'scripts/output/social-mentions-template.csv created with columns: timestamp, channel, query, url, snippet, classification, action_taken'
      ]
    }
  },
  {
    id: 'b958950c-2249-4ae4-b10a-5b79a82d6323',
    priority: 'medium',
    title: 'Tuvok: stale-record audit CSV — top-300 >30d, by completeness desc',
    description: "Produce scripts/output/stale-records-2026-05-24.csv listing 300 published communities where last research activity in community_research_log OR communities.updated_at is >30 days old (cutoff 2026-04-24). Sort by completeness_score DESC primary (high-value rows first), days_since_refresh DESC tiebreaker. Columns: id, canonical_name, city, zip_code, completeness_score (0-100, computed from filled critical fields), days_since_refresh, last_event_type, last_event_date. Prepend a 1-line summary comment with: total stale row count, average completeness across the 300, oldest refresh date. SELECT-only — no UPDATE/INSERT. Admiral chooses refresh batch size after reviewing the CSV.",
    context: {
      source: "HOA_PLAN.md SUCCESS CRITERIA #4 + DATA QUALITY tactic 'Refresh stale records over 30 days old'",
      why_now: 'SUCCESS CRITERIA #4 (every record refreshed in last 30 days) is dark — no audit or refresh proposal in the queue. Without this baseline we cannot measure or close the freshness gap.',
      no_writes: true,
      assigns_to: 'Tuvok',
      assigns_to_agent_id: 'hoa-updater',
      output_path: 'scripts/output/stale-records-2026-05-24.csv',
      target_rows: 300,
      estimated_time: 90,
      effort_estimate: { minutes: 90, breakdown: '30m completeness scoring SQL, 30m join with community_research_log, 20m sort/output, 10m summary header + QA' },
      success_criteria: [
        'scripts/output/stale-records-2026-05-24.csv exists with exactly 300 data rows (or fewer if total stale count <300)',
        "All rows are status='published' AND county='Palm Beach'",
        'All rows have days_since_refresh >= 30 (cutoff 2026-04-24)',
        'Columns present in order: id, canonical_name, city, zip_code, completeness_score, days_since_refresh, last_event_type, last_event_date',
        'Sorted: completeness_score DESC, then days_since_refresh DESC',
        'CSV header comment line lists total_stale_count, avg_completeness, oldest_refresh_date',
        'Zero writes to communities table (verified via SELECT before/after)'
      ]
    }
  }
];

(async () => {
  await status.start('hoa-goal', 'Refining 3 hoa-dir proposals (Seven/Neelix/Tuvok)', 3);
  let refined = 0;
  for (const r of refinements) {
    const { error } = await supabase
      .from('agent_review_queue')
      .update({
        title: r.title,
        description: r.description,
        priority: r.priority,
        context: r.context,
        updated_at: new Date().toISOString()
      })
      .eq('id', r.id)
      .eq('agent_id', 'hoa-dir')
      .eq('status', 'pending');
    if (error) {
      console.error('Update error for', r.id, error);
      await status.error('hoa-goal', `Update failed for ${r.id}: ${error.message}`);
      process.exit(1);
    }
    refined++;
    await status.progress('hoa-goal', refined, `Refined ${r.title.slice(0, 60)}...`);
    console.log('Refined:', r.id, '→', r.title);
  }
  await status.complete('hoa-goal', `Refined ${refined} hoa-dir proposals with measurable success criteria + effort estimates (Seven bumped to high — 2026-05-28 deadline).`);
  console.log('Done. Refined', refined, 'proposals.');
})();
