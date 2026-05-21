const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });
const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGENT = 'ms-dir';
const COMPANY = 'morningstar';

const proposals = [
  {
    agent_id: AGENT,
    company: COMPANY,
    priority: 'high',
    status: 'pending',
    title: 'Silent-VIP re-engagement: 2 clients dark since Sept 2025',
    description:
      'Pull QBO customer list filtered to last_invoice_date between 2025-08-01 and 2025-09-30 AND prior-12mo revenue >= $1,500 to surface the two high-value clients flagged in MORNINGSTAR_PLAN "current top-of-mind issues." Confirm IDs with Izzy, then draft 2 personalized re-open messages (separate per client) with a no-pressure CTA — anniversary check-in framing, not a sales pitch. Deliverable: short doc naming both clients, last-job date, total revenue, draft email + draft SMS for each. No sends — Izzy approves before anything ships.',
    context: {
      assigns_to: 'Deanna Troi',
      assigns_to_agent_id: 'ms-outreach',
      estimated_time: 60,
      why_now: 'Plan flags these as top-of-mind. 8 months of silence is past the point where polite re-entry still works without specificity — every additional week makes the conversation harder. No other agent has been tasked with this.',
      source: 'CURRENT TOP-OF-MIND ISSUES + Growth focus #4 STABILITY (recurring contracts, retention)',
      deliverable: '2-client doc: name, last job, revenue, draft email + draft SMS each',
      no_sends: true,
      requires_izzy_approval: true
    }
  },
  {
    agent_id: AGENT,
    company: COMPANY,
    priority: 'high',
    status: 'pending',
    title: 'Erick RBN anchor-account 60-day early-warning scorecard',
    description:
      'Erick RBN is the largest client at 217 invoiced jobs — plan flags "protect that relationship." Build a one-page weekly scorecard from Jobber: on-time arrival %, missed/rescheduled visits, frequency drift vs prior 90-day baseline, supply cost per visit variance, any complaint mentions in notes. First run covers 2026-03-22 → 2026-05-21. Output is a 1-page PDF/markdown with a red/yellow/green per row. If any row is red, flag to Izzy same day. Goal: catch degradation 4 weeks before Erick would notice and complain.',
    context: {
      assigns_to: 'Geordi La Forge',
      assigns_to_agent_id: 'ms-optimizer',
      estimated_time: 75,
      why_now: 'Anchor account with single-customer concentration risk. No preventive monitoring exists. Plan explicitly says "protect that relationship" but no agent has been assigned protection work. Worth one ops cycle now to standardize.',
      source: 'CURRENT TOP-OF-MIND ISSUES (Erick RBN largest client) + Growth focus #4 STABILITY',
      deliverable: '1-page weekly scorecard, first run 2026-03-22 → 2026-05-21',
      cadence: 'weekly starting 2026-05-29 (Friday afternoon review slot)',
      escalation_rule: 'any red row → Izzy same day'
    }
  },
  {
    agent_id: AGENT,
    company: COMPANY,
    priority: 'medium',
    status: 'pending',
    title: 'BNI roster touchpoint-gap analysis: members untouched 60+ days',
    description:
      'Plan growth focus #1 (MORE CLIENTS) lists "BNI relationships — identify members untouched in 60+ days" as the top tactic. No agent has tackled this yet. Deliverable: pull current BNI chapter roster from Izzy (or chapter directory if shared), cross-reference last-touchpoint date from QBO notes, Jobber notes, Gmail thread history. Output: ranked CSV of members untouched ≥60 days with columns name, business, last-contact-date, referral-potential-note (1 line). No outreach in this proposal — research and ranked list only. Troi then drafts the actual messages in a follow-up cycle.',
    context: {
      assigns_to: 'Guinan',
      assigns_to_agent_id: 'ms-research',
      estimated_time: 45,
      why_now: 'Top-priority tactic in Growth Focus #1, zero work proposed against it. Pairs with success criterion "new client every two weeks." BNI is Izzy\'s warmest existing channel — leaving it cold is a lead-source bug.',
      source: 'Growth focus #1 MORE CLIENTS, tactic #1 BNI relationships',
      deliverable: 'ranked CSV of BNI members untouched ≥60 days with referral-potential notes',
      no_outreach: true,
      handoff: 'after ranking, ms-outreach (Troi) drafts messages in follow-up cycle'
    }
  }
];

(async () => {
  await status.start(AGENT, 'Picard: filing 3 gap-targeted proposals (silent VIPs / Erick RBN scorecard / BNI gap)', proposals.length);
  let n = 0;
  for (const p of proposals) {
    const { error } = await supabase.from('agent_review_queue').insert(p);
    if (error) {
      console.error('insert failed:', p.title, error.message);
      await status.error(AGENT, `Insert failed: ${p.title} — ${error.message}`);
      process.exit(1);
    }
    n++;
    await status.progress(AGENT, n, `Filed: ${p.title}`);
    console.log(`Filed ${n}/${proposals.length}: ${p.title}`);
  }
  await status.complete(
    AGENT,
    `Picard filed 3/3 gap-targeted proposals: silent-VIP re-engagement (HIGH/Troi), Erick RBN scorecard (HIGH/Geordi), BNI touchpoint gap (MED/Guinan).`
  );
  console.log('done.');
})();
