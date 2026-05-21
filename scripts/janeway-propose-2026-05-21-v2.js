const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/izzymartinez/Documents/hoa-agent/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGENT_ID = 'hoa-dir';

async function main() {
  await status.start(AGENT_ID, 'Janeway: file 3 gap-targeted proposals (Jupiter pivot, restrictions pilot, street_address expansion)', 3);

  const proposals = [
    {
      agent_id: AGENT_ID,
      company: 'hoa-agent',
      priority: 'high',
      title: 'Jupiter mgmt_company alt-source pivot — 577 rows, non-DDG signals',
      status: 'pending',
      description:
        "First Jupiter toolkit (4df4b851) returned 0 two-signal candidates because DDG was hard-blocked (120 attempts, 0 hits). " +
        "577 of 759 published Jupiter rows are still missing management_company — Jupiter is the only top-5 PBC city without traction (Boca, WPB, Lake Worth, PBG, Delray all have toolkits running). " +
        "Pivot to non-DDG signals: (1) Sunbiz registered_agent → known mgmt company name table lookup (LaCie cordata, parser-fix gated); (2) Abacoa POA / Jonathan's Landing master-HOA cross-references (these 2 masters cover ~60 Jupiter subs whose mgmt company is usually the master's); (3) PBC code enforcement record search (cases often list the mgmt firm); (4) town of Jupiter community contact directory. " +
        "Emit scripts/output/jupiter-mgmt-altsource-evidence.csv with one row per community × source. No DB writes. Two-signal rule per CLAUDE.md §16.",
      context: {
        assigns_to: 'Seven of Nine',
        assigns_to_agent_id: 'hoa-research',
        estimated_time: 120,
        why_now:
          'Existing Jupiter toolkit completed but produced 0 actionable rows — the city is the last top-5 mgmt_company gap and the original DDG-based approach is proven not to work; momentum will be lost if the failure sits without a pivot.',
        source: 'HOA_PLAN.md §1 DATA QUALITY tactic #1 (Fill management_company for top 5 PBC cities)',
        target_city: 'Jupiter',
        target_count: 577,
        prior_attempt: '4df4b851-c208-4d9c-a703-f074bbd48ce9 (0 two-signal)',
        output_path: 'scripts/output/jupiter-mgmt-altsource-evidence.csv',
        no_db_writes: true,
        blocking_dependencies:
          'LaCie volume mounted; Sunbiz parser fix b0bc7c67 must land before any Sunbiz-derived row is treated as a confirming signal.',
        success_criteria: [
          '≥150 of 577 rows with at least one credible non-DDG signal',
          '≥30 of 577 rows with two independent signals',
          'CSV grouped by signal source, with admin-reviewable provenance per row',
        ],
      },
    },
    {
      agent_id: AGENT_ID,
      company: 'hoa-agent',
      priority: 'medium',
      title: 'Restriction-fields backfill pilot — pet/rental/STR/vehicle, 100 rows to pending only',
      status: 'pending',
      description:
        "98% of published rows are NULL across all 4 restriction fields: pet_restriction 7867, rental_approval 7899, str_restriction 7910, vehicle_restriction 7965 (out of 8006). Zero pending proposals address these — a complete blind spot. " +
        "Pilot 100 rows ordered by unit_count DESC NULLS LAST, source restriction text from Sunbiz governing-documents PDFs on LaCie plus community website if entry already has website_url. " +
        "Write to pending_community_data only (per CLAUDE.md research pipeline — restriction text is NEVER auto-approvable, always admin-reviewed). " +
        "Emit scripts/output/restrictions-pilot-evidence.csv with one row per community × field × source quote. No DB writes.",
      context: {
        assigns_to: 'Seven of Nine',
        assigns_to_agent_id: 'hoa-research',
        estimated_time: 90,
        why_now:
          'Plan §1 lists restriction fields as part of the data-quality success criteria; queue has zero proposals targeting them despite 98% null coverage. Pilot establishes feasibility (LaCie-governing-doc parse rate) before any larger sweep.',
        source: 'HOA_PLAN.md §1 DATA QUALITY (Sunbiz cordata fill) + CLAUDE.md §research-pipeline (restriction fields require admin approval)',
        target_count: 100,
        target_filter: 'status=published AND unit_count IS NOT NULL ORDER BY unit_count DESC',
        output_path: 'scripts/output/restrictions-pilot-evidence.csv',
        write_target: 'pending_community_data only',
        no_db_writes: true,
        success_criteria: [
          '≥40 of 100 rows yield at least one restriction-field quote with source page reference',
          'Per-field hit-rate table (pet/rental/STR/vehicle) included in report so Admiral can decide whether to expand',
          'No row written directly to communities table',
        ],
      },
    },
    {
      agent_id: AGENT_ID,
      company: 'hoa-agent',
      priority: 'medium',
      title: 'Street_address CAMA pilot expansion — Boca Raton 300 rows, 2-signal CSV',
      status: 'pending',
      description:
        "Existing WPB street_address pilot (84e59d93) covers 275 rows. 5,558 published rows are still missing street_address — Boca Raton alone has the largest gap (1,604 published, vast majority missing). " +
        "Extend the same CAMA two-signal approach to Boca Raton: 300 rows ordered by unit_count DESC, match against PBC CAMA tables on LaCie, require ZIP-match + name-fuzzy-match (Jaro-Winkler ≥0.85) as the two independent signals. " +
        "Emit scripts/output/boca-street-address-evidence.csv with candidate + match + confidence per row. No DB writes. Use WPB pilot output as the template — once Admiral approves WPB output format, this expansion can follow the same shape.",
      context: {
        assigns_to: 'Seven of Nine',
        assigns_to_agent_id: 'hoa-research',
        estimated_time: 75,
        why_now:
          'WPB pilot already proves CAMA matching works; Boca is the single biggest street_address gap and has the most pending mgmt_company / dedupe activity, so address backfill compounds downstream verification work. Should follow, not duplicate, the WPB pilot pattern.',
        source: 'HOA_PLAN.md §1 DATA QUALITY (Fill unit_count and property_type from CAMA and Property tables on LaCie — same data source)',
        target_city: 'Boca Raton',
        target_count: 300,
        prior_pilot: '84e59d93-fa93-4efc-8f68-2a9a874c84d2 (WPB, 275 rows)',
        output_path: 'scripts/output/boca-street-address-evidence.csv',
        no_db_writes: true,
        blocking_dependencies: 'WPB pilot output format approved first — do not start this until WPB review is complete to avoid divergent CSV shapes.',
        success_criteria: [
          '≥180 of 300 Boca rows match a CAMA record with ZIP+name two-signal confidence',
          'Per-row Jaro-Winkler score + ZIP match flag in CSV',
          'Rejected single-signal candidates segregated to second CSV for admin review',
        ],
      },
    },
  ];

  let filed = 0;
  for (const p of proposals) {
    const { data, error } = await supabase.from('agent_review_queue').insert(p).select('id, title').single();
    if (error) {
      console.error('FAIL:', p.title, error.message);
      await status.error(AGENT_ID, `Failed to file: ${p.title} — ${error.message}`);
      process.exit(1);
    }
    filed++;
    console.log('Filed:', data.id, '|', data.title);
    await status.progress(AGENT_ID, filed, `Filed: ${data.title}`);
  }

  const summary = `Janeway filed ${filed}/3 gap-targeted proposals: Jupiter mgmt alt-source pivot (HIGH/Seven), restriction-fields pilot (MED/Seven), Boca street_address CAMA expansion (MED/Seven).`;
  await status.complete(AGENT_ID, summary, { proposals_filed: filed });
  console.log('\n' + summary);
}

main().catch(async (err) => {
  console.error(err);
  await status.error(AGENT_ID, err.message);
  process.exit(1);
});
