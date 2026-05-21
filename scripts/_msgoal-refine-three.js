// Refine the 3 newest unrefined ms-dir proposals (no ms_goal_refined_at).
const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/izzymartinez/Documents/hoa-agent/.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const AGENT = 'ms-goal';
const REFINED_AT = new Date().toISOString();

const refinements = [
  {
    id: 'fbd8ef32-de12-4085-9161-f1b35ad9345a',
    title: 'Revenue-mix tracker — 12mo recurring vs one-off split + Top-10 one-off conversion list for Troi',
    description: 'MORNINGSTAR_PLAN section 4 STABILITY tactic #1 ("Recurring contracts over one-off jobs") has no baseline metric. Beverly pulls 12 months of QBO Sales-by-Customer (post-reauth), buckets each customer as RECURRING (>=3 invoices same service line within a rolling 90-day window AND average inter-invoice gap <=45 days) or ONE-OFF (everything else). Output 3 artifacts: (1) monthly_recurring_share.csv — 12 rows, columns: month, recurring_revenue, oneoff_revenue, recurring_share_pct; (2) oneoff_top10.csv — top 10 one-off customers DESC by trailing-12mo $; (3) summary.md — 1-page trend read (is recurring share rising/falling MoM), current mix vs proposed target (>=60% recurring), and the explicit hand-off to Troi for deepening outreach. Reporting only — zero customer reclassification in QBO.',
    context_patch: {
      ms_goal_refined_at: REFINED_AT,
      ms_goal_refined_notes: 'Title now names both deliverables (tracker + conversion list) and the downstream consumer (Troi). Locked the "recurring" definition (>=3 invoices same service + <=45d avg gap) so the bucketing is reproducible. Added explicit target mix (>=60% recurring) so the summary has a yardstick. Pinned 3 artifact filenames + column schemas so completion is verifiable on inspection.',
      success_criteria: [
        '3 artifacts saved: ~/Agents/morningstar/reports/monthly-recurring-share-2026-05.csv, ~/Agents/morningstar/reports/oneoff-top10-2026-05.csv, ~/Agents/morningstar/reports/revenue-mix-summary-2026-05.md',
        'Recurring definition explicit in summary header: >=3 invoices same service line within rolling 90 days AND avg inter-invoice gap <=45 days',
        'monthly CSV has exactly 12 rows (one per month back through 2025-06) with columns month,recurring_revenue,oneoff_revenue,recurring_share_pct',
        'Top-10 CSV ranked DESC by trailing-12mo $ with columns customer_name, ttm_revenue, invoice_count, last_invoice_date, deepening_hook (1-line)',
        'Summary names current recurring share %, MoM trend direction (rising / flat / falling), gap to >=60% target, and Troi hand-off note',
        'Zero customer reclassification in QBO (read-only verified)',
        'Hand-off note to success-criteria tracker (f38dae07) so MRR row pulls from same source-of-truth definition'
      ],
      effort_estimate: { minutes: 60, complexity: 'medium', risk: 'low', blockers: ['QBO MCP re-auth required for Sales-by-Customer pull'] },
      blocked_by: 'QBO MCP token expired — re-auth required'
    }
  },
  {
    id: 'e69eda95-8726-49b9-be69-b17e636548d8',
    title: 'Workers comp decision packet — 3 carrier quote ranges + W-2 breakeven at $150K/$250K/$400K (no bind)',
    description: 'MORNINGSTAR_PLAN names "Workers comp coverage gap if we shift to W-2" as an unresolved blocker on the worker-classification decision. Beverly assembles a decision-ready packet (no policy binding): (a) pre-quote ranges from 3 carriers for FL SIC 7349 / NAICS 561720 / class code 9014 (Building Cleaning) — Hartford, Travelers, and either Employers Mutual or FL Citizens — sourced via named broker calls, not invented; (b) 3-scenario cost-impact table (current 1099 model vs W-2+WC) at projected annual payroll $150K / $250K / $400K with explicit FICA+FUTA+SUTA+WC math shown; (c) breakeven point (payroll $ at which 1099 cost equals W-2+WC); (d) 1-page recommendation memo for Ron Joseph CPA review. Crew NEVER binds coverage, NEVER files with FL Division of Workers Comp — Izzy + Dorothy + Ron decide and Ron files. Packet only.',
    context_patch: {
      ms_goal_refined_at: REFINED_AT,
      ms_goal_refined_notes: 'Title now names the 3-scenario payroll breakdown explicitly and the no-bind constraint. Locked NAICS/class code (561720 / 9014) so quote requests are apples-to-apples. Required broker names with quote rather than invented numbers (audit trail). Added breakeven point as a deliverable so the memo has a sharp recommendation hook instead of just side-by-side columns.',
      success_criteria: [
        'Packet saved to ~/Agents/morningstar/reports/wc-decision-packet-2026-05-21.md',
        '3 carriers named with broker contact + date of quote range (Hartford + Travelers + 1 of {Employers Mutual, FL Citizens}) — no invented premiums',
        'NAICS 561720 / class code 9014 (Building Cleaning) sourced explicitly in packet header',
        'Cost-impact table shows 1099 vs W-2+WC at $150K / $250K / $400K annual payroll with FICA + FUTA + SUTA + WC components broken out',
        'Breakeven payroll $ stated (where 1099 cost = W-2+WC cost)',
        '1-page recommendation memo for Ron Joseph CPA at ~/Agents/morningstar/drafts/ron-joseph-wc-2026-05-21.md — NOT sent (Izzy reviews first)',
        'Zero coverage bound, zero filings with FL Division of Workers Comp (verified)',
        'Hand-off note bridges packet -> 1099 vs W-2 memo (acb57b31) and contractor roster (35c5396a) so the classification decision can close in one Ron Joseph review cycle'
      ],
      effort_estimate: { minutes: 120, complexity: 'high', risk: 'medium', blockers: ['QBO payroll projection needs current Jobber crew count', 'Broker availability for 3 quotes'] },
      non_goals: ['Bind workers comp coverage', 'File with FL Division of Workers Comp', 'Make classification decision without Ron Joseph review']
    }
  },
  {
    id: '9073d84e-abad-4a5d-818b-e7b1ff0c6fa8',
    title: 'London Foster realtor packet — 15-20 ranked colleagues + 3 email variants + tracking sheet (no sends)',
    description: 'Izzy is a licensed FL realtor with London Foster relationships; MORNINGSTAR_PLAN section 1 MORE CLIENTS names realtor referrals as a top-priority tactic with zero current queue coverage. Troi delivers: (a) 15-20 person ranked CSV of London Foster colleagues Izzy has transacted with or co-listed alongside in the last 12 months — Izzy supplies seed names, Troi structures the file (columns: colleague_name, brokerage_office, last_transaction_or_co_list_date, relationship_strength_1to3, best_contact_channel); (b) 3 email draft variants saved as separate files — V1 "I clean for your clients" intro, V2 move-in/move-out specialty offer with $/turn anchor pulled from master pricing list (51a30fc6), V3 recurring-client referral kickback structure; (c) tracking sheet template (first-touch date / response / converted). ZERO sends — Izzy approves each colleague before contact. Distinct from the existing London Foster referral kit proposal (319e1b66, owned by Wesley) which builds the agent-facing one-pager and price card — Troi owns the outreach CSV + email drafts + tracking; Wesley owns the marketing collateral. Hand-off note bridges the two.',
    context_patch: {
      ms_goal_refined_at: REFINED_AT,
      ms_goal_refined_notes: 'Title now names all 3 deliverables (ranked CSV + email variants + tracking) and the no-send constraint. Cross-linked to 319e1b66 (Wesley London Foster kit) and explicitly partitioned ownership so the two proposals do not duplicate work: Troi owns outreach drafting, Wesley owns marketing collateral. Pricing-list dependency (51a30fc6) made explicit so V2 cannot ship with invented $/turn.',
      success_criteria: [
        'Ranked CSV at ~/Agents/morningstar/reports/london-foster-troi-2026-05-21.csv with 15-20 rows (or "awaiting Izzy seed names" flag if blocked)',
        'CSV columns present: colleague_name, brokerage_office, last_transaction_or_co_list_date, relationship_strength_1to3, best_contact_channel',
        '3 email drafts saved as separate files at scripts/output/london-foster-v1-intro.md, v2-movein-moveout.md, v3-referral-kickback.md',
        'V2 (move-in/move-out) draft references the master pricing list (51a30fc6) for $/turn anchor — blank or "TBD" if pricing list not yet built (no invented rates)',
        'V3 (referral kickback) names exact $ or % structure (proposed, for Izzy review)',
        'Tracking sheet template at ~/Agents/morningstar/reports/london-foster-tracking-2026-05-21.csv with columns: colleague_name, first_touch_date, channel, response, converted_yes_no, notes',
        'Zero outbound sends — Izzy approves each colleague + draft before contact',
        'Hand-off note explicit: Troi owns outreach assets; Wesley (319e1b66) owns the marketing one-pager + price card — no overlap'
      ],
      effort_estimate: { minutes: 75, complexity: 'medium', risk: 'low', blockers: ['Izzy supplies seed colleague names', 'Master pricing list 51a30fc6 needed for V2 $/turn anchor (else leave blank)'] },
      depends_on: ['Izzy seed colleague names', 'Master pricing list 51a30fc6 (for V2 only; V1 + V3 unblocked)']
    }
  }
];

