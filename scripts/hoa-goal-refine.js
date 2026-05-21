const path = require('path');
const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const NOW = new Date().toISOString();

const refinements = [
  {
    id: '10362c2f-18ea-4d73-9224-6eef154f6c7d',
    title: 'Miami-Dade GIS research — 3+ FeatureServer endpoints documented + 100-row sample CSV (docs only)',
    description: 'Broward GIS research (proposal 280de757) is already queued; Miami-Dade — the other named Phase-2 expansion target in HOA_PLAN — has zero proposals. Seven of Nine should enumerate condo/HOA-relevant endpoints on gis-mdc.opendata.arcgis.com, write a Miami-Dade subsection in EXPANSION_PLAYBOOK.md (≥3 FeatureServer URLs with record counts and field schemas), and emit a 100-row sample CSV at scripts/output/miami-dade-gis-sample.csv with columns canonical_name, address, zip_code, raw_gis_id. Strict docs-only: no communities table writes, no county scope changes, no expansion of any service area in this task.',
    contextPatch: {
      refined_at: NOW,
      refined_by: 'hoa-goal',
      write_mode: 'docs-only',
      no_db_writes: true,
      stop_before: 'any communities table write or county scope change',
      output_files: [
        'EXPANSION_PLAYBOOK.md (modified — new Miami-Dade subsection)',
        'scripts/output/miami-dade-gis-sample.csv (new, 100 rows)'
      ],
      effort_estimate: 'S',
      success_criteria: [
        'EXPANSION_PLAYBOOK.md contains a new "Miami-Dade County" subsection',
        '≥3 distinct FeatureServer URLs documented with hostname gis-mdc.opendata.arcgis.com',
        'Each documented endpoint lists record count and field names',
        'scripts/output/miami-dade-gis-sample.csv exists with exactly 100 rows',
        'CSV header includes canonical_name, address, zip_code, raw_gis_id',
        'Zero rows inserted/updated in communities table (verify via SELECT count(*) FROM communities WHERE county = \'Miami-Dade\' before+after = 0 = 0)'
      ],
      sharpened_success_criteria: [
        'At least one endpoint must include a condo or association field (filter on field-name regex /condo|hoa|assoc/i)',
        'Sample CSV ZIPs must all be in 331xx or 330xx (Miami-Dade ZIP prefix sanity)',
        'Playbook subsection must end with an Admiral-readable "Ingest sizing estimate" line in the form "≈N records × M cities"'
      ],
      precondition_query: 'grep -i "miami-dade" EXPANSION_PLAYBOOK.md  # must return 0 lines before task starts',
      blocker_handling: 'If <3 condo/HOA endpoints discoverable in 30 min of search, stop and report findings — do NOT scrape PDF document libraries or non-GIS pages as a substitute.',
      rollback_plan: 'git checkout EXPANSION_PLAYBOOK.md && rm -f scripts/output/miami-dade-gis-sample.csv',
      estimated_time: 60,
      assigns_to: 'Seven of Nine',
      assigns_to_agent_id: 'hoa-research',
      source: 'EXPANSION (slow track only) + CURRENT TOP-OF-MIND ISSUES',
      why_now: 'Plan EXPANSION section names both Broward and Miami-Dade as 2026 targets; Broward research is queued, Miami-Dade gap noted explicitly in CURRENT TOP-OF-MIND ISSUES',
      guardrails: 'One expansion-related task per week max — verify this is the only active Miami-Dade task before assigning; absolutely no DB writes; no county field changes anywhere'
    }
  },

  {
    id: 'edff8bf5-def1-4a91-be0e-3e6159ee62da',
    title: 'Amenities backfill pilot — 200 rows → pending_community_data only (≥150 with proposal)',
    description: 'amenities is at 1.60% coverage on 8,007 published rows — the lowest non-fee field — and is the upstream signal the Tier-3b research script uses to flag is_gated and is_55_plus. Seven of Nine should select 200 communities with street_address+zip_code filled but amenities NULL, run research-hoa-comprehensive.py scoped to amenities-only (skip mgmt_company and fees), and write proposed amenities strings to pending_community_data for admin approval. Expected side effect: 5–15 new is_gated and 1–5 new is_55_plus candidates surface in the detection side-effect report. Zero direct writes to the communities table.',
    contextPatch: {
      refined_at: NOW,
      refined_by: 'hoa-goal',
      write_mode: 'pending-queue-only',
      no_db_writes_to_communities: true,
      stop_before: 'any UPDATE on communities table (only pending_community_data INSERTs are allowed)',
      target_rows: 200,
      output_files: [
        'pending_community_data INSERTs (field=amenities, source=research_pilot_2026-05-21)',
        'scripts/output/amenities-pilot-2026-05-21.csv (proposal trace)',
        'scripts/output/amenities-pilot-detection-side-effects.txt (gated/55+ candidates)'
      ],
      snapshot_path: 'logs/snapshots/amenities-pilot-2026-05-21/',
      effort_estimate: 'M',
      success_criteria: [
        'Exactly 200 candidate rows pulled (status=published AND amenities IS NULL AND street_address IS NOT NULL AND zip_code IS NOT NULL)',
        '≥150 of 200 produce a non-empty amenities proposal',
        '100% of proposals land in pending_community_data (verify: SELECT count(*) FROM pending_community_data WHERE field=\'amenities\' AND created_at > snapshot_ts)',
        'Zero direct writes to communities.amenities (verify: post-task SELECT amenities FROM communities WHERE id IN (pilot_ids) AND amenities IS NOT NULL returns 0 rows)',
        'Detection side-effect file enumerates each candidate id with which signal (gated/55+) and the source phrase'
      ],
      sharpened_success_criteria: [
        'Each pending row must include a source URL (no bare strings) to support admin review',
        'Dedupe-check (rule #15) must be invoked before each pending INSERT — log skipped duplicates to side-effect file',
        'If 3+ near-identical amenities strings detected from same source (boilerplate), discard all 3+ and log to slider-style noise rejection in side-effect file',
        'Pilot must NOT exceed 200 rows even if more qualify — hard stop at 200 to keep pending queue reviewable in one admin session'
      ],
      precondition_query: 'SELECT count(*) FROM communities WHERE status=\'published\' AND amenities IS NULL AND street_address IS NOT NULL AND zip_code IS NOT NULL;  -- must return ≥200',
      blocker_handling: 'If first 20 rows yield <5 amenities proposals total, halt — likely a research-script regression or rate-limit; report rather than continue.',
      rollback_plan: 'Bulk reject in /admin/pending via WHERE source=\'research_pilot_2026-05-21\' AND field=\'amenities\'; or DELETE FROM pending_community_data WHERE source=\'research_pilot_2026-05-21\' AND created_at > <snapshot_ts>',
      estimated_time: 120,
      assigns_to: 'Seven of Nine',
      assigns_to_agent_id: 'hoa-research',
      source: 'Data Completeness Baseline + 55+/Gated Detection sources priority order',
      why_now: 'amenities is the lowest-coverage non-fee critical field (1.60%) and is the upstream signal for is_gated/is_55_plus detection per Tier-3b research pipeline',
      guardrails: 'Listing-site amenities NEVER auto-approve — pending queue only; if 3+ near-duplicate amenities strings from same source treat as boilerplate noise and discard; honor rule #15 dedupe-check before any pending row'
    }
  },

  {
    id: 'b0bc7c67-7e12-4e1b-ba26-0d4d992f5074',
    title: 'Fix Sunbiz cordata parser off-by-one — patch slices + 50-row QC + affected-rows inventory',
    description: 'scripts/bulk-sunbiz-match.py uses line[:13] / line[13:93], but the cordata fixed-width layout requires line[:12] / line[12:204]. The off-by-one corrupts every byte past state_entity_number and legal_name (memory: sunbiz_parser_offset.md). Tuvok should (a) patch the slices in bulk-sunbiz-match.py to line[:12] / line[12:204], (b) add a parser fixture test that fails under the old slices and passes under the new ones, (c) re-parse a 50-row sample to scripts/output/sunbiz-parser-offset-qc.csv to confirm legal_name aligns with state_entity_number ≥95%, and (d) produce scripts/output/sunbiz-offset-affected-rows.csv enumerating every previously-written row id so the Admiral can decide on a targeted re-backfill. Code patch + diagnostic CSVs only — zero UPDATEs to communities in this task.',
    contextPatch: {
      refined_at: NOW,
      refined_by: 'hoa-goal',
      write_mode: 'code-patch + read-only QC',
      no_db_writes: true,
      stop_before: 'any UPDATE on communities (re-backfill is a separate Admiral-gated proposal)',
      output_files: [
        'scripts/bulk-sunbiz-match.py (patched)',
        'tests/test_sunbiz_parser.py (new fixture)',
        'scripts/output/sunbiz-parser-offset-qc.csv (50-row resample)',
        'scripts/output/sunbiz-offset-affected-rows.csv (inventory of previously-corrupted writes)'
      ],
      effort_estimate: 'M',
      success_criteria: [
        'git diff shows exactly line[:12] and line[12:204] slices in bulk-sunbiz-match.py',
        'tests/test_sunbiz_parser.py contains a fixture that FAILS on the old [:13]/[13:93] slices and PASSES on the new [:12]/[12:204] slices',
        'scripts/output/sunbiz-parser-offset-qc.csv has 50 rows where ≥47 (95%) show legal_name aligned with state_entity_number per a regex check (state_entity_number is 12-char alphanumeric, legal_name is non-empty and does not begin with a digit-only token)',
        'scripts/output/sunbiz-offset-affected-rows.csv enumerates every community id with sunbiz_source=\'bulk-sunbiz-match.py\' written before this patch lands, with one column flagging whether legal_name and registered_agent appear shifted',
        'Zero UPDATEs on communities table during this task (verify: git log shows no Supabase write call in the diff; runtime log shows zero PATCH /communities)'
      ],
      sharpened_success_criteria: [
        'Parser fixture must use a real Sunbiz cordata line (or a redacted equivalent) — synthetic fixtures rejected',
        'QC CSV must include a "shift_detected" boolean column per row so Admiral can scan visually',
        'Affected-rows inventory must include exact write timestamp range so re-backfill can be scoped without rewriting recently-corrected rows from proposal 5485f853',
        'Commit message must reference memory key sunbiz_parser_offset.md so future Tuvix turns can locate the fix'
      ],
      precondition_query: 'head -1 "/Volumes/LaCie/FL-Palm Beach County Data /cordata*.txt" | cut -c1-12,13-204 # confirm fixed-width layout before patching',
      blocker_handling: 'If cordata layout cannot be confirmed against an official Sunbiz spec, halt and queue a docs proposal — do NOT guess offsets a second time.',
      rollback_plan: 'git revert HEAD on the patch commit; no DB rollback needed because task is read-only against the database.',
      parser_fixture_test: 'tests/test_sunbiz_parser.py::test_cordata_slices_aligns_legal_name_with_entity_number — must assert both directions (old slices fail, new slices pass) to lock the regression',
      estimated_time: 90,
      assigns_to: 'Tuvok',
      assigns_to_agent_id: 'hoa-updater',
      source: 'ABSOLUTE RULES + CURRENT STATE (1,585 rows previously corrected from Sunbiz parser bug)',
      why_now: 'Queued top-500 Sunbiz backfill (92d90187) will compound the corruption if shipped on the unpatched parser; HOA_PLAN success criterion #5 says zero corrupted data from buggy parsers',
      guardrails: 'No UPDATEs to communities; QC writes are CSV-only; previously-written rows are NOT auto-rewritten — that decision is gated on Admiral review of the affected-rows inventory',
      reference_memory: 'sunbiz_parser_offset.md'
    }
  }
];

