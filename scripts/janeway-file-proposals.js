// Janeway proposal filer — writes 3 gap-targeted proposals to agent_review_queue
// Agent: hoa-boards (running) → files as hoa-dir (Janeway captain seat)
const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });
const { createClient } = require('@supabase/supabase-js');
const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGENT_ID = 'hoa-boards';

const proposals = [
  {
    agent_id: 'hoa-dir',
    company: 'hoa-agent',
    priority: 'critical',
    title: 'Seven: Solcera community ingestion research + draft row, no insert',
    description: "CLAUDE.md TOP-OF-MIND ISSUES lists 'Solcera community needs to be added to the database' — open 21+ days with zero proposal coverage across the 80+ row hoa-agent queue. Seven of Nine runs a Sunbiz cordata grep on /Volumes/LaCie/ for 'SOLCERA' (also SOLCERA HOA, SOLCERA HOMEOWNERS, SOLCERA PROPERTY OWNERS, SOLCERA CONDOMINIUM) plus a DuckDuckGo verification search for 'Solcera Palm Beach County HOA'. Output scripts/output/solcera-ingestion-2026-05-24.md with: canonical_name, city, county=Palm Beach, state=FL, zip_code (if found), state_entity_number, registered_agent, entity_status, incorporation_date, two source citations, AND a commented draft INSERT into pending_community_data. Zero writes — Admiral reviews the draft before any row lands.",
    status: 'pending',
    context: {
      assigns_to: 'Seven of Nine',
      assigns_to_agent_id: 'hoa-research',
      estimated_time: 30,
      why_now: "Named TOP-OF-MIND issue, 21+ days old, no pending proposal touches it. Adding a single named community is the most concrete data-quality win available right now.",
      source: 'CLAUDE.md §CURRENT TOP-OF-MIND ISSUES — "Solcera community needs to be added to the database"',
      no_writes: true,
      output_path: 'scripts/output/solcera-ingestion-2026-05-24.md',
      success_criteria: [
        'scripts/output/solcera-ingestion-2026-05-24.md exists',
        'Document names canonical_name, city, county=Palm Beach, state=FL — or explicitly flags as not found in PBC',
        'At least 2 independent source citations (Sunbiz cordata line + 1 web confirmation, OR 2 web confirmations)',
        'Commented draft INSERT statement for pending_community_data with all auto-approvable fields (entity_status, state_entity_number, registered_agent, incorporation_date) populated where Sunbiz hit exists',
        'Dedupe check against existing communities table: SELECT id, canonical_name FROM communities WHERE canonical_name ILIKE %solcera% (must return zero before draft is added)',
        'Zero writes to communities or pending_community_data — verified by row-count delta = 0'
      ],
      verification_query: "SELECT COUNT(*) FROM communities WHERE canonical_name ILIKE '%solcera%'; -- run before AND after, both must be 0",
      effort_estimate: {
        time_min: 30,
        complexity: 'low',
        risk: 'low',
        dependencies: ['LaCie /Volumes/LaCie/FL-Palm Beach County Data / Sunbiz cordata grep (trailing space in path)', 'DuckDuckGo HTML search for verification']
      }
    }
  },
  {
    agent_id: 'hoa-dir',
    company: 'hoa-agent',
    priority: 'high',
    title: 'Seven: Lake Worth mgmt_company backfill CSV — 0.25% coverage, top-100 pilot',
    description: "HOA_PLAN.md DATA QUALITY tactic #1: 'Fill management_company for top 5 PBC cities (Boca, WPB, Lake Worth, Jupiter, Palm Beach Gardens)'. Lake Worth currently has 3/1220 = 0.25% coverage — by far the worst of the five (Boca 53/1604, WPB 24/1360, Jupiter 182/759, Gardens 149/516). Zero pending proposals target Lake Worth specifically. Seven SELECTs Lake Worth published communities with NULL management_company, joins each to communities.registered_agent (already populated for many), and outputs scripts/output/lake-worth-mgmt-backfill-2026-05-24.csv with columns: community_id, canonical_name, current_registered_agent, proposed_management_company (=agent if name matches FL mgmt patterns like 'MANAGEMENT', 'PROPERTY MANAGEMENT', 'ASSOCIATIONS, INC.', 'CAM SERVICES'), confidence (high if 2 signals: name pattern + Sunbiz address match to known FL CAM firm / medium if 1 signal / low if pattern only), source. Top-100 pilot rows only. Zero writes — Admiral reviews CSV before any UPDATE.",
    status: 'pending',
    context: {
      assigns_to: 'Seven of Nine',
      assigns_to_agent_id: 'hoa-research',
      estimated_time: 45,
      why_now: "Lake Worth is the worst-covered top-5 priority city (0.25% mgmt fill) and has no targeted proposal in queue. Pilot CSV unblocks a measurable bulk write later.",
      source: 'HOA_PLAN.md §DATA QUALITY tactic #1 + live coverage probe (Lake Worth 3/1220 vs Boca 53/1604, WPB 24/1360, Jupiter 182/759, Gardens 149/516)',
      no_writes: true,
      output_path: 'scripts/output/lake-worth-mgmt-backfill-2026-05-24.csv',
      success_criteria: [
        'scripts/output/lake-worth-mgmt-backfill-2026-05-24.csv exists with 100 rows (or all candidates if <100)',
        "All rows have city='Lake Worth', status='published', management_company IS NULL pre-task",
        "Columns present: community_id, canonical_name, current_registered_agent, proposed_management_company, confidence ∈ {high, medium, low}, source",
        'Confidence assignment: HIGH iff name pattern matches known FL CAM regex AND Sunbiz address matches a known FL CAM firm; MEDIUM iff one signal; LOW iff weak pattern only',
        'Header summary block reports: total_candidates, high_confidence_count, medium_count, low_count, no_signal_count',
        'Footer lists 10 sample HIGH-confidence rows for Admiral spot-check',
        'Zero writes to communities — verified by SELECT COUNT(*) FROM communities WHERE city=Lake Worth AND management_company IS NOT NULL pre/post identical'
      ],
      verification_query: "SELECT COUNT(*) FROM communities WHERE city='Lake Worth' AND status='published' AND management_company IS NOT NULL; -- must match pre-task count exactly",
      effort_estimate: {
        time_min: 45,
        complexity: 'low',
        risk: 'low',
        dependencies: ['Supabase SELECT on communities (city, registered_agent, status)', 'Hard-coded FL CAM name regex + known-firm address list']
      }
    }
  },
  {
    agent_id: 'hoa-dir',
    company: 'hoa-agent',
    priority: 'medium',
    title: "Harry Kim: top-20 PBC mgmt company outreach roster CSV, no sends",
    description: "Harry Kim is named in HOA_PLAN.md THE CREW table as 'Management Co. Ops — outreach to property management companies' but has ZERO coverage across the 80+ row hoa-agent queue. Build scripts/output/pbc-mgmt-outreach-roster-2026-05-24.csv listing the top 20 management companies by community_count (SELECT management_company, COUNT(*) FROM communities WHERE status='published' AND management_company IS NOT NULL GROUP BY management_company ORDER BY COUNT DESC LIMIT 20). Columns: rank, management_company (normalized), community_count, sample_community_slugs (≤3, semicolon-joined), website_guess (kebab-case + .com), public_email_guess (info@ / contact@ / admin@), suggested_template ∈ {A_intro, B_partnership, C_data_share}, first_touch_subject_line. Plus 1-paragraph rationale per top-5 firm explaining template choice. NO EMAILS SENT — Admiral approves roster + per-firm template before any outreach starts.",
    status: 'pending',
    context: {
      assigns_to: 'Harry Kim',
      assigns_to_agent_id: 'hoa-mgmt',
      estimated_time: 40,
      why_now: "Harry Kim is one of three uncovered crew channels (along with B'Elanna and Tom partial). Mgmt company partnerships are the highest-leverage data-acquisition play — one signed firm can backfill 50+ communities at once. Roster unblocks all downstream mgmt outreach.",
      source: 'HOA_PLAN.md §THE CREW — Harry Kim (Management Co. Ops)',
      no_sends: true,
      output_path: 'scripts/output/pbc-mgmt-outreach-roster-2026-05-24.csv',
      success_criteria: [
        'scripts/output/pbc-mgmt-outreach-roster-2026-05-24.csv exists with exactly 20 rows',
        "Sourced from SELECT management_company, COUNT(*) FROM communities WHERE status='published' GROUP BY management_company ORDER BY COUNT DESC LIMIT 20",
        'Columns present: rank, management_company, community_count, sample_community_slugs (≤3), website_guess, public_email_guess, suggested_template ∈ {A_intro, B_partnership, C_data_share}, first_touch_subject_line',
        'Top-5 rows each have a paragraph in the footer explaining template choice + why this firm matters',
        'No email send code in commit — only CSV + rationale doc',
        'Zero writes to outreach_contacts or any production table — verified by row-count delta = 0 on outreach_contacts'
      ],
      verification_query: 'SELECT COUNT(*) FROM outreach_contacts; -- must match pre-task count exactly',
      effort_estimate: {
        time_min: 40,
        complexity: 'low',
        risk: 'low',
        dependencies: ['Supabase SELECT on communities.management_company', 'Existing outreach templates A/B/C in scripts/']
      }
    }
  }
];

