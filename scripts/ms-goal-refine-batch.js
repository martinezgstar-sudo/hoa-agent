// ms-goal (Owen Paris) — refinement pass over 19 unrefined ms-dir proposals.
//
// QC objectives per row:
//   1. Sharpen title (≤80 chars, lead with verb, concrete deliverable noun)
//   2. Normalize deliverable paths to today's date (2026-05-21) where description
//      and success_criteria disagree
//   3. Add ms_goal_refined_at + ms_goal_refined_notes to context (preserve all
//      existing fields)
//   4. Where success_criteria misses a "no auto-send" / "doc only" gate that the
//      description requires, add it
//
// NEVER inserts new rows — only updates ms-dir's existing rows.

const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGENT_ID = 'ms-goal';
const REFINED_AT = new Date().toISOString();

// Per-row refinements. Each entry: { id, title?, description?, success_criteria_add?, ms_goal_refined_notes }
const refinements = [
  {
    id: 'f835052e-2852-49ea-80b9-e133c85d8415',
    title: 'Friday weekly-review template (5 rows) + 4pm cadence — first run 2026-05-22',
    ms_goal_refined_notes: 'Tightened title to lead with the artifact (5-row template) and named the first live run date. No description rewrite needed — success_criteria already concrete.',
  },
  {
    id: 'f38dae07-9685-44e4-90f3-0f6a63dad40a',
    title: 'Success-criteria tracker: new-client velocity, MRR, retention — 3 metrics',
    ms_goal_refined_notes: 'Title sharpened to lead with deliverable type (tracker) and metric count. Original was a clause not a deliverable.',
  },
  {
    id: '6d8a7fc4-8a7a-42c6-a0a9-64361c3c4624',
    title: 'GBP review-ask cohort: 15-client ranked CSV + SMS/email templates',
    ms_goal_refined_notes: 'Title renamed from "acquisition drive" (vague) to specific deliverables (CSV + templates). Cross-link to a0d43900 anniversary roster and 2f09bfe7 RBN play already noted.',
  },
  {
    id: 'b09a407b-eb2d-4145-9dba-dd0309c277ca',
    title: 'Crew skills matrix: rows×skills with single-owner risk flagged (doc-only)',
    ms_goal_refined_notes: 'Title sharpened to expose the risk-output (single-owner cells) which is the actual value vs. the matrix itself. doc_only constraint surfaced in title.',
    success_criteria_add: 'Hand-off note to Tasha proposal 7ef89792 explicit — matrix delivered, no SOP duplication',
  },
  {
    id: '51a30fc6-891d-4eff-9ab4-645e96343419',
    title: 'Master pricing list (4 service lines) — undocumented rates flagged for Izzy',
    ms_goal_refined_notes: 'Title made action-oriented (flagged for Izzy). Description already constrains to doc_only. Downstream consumers (319e1b66, fb67eef5) named in success_criteria.',
  },
  {
    id: 'a0d43900-bbba-470f-afd0-2d72cf3b356a',
    title: 'Anniversary client roster CSV — 1/2/3/4/5yr+ buckets, ranked by LTV',
    ms_goal_refined_notes: 'Title sharpened with explicit bucket labels. QBO MCP re-auth blocker preserved in context; Jobber CSV fallback path keeps proposal non-blocking.',
  },
  {
    id: '319e1b66-667e-4c05-96a2-28cc8bce647c',
    title: 'London Foster referral kit: 15-agent CSV + co-marketing one-pager + price card',
    ms_goal_refined_notes: 'Title made three-deliverable explicit (CSV + one-pager + price card). Depends on 51a30fc6 pricing list — that dependency now explicit in success_criteria below.',
    success_criteria_add: 'Price card pulls verified figures from 51a30fc6 master pricing list — zero quoted rates that lack a documented source',
  },
  {
    id: 'acb57b31-115c-4c17-8cda-7ea031b4cade',
    title: '1099-vs-W2 decision packet: 3 scenarios + 3 broker WC quotes + CPA Q-list',
    ms_goal_refined_notes: 'Title compressed to 80 chars; called out "decision packet" framing (vs. recommendation). Preferred sibling of 18e0d488 (already resolved as dupe).',
  },
  {
    id: '050630a7-51eb-4cb9-9f60-57c52963647b',
    title: 'Q2 2026 QBR prep pack: 12+ numbers, named owners, 1-page agenda — due 2026-06-25',
    ms_goal_refined_notes: 'Title now carries the prep-due date so it surfaces in queue scans. Proposal already specifies named owners + delta-vs-Q1 column.',
  },
  {
    id: '4f62e96f-d350-48e6-ab8c-71430d2f6ea1',
    title: 'Service-line margin ranking: 8 lines × 3 margin columns + top-3 / bottom-2 calls',
    ms_goal_refined_notes: 'Title sharpened to specify shape of output (8×3 table). Depends on 71c73e5a + QBO re-auth, already named in context.',
  },
  {
    id: 'fb67eef5-271f-44af-abdb-a175e079566c',
    title: 'Lead-source strategy one-pager: 6 channels ranked + $/time allocation + triggers',
    ms_goal_refined_notes: 'Title now exposes the three components (ranking + allocation + triggers). Description already cross-references all six downstream channels.',
  },
  {
    id: '71f8383c-9107-4fbb-9e32-d2aa3356784c',
    title: 'Spring deep-clean addon SKU: scope + 2-tier pricing + 5 bound client drafts',
    ms_goal_refined_notes: 'Title sharpened. Dedupe-rule against Troi shortlist + Tasha silent-client list preserved — critical to avoid double-asks.',
  },
  {
    id: '71c73e5a-ba15-4060-8033-c7aaef6f3d6e',
    title: 'Cleaning SOPs (4 service types) + per-visit supply cost baseline + variance flag',
    ms_goal_refined_notes: 'Title expanded to surface all three deliverables. Drafted from operator knowledge — no Jobber dependency (key feature, kept in description).',
  },
  {
    id: '7ef89792-3415-4bd9-8e5f-206cf36a57f8',
    title: 'Emergency coverage SOP + 2 client SMS templates + monthly drill — Erick RBN protect',
    ms_goal_refined_notes: 'Title now names the highest-value relationship (RBN). Dedupe-with-b09a407b boundary preserved in success_criteria (no matrix duplication).',
  },
  {
    id: '08dc9317-f9ca-4217-ab35-9eb6f55fd054',
    title: 'BNI roster: 20 untouched-60+-days members + top-10 personalized outreach hooks',
    ms_goal_refined_notes: 'Title sharpened to lead with the numerical deliverable. Preferred over duplicate 16629cfb (already resolved). No outbound sends — Admiral approves before contact.',
  },
  {
    id: 'e5a3bbad-4234-4ecb-9d99-0eec0f120a50',
    title: 'CRITICAL: FL DR-15 6-days-overdue escalation draft for Izzy/Dorothy — no auto-send',
    ms_goal_refined_notes: 'Title now leads with CRITICAL and the overdue duration so it stays at top of queue scans. Draft-only constraint reinforced in title.',
  },
  {
    id: 'b8dfff2f-3894-44b0-a223-d7502c2bc3d1',
    title: 'Stability templates: anniversary thank-you (3 variants) + quarterly retention check-in',
    ms_goal_refined_notes: 'Title expanded to name both templates and the variant count. Merge-field placeholders bound to a0d43900 anniversary roster.',
  },
  {
    id: '8c4cb6dc-f44c-4fbe-867a-b6ebf3cc63d2',
    title: 'HOA common-area target list: 10 northern PBC masters with registered agent + PM',
    ms_goal_refined_notes: 'Title now names the routing fields (registered agent + PM). List-only — no outbound contact this round.',
  },
  {
    id: '85a58d65-06aa-4578-8622-fb0db21d2d3a',
    title: 'PM cold-email 3-touch sequence: intro / day-5 nudge / day-14 final — paste-ready',
    ms_goal_refined_notes: 'Title now exposes the cadence (day-0/5/14). Zero personalization until Admiral approves the 10-firm PM list.',
  },
];

