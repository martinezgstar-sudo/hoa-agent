// Picard Tour 15 — file 3 gap-targeted MorningStar proposals
const path = require('path');
const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGENT = 'ms-dir';

const proposals = [
  {
    agent_id: AGENT,
    company: 'morningstar',
    priority: 'high',
    title: 'Troi: BNI dormant-member roster — 60+ day silent contacts, personal outreach drafts',
    description:
      "Build the BNI dormant-member outreach roster the plan explicitly calls for: pull every BNI chapter contact Izzy has interacted with, flag those untouched in 60+ days, and draft one personalized message per contact (no sends — Izzy reviews). Output a single CSV: name, company, chapter, last_touch_date, days_silent, drafted_message, suggested_ask. The plan names BNI relationships as MORE CLIENTS tactic #1 and the 60-day rule is non-negotiable, but zero pending proposals address it.",
    status: 'pending',
    context: {
      assigns_to: 'Counselor Troi',
      assigns_to_agent_id: 'ms-outreach',
      estimated_time: 60,
      why_now:
        "Direct plan tactic with explicit 60-day threshold and zero coverage in the pending queue across 14 prior Picard tours. BNI is a warm-relationship channel and dormant contacts decay quickly.",
      source: 'MORNINGSTAR_PLAN.md › Four Growth Focuses › #1 MORE CLIENTS — tactic 1',
      deliverable: 'scripts/output/bni-dormant-roster-2026-05-24.csv',
      guardrails: ['No sends — drafts only', 'Izzy reviews every row before any outbound', 'Skip any contact with prior request-to-stop'],
      success_criteria: [
        'CSV produced with every BNI contact tagged active vs 60+ days silent',
        'At least 1 personalized draft per dormant contact',
        'Suggested ask is specific (referral, intro, coffee) — no generic check-ins'
      ]
    }
  },
  {
    agent_id: AGENT,
    company: 'morningstar',
    priority: 'high',
    title: 'Geordi: route-optimization + mileage-waste audit — Jobber data, 4-week window',
    description:
      "Pull the last 4 weeks of Jobber job data and produce a route-optimization audit: per-day crew route map, total miles, between-job dead-mileage, and a ranked list of the 10 worst inefficiencies (crews crossing the county twice in one day, jobs scheduled out of zone, gaps over 90 minutes). Recommend a revised weekly skeleton schedule grouping jobs by zip cluster. No Jobber writes — analysis + proposal only. The plan flags EFFICIENCY tactics #1 and #3 (route optimization, reduce mileage waste) as priority work but no pending proposal addresses scheduling geometry.",
    status: 'pending',
    context: {
      assigns_to: 'Geordi La Forge',
      assigns_to_agent_id: 'ms-optimizer',
      estimated_time: 90,
      why_now:
        "EFFICIENCY is one of the four equal-priority focuses and route waste compounds every week. Tour 14 covered key/access SOP but mileage geometry is the highest-ROI Geordi tactic still uncovered.",
      source: 'MORNINGSTAR_PLAN.md › Four Growth Focuses › #3 EFFICIENCY — tactics 1 and 3',
      deliverable: 'scripts/output/route-audit-2026-05-24.md + route-audit.csv',
      guardrails: ['Read-only on Jobber', 'Recommend — do not auto-apply schedule changes', 'Dorothy + Izzy approve any actual route changes'],
      success_criteria: [
        '4-week dead-mileage total quantified in miles and $ (IRS standard rate)',
        'Top-10 worst-day routes named with crew + date',
        'Revised zip-cluster weekly skeleton schedule proposed',
        'Estimated weekly mile savings stated'
      ]
    }
  },
  {
    agent_id: AGENT,
    company: 'morningstar',
    priority: 'medium',
    title: 'Tasha: lead-response SLA tracker — 4-hour first-touch dashboard + inbound channel audit',
    description:
      "Build the lead-response tracker the success criteria requires: 'Time from new lead inquiry to first response under 4 hours.' Output (a) an inventory of every inbound lead channel currently in use (Jobber request form, Google Business Profile, Facebook DM, voicemail, email, BNI referrals, website contact form), (b) a 30-day backlog audit showing time-to-first-response per lead with the 4-hour SLA breaches highlighted, and (c) a recommended monitoring cadence + alert rule. No sends. The success-criteria line is in the plan but no proposal tracks inbound speed.",
    status: 'pending',
    context: {
      assigns_to: 'Tasha Yar',
      assigns_to_agent_id: 'ms-email',
      estimated_time: 75,
      why_now:
        "Success criterion explicitly states under 4 hours but there is no visibility into current performance. Open-quote pipeline (existing proposal) covers post-quote follow-up; this is pre-quote first-touch — different stage of the funnel.",
      source: 'MORNINGSTAR_PLAN.md › Success Criteria — line 8',
      deliverable: 'scripts/output/lead-response-sla-2026-05-24.md + breaches.csv',
      guardrails: ['Read-only — no automated replies', 'Do not contact any lead without Izzy review', 'Anonymize any client PII not already in our system'],
      success_criteria: [
        'Full inbound channel inventory with current routing destination',
        '30-day SLA breach rate quantified (% under 4 hr / median / worst)',
        'Specific alert rule recommended (e.g., notify Izzy if any lead untouched 2 hr)'
      ]
    }
  }
];

(async () => {
  await status.start(AGENT, 'Picard Tour 15 — 3 uncovered morningstar proposals (BNI dormant, route audit, lead SLA)', proposals.length);

  let filed = 0;
  const filedTitles = [];
  for (const p of proposals) {
    const { data, error } = await supabase.from('agent_review_queue').insert(p).select('id').single();
    if (error) {
      console.error('Insert failed:', p.title, error.message);
      await status.error(AGENT, `Insert failed: ${p.title}: ${error.message}`);
      process.exit(1);
    }
    filed += 1;
    filedTitles.push(`${p.context.assigns_to} (${data.id.slice(0, 8)})`);
    await status.progress(AGENT, filed, `Filed ${filed}/${proposals.length}: ${p.context.assigns_to} (${data.id})`);
    console.log(`Filed ${filed}/${proposals.length}: ${p.priority} | ${p.title} | id=${data.id}`);
  }

  const summary = `Picard Tour 15 filed ${filed}/${proposals.length} uncovered morningstar proposals: HIGH/Troi BNI dormant roster, HIGH/Geordi route+mileage audit, MEDIUM/Tasha lead-response SLA.`;
  await status.complete(AGENT, summary, { filed_ids: filedTitles });
  console.log('\n' + summary);
})();
