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
    id: '872ea830-4898-4acc-a954-82b4f0364a8d',
    title: 'Sunbiz cordata mid-month refresh dry-run — gated on parser-fix b0bc7c67; 200-row diff CSV, zero DB writes',
    description: 'HOA_PLAN ops cadence calls for a mid-month Sunbiz cordata refresh by May 15; today is 2026-05-21 (6 days overdue). 4,282 published rows have updated_at older than 30 days. Tuvok prepares a 200-row dry-run batch — selecting rows where entity_status / state_entity_number / incorporation_date are stale or null and registered_agent already filled (so parser-shift damage is limited) — emits a snapshot to logs/snapshots/sunbiz-refresh-2026-05-21/ and a diff CSV to scripts/output/sunbiz-refresh-2026-05-21-dryrun.csv. HARD GATE: no DB writes until parser-fix b0bc7c67 lands AND its 50-row QC passes ≥95% legal_name alignment. If b0bc7c67 has not landed, this proposal stops at the dry-run CSV.',
    contextPatch: {
      refined_at: NOW,
      refined_by: 'hoa-goal',
      write_mode: 'dry-run-only (snapshot + diff CSV)',
      no_db_writes: true,
      stop_before: 'any UPDATE on communities — Admiral must confirm b0bc7c67 patch is merged AND 50-row QC ≥95% before this proposal advances to apply phase',
      depends_on: 'b0bc7c67-7e12-4e1b-ba26-0d4d992f5074',
      gate_rule: 'Do NOT run apply step until parser-fix proposal b0bc7c67 is merged AND its 50-row QC CSV shows ≥95% legal_name/SEN alignment',
      target_rows: 200,
      output_files: [
        'logs/snapshots/sunbiz-refresh-2026-05-21/ (snapshot of 200 target rows before any change)',
        'scripts/output/sunbiz-refresh-2026-05-21-dryrun.csv (one row per candidate: id, canonical_name, current vs proposed entity_status / state_entity_number / incorporation_date, sunbiz source line, parser_alignment_flag)'
      ],
      effort_estimate: 'M',
      success_criteria: [
        'Exactly 200 candidate rows selected (status=published AND updated_at < NOW - 30d AND at least one of entity_status / state_entity_number / incorporation_date is NULL or stale)',
        'Snapshot directory logs/snapshots/sunbiz-refresh-2026-05-21/ exists with one CSV per affected column',
        'scripts/output/sunbiz-refresh-2026-05-21-dryrun.csv contains exactly 200 rows with the listed columns',
        'Zero UPDATEs on communities table (verify: post-task SELECT max(updated_at) FROM communities WHERE id IN (candidate_ids) is unchanged from snapshot)',
        'A parser_alignment_flag column in the dry-run CSV labels each row as aligned / shifted / unknown based on regex check of legal_name vs state_entity_number formats'
      ],
      sharpened_success_criteria: [
        'If b0bc7c67 has NOT landed by run time, the dry-run CSV must include a top-of-file comment line stating "PARSER FIX NOT VERIFIED — APPLY PHASE BLOCKED"',
        'If any candidate row already has the field set from a non-Sunbiz source (e.g. manual admin entry, sunbiz_source IS NULL), it must be excluded from the candidate set and counted in a skipped-rows summary',
        'Verification SELECT (rule #18) must include count of rows where current entity_status conflicts with proposed entity_status — Admiral needs this to size the eventual apply phase'
      ],
      precondition_query: 'SELECT count(*) FROM communities WHERE status=\'published\' AND updated_at < NOW() - INTERVAL \'30 days\' AND (entity_status IS NULL OR state_entity_number IS NULL OR incorporation_date IS NULL);  -- must return ≥200',
      gate_check_query: 'SELECT id, status, context->>\'qc_pass\' AS qc_pass FROM agent_review_queue WHERE id = \'b0bc7c67-7e12-4e1b-ba26-0d4d992f5074\';  -- status must be approved/completed AND qc_pass=true before proceeding past dry-run',
      blocker_handling: 'If parser-fix b0bc7c67 is still pending, emit dry-run CSV ONLY and halt. Do NOT proceed to apply phase. Re-queue as a follow-up proposal after parser fix lands.',
      rollback_plan: 'Dry-run is read-only; rm -rf logs/snapshots/sunbiz-refresh-2026-05-21/ and rm scripts/output/sunbiz-refresh-2026-05-21-dryrun.csv to fully discard.',
      estimated_time: 60,
      assigns_to: 'Tuvok',
      assigns_to_agent_id: 'hoa-updater',
      source: 'HOA_PLAN.md → OPERATIONS → MONTHLY (Mid-month: Sunbiz cordata refresh)',
      why_now: 'Mid-month Sunbiz refresh is 6 days overdue; 4,282 rows >30d stale per HOA_PLAN data-quality SLA. Dry-run-first prevents compounding the parser bug across another batch.',
      guardrails: 'Never write to communities pre-parser-fix verification. verification_status only accepts pending/verified/in_progress/failed. Memory key sunbiz_parser_offset.md is the canonical reference.',
      reference_memory: 'sunbiz_parser_offset.md'
    }
  },

  {
    id: '09317572-f711-4c18-8f9d-6d887046c044',
    title: 'Wellington mgmt_company 5-source evidence CSV — 269 missing rows, 2-signal rule, no DB writes',
    description: 'Wellington has 276 published communities; 269 (97.5%) lack management_company. It is the only top-10 PBC city without a mgmt-co research toolkit (Boca, WPB, Lake Worth, Jupiter, PBG, Delray, Boynton all have pilots queued). Seven of Nine builds the same 5-source evidence CSV format used by jupiter-toolkit.md: Sunbiz registered_agent → likely manager, public HOA notices, condo.com listings, DBPR licenses, master HOA disclosures. Two-signal threshold per CLAUDE.md rule #16 before any candidate is labeled "confident." Output CSV only at scripts/output/wellington-mgmt-toolkit-2026-05-21.csv plus snapshot of the 269-row candidate list to logs/snapshots/wellington-mgmt-2026-05-21/. Zero communities writes; admin reviews CSV before any pending_community_data INSERT in a follow-up proposal.',
    contextPatch: {
      refined_at: NOW,
      refined_by: 'hoa-goal',
      write_mode: 'CSV-only (research deliverable)',
      no_db_writes: true,
      stop_before: 'any pending_community_data INSERT or communities UPDATE — those are separate Admiral-gated proposals',
      target_rows: 269,
      output_files: [
        'logs/snapshots/wellington-mgmt-2026-05-21/ (snapshot of 269 candidate community ids + canonical_name + current management_company NULL)',
        'scripts/output/wellington-mgmt-toolkit-2026-05-21.csv (one row per community: id, canonical_name, street_address, zip_code, source1_value, source1_url, source2_value, source2_url, source3_value, source3_url, source4_value, source4_url, source5_value, source5_url, signal_count, confident_pick, confidence_rationale)'
      ],
      effort_estimate: 'L',
      success_criteria: [
        'Exactly 269 candidate rows pulled (status=published AND city=\'Wellington\' AND management_company IS NULL)',
        'CSV contains all 269 rows with all 14 source columns (10 = 5 source/url pairs + 3 derived + canonical metadata)',
        '≥40% of rows have ≥2 independent signals (signal_count ≥ 2) — if below 40%, halt and report rather than fill in weak guesses',
        'confident_pick is non-empty ONLY when signal_count ≥ 2 AND ≥2 sources agree on company name (case-insensitive trim)',
        'Zero writes to communities or pending_community_data (verify: SELECT count(*) FROM pending_community_data WHERE field=\'management_company\' AND source LIKE \'wellington_toolkit_%\' returns 0)'
      ],
      sharpened_success_criteria: [
        'Sunbiz signal must use the live registered_agent from communities.registered_agent OR a fresh LaCie cordata lookup — never inferred from name similarity alone',
        'condo.com / listing-site signals must include the exact listing URL — bare "found on condo.com" rejected',
        'If a candidate community has master_hoa_id set, the master\'s management_company is recorded in a separate "master_inferred" column but does NOT count as a signal (per rule #16)',
        'Output CSV must include a "needs_admin_eyes" boolean: true when signal_count = 1 OR when 2 signals disagree on company name'
      ],
      precondition_query: 'SELECT count(*) FROM communities WHERE status=\'published\' AND city=\'Wellington\' AND management_company IS NULL;  -- must return ≥260',
      blocker_handling: 'If LaCie volume is not mounted, halt — do NOT attempt to substitute Sunbiz lookups with name-similarity inference. Report blocker and queue.',
      rollback_plan: 'rm scripts/output/wellington-mgmt-toolkit-2026-05-21.csv && rm -rf logs/snapshots/wellington-mgmt-2026-05-21/  (CSV is read-only deliverable)',
      estimated_time: 90,
      assigns_to: 'Seven of Nine',
      assigns_to_agent_id: 'hoa-research',
      source: 'HOA_PLAN.md → THE TWO GROWTH FOCUSES → 1. DATA QUALITY (tactic #1)',
      why_now: 'Closes the last top-10-city gap in the HOA_PLAN tactic; Wellington is 8th-largest PBC city by published rows and only one with no toolkit',
      guardrails: 'Rule #16 — 2 independent signals required before "confident" label; ZIP/name similarity alone never sufficient; listing-site evidence never auto-approves',
      reference_format: 'scripts/output/jupiter-mgmt-report.txt (use as format reference for column structure)'
    }
  },

  {
    id: 'cc279f11-7aee-400e-9540-3f397dfe3a6d',
    title: 'Brand-mention baseline sweep — 5 platforms × HOA Agent, intel CSV, zero engagement',
    description: 'HOA_PLAN tactic "Monitor mentions of HOA Agent across social channels" (Kes) has no proposal in queue and no recorded activity in the 24h log. Site has ~8,007 community pages live with growing PBC footprint; baseline scan needed before any engagement loop can run. Kes does a one-pass intel scan of Facebook groups, Instagram tagged posts, LinkedIn company-mentions, Reddit (r/florida + r/PalmBeachCounty + r/HOA + r/RealEstate), and Nextdoor for any mention of "hoa-agent.com", "HOA Agent", or @hoa_agent. Output: scripts/output/brand-mention-sweep-2026-05-21.csv with columns platform, url, snippet, author, posted_at, sentiment[positive|neutral|negative|spam], suggested_action[respond|ignore|escalate], rationale. INTEL ONLY — no replies, no DMs, no comments posted; CSV review by Admiral before any engagement.',
    contextPatch: {
      refined_at: NOW,
      refined_by: 'hoa-goal',
      write_mode: 'intel-only CSV deliverable',
      no_db_writes: true,
      no_social_writes: true,
      stop_before: 'any reply, DM, comment, or social-API write — Admiral reviews CSV before any engagement loop is dispatched',
      target_platforms: [
        'Facebook (public groups + page mentions)',
        'Instagram (hashtag + tagged posts)',
        'LinkedIn (company mentions + post search)',
        'Reddit (r/florida, r/PalmBeachCounty, r/HOA, r/RealEstate)',
        'Nextdoor (Palm Beach County neighborhood scope)'
      ],
      search_terms: ['hoa-agent.com', 'HOA Agent', 'hoa agent', '@hoa_agent', 'hoaagent'],
      output_files: [
        'scripts/output/brand-mention-sweep-2026-05-21.csv (one row per mention: platform, url, snippet, author, posted_at, sentiment, suggested_action, rationale)',
        'scripts/output/brand-mention-sweep-2026-05-21-summary.txt (counts by platform × sentiment; flag count of negative mentions)'
      ],
      effort_estimate: 'S',
      success_criteria: [
        'All 5 platforms searched with all 5 search terms (5×5=25 minimum searches logged)',
        'CSV exists at scripts/output/brand-mention-sweep-2026-05-21.csv with the 8 required columns',
        'Summary file enumerates counts by platform × sentiment',
        'Zero social API writes (no replies, DMs, comments, or follows initiated) — verifiable by absence of any POST request in the run log',
        'Negative-sentiment mentions are flagged with suggested_action=escalate AND surfaced in a top-of-file comment in the summary'
      ],
      sharpened_success_criteria: [
        'Every mention row must include the exact URL — if a mention is found but URL is paywalled/private, record snippet only with url=PRIVATE_NO_URL and sentiment=unknown',
        'If zero mentions found on a platform, the platform still gets one row in the summary stating "0 mentions" — silence is data, not omission',
        'Spam / unrelated mentions (e.g. unrelated "HOA agent" usage for insurance agents) must be tagged sentiment=spam, NOT excluded — so future sweeps can dedupe',
        'Suggested-action=respond rows must include the exact draft response in a separate column or linked file — no "respond" without a concrete draft for Admiral to review'
      ],
      precondition_query: 'No DB precondition; deliverable is external-source scan only.',
      blocker_handling: 'If a platform requires auth Kes does not have (e.g. Nextdoor neighborhood-scoped feed), record blocker in summary and continue with the other platforms rather than halting.',
      rollback_plan: 'rm scripts/output/brand-mention-sweep-2026-05-21.csv and the summary file. No social-side state changes to undo (intel-only).',
      estimated_time: 45,
      assigns_to: 'Kes',
      assigns_to_agent_id: 'hoa-comments',
      source: 'HOA_PLAN.md → THE TWO GROWTH FOCUSES → 2. SOCIAL OUTREACH (Kes tactic #6)',
      why_now: 'Plan tactic has zero coverage in 24h activity log; baseline scan needed before engagement loop can run safely',
      guardrails: 'NO replies, DMs, or comments. NO follows or likes. CSV-only deliverable. Admiral reviews before any engagement is dispatched in a follow-up proposal. Negative mentions escalate to Admiral immediately via priority=high re-emission.'
    }
  }
];

(async () => {
  await status.start('hoa-goal', 'Refining 3 newest hoa-dir captain proposals (13:17 batch)', refinements.length);

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
      console.log(`Skipping ${r.id} — status is ${existing.status}, not pending`);
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
    console.log(`Refined ${done}/${refinements.length}: ${r.id} — ${r.title.substring(0, 70)}`);
    await status.progress('hoa-goal', done, `Refined ${r.id}`);
  }

  await status.complete('hoa-goal', `Refined ${done} hoa-dir proposals (added measurable success_criteria, effort_estimate, precondition_query, gate_check_query, blocker_handling, rollback_plan, sharpened_success_criteria); no new proposals written.`);
  console.log('\nDone.');
})();