async function main() {
  await status.start(AGENT_ID, `Refining ${refinements.length} ms-dir proposals (QC pass)`, refinements.length);

  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 0; i < refinements.length; i++) {
    const r = refinements[i];

    // Fetch current row to merge context safely
    const { data: row, error: fetchErr } = await supabase
      .from('agent_review_queue')
      .select('id, title, description, context, status, agent_id')
      .eq('id', r.id)
      .single();

    if (fetchErr || !row) {
      errors.push({ id: r.id, error: fetchErr?.message || 'not found' });
      continue;
    }
    if (row.status !== 'pending' || row.agent_id !== 'ms-dir') {
      skipped++;
      console.log(`[skip] ${r.id} — status=${row.status} agent=${row.agent_id}`);
      continue;
    }
    if (row.context?.ms_goal_refined_at) {
      skipped++;
      console.log(`[skip] ${r.id} — already refined at ${row.context.ms_goal_refined_at}`);
      continue;
    }

    // Build new context preserving all existing fields
    const newContext = {
      ...(row.context || {}),
      ms_goal_refined_at: REFINED_AT,
      ms_goal_refined_notes: r.ms_goal_refined_notes,
    };
    if (r.success_criteria_add && Array.isArray(newContext.success_criteria)) {
      newContext.success_criteria = [...newContext.success_criteria, r.success_criteria_add];
    }

    const update = { context: newContext };
    if (r.title) update.title = r.title;
    if (r.description) update.description = r.description;

    const { error: updErr } = await supabase
      .from('agent_review_queue')
      .update(update)
      .eq('id', r.id);

    if (updErr) {
      errors.push({ id: r.id, error: updErr.message });
      console.error(`[err]  ${r.id} — ${updErr.message}`);
      continue;
    }
    updated++;
    console.log(`[ok]   ${r.id} — title: ${update.title || '(unchanged)'}`);
    if ((i + 1) % 5 === 0) {
      await status.progress(AGENT_ID, i + 1, `Refined ${i + 1}/${refinements.length}`);
    }
  }

  console.log(`\nSummary: updated=${updated} skipped=${skipped} errors=${errors.length}`);
  if (errors.length) console.log('Errors:', JSON.stringify(errors, null, 2));

  await status.complete(
    AGENT_ID,
    `Refined ${updated} of ${refinements.length} pending ms-dir proposals (sharpened titles, stamped ms_goal_refined_at, added cross-refs where applicable; skipped=${skipped}, errors=${errors.length}).`,
    { updated, skipped, errors }
  );
}

main().catch(async (err) => {
  console.error(err);
  await status.error(AGENT_ID, err.message);
  process.exit(1);
});
