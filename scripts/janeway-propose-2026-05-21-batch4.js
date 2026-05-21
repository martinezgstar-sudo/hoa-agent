#!/usr/bin/env node
const path = require('path');
const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGENT_ID = 'hoa-dir';

const proposals = [
  {
    agent_id: AGENT_ID,
    company: 'hoa-agent',
    priority: 'high',
    title: 'property_type CAMA backfill pilot — top 500 published rows, evidence CSV only',
    description:
      "Build a property_type-only pilot toolkit: pull CAMA property_use_code from LaCie /Volumes/LaCie/FL-Palm Beach County Data /CAMA tables for the top 500 published communities where property_type IS NULL (rank by unit_count DESC). Map codes to {condo, single-family, townhome, villa, manufactured} via a documented lookup. Output reports/property-type-cama-pilot-2026-05-21.csv with columns id, canonical_name, zip_code, cama_property_use_code, proposed_property_type, evidence_rows_count. Zero DB writes — research-only artifact for Admiral review. property_type is a SUCCESS CRITERIA field per HOA_PLAN.md but has zero existing proposals in the 80-row queue.",
    status: 'pending',
    context: {
      assigns_to: 'Seven of Nine',
      assigns_to_agent_id: 'hoa-research',
      estimated_time: 90,
      why_now:
        "property_type is one of seven SUCCESS CRITERIA fields and the only one with zero pending or approved proposals; CAMA tables on LaCie already contain the source data.",
      source: 'HOA_PLAN.md §Growth Focus #1 ("Fill unit_count and property_type from CAMA")',
      success_criteria: [
        '≥400 of 500 target rows have at least one CAMA property_use_code match',
        'CSV written to reports/property-type-cama-pilot-2026-05-21.csv with all 6 columns populated',
        'Lookup table from CAMA codes → property_type values committed alongside the CSV',
        'Zero rows written to communities or pending_community_data',
      ],
      stop_before: 'Any UPDATE or INSERT on communities or pending_community_data.',
      write_mode: 'csv_only',
    },
  },
  {
    agent_id: AGENT_ID,
    company: 'hoa-agent',
    priority: 'medium',
    title: 'Malformed city-name normalization sweep — 8,007 rows, proposed-change CSV only',
    description:
      "Scan every published community row (status='published', n=8,007) and flag rows where the city value (a) has trailing punctuation, (b) has inconsistent casing vs the PBC city dictionary, (c) is not in the 38-city PBC dictionary, or (d) has duplicated whitespace. Compare against pbc_zips dict in scripts/verify-locations.py to assert ZIP/city alignment. Output reports/city-normalization-sweep-2026-05-21.csv with columns id, canonical_name, current_city, proposed_city, normalization_reason, zip_code, zip_implied_city, conflict_flag. Zero DB writes.",
    status: 'pending',
    context: {
      assigns_to: 'Tuvok',
      assigns_to_agent_id: 'hoa-updater',
      estimated_time: 45,
      why_now:
        "HOA_PLAN.md explicitly lists 'Normalize malformed city names (Boca Raton trailing comma, etc.)' as a §Growth Focus #1 tactic. No proposals in the current pending or approved queue address city-name normalization.",
      source: 'HOA_PLAN.md §Growth Focus #1 ("Normalize malformed city names")',
      success_criteria: [
        'Every published row evaluated against the 4 rules + ZIP/city alignment',
        'CSV at reports/city-normalization-sweep-2026-05-21.csv with all 8 columns populated for every flagged row',
        'Summary footer in CSV: counts by reason (trailing_punct / casing / not_in_dict / whitespace / zip_conflict)',
        'Zero writes to communities table',
      ],
      stop_before: 'Any UPDATE on communities.city.',
      write_mode: 'csv_only',
    },
  },
  {
    agent_id: AGENT_ID,
    company: 'hoa-agent',
    priority: 'medium',
    title: 'May 2026 end-of-month coverage report — template build, dry-run on current data',
    description:
      "Build the reusable end-of-month coverage report per HOA_PLAN.md OPERATIONS cadence (due June 1). Compute completeness % for the 9 critical-field set (entity_status, legal_name, state_entity_number, registered_agent, management_company, monthly_fee_median, unit_count, property_type, zip_code) sliced by (a) PBC city — 9 top cities, (b) the 24 confirmed master HOAs from CLAUDE.md, and (c) overall published. Output reports/coverage-2026-05.md with three tables + a Top-5-Gaps callout. Also output reports/coverage-2026-05.csv for spreadsheet. Reporting only — zero DB writes. Re-runnable as scripts/coverage-report.js for future months.",
    status: 'pending',
    context: {
      assigns_to: 'Tuvok',
      assigns_to_agent_id: 'hoa-updater',
      estimated_time: 60,
      why_now:
        "End-of-month coverage report is a §OPERATIONS-Monthly cadence item; May 31 is 10 days out. No coverage-report template exists in scripts/. Building it now (vs on May 31) lets the same artifact be re-run on June 30, July 31, etc.",
      source: 'HOA_PLAN.md §OPERATIONS — Monthly ("End of month: Comprehensive coverage report")',
      success_criteria: [
        'scripts/coverage-report.js exists and runs end-to-end against the live DB',
        'reports/coverage-2026-05.md contains 3 tables (overall / by-city / by-master) and a Top-5-Gaps callout',
        'reports/coverage-2026-05.csv contains the same data in tidy format (one row per city+field or master+field)',
        'Zero DB writes; only file outputs in reports/',
      ],
      stop_before: 'Any DB write or migration.',
      write_mode: 'csv_md_only',
    },
  },
];

async function main() {
  await status.start(
    'hoa-boards',
    'Janeway: file 3 gap-targeted proposals (property_type CAMA / city normalization / EOM coverage report)',
    proposals.length
  );

  let written = 0;
  for (const p of proposals) {
    const { data, error } = await supabase
      .from('agent_review_queue')
      .insert(p)
      .select('id, title')
      .single();
    if (error) {
      console.error('Insert error:', error.message, error.details);
      await status.error('hoa-boards', `Insert failed: ${error.message}`);
      process.exit(1);
    }
    written += 1;
    console.log(`Filed [${data.id}]: ${data.title}`);
    await status.progress('hoa-boards', written, `Filed: ${p.title}`);
  }

  await status.complete(
    'hoa-boards',
    `Janeway filed ${written}/${proposals.length} gap-targeted proposals: property_type CAMA pilot (HIGH/Seven), city-name normalization sweep (MED/Tuvok), May EOM coverage report template (MED/Tuvok).`
  );
  console.log('Done.');
}

main().catch(async (err) => {
  console.error('Fatal:', err);
  await status.error('hoa-boards', `Fatal: ${err.message}`);
  process.exit(1);
});
