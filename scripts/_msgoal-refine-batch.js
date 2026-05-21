require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const refinements = [
  {
    id: '6c1ad6c9-a3a4-400e-b204-fdfdbfe934c8',
    title: 'GBP photo library: 20-pair before/after catalog + consent SMS + crew capture SOP',
    description: 'Stand up the visual-asset pipeline that the approved GBP 30-day posting plan and the GBP review-ask cohort both implicitly require. Deliverables: (1) 20-pair before/after catalog organized by service type (≥5 each: residential recurring, commercial, deep clean, move-out) — pull existing Jobber photos first, gap-fill with a 2-week crew-lead field-collection ask; (2) 2-sentence client photo-consent SMS template with one-tap reply ("Y to allow"); (3) 1-page crew capture SOP defining when/how to shoot, naming convention, and upload path. Google rewards weekly photo uploads in Local Pack ranking; without an asset bank Wesley\'s approved posting plan starves after week 1. No external posting yet — pipeline build only.',
    context_add: {
      success_criteria: [
        'Catalog spreadsheet exists with ≥20 rows; columns: service_type, job_id, before_url, after_url, client_consent (Y/N/pending), capture_date',
        'Distribution: ≥5 residential recurring, ≥5 commercial, ≥5 deep clean, ≥5 move-out — counts visible at top of sheet',
        'Gap report names which N of 20 came from existing Jobber photos vs. require new field collection',
        '1-page crew capture SOP saved with naming convention + upload path documented',
        'Consent SMS template ≤2 sentences with explicit one-tap reply convention drafted',
        'Zero photos used externally until client_consent column = Y'
      ],
      effort_estimate: {
        minutes: 60,
        complexity: 'medium',
        risk: 'low',
        blockers: ['Jobber photo export access'],
      },
      ms_goal_refined_at: new Date().toISOString(),
      ms_goal_refined_notes: 'Title lengthened to surface all 3 deliverables (catalog, SMS, SOP). Added 4th deliverable (capture SOP) since "crew capture pipeline" was implied but not bound. Distribution requirement made explicit so Wesley does not under-cover commercial.'
    }
  },
  {
    id: '35c5396a-515f-4194-8c19-9ea1d20eaddd',
    title: '1099 contractor roster + W-9/license/COI gap list — prereq for classification packet',
    description: 'Assemble every person/entity MorningStar has paid as a contractor in the last 12 months into a single CSV: legal_name, EIN_or_SSN_last4, address, W-9 on file (Y/N + date), business license # + expiry, insurance COI (Y/N + expiry), YTD $ paid. Pull names from QBO 1099 vendor list (once re-auth lands) cross-checked against Jobber crew records. Output two artifacts: (a) clean roster CSV, (b) missing-paperwork punchlist sorted descending by YTD $ paid so Dorothy knows who to chase first. No outbound contact to contractors — internal prep only. Prerequisite for the 1099-vs-W-2 decision packet (acb57b31) and the January 1099 issuance; no current proposal touches contractor paperwork.',
    context_add: {
      success_criteria: [
        'roster.csv exists with one row per contractor paid in last 12 months (filename + path documented)',
        'Required columns present: legal_name, EIN_or_SSN_last4, address, w9_on_file, w9_date, business_license_number, license_expiry, coi_on_file, coi_expiry, ytd_paid_dollars',
        '≥95% of contractor names reconciled between QBO 1099 vendor list and Jobber crew records (mismatches listed)',
        'Missing-paperwork punchlist sorted DESC by ytd_paid_dollars with each row tagged: w9_missing | license_missing | license_expired | coi_missing | coi_expired',
        'Zero outbound communication to contractors (verified by activity log)',
        'Hand-off note bridges roster → acb57b31 (decision packet) and the January 1099 issuance workflow'
      ],
      effort_estimate: {
        minutes: 60,
        complexity: 'medium',
        risk: 'medium',
        blockers: ['QBO MCP re-auth required before QBO vendor pull'],
      },
      ms_goal_refined_at: new Date().toISOString(),
      ms_goal_refined_notes: 'Title sharpened to lead with the deliverable (roster) and name the downstream consumer (classification packet). Schema fully spec\'d so artifact is unambiguous. Reconciliation rate threshold added (≥95%) so completion is measurable instead of vibes.'
    }
  },
  {
    id: '052caa2e-25c0-4279-a1ba-b32c7f759bc4',
    title: 'Complaint log + 4hr triage SOP — Todd Cusumano seeded row 1, May 29 follow-up bound',
    description: 'Build the recurring complaint capture system Success Criterion #7 requires: a 6-column log (date_received, client_name, channel, summary, owner, status_resolution) plus a 1-page triage SOP (acknowledge ≤4 hrs, route to crew lead, resolution target 72 hrs, escalate to Izzy at 24 hrs unresolved). Seed row 1 with the Todd Cusumano scheduling complaint already pending from the gmail sweep — that row drives the May 29 follow-up. Distinct from the approved Tasha 30-day audit (one-time snapshot); this builds the recurring intake the audit plugs into. Deliverable: complaint-log.csv + 1-page SOP. NO client outreach — Izzy/Dorothy must review before any reply lands.',
    context_add: {
      success_criteria: [
        'complaint-log.csv exists at documented path with exactly the 6 columns specified',
        'Todd Cusumano seeded as row 1 with May 29 follow-up date in status_resolution field',
        '1-page triage SOP defines acknowledgment SLA (≤4 hrs), routing rule, 72-hr resolution target, 24-hr escalation to Izzy',
        'status_resolution field constrained to finite values: new | acknowledged | in_progress | resolved | escalated',
        'Friday weekly-review template (f835052e) references this file as its source for Criterion #7',
        'Zero outbound replies sent (verified — Izzy/Dorothy approval required for any client-facing message)'
      ],
      effort_estimate: {
        minutes: 45,
        complexity: 'low',
        risk: 'low',
        blockers: [],
      },
      ms_goal_refined_at: new Date().toISOString(),
      ms_goal_refined_notes: 'Title now names the SLA (4hr) and the seed row + date, so Tasha can\'t complete this without binding the Todd follow-up. Status field enum locked so the file is machine-queryable. Linked to f835052e (Friday review) so Criterion #7 measurability has a closed loop.'
    }
  }
];

(async () => {
  for (const r of refinements) {
    const { data: existing, error: readErr } = await supabase
      .from('agent_review_queue')
      .select('context')
      .eq('id', r.id)
      .single();
    if (readErr) { console.error('read err', r.id, readErr); process.exit(1); }

    const newContext = { ...(existing.context || {}), ...r.context_add };
    const { error: updErr } = await supabase
      .from('agent_review_queue')
      .update({
        title: r.title,
        description: r.description,
        context: newContext,
        updated_at: new Date().toISOString(),
      })
      .eq('id', r.id);
    if (updErr) { console.error('update err', r.id, updErr); process.exit(1); }
    console.log('refined', r.id, '→', r.title);
  }
  console.log('done — refined', refinements.length);
})();
