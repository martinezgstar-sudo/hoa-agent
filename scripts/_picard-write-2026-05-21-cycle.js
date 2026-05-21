// Picard (ms-dir) — 2026-05-21 cycle
// Files 3 gap-targeted proposals into agent_review_queue.
// Gaps targeted (vs. existing queue audit):
//   1. Route/mileage optimization (Efficiency tactics 1 & 3 — untouched)
//   2. HOA common-area contracts via HOA Agent data leverage (Higher RPC tactic 3 — untouched)
//   3. Quarterly client retention check-in SOP (Stability tactic 2 — uncovered as active cadence)

const path = require('path');
const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGENT_ID = 'ms-dir';
const COMPANY = 'morningstar';

const proposals = [
  {
    priority: 'high',
    title: 'Route optimization & mileage-waste audit — 30-day Jobber pull + 3 routing fixes',
    description:
      "Pull last 30 days of completed jobs from Jobber, geocode service addresses, and map drive-time gaps and dead-leg miles between consecutive stops for every crew/day. Output: ranked list of top 10 worst routes (most dead-leg minutes), heat map of clustering opportunities by ZIP, and 3 concrete routing-change recommendations (e.g., move client X from Tuesday to Thursday, batch Jupiter Inlet Colony jobs adjacent to Abacoa). No live changes to Jobber routes — recommendations only, for Izzy review. This is the first quantified attack on Efficiency Focus tactics #1 (route optimization) and #3 (mileage waste) — both currently untouched in the queue despite being top-priority efficiency levers.",
    context: {
      assigns_to: 'Geordi La Forge',
      assigns_to_agent_id: 'ms-optimizer',
      estimated_time: 90,
      why_now:
        'Efficiency Focus has 6 proposals filed but zero address routing/mileage — the two highest-impact tactics in that focus. Jobber data is available and Geordi already has Jobber context from prior silent-client work.',
      source: 'MORNINGSTAR_PLAN.md → Growth Focus 3 (Efficiency) → tactics #1 and #3',
      deliverables: [
        'CSV: 30-day jobs with crew, start_time, end_time, address, lat/lng, dead-leg minutes to next job',
        'Top-10 worst-route list (by dead-leg minutes)',
        'ZIP clustering heat map (table form: ZIP × day-of-week × job count)',
        '3 concrete reroute proposals naming client + current day + proposed day + minutes saved estimate',
      ],
      success_criteria: [
        'At least 10 named jobs/clients ranked by dead-leg waste',
        'Each of 3 reroute proposals includes minutes-saved estimate + named clients affected',
        'No live Jobber changes — Izzy approves before any reroute',
      ],
      constraints: [
        'Read-only on Jobber',
        'If Jobber API auth is stale, flag for Izzy reconnect — do not block on it; export CSV manually',
      ],
    },
  },
  {
    priority: 'high',
    title: 'HOA common-area cleaning target list — 20 northern PBC HOAs via HOA Agent data',
    description:
      "Build a ranked list of 20 northern Palm Beach County HOA common-area cleaning targets, drawing directly on HOA Agent's database (table: communities). Filter: county='Palm Beach', city IN (Jupiter, Palm Beach Gardens, North Palm Beach, Juno Beach, Tequesta, Singer Island, Riviera Beach, Lake Park, Royal Palm Beach), status='published'. Rank by: master HOA size (unit_count desc), management_company present, registered_agent present, monthly_fee_median >= $400 (signals well-funded HOA). For each row output: canonical_name, city, unit_count, management_company, registered_agent, phone, website_url, and a 1-line pitch hook. Tag the 5 confirmed PBC masters in scope (PGA National, Mirasol, Abacoa Property Owners' Assembly, Evergrene, Ballenisles). Output is a doc-only research deliverable — no outreach yet. MorningStar is HOA Agent's #1 advertiser; this turns that strategic asset into a commercial-account pipeline.",
    context: {
      assigns_to: 'Wesley Crusher',
      assigns_to_agent_id: 'ms-marketing',
      estimated_time: 75,
      why_now:
        "Growth Focus 2 tactic #3 ('Premium tiers for luxury homes and HOA common-area contracts') is untouched. The northern-PBC property-manager target list (3:29 UTC, approved) is mgmt-co-focused; this is HOA-direct and exploits unique HOA Agent data leverage that no competitor has.",
      source: 'MORNINGSTAR_PLAN.md → Growth Focus 2 (Higher Revenue Per Client) → tactic #3 + Growth Focus 1 → property-manager outreach',
      deliverables: [
        'CSV with 20 rows: canonical_name, city, unit_count, mgmt_company, registered_agent, phone, website_url, monthly_fee_median, master_hoa_name (if sub), 1-line pitch hook',
        'Cover memo (1 page) explaining the HOA Agent data leverage and why these 20 ranked first',
      ],
      success_criteria: [
        'All 20 rows are status=published northern-PBC HOAs (verified by SQL)',
        'At least 12 of 20 have either management_company OR registered_agent populated',
        '5 named PBC masters included by reference (PGA, Mirasol, Abacoa, Evergrene, Ballenisles)',
        'Hook lines reference unit count or amenity context — not generic',
      ],
      constraints: [
        'Read-only on communities table',
        'Do not invent contact info — leave blank if HOA Agent row is blank',
        'No outreach in this task — list only; outreach drafts come in a follow-on proposal',
      ],
      data_source_note: 'communities table — Supabase project uacgzbojhjelzirvbphg. Use master_hoa_id + is_sub_hoa for master/sub detection per CLAUDE.md rule.',
    },
  },
  {
    priority: 'medium',
    title: 'Quarterly client retention check-in SOP — 90-day cadence + 5Q script + churn flags',
    description:
      "Design and document the quarterly retention check-in SOP. Components: (1) 90-day rolling calendar that pulls every recurring client into a Q1/Q2/Q3/Q4 bucket based on contract start month; (2) 5-question check-in script (e.g., 'On a scale of 1-10 how likely are you to recommend us?', 'Anything we should be doing differently?', 'Any rooms/services we're missing?', 'How is crew X working out?', 'Anything coming up — moves, renovations, family changes — we should plan for?'); (3) churn-flag rubric (NPS ≤6, missed visits in last 30d, complaint logged, fee pushback) → escalation to Izzy same-day; (4) tracking sheet (client, last check-in, NPS, flags, next check-in date). First live run: 2026-06-01, covering all Q2-anniversary recurring clients. No actual outreach in this task — SOP + sheet template + script only.",
    context: {
      assigns_to: 'Deanna Troi',
      assigns_to_agent_id: 'ms-outreach',
      estimated_time: 60,
      why_now:
        "Stability Focus tactic #2 ('Client retention check-ins quarterly') has zero coverage. The anniversary roster (14:30 UTC, pending) and post-job referral ask (20:13 UTC May 20, approved) are adjacent but neither is a proactive 90-day NPS-style cadence. >90% retention is a top-line success criterion in the plan.",
      source: 'MORNINGSTAR_PLAN.md → Growth Focus 4 (Stability) → tactic #2 + Success Criteria → "Client retention over 90% for recurring contracts"',
      deliverables: [
        'SOP doc (1 page): cadence, owner, escalation rules',
        '5-question check-in script (phone + email variant)',
        'Churn-flag rubric with explicit thresholds',
        'Tracking sheet template (Google Sheet / CSV columns spec)',
        'Q2-cohort first-run list — names pulled from anniversary roster once approved',
      ],
      success_criteria: [
        'SOP names a single owner (default: Troi-led, Izzy escalation)',
        'Script is conversational, fits under 8 minutes',
        '4 churn flags each have a binary trigger condition',
        'First-run date 2026-06-01 with bound client list (or list-on-deck stub if anniversary roster not yet built)',
      ],
      depends_on: [
        'Anniversary client roster CSV (proposal 14:30 UTC 2026-05-21, ms-quickbooks) — for first-run client list',
      ],
      constraints: [
        'No live outreach in this task — SOP and template only',
        'Script must not promise pricing or new services without checking pricing list (per plan THINGS THE CREW SHOULD NEVER DO)',
      ],
    },
  },
];

