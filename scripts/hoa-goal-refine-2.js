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
    id: '7d96edbc-2b81-4a7c-962f-d0e9dfbff7c7',
    title: 'pending_community_data triage — 158 sunbiz-sourced rows (53 SEN / 43 inc_date / 39 mgmt / 20 addr / 3 RA), accept/reject CSV',
    description: 'pending_community_data has 158 rows in status=pending (verified live 2026-05-21). Live breakdown by field_name: 53 state_entity_number, 43 incorporation_date, 39 management_company, 20 street_address, 3 registered_agent. By source_type: 115 sunbiz_match_llc, 26 sunbiz_match, 12 sunbiz_no_match, 4 sunbiz_mismatch_flag, 1 sunbiz_inferred. All 158 are auto_approvable=false and were written 2026-05-20 (last 24h). Tuvok joins each row to its community_id and current field value, classifies accept/reject/needs-evidence per heuristic (sunbiz_match_llc + community already has state_entity_number from same source → accept; sunbiz_no_match / sunbiz_mismatch_flag → reject; rest → needs admin eyes), writes decisions to scripts/output/pending-triage-2026-05-21.csv, AND opens the admin UI to apply the bulk accept set. No direct communities table writes — every accept flows through the existing /admin/pending POST handler that mutates pending_community_data.status only.',
    contextPatch: {
      refined_at: NOW,
      refined_by: 'hoa-goal',
      write_mode: 'admin-queue approvals only (pending_community_data.status mutations) — no direct communities writes',
      no_db_writes_to_communities: true,
      stop_before: 'any direct UPDATE on communities table; the /admin/pending handler is the only allowed write path',
      target_count: 158,
      live_breakdown: {
        by_field_name: { state_entity_number: 53, incorporation_date: 43, management_company: 39, street_address: 20, registered_agent: 3 },
        by_source_type: { sunbiz_match_llc: 115, sunbiz_match: 26, sunbiz_no_match: 12, sunbiz_mismatch_flag: 4, sunbiz_inferred: 1 },
        auto_approvable_true: 0,
        all_written_within_hours: 36,
        oldest_created_at: '2026-05-20T03:01:21Z',
        newest_created_at: '2026-05-20T14:03:53Z'
      },
      schema_correction: 'Column is field_name, NOT data_type (which does not exist). Column is source_type, NOT source. Captain proposal used wrong column names.',
      output_files: [
        'scripts/output/pending-triage-2026-05-21.csv (one row per pending id: id, community_id, canonical_name, field_name, proposed_value, current_value, source_type, decision[accept|reject|needs_evidence], rationale)',
        'scripts/output/pending-triage-2026-05-21-summary.txt (counts by decision × field_name × source_type)'
      ],
      effort_estimate: 'M',
      estimated_time: 90,
      assigns_to: 'Tuvok',
      assigns_to_agent_id: 'hoa-updater',
      source: 'HOA_PLAN success criteria — 24h review SLA',
      why_now: 'Queue has 158 rows backed up from the 2026-05-20 sunbiz backfill cron; 36h old at oldest. Drain restores the 24h SLA and unblocks the next backfill cron from compounding the queue.',
      precondition_query: "SELECT count(*) FROM pending_community_data WHERE status='pending'; -- must return ≥150 before task starts (was 158 at proposal time)",
      blocker_handling: 'If any sunbiz_mismatch_flag row points to a community that already has DIFFERENT registered_agent or state_entity_number values, flag for admin — do NOT auto-reject (mismatch may indicate corrupted parser write from sunbiz_parser_offset.md bug, which is being patched in proposal b0bc7c67). Wait for that patch before processing mismatch rows.',
      ordering_dependency: 'b0bc7c67 (Sunbiz parser fix) should land BEFORE this triage runs on the 4 sunbiz_mismatch_flag rows — otherwise we may approve corrupted data. Triage the 154 non-mismatch rows first; queue mismatch_flag rows for after parser patch.',
      rollback_plan: 'Each rejection sets pending_community_data.status=rejected with reviewed_by=hoa-updater — can be reverted in /admin/pending by flipping status back to pending. CSV is read-only artifact.',
      success_criteria: [
        'scripts/output/pending-triage-2026-05-21.csv exists with exactly 158 rows (one per pending id)',
        'Every row has a decision column populated with one of {accept, reject, needs_evidence}',
        'After admin applies the accept set: SELECT count(*) FROM pending_community_data WHERE status=\'pending\' AND created_at < \'2026-05-21\' returns ≤ 20 (triage drains ≥138 rows)',
        'Zero direct UPDATEs on communities table during triage script run (verify: PATCH /communities count in script log = 0)',
        'Summary file enumerates accept/reject/needs_evidence counts per field_name AND per source_type',
        'All 4 sunbiz_mismatch_flag rows classified as needs_evidence and held pending parser-patch landing'
      ],
      sharpened_success_criteria: [
        'For every accept decision, CSV must show CURRENT communities field value alongside proposed_value so admin can see whether accept overwrites existing data',
        'No row with source_type=sunbiz_no_match or sunbiz_mismatch_flag may be classified accept — only reject or needs_evidence',
        'CSV must include a "data_completeness_delta" column estimating % point change in CLAUDE.md baseline numbers if all accepts ship (e.g., +0.4pp on state_entity_number coverage)',
        'Heuristic must be deterministic — re-running the script on the same 158 rows must produce identical decisions',
        'Summary file must end with an Admiral-readable "Suggested batch order" listing the order to click through in /admin/pending'
      ],
      acceptance_check: '158 rows classified, ≥138 drained on admin apply, parser-corrupted rows held safely, queue back to <20 rows.',
      guardrails: 'NEVER bypass /admin/pending — direct DB writes are forbidden. Mismatch_flag rows wait for parser fix. Re-runnability via deterministic heuristic.'
    }
  },

  {
    id: '39bc41f5-b351-4dfb-90a7-8e0bb7d13bbc',
    title: 'DUPLICATE of a0ab1c8c — close in favor of the prior refined Olympia relink audit (also fixes wrong ZIPs)',
    description: 'This proposal duplicates the already-refined Olympia relink audit (a0ab1c8c-20cf-49ab-b426-3d73935eab10, refined 2026-05-21T06:31, same priority/scope/output: 2-signal evidence CSV, no DB writes). Admiral should close 39bc41f5 and execute a0ab1c8c instead. SEPARATE ISSUE: this proposal lists Olympia ZIPs as 33413/33415/33449, but live data shows the master (id cdb2fd94-51c2-4fec-bb2a-dbe4a3a19f3f) is at 33414 in Wellington with its one current sub (Olympia, 54138b63-b359-4df4-9410-ef6aac0fe03b) also at 33414. The refined a0ab1c8c uses the correct master_hoa_id lookup approach. CLAUDE.md Master/Sub HOA section ZIP hints are stale and should be updated to 33414 in a follow-up.',
    contextPatch: {
      refined_at: NOW,
      refined_by: 'hoa-goal',
      duplicate_of: 'a0ab1c8c-20cf-49ab-b426-3d73935eab10',
      duplicate_reason: 'Same scope (Olympia village re-link investigation), same constraint (no DB writes per rule #17), same deliverable (evidence CSV), same assignee (Seven of Nine / hoa-research). Original was refined 2026-05-21T06:31; this captain proposal at 12:15 appears to be an unintentional re-emission.',
      recommended_admiral_action: 'Set status=cancelled on this row (39bc41f5) and proceed with a0ab1c8c. Optionally separate proposal to update CLAUDE.md ZIP hints from 33413/33415/33449 → 33414.',
      fact_correction: {
        claude_md_says: 'ZIPs 33413, 33415, 33449',
        actual_live_data: {
          master_id: 'cdb2fd94-51c2-4fec-bb2a-dbe4a3a19f3f',
          master_canonical_name: 'Olympia Master Association, Inc.',
          master_city: 'Wellington',
          master_zip: '33414',
          current_sub_count: 1,
          current_sub_id: '54138b63-b359-4df4-9410-ef6aac0fe03b',
          current_sub_canonical_name: 'Olympia',
          current_sub_zip: '33414'
        },
        verified_at: NOW
      },
      effort_estimate: 'XS (close + admin action only)',
      estimated_time: 5,
      assigns_to: 'Admiral (close action)',
      assigns_to_agent_id: 'admiral',
      source: 'QC sweep — agent_review_queue duplicate detection',
      why_now: 'Two open proposals on the same Olympia relink work item is noise in the inbox; the older refined one already passes QC.',
      success_criteria: [
        'agent_review_queue row 39bc41f5 transitions to status=cancelled (or similar terminal state) referencing a0ab1c8c as canonical',
        'No work is dispatched against 39bc41f5; a0ab1c8c is the authoritative work item',
        'CLAUDE.md Master/Sub HOA section ZIPs updated to 33414 (follow-up proposal — out of scope for this row)'
      ],
      sharpened_success_criteria: [
        'Admiral confirms a0ab1c8c remains active and 39bc41f5 closed',
        'No researcher accidentally runs both — only one Olympia relink audit is produced'
      ],
      acceptance_check: 'Row closed without work dispatched.',
      write_mode: 'no execution — close-only proposal',
      no_db_writes: true,
      stop_before: 'any researcher dispatch — this proposal is a duplicate marker only',
      rollback_plan: 'If a0ab1c8c is somehow blocked, re-open 39bc41f5 by setting status back to pending.',
      guardrails: 'Do not dispatch; do not assign to a researcher; close-only.'
    }
  },

  {
    id: 'f312a24c-cff8-4737-8cd0-37402541da33',
    title: 'DUPLICATE of 5cf94d4d — close in favor of the prior refined Solcera Sunbiz-dedupe-gated proposal',
    description: 'This proposal duplicates the already-refined Solcera add (5cf94d4d-077f-4ef9-89f5-cb52435e08a3, refined 2026-05-21T06:31). Same target (Solcera community), same precondition (0 rows match ILIKE %solcera% in communities — re-verified 2026-05-21), same constraint (rule #15 dedupe-check before any INSERT), same write_mode (draft/pending only — no auto-publish). The earlier proposal has a more rigorous 2-signal decision tree (2 Sunbiz signals → status=draft INSERT; 1 signal → pending_community_data; 0 signals → "not found" report and INSERT nothing), which strictly dominates this one. Admiral should close f312a24c and execute 5cf94d4d.',
    contextPatch: {
      refined_at: NOW,
      refined_by: 'hoa-goal',
      duplicate_of: '5cf94d4d-077f-4ef9-89f5-cb52435e08a3',
      duplicate_reason: 'Same target community (Solcera), same researcher (Seven of Nine), same precondition (0 communities matches), same rules (#15 dedupe), same write_mode (draft/pending only). 5cf94d4d has a strictly more detailed decision tree and was already refined 2026-05-21T06:31.',
      recommended_admiral_action: 'Set status=cancelled on this row (f312a24c) and proceed with 5cf94d4d.',
      precondition_reverified: {
        query: "SELECT id FROM communities WHERE canonical_name ILIKE '%solcera%' OR canonical_name ILIKE '%solera%' OR canonical_name ILIKE '%sol cera%'",
        result: '0 rows',
        verified_at: NOW
      },
      effort_estimate: 'XS (close + admin action only)',
      estimated_time: 5,
      assigns_to: 'Admiral (close action)',
      assigns_to_agent_id: 'admiral',
      source: 'QC sweep — agent_review_queue duplicate detection',
      why_now: 'Two open proposals on the same Solcera add is noise; 5cf94d4d already passes QC and includes the more rigorous decision tree.',
      success_criteria: [
        'agent_review_queue row f312a24c transitions to status=cancelled (or similar terminal state) referencing 5cf94d4d as canonical',
        'No work is dispatched against f312a24c; 5cf94d4d is the authoritative work item',
        'When the researcher executes 5cf94d4d, the post-write SELECT (rule #18) confirms exactly one new Solcera row OR a "not found" report and zero rows — never both'
      ],
      sharpened_success_criteria: [
        'Admiral confirms 5cf94d4d remains active and f312a24c closed',
        'No researcher accidentally runs both — only one Solcera entry exists post-execution'
      ],
      acceptance_check: 'Row closed without work dispatched; 5cf94d4d remains the canonical Solcera proposal.',
      write_mode: 'no execution — close-only proposal',
      no_db_writes: true,
      stop_before: 'any researcher dispatch — this proposal is a duplicate marker only',
      rollback_plan: 'If 5cf94d4d is somehow blocked, re-open f312a24c by setting status back to pending.',
      guardrails: 'Do not dispatch; do not assign to a researcher; close-only.'
    }
  }
];

