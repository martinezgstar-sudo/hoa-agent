const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });
const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGENT_ID = 'ms-dir';
const COMPANY = 'morningstar';

const proposals = [
  {
    priority: 'high',
    title: 'Anniversary client roster pull — feed approved Tasha thank-you templates',
    description: "Tasha Yar's anniversary thank-you + quarterly retention templates were approved 2026-05-20 but no one has pulled the list of clients to deploy against. Beverly should pull a roster from QBO/Jobber of every active customer with first_invoice_date, bucketed into 1yr / 2yr / 3yr / 4yr / 5yr+ anniversary cohorts, sorted by lifetime revenue. Output a CSV with name, anniversary_date, months_tenured, ltv, last_invoice_date — no client contact, list only, to hand to Tasha for the template send. Gated on the existing QBO MCP re-auth blocker (ticket already filed under ms-quickbooks); if QBO is still down, use a Jobber Revenue-by-Client export from Izzy/Dorothy as fallback.",
    context: {
      assigns_to: 'Beverly Crusher',
      assigns_to_agent_id: 'ms-quickbooks',
      estimated_time: 45,
      why_now: 'Anniversary thank-you templates approved 2026-05-20 are dormant without a target list; six-year-old business has cohorts ready for recognition right now',
      source: 'MORNINGSTAR_PLAN.md Growth Focus #4 STABILITY tactic #3 (Anniversary thank-you notes) + downstream of approved Tasha template proposal',
      blocker: 'QBO MCP re-auth required (existing ticket); Jobber CSV from inbox is acceptable fallback',
      write_mode: 'csv_only',
      output_files: ['~/Agents/morningstar/reports/anniversary-roster-2026-05-21.csv'],
      success_criteria: 'CSV with one row per active customer, anniversary_date populated, ≥5 cohorts represented, sorted by LTV',
      rollback_plan: 'N/A (read-only export, no sends)'
    }
  },
  {
    priority: 'high',
    title: 'Pricing-list audit — verify current price sheet exists for all 4 service categories',
    description: "MORNINGSTAR_PLAN.md explicitly forbids the crew from quoting prices without checking a pricing list, but nothing in the queue confirms a current pricing list actually exists in a known location for residential cleaning, commercial cleaning, move-in/move-out, and property management. Wesley should locate (or compile if missing) a single master price sheet that documents per-service base rates, square-foot multipliers, add-ons, and 2026 increases for all four categories, save it to ~/Agents/morningstar/reports/pricing-list-master-2026-05-21.md, and flag any service line that currently has no documented rate. This is foundational for the lead-source diversification work and the realtor referral one-pager already approved — both quote prices.",
    context: {
      assigns_to: 'Wesley Crusher',
      assigns_to_agent_id: 'ms-marketing',
      estimated_time: 60,
      why_now: 'Plan rule forbids quoting without the list; multiple in-flight proposals (London Foster kit, lead-source diversification, FB ad campaign) will quote prices — they need a verified source of truth before launch',
      source: "MORNINGSTAR_PLAN.md THINGS THE CREW SHOULD NEVER DO (Promise pricing without checking pricing list) + Growth Focus #2 HIGHER REVENUE PER CLIENT (Premium tiers)",
      write_mode: 'doc_only',
      output_files: ['~/Agents/morningstar/reports/pricing-list-master-2026-05-21.md'],
      success_criteria: 'Single markdown file with 4 sections (residential / commercial / move-in-out / property mgmt), each section shows current rate or explicit "NO DOCUMENTED RATE" flag; any gaps surfaced for Izzy/Dorothy decision',
      rollback_plan: 'N/A (documentation only, no live pricing changes)'
    }
  },
  {
    priority: 'medium',
    title: 'Single-person-failure crew skills matrix — who is the only one who can do what',
    description: "STABILITY tactic #6 (Cross-training so no single person is critical) has no owner in the current 56-row queue. Tasha's emergency-coverage SOP proposal covers process, not the actual skill/site ownership map. Geordi should build a matrix from Jobber crew assignments + Izzy/Dorothy interview: rows = crew members, columns = (key client sites, specialty skills like move-out / commercial / property checks, equipment expertise, client-specific access codes). Each cell is 'primary / can-backup / cannot' so any cell with exactly one 'primary' and zero 'can-backup' is a single-person-failure risk. Output: ~/Agents/morningstar/reports/crew-skills-matrix-2026-05-21.md with explicit list of risk cells for Izzy to act on. Read-only matrix, no scheduling changes.",
    context: {
      assigns_to: 'Geordi La Forge',
      assigns_to_agent_id: 'ms-optimizer',
      estimated_time: 50,
      why_now: 'Erick RBN protection + zero-complaint criterion both depend on crew coverage; without the matrix we cannot tell which client relationships are one-flu-away from breaking',
      source: 'MORNINGSTAR_PLAN.md Growth Focus #4 STABILITY tactic #6 (Cross-training so no single person is critical) + Erick RBN top-of-mind protection',
      write_mode: 'doc_only',
      output_files: ['~/Agents/morningstar/reports/crew-skills-matrix-2026-05-21.md'],
      success_criteria: 'Matrix with ≥6 skill/site columns × all current crew; explicit numbered list of single-person-failure cells; recommended training pair for each',
      rollback_plan: 'N/A (documentation only, no scheduling changes)',
      depends_on: 'Best run after Geordi has Jobber crew-assignment view; if Jobber MCP still inaccessible, run from Izzy/Dorothy interview only and flag the limitation'
    }
  }
];

(async () => {
  await status.start(AGENT_ID, 'Picard cycle: 3 gap-targeted proposals (anniversary roster / pricing audit / skills matrix)', proposals.length);

  let written = 0;
  for (const p of proposals) {
    const { data, error } = await supabase
      .from('agent_review_queue')
      .insert({
        agent_id: AGENT_ID,
        company: COMPANY,
        priority: p.priority,
        title: p.title,
        description: p.description,
        status: 'pending',
        context: p.context
      })
      .select('id')
      .single();

    if (error) {
      console.error(`FAIL [${p.title}]:`, error.message);
      await status.error(AGENT_ID, `Insert failed: ${error.message}`, { title: p.title });
      continue;
    }
    written++;
    console.log(`OK [${p.priority}] ${data.id}  ${p.title}`);
    await status.progress(AGENT_ID, written, `Filed: ${p.title}`);
  }

  await status.complete(
    AGENT_ID,
    `Picard filed ${written}/3 gap-targeted proposals: anniversary client roster (HIGH/Beverly), pricing-list audit (HIGH/Wesley), single-person-failure skills matrix (MED/Geordi)`,
    { written, total: proposals.length }
  );
})();