(async () => {
  await status.start('hoa-goal', 'Refining 3 hoa-dir captain proposals', refinements.length);

  let done = 0;
  for (const r of refinements) {
    // Fetch existing context to preserve fields we don't override
    const { data: existing, error: fetchErr } = await supabase
      .from('agent_review_queue')
      .select('context')
      .eq('id', r.id)
      .single();
    if (fetchErr) {
      console.error(`Fetch failed for ${r.id}:`, fetchErr.message);
      await status.error('hoa-goal', `Fetch failed for ${r.id}: ${fetchErr.message}`);
      process.exit(1);
    }
    const mergedContext = { ...(existing.context || {}), ...r.contextPatch };

    const { error: updateErr } = await supabase
      .from('agent_review_queue')
      .update({
        title: r.title,
        description: r.description,
        context: mergedContext
      })
      .eq('id', r.id)
      .eq('status', 'pending'); // safety: do not update if status changed

    if (updateErr) {
      console.error(`Update failed for ${r.id}:`, updateErr.message);
      await status.error('hoa-goal', `Update failed for ${r.id}: ${updateErr.message}`);
      process.exit(1);
    }
    done += 1;
    console.log(`Refined ${done}/${refinements.length}: ${r.id} — ${r.title.substring(0, 70)}`);
    await status.progress('hoa-goal', done, `Refined ${r.id}`);
  }

  await status.complete('hoa-goal', `Refined ${done} hoa-dir proposals (added measurable success_criteria, effort_estimate, precondition_query, rollback_plan, write_mode, stop_before, blocker_handling); no new proposals written.`);
  console.log('\nDone.');
})();