(async () => {
  await status.start(AGENT_ID, 'Janeway tour: filing 3 gap-targeted hoa-dir proposals (Solcera, Lake Worth mgmt, Harry Kim roster)', proposals.length);

  const filed = [];
  for (let i = 0; i < proposals.length; i++) {
    const p = proposals[i];
    const { data, error } = await supabase
      .from('agent_review_queue')
      .insert(p)
      .select('id, title')
      .single();
    if (error) {
      console.error('Insert failed:', p.title, error.message);
      await status.error(AGENT_ID, `Insert failed: ${p.title} — ${error.message}`);
      process.exit(1);
    }
    filed.push({ id: data.id, title: data.title, assigns_to: p.context.assigns_to });
    await status.progress(AGENT_ID, i + 1, `Filed ${i + 1}/${proposals.length}: ${p.context.assigns_to} (${data.id.slice(0, 8)})`);
    console.log(`Filed ${data.id} — ${data.title}`);
  }

  const summary = `Janeway filed ${filed.length}/${proposals.length} gap-targeted proposals: CRITICAL/Seven Solcera ingestion (${filed[0].id.slice(0,8)}), HIGH/Seven Lake Worth mgmt backfill CSV — 0.25% pilot (${filed[1].id.slice(0,8)}), MEDIUM/Harry Kim top-20 PBC mgmt outreach roster (${filed[2].id.slice(0,8)}). All hit zero-coverage areas in the 80+ row hoa-agent queue.`;
  await status.complete(AGENT_ID, summary, { filed });
  console.log('\n' + summary);
})();
