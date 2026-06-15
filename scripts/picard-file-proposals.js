const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const proposals = [
  {
    agent_id: 'ms-dir',
    company: 'morningstar',
    priority: 'high',
    title: 'Wesley: STR (Airbnb/VRBO) turnover service line — SKU + pricing band + 5 host targets',
    status: 'pending',
    description: 'Northern PBC (Singer Island, Juno Beach, Jupiter, Palm Beach) has heavy short-term rental concentration. STR turnovers are a distinct service from move-in/move-out (49, 79, 129): 2-4 hour same-day window, 1.5-4x premium per turn, recurring weekly cadence per host = direct MRR multiplier. Wesley specs the SKU (scope checklist, linen handling, restock policy, photo-doc requirement, response-time SLA), pricing band by sqft tier, and pulls a starter list of 5 multi-property STR hosts from public Airbnb/VRBO listings in northern PBC. No outreach until Admiral approves the pack.',
    context: {
      assigns_to: 'Wesley Crusher',
      assigns_to_agent_id: 'ms-marketing',
      estimated_time: 90,
      why_now: 'Zero coverage across 158 pending/approved proposals despite STR being a named-different service from move-in/out and a direct hit on §2 HIGHER REVENUE tactic #5 (specialty services). Lead-source diversification (TOP-OF-MIND #5) needs a new channel — STR hosts are a B2B-like buyer with recurring high-frequency demand that residential one-offs cannot match. Quick-win productization that pairs with the upcoming Guinan STR market scan.',
      source: 'PLAN: §2 HIGHER REVENUE PER CLIENT tactic #5 (specialty services) + §1 MORE CLIENTS (channel diversification) + TOP-OF-MIND #5 (lead source diversification)'
    }
  },
  {
    agent_id: 'ms-dir',
    company: 'morningstar',
    priority: 'medium',
    title: 'Guinan: STR market scan northern PBC — host density, avg cleaning fee, top-3 competitor pricing',
    status: 'pending',
    description: 'Research counterpart to the Wesley STR SKU spec. Guinan pulls public Airbnb + VRBO data for Singer Island, Juno Beach, Jupiter, Palm Beach Gardens, Palm Beach, West Palm Beach: count active listings, identify multi-property hosts (3+ listings = pro operators = best targets), capture each listing public cleaning fee, and document the top 3 STR-specialist cleaning competitors active in northern PBC including their advertised per-turn rates, SLA promises, and any visible service gaps. Output: 1-page market sizing + competitor positioning brief that feeds Wesley pricing band and target-list work.',
    context: {
      assigns_to: 'Guinan',
      assigns_to_agent_id: 'ms-research',
      estimated_time: 75,
      why_now: 'Wesley STR SKU proposal (paired) needs pricing-band evidence and host-count sizing before Admiral can decide whether to fund the new service line. Guinan owns competitor research per the crew roster. Pairs cleanly with lead-source diversification scorecard (35) and Yelp/Thumbtack/Angi scan (24) by adding the STR vertical absent from those. No existing proposal touches STR.',
      source: 'PLAN: §1 MORE CLIENTS (lead source diversification, competitor intel) + TOP-OF-MIND #5 + crew roster (Guinan = competitor research)'
    }
  },
  {
    agent_id: 'ms-dir',
    company: 'morningstar',
    priority: 'high',
    title: 'Beverly: S-Corp reasonable-compensation memo for Izzy + Dorothy LLCs — Ron Joseph review packet (no filings)',
    status: 'pending',
    description: 'Plan ANNUALLY rhythm names two 1120-S filings (Ismael Martinez LLC + Dorothy Hidalgo LLC). IRS treats unreasonably low S-corp owner wages as the #1 audit trigger — and overpaying leaks payroll tax unnecessarily. Beverly pulls 2025 gross revenue per LLC, current W-2 wages per owner, and net distribution, then builds a 1-page reasonable-comp analysis using IRS factors (role, hours, comparable salaries for cleaning-business operators in PBC, replacement-cost analysis). Output goes to Ron Joseph CPA for final call — no payroll changes, no filings. Strictly an analytical packet that gives Ron the numbers he needs before tax season opens.',
    context: {
      assigns_to: 'Beverly Crusher',
      assigns_to_agent_id: 'ms-quickbooks',
      estimated_time: 105,
      why_now: 'Two of four named tax filings in the ANNUALLY rhythm are owner-level 1120-S returns, and reasonable-comp is the spine of S-corp tax planning — yet zero proposals across 158 touch owner compensation. Beverly Q2 estimated-tax packet (97) covers estimated payments but does not analyze the wages-vs-distribution split. Workers comp + 1099/W-2 stack (17, 51, 86, 92, 115, 132) all touch crew payroll but owner payroll is structurally distinct and explicitly named (Things The Crew Should Never Do #3: Dorothy owns payroll modification — this proposal honors that by routing to Ron Joseph for the actual decision). Building the memo now decouples analytical work from filing-season crunch (Jan 2027).',
      source: 'PLAN: §OPERATIONS ANNUALLY (1120-S filings for both LLCs) + Things The Crew Should Never Do #1/#3 (Ron Joseph files; Dorothy owns payroll) + TOP-OF-MIND #1 (classification structure)'
    }
  }
];

(async () => {
  await status.start('ms-dir', 'Picard: filing 3 gap-targeted proposals (Tour 6 — STR + S-corp owner comp)', proposals.length);
  let filed = 0;
  const results = [];
  for (const p of proposals) {
    const { data, error } = await supabase
      .from('agent_review_queue')
      .insert(p)
      .select('id, title, priority')
      .single();
    if (error) {
      console.error(`FAIL: ${p.title} — ${error.message}`);
      await status.error('ms-dir', `Insert failed: ${error.message}`);
      process.exit(1);
    }
    filed++;
    results.push({ id: data.id, title: data.title, priority: data.priority, assigns_to: p.context.assigns_to });
    await status.progress('ms-dir', filed, `Filed ${filed}/${proposals.length}: ${p.context.assigns_to} — ${p.title.slice(0,70)} (${data.id.slice(0,8)})`);
    console.log(`Filed [${data.priority}] ${data.id} — ${data.title}`);
  }
  const summary = `Picard filed 3/3 gap-targeted proposals (Tour 6) — all hitting zero-coverage areas in the 158-row queue: HIGH/Wesley STR Airbnb/VRBO turnover service line + targets (${results[0].id.slice(0,8)}), MEDIUM/Guinan STR market scan + competitor pricing (${results[1].id.slice(0,8)}), HIGH/Beverly S-Corp reasonable-comp memo for Izzy + Dorothy LLCs routed to Ron Joseph CPA (${results[2].id.slice(0,8)}).`;
  await status.complete('ms-dir', summary, { proposal_ids: results.map(r => r.id) });
  console.log('\n' + summary);
})();
