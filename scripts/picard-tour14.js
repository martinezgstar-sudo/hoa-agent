// Picard Tour 14 — file 3 genuinely uncovered MorningStar proposals
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });
const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const proposals = [
  {
    agent_id: 'ms-dir',
    company: 'morningstar',
    priority: 'high',
    status: 'pending',
    title: "Tasha: MorningStar Master Service Agreement template — recurring contract paper layer",
    description: "Plan §4 STABILITY tactic #1 explicitly names 'Recurring contracts over one-off jobs' but no proposal across 50+ pending MorningStar items produces the signed contract document. Tasha drafts a 2-page MSA template covering: scope (services + frequency + property address), term (12-month default w/ auto-renew), cancellation (30-day notice), price-change clause (annual w/ 60-day notice), payment terms (Net 7, ACH preferred, credit card surcharge), key/access handling, exclusions (windows, deep-clean, post-construction), indemnity boilerplate, governing law (FL), counterpart e-sign. Pairs with Tasha's queued canonical pricing list (11:46) and Wesley's commercial bid PDF (10:47) — neither produces a signed services agreement. No sends; output is the editable .docx + PDF + 1-page summary of what's negotiable vs. fixed. Ron Joseph to legal-review before live use.",
    context: {
      assigns_to: 'Tasha Yar',
      assigns_to_agent_id: 'ms-email',
      estimated_time: 90,
      why_now: "Plan §4 STABILITY #1 is the spine tactic of the entire focus area (recurring > one-off) and the actual contract document is missing from 50+ queued proposals. Every upgrade conversion (Geordi audit), every PM win (Troi), every HOA award lands on no paper. Pricing list + bid PDF are queued but neither IS the recurring services agreement.",
      source: 'Plan §4 STABILITY tactic #1 (Recurring contracts over one-off jobs)',
      deliverables: ['MSA template .docx + PDF', '1-page negotiable-vs-fixed summary', 'Ron Joseph legal-review handoff note'],
      pairs_with: ['11:46 Tasha canonical pricing list', '10:47 Wesley commercial bid PDF template', '12:33 Geordi upgrade-candidate audit'],
      no_sends: true
    }
  },
  {
    agent_id: 'ms-dir',
    company: 'morningstar',
    priority: 'high',
    status: 'pending',
    title: "Geordi: client key/access management SOP — inventory, intake, loss-liability rules",
    description: "Zero proposals across 50+ pending MorningStar items address physical client access — yet recurring residential cleaning means MorningStar holds keys, lockbox codes, alarm codes, gate fobs, and garage clickers for the entire recurring book. Lost-key liability ($200-$1500 per re-key event) currently sits on the company with no documented control. Geordi builds: (1) master access ledger spec (Jobber custom field or Google Sheet — one row per client w/ access type, who holds it, last-rotated date), (2) intake SOP at new-client onboarding (who receives, where stored, who has duplicate, photo evidence), (3) crew checkout/check-in log for daily key handling, (4) loss-event protocol (immediate client notification SLA, lock-change vendor, who pays), (5) crew-departure access-revocation checklist (deactivate, return all, alarm-code rotation). No live deployment in this pass — spec + templates only.",
    context: {
      assigns_to: 'Geordi La Forge',
      assigns_to_agent_id: 'ms-optimizer',
      estimated_time: 75,
      why_now: "Recurring residential cleaning book = MorningStar holds keys/codes for hundreds of homes with no documented control. Insurance audit + COI work (queued) will surface this gap; a single lost-key incident at a Boca West home = $400-$1500 re-key + client trust hit. No proposal in 50+ pending touches access management.",
      source: 'Plan §4 STABILITY (recurring contracts) + §3 EFFICIENCY (eliminate worker gray areas) — access controls are infrastructure for both',
      deliverables: ['Master access ledger spec', 'Onboarding intake SOP', 'Crew check-in/out log template', 'Loss-event protocol w/ vendor + SLA', 'Crew-departure revocation checklist'],
      pairs_with: ['Queued Beverly W-2/1099 + IC agreement work (departure = revocation)', 'Wesley crew recruiting funnel'],
      no_sends: true
    }
  },
  {
    agent_id: 'ms-dir',
    company: 'morningstar',
    priority: 'medium',
    status: 'pending',
    title: "Wesley: client + crew referral incentive program — payout structure + ask script",
    description: "Tasha's anniversary+referral-ask cadence SOP (queued 2026-05-23T09:46) defines the ASK but not the REWARD — the queue has no proposal that pins down the actual referral payout structure. Wesley specs: (1) client-to-client referral reward (recommended: $50 account credit to referrer + $25 first-clean discount to referee, paid on referee's 2nd completed job to filter bounces), (2) crew-driven referral reward (recommended: $75 cash to crew member after referee's 1st month, $50 to client referee), (3) BNI / London Foster realtor partner referral fee (recommended: $100/closed-account flat, not %), (4) tracking mechanism (Jobber tag 'Source: Referral - [Name]'), (5) breakeven math: cost of reward vs LTV (uses Beverly's pending 24-month LTV model). No live launch — proposal includes 3 payout tiers (lean, standard, aggressive) with breakeven assumptions for Admiral to pick.",
    context: {
      assigns_to: 'Wesley Crusher',
      assigns_to_agent_id: 'ms-marketing',
      estimated_time: 60,
      why_now: "Tasha's queued referral-ask cadence has no payout structure paired to it — running a referral ask without defined incentives = inconsistent rewards, crew confusion, lost referrers. London Foster realtor packet (Troi queued) + BNI 60-day outreach (Troi queued) both depend on referral economics being defined. SUCCESS CRITERIA #1 (new client every 2 weeks) is most cheaply served by warm referrals.",
      source: 'Plan §4 STABILITY tactic #4 (Build a referral asking habit) + §1 MORE CLIENTS realtor/BNI lanes',
      deliverables: ['3-tier payout matrix (lean/standard/aggressive) w/ breakeven math', 'Jobber tracking-tag spec', 'Crew + client + partner ask scripts', '1-page Admiral decision summary'],
      pairs_with: ['Tasha 2026-05-23T09:46 referral-ask cadence', 'Troi London Foster packet', 'Troi BNI 60-day list', 'Beverly 24-month LTV model'],
      no_sends: true
    }
  }
];

(async () => {
  let filed = 0;
  for (const p of proposals) {
    const { data, error } = await sb.from('agent_review_queue').insert(p).select('id').single();
    if (error) {
      console.error('FAIL:', p.title, '-', error.message);
      await status.error('ms-dir', `Insert failed: ${p.title} - ${error.message}`);
      process.exit(1);
    }
    filed++;
    console.log(`Filed ${filed}/3: ${p.context.assigns_to} (${data.id})`);
    await status.progress('ms-dir', filed, `Filed ${filed}/3: ${p.context.assigns_to} (${data.id})`);
  }
  await status.complete('ms-dir', `Picard Tour 14 filed 3/3 uncovered morningstar proposals: HIGH/Tasha MSA template, HIGH/Geordi key-access SOP, MEDIUM/Wesley referral payout program.`);
  console.log('DONE');
})();