(async () => {
  await status.start(AGENT_ID, 'Picard: filing 3 gap-targeted proposals (route waste / HOA common-area / quarterly retention SOP)', proposals.length);
  await status.start('ms-research', 'Picard cycle (running as ms-research host) — 3 proposals targeting untouched plan tactics', proposals.length);

  let filed = 0;
  const filedIds = [];

  for (const p of proposals) {
    const row = {
      agent_id: AGENT_ID,
      company: COMPANY,
      priority: p.priority,
      title: p.title,
      description: p.description,
      status: 'pending',
      context: p.context,
    };

    const { data, error } = await supabase
      .from('agent_review_queue')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      console.error('Insert failed:', p.title, error.message);
      await status.error(AGENT_ID, `Insert failed: ${p.title} — ${error.message}`);
      process.exit(1);
    }

    filed += 1;
    filedIds.push({ id: data.id, title: p.title, priority: p.priority, assigns: p.context.assigns_to_agent_id });
    await status.progress(AGENT_ID, filed, `Filed: ${p.title}`);
    console.log(`Filed ${data.id} [${p.priority}] → ${p.context.assigns_to_agent_id}: ${p.title}`);
  }

  const summary = `Picard filed ${filed}/${proposals.length} gap-targeted proposals: route-waste audit (HIGH/Geordi), HOA common-area target list (HIGH/Wesley), quarterly retention SOP (MED/Troi). All target plan tactics with zero prior coverage.`;
  await status.complete(AGENT_ID, summary, { filed_ids: filedIds });
  await status.complete('ms-research', summary, { filed_ids: filedIds });
  console.log('\n' + summary);
})();
