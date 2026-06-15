// Picard Tour 12 — file 3 genuinely uncovered morningstar proposals after scanning 173 existing
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGENT_ID = 'ms-dir';

const proposals = [
  {
    priority: 'high',
    title: 'Wesley: FL summer revenue defense — snowbird-dip Jun-Sep MRR protection plan',
    description: 'Build a 4-month (Jun-Sep 2026) revenue defense plan for the structural snowbird departure that hits all PBC residential cleaning businesses. Deliverable: (1) ranked list of MorningStar clients flagged as seasonal snowbirds vs full-time residents, (2) two MRR-protection offers — vacation-watch service for absent owners and pre-season deep-clean for arrivals, (3) one outreach calendar mapping who hears which offer when. NO sends. NO pricing commitment without Izzy sign-off. Pairs with but distinct from hurricane comms packet (#60).',
    context: {
      assigns_to: 'Wesley Crusher',
      assigns_to_agent_id: 'ms-marketing',
      estimated_time: 90,
      why_now: 'SUCCESS CRITERIA #2 (MRR trending upward) is structurally at risk every Jun-Sep when snowbirds leave PBC. Across 173 pending proposals only hurricane-season comms (#60) addresses summer — operationally, not for revenue. June starts in 7 days; defensive offers need to ship before clients pause service themselves.',
      source: 'SUCCESS CRITERIA #2 (MRR upward) + GROWTH FOCUS #2 (specialty/bundle) + GROWTH FOCUS #4 STABILITY (recurring contracts)',
      deliverable: '~/Agents/morningstar/output/summer-revenue-defense-2026.md',
      blockers: 'none — research + draft only; client snowbird tagging may need owner input'
    }
  },
  {
    priority: 'medium',
    title: 'Tasha: late-cancel / no-show / reschedule fee policy + 24h notice SOP (no sends)',
    description: 'Draft MorningStar cancellation policy covering: (a) >24h notice — free reschedule, (b) <24h notice — 50% fee, (c) at-door no-show — 100% fee, (d) crew arrival but client refuses entry — 100% fee. Include client-facing one-pager language, crew-facing decision tree, and Jobber field-name list to track each event type. Service guarantee SOP (#70) covers POST-job rework; this covers PRE-job cancellation revenue leak. NO client notifications yet — owner must approve enforcement posture first.',
    context: {
      assigns_to: 'Tasha Yar',
      assigns_to_agent_id: 'ms-email',
      estimated_time: 60,
      why_now: 'Zero proposals across 173 address pre-job cancellation revenue. Industry baseline is 25-50% no-show fee — every <24h cancel currently absorbs full crew labor cost with zero billing. With Friday payroll non-negotiable, uncompensated cancel days directly threaten that floor.',
      source: 'GROWTH FOCUS #3 EFFICIENCY (margin protection) + SUCCESS CRITERIA #2 (MRR) + adjacent to service-guarantee SOP #70',
      deliverable: '~/Agents/morningstar/output/cancellation-policy-2026-05-24.md',
      blockers: 'none — draft only; owner approves enforcement before any client notice'
    }
  },
  {
    priority: 'high',
    title: 'Guinan: HOA Agent → MorningStar cross-sell map — N-PBC masters w/ matching service area',
    description: 'Build a cross-pollination map between the two sister companies. Query HOA Agent DB (Supabase: communities table, status=published) for masters in northern PBC ZIPs matching MorningStar service area (Jupiter 33458/33477/33469, PBG 33410/33418, Juno Beach 33408, North PB 33403/33408, Tequesta 33469). Confirmed N-PBC masters per CLAUDE.md: PGA National (40 subs), Mirasol (30 subs), BallenIsles (2 subs), Evergrene (6 subs), Abacoa (43 subs). Deliverable: ranked CSV of 10 candidate masters with registered_agent + management_company + sub-count for each, ready for Troi PM-outreach pairing. NO outreach.',
    context: {
      assigns_to: 'Guinan',
      assigns_to_agent_id: 'ms-research',
      estimated_time: 75,
      why_now: 'Structurally unique MorningStar advantage no competitor has — Izzy owns the HOA Agent DB. Zero proposals across 173 leverage sister-company data. Existing HOA common-area target lists (#51, #98, #152) are generic and not derived from HOA Agent — this closes that loop with named master HOAs and verified registered agents.',
      source: 'GROWTH FOCUS #1 MORE CLIENTS (PM outreach + commercial accounts) + cross-portfolio leverage unique to Izzy',
      deliverable: '~/Agents/morningstar/output/hoa-agent-crosssell-npbc-2026-05-24.csv',
      blockers: 'none — read-only Supabase query against HOA Agent DB; uses verified columns master_hoa_id + is_sub_hoa per CLAUDE.md'
    }
  }
];

(async () => {
  await status.start(AGENT_ID, 'Picard Tour 12 — 3 genuinely uncovered morningstar proposals (summer-MRR / cancel-fee / HOA-Agent cross-sell)', proposals.length);

  let filed = 0;
  const results = [];
  for (const p of proposals) {
    const { data, error } = await supabase
      .from('agent_review_queue')
      .insert({
        agent_id: AGENT_ID,
        company: 'morningstar',
        priority: p.priority,
        title: p.title,
        description: p.description,
        status: 'pending',
        context: p.context
      })
      .select('id')
      .single();

    if (error) {
      console.error(`FAIL: ${p.title} — ${error.message}`);
      await status.error(AGENT_ID, `Insert failed on "${p.title}": ${error.message}`);
      process.exit(1);
    }
    filed++;
    results.push({ id: data.id, assigns_to: p.context.assigns_to, priority: p.priority });
    console.log(`Filed ${filed}/${proposals.length}: [${p.priority}] ${p.context.assigns_to} — ${data.id}`);
    await status.progress(AGENT_ID, filed, `Filed ${filed}/${proposals.length}: ${p.context.assigns_to} (${data.id.slice(0,8)})`);
  }

  const summary = `Picard Tour 12 filed 3/3 genuinely-uncovered morningstar proposals: HIGH/Wesley summer-MRR defense (${results[0].id.slice(0,8)}), MED/Tasha cancel-fee SOP (${results[1].id.slice(0,8)}), HIGH/Guinan HOA-Agent N-PBC cross-sell map (${results[2].id.slice(0,8)}).`;
  await status.complete(AGENT_ID, summary, { proposal_ids: results.map(r => r.id) });
  console.log('\n' + summary);
})();