(async () => {
  await status.start('hoa-goal', 'Refining 3 new hoa-dir captain proposals (2 dupes + 1 triage)', refinements.length);

  let done = 0;
  for (const r of refinements) {
    const { data: existing, error: fetchErr } = await supabase
      .from('agent_review_queue')
      .select('context, status')
      .eq('id', r.id)
      .single();
    if (fetchErr) {
      console.error(`Fetch failed for ${r.id}:`, fetchErr.message);
      await status.error('hoa-goal', `Fetch failed for ${r.id}: ${fetchErr.message}`);
      process.exit(1);
    }
    if (existing.status !== 'pending') {
      console.log(`Skip ${r.id}: status is ${existing.status}, not pending`);
      continue;
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
      .eq('status', 'pending');

    if (updateErr) {
      console.error(`Update failed for ${r.id}:`, updateErr.message);
      await status.error('hoa-goal', `Update failed for ${r.id}: ${updateErr.message}`);
      process.exit(1);
    }
    done += 1;
    console.log(`Refined ${done}/${refinements.length}: ${r.id} — ${r.title.substring(0, 90)}`);
    await status.progress('hoa-goal', done, `Refined ${r.id}`);
  }

  await status.complete('hoa-goal', `Refined ${done} hoa-dir proposals: 1 triage (158-row pending queue, schema corrected from data_type→field_name, parser-mismatch dependency on b0bc7c67 flagged), 2 marked as duplicates of prior refined Olympia/Solcera proposals.`);
  console.log('\nDone.');
})();