(async () => {
  await status.start(AGENT, 'Refining 3 fresh ms-dir proposals (Owen Paris quality control)', refinements.length);

  let updated = 0;
  for (let i = 0; i < refinements.length; i++) {
    const r = refinements[i];

    const { data: existing, error: fetchErr } = await supabase
      .from('agent_review_queue')
      .select('context')
      .eq('id', r.id)
      .single();

    if (fetchErr) {
      console.error(`Fetch failed for ${r.id}:`, fetchErr.message);
      continue;
    }

    const mergedContext = { ...(existing.context || {}), ...r.context_patch };

    const { error: updErr } = await supabase
      .from('agent_review_queue')
      .update({
        title: r.title,
        description: r.description,
        context: mergedContext
      })
      .eq('id', r.id);

    if (updErr) {
      console.error(`Update failed for ${r.id}:`, updErr.message);
      await status.warn(AGENT, `Update failed for ${r.id}: ${updErr.message}`);
      continue;
    }

    updated += 1;
    await status.progress(AGENT, updated, `Refined ${r.id.slice(0, 8)} - ${r.title.slice(0, 60)}`);
    console.log(`Refined ${r.id} - ${r.title}`);
  }

  await status.complete(AGENT, `Refined ${updated} of ${refinements.length} fresh ms-dir proposals (locked deliverable schemas, success_criteria, effort_estimate).`);
  console.log(`\nDone - ${updated} proposals updated.`);
})();
