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
    title: 'Client complaint intake log + triage SOP — bind Todd Cusumano as first row',
    description:
      "Build an ongoing complaint capture system: a 6-column log (date received, client name, channel, complaint summary, owner, status/resolution) plus a triage SOP (acknowledge within 4 hours, route to crew lead, resolution target 72 hours). Seed it with the Todd Cusumano scheduling complaint already pending in the queue from the gmail sweep — that row drives the May 29 follow-up. This makes Success Criterion #7 (zero complaints in last 30 days) actually measurable; today it's unverifiable. The approved Tasha 30-day audit produces a one-time snapshot — this proposal builds the recurring intake the audit plugs into going forward. Deliverable: complaint-log.csv + 1-page SOP, no client outreach (Izzy/Dorothy review before any reply lands).",
    context: {
      assigns_to: 'Tasha Yar',
      assigns_to_agent_id: 'ms-email',
      estimated_time: 45,
      why_now:
        'Success Criterion #7 currently unmeasurable; gmail sweep already surfaced Todd Cusumano with a hard May 29 follow-up date — needs a home before it falls through the cracks.',
      source:
        "MORNINGSTAR_PLAN.md → SUCCESS CRITERIA #7 (Zero job complaints in last 30 days) + downstream system for the approved 30-day-complaint audit (Tasha)",
      depends_on: ['gmail-sweep:Todd Cusumano May 29 follow-up'],
      gap_targeted: 'No ongoing complaint capture system exists; only a one-time audit is approved.',
    },
  },
  {
    priority: 'high',
    title: 'Subcontractor W-9 + business-license sweep — roster + missing-paperwork list',
    description:
      "Assemble the current 1099 contractor roster (every person/entity MorningStar has paid as a contractor in the last 12 months) into a single CSV: legal name, EIN/SSN-last-4, address, W-9 on file (Y/N + date), business license # + expiry (if applicable), insurance certificate on file (Y/N + expiry). Pull names from QBO 1099 vendor list once re-auth lands; cross-check against Jobber crew records. Output two artifacts: (a) clean roster CSV, (b) missing-paperwork punchlist ranked by $ paid YTD so Dorothy knows who to chase first. Do NOT email contractors — this is internal prep only. This is the prerequisite the 1099-vs-W-2 decision packet (acb57b31) and the January 1099 issuance both depend on, and no current proposal touches contractor paperwork.",
    context: {
      assigns_to: 'Beverly Crusher',
      assigns_to_agent_id: 'ms-quickbooks',
      estimated_time: 60,
      why_now:
        "January 1099 deadline is fixed and worker classification is top-of-mind; neither decision can land without knowing who's currently a 1099 and whose W-9 is on file. QBO re-auth pending block — queue this so it fires as soon as auth returns.",
      source:
        'MORNINGSTAR_PLAN.md → OPERATIONS ANNUALLY (January 1099s issued) + CURRENT TOP-OF-MIND ISSUES (worker classification, workers comp gap) + Growth Focus #3 EFFICIENCY tactic #6',
      depends_on: ['QBO MCP re-auth (existing pending item)'],
      gap_targeted:
        'No proposal in queue covers current contractor paperwork; all classification work assumes the roster exists.',
      blocked_by: 'QBO MCP token expired — re-auth required (existing approved item)',
    },
  },
  {
    priority: 'medium',
    title: 'GBP before/after photo library — 20-job catalog + client consent SMS template',
    description:
      "Stand up the visual asset pipeline that the approved Google Business Profile 30-day posting plan and the GBP review-ask cohort both implicitly require. Two deliverables: (1) 20-job before/after photo catalog organized by service type (residential recurring, commercial, deep clean, move-out) — pull from existing Jobber job photos where crews have already shot them, fill gaps with a 2-week field-collection ask to crew leads; (2) a 2-sentence client photo-consent SMS template Tasha can send once per active client with one-tap reply ('Y to allow'). Google rewards weekly photo uploads in Local Pack ranking; without an asset bank, Wesley's approved posting plan starves after week 1.",
    context: {
      assigns_to: 'Wesley Crusher',
      assigns_to_agent_id: 'ms-marketing',
      estimated_time: 60,
      why_now:
        'Approved GBP posting plan begins firing; without a photo bank the cadence will collapse after week 1. Photos also pair directly with the review-ask cohort already approved.',
      source:
        'MORNINGSTAR_PLAN.md → Growth Focus #1 MORE CLIENTS → tactic #3 (GBP optimization) — upstream asset pipeline for the approved GBP posting plan and review-ask cohort',
      pairs_with: ['Google Business Profile 30-day posting + Q&A plan (approved)', 'GBP review-ask cohort (pending)'],
      gap_targeted: 'No proposal in queue covers photo asset collection — only posting cadence and review-asking.',
    },
  },
];

(async () => {
  await status.start(AGENT_ID, 'Picard cycle: drafting gap-targeted proposals for Admiral inbox', proposals.length);

  let inserted = 0;
  const ids = [];
  for (let i = 0; i < proposals.length; i++) {
    const p = proposals[i];
    const { data, error } = await supabase
      .from('agent_review_queue')
      .insert({
        agent_id: AGENT_ID,
        company: 'morningstar',
        priority: p.priority,
        title: p.title,
        description: p.description,
        status: 'pending',
        context: p.context,
      })
      .select('id')
      .single();

    if (error) {
      console.error(`Insert failed for "${p.title}":`, error.message);
      await status.error(AGENT_ID, `Insert failed: ${error.message}`, { title: p.title });
      process.exit(1);
    }
    inserted += 1;
    ids.push(data.id);
    console.log(`[${i + 1}/${proposals.length}] inserted ${data.id} — ${p.priority.toUpperCase()} — ${p.title}`);
    await status.progress(AGENT_ID, inserted, `Filed proposal ${i + 1}: ${p.title}`);
  }

  const summary =
    `Picard filed ${inserted}/${proposals.length} gap-targeted proposals: ` +
    `complaint-intake log (HIGH/Tasha), W-9 sweep (HIGH/Beverly, QBO-blocked), GBP photo library (MED/Wesley). ` +
    `IDs: ${ids.join(', ')}.`;
  await status.complete(AGENT_ID, summary, { proposal_ids: ids });
  console.log('\n' + summary);
})();
