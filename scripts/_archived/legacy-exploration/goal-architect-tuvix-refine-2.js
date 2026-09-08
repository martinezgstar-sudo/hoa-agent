// Tuvix (hoa-goal) — refine 3 newest hoa-dir proposals (created 2026-05-24 02:02)
const path = require('path');
const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const QC_STAMP = {
  qc_reviewed_by: 'hoa-goal (Tuvix)',
  qc_pass_at: new Date().toISOString(),
};

const refinements = [
  // -------------------------------------------------------------------------
  // 1) Seven: Solcera dossier (MEDIUM — but Admiral-named TOP-OF-MIND)
  // -------------------------------------------------------------------------
  {
    id: 'b8f5cc5e-8a96-4b64-a31b-f3f0efceff39',
    title: 'Seven: Solcera dossier — 5-tier research, 1-row markdown, no INSERT',
    description:
      "TOP-OF-MIND in CLAUDE.md: 'Solcera needs to be added to the database' — Supabase confirms 0 rows match 'solcera' in canonical_name. " +
      "Seven runs the 5-tier pipeline (LaCie Sunbiz CSVs → CourtListener → DuckDuckGo ×9 queries → listing sites → PBCPAO) and writes a " +
      "single-row dossier to scripts/output/solcera-dossier-2026-05-23.md. Required fields: proposed canonical_name, slug, city (must be PBC), " +
      "zip_code (must be 334xx/335xx), proposed master_hoa_id candidate WITH the two independent signals required by Rule 16, entity_status, " +
      "state_entity_number, registered_agent, incorporation_date, unit_count, monthly_fee_min/median/max (each tagged AUTO_APPROVE or " +
      "PENDING_REVIEW per CLAUDE.md fee rules), evidence URLs per field (min 1, prefer 2). Unverified fields = NULL with literal 'not found' " +
      "note. Run scripts/lib/dedupe-check.py BEFORE recommending INSERT and include its output verbatim in the dossier. NO Supabase writes.",
    context_merge: {
      ...QC_STAMP,
      qc_notes:
        'Title cut 88→68 chars and named the artifact. Enforced Rule 16 two-signal requirement on master_hoa_id explicitly. Added per-field ' +
        'AUTO_APPROVE/PENDING_REVIEW tagging so the dossier maps cleanly to CLAUDE.md auto-approvable vs pending-queue split. Required city ' +
        'and ZIP to be inside PBC so a non-PBC Solcera (false positive) is rejected at dossier stage. Verification query proves 0 writes.',
      deliverables: [
        'scripts/output/solcera-dossier-2026-05-23.md (single-row markdown + JSON code-fence)',
        'Inline dedupe-check.py output (existing_id or "no match")',
      ],
      effort_estimate: {
        time_min: 40,
        complexity: 'medium',
        risk: 'low',
        dependencies: [
          'LaCie path "/Volumes/LaCie/FL-Palm Beach County Data /" mounted (trailing space)',
          'CourtListener token + DuckDuckGo HTML access',
          'scripts/lib/dedupe-check.py importable',
        ],
        blockers: ['LaCie unmounted → Tier 1 falls back to Sunbiz public site (slower, log it)'],
      },
      success_criteria: [
        'scripts/output/solcera-dossier-2026-05-23.md exists with EXACTLY one community profile',
        'Dossier includes: canonical_name, slug, city ∈ PBC city list, zip_code matches /^33[45]\\d{2}$/, entity_status, state_entity_number, registered_agent, incorporation_date, unit_count, monthly_fee_min/median/max',
        'Each field row tagged: AUTO_APPROVE | PENDING_REVIEW | NOT_FOUND with at least one evidence URL when value is non-NULL',
        'master_hoa_id candidate is present only if TWO independent Rule-16 signals are documented (Sunbiz agent match, address-range, related-entity mention, or master HOA website mention); ZIP alone = NULL',
        'dedupe-check.py output reproduced verbatim in dossier; if existing_id returned, dossier ends with "RECOMMENDATION: UPDATE existing row, do not INSERT"',
        'Listing-site fees flagged PENDING_REVIEW only; Sunbiz fields tagged AUTO_APPROVE only',
        'Zero Supabase writes — verified by SELECT COUNT(*) FROM communities WHERE canonical_name ILIKE \'%solcera%\' returning identical pre/post count',
      ],
      verification_query:
        "SELECT COUNT(*) FROM communities WHERE canonical_name ILIKE '%solcera%'; -- must match pre-task count exactly (expected 0)",
    },
  },

  // -------------------------------------------------------------------------
  // 2) Tuvok: exact-name duplicate audit (HIGH)
  // -------------------------------------------------------------------------
  {
    id: '384cd737-08d1-42db-b66e-2da68afe0ec3',
    title: 'Tuvok: exact-name dup audit CSV — 47 clusters, recommend_keep, no merges',
    description:
      "DATA QUALITY tactic 5 in HOA_PLAN.md: 'Identify duplicates by canonical_name and merge' — zero coverage. Audit shows 47 canonical_name " +
      "clusters in status='published' with 2+ rows sharing the exact name. Tuvok writes scripts/output/exact-name-dups-2026-05-23.csv with one " +
      "row per duplicate community (≥94 rows total) grouped by cluster_id. Columns: cluster_id (1..47), canonical_name, row_id, slug, city, " +
      "zip_code, master_hoa_id, unit_count, entity_status, has_fees (Y/N), has_news (Y/N), non_null_field_count (int), recommended_keep (Y/N), " +
      "recommended_dup_reason. Keep-rule: row with highest non_null_field_count across {entity_status, management_company, monthly_fee_median, " +
      "unit_count, registered_agent}; tie-breaker = older created_at. Per Rule 17, clusters where rows have DISTINCT non-NULL master_hoa_id are " +
      "tagged 'OWNER_CONFIRM_REQUIRED' and excluded from recommended_keep. NO status changes, NO merges, NO unlinks.",
    context_merge: {
      ...QC_STAMP,
      qc_notes:
        'Title cut 81→70 chars. Made the recommended_keep tie-breaker rule deterministic and explicit (non_null_field_count across 5 named ' +
        'fields, then created_at). Added the OWNER_CONFIRM_REQUIRED tag so Rule 17 is encoded in the artifact, not just the guardrail. ' +
        'Filtered rows already marked status=duplicate from the audit (per guardrail). Verification query confirms 0 status mutations.',
      deliverables: [
        'scripts/output/exact-name-dups-2026-05-23.csv (≥94 data rows, ordered by cluster_id then created_at)',
        'Footer comment lines: total_clusters, total_rows, owner_confirm_clusters, recommend_keep_count, recommend_dup_count',
      ],
      effort_estimate: {
        time_min: 45,
        complexity: 'low',
        risk: 'low',
        dependencies: [
          'Supabase SELECT on communities WHERE status=\'published\' GROUP BY canonical_name HAVING COUNT(*)>=2',
        ],
        blockers: [],
      },
      success_criteria: [
        'scripts/output/exact-name-dups-2026-05-23.csv exists with ≥94 data rows across exactly 47 cluster_id values (1..47)',
        'Every row populated with: cluster_id, canonical_name, row_id (uuid), slug, city, zip_code, master_hoa_id (uuid or NULL), unit_count (int or NULL), entity_status, has_fees ∈ {Y,N}, has_news ∈ {Y,N}, non_null_field_count (int 0..5), recommended_keep ∈ {Y,N,OWNER_CONFIRM_REQUIRED}, recommended_dup_reason',
        'Within each cluster, exactly one row has recommended_keep=Y UNLESS the cluster is OWNER_CONFIRM_REQUIRED (then 0 rows have Y)',
        'A cluster is OWNER_CONFIRM_REQUIRED iff 2+ rows have distinct non-NULL master_hoa_id (Rule 17 encoded)',
        'Rows with status=\'duplicate\' are excluded from the audit (verified by SELECT count)',
        'Footer counts reconcile: recommend_keep_count + recommend_dup_count + (owner_confirm_clusters * cluster_size) = total_rows',
        'Zero status mutations — SELECT COUNT(*) FROM communities WHERE status=\'duplicate\' identical pre/post',
      ],
      verification_query:
        "SELECT COUNT(*) FROM communities WHERE status='duplicate'; SELECT canonical_name, COUNT(*) FROM communities WHERE status='published' GROUP BY canonical_name HAVING COUNT(*)>=2; -- cluster count must equal 47",
    },
  },

  // -------------------------------------------------------------------------
  // 3) Seven: CAMA unit_count backfill (HIGH)
  // -------------------------------------------------------------------------
  {
    id: '39e09112-acd8-4c1b-bf12-f4a2adc67bc5',
    title: 'Seven: CAMA unit_count top-500 CSV — match_score ≥0.85, no writes',
    description:
      "DATA QUALITY tactic 3 in HOA_PLAN.md: 'Fill unit_count and property_type from CAMA and Property tables on LaCie' — only DATA QUALITY " +
      "tactic with zero proposals. 3,123 published communities (39% of 8,007) have NULL unit_count. Seven scans \"/Volumes/LaCie/FL-Palm Beach " +
      "County Data /\" CAMA + Property tables (quote the trailing space — memory: lacie_path), fuzzy-matches against the 3,123-row gap list, and " +
      "writes scripts/output/cama-unit-count-top500-2026-05-23.csv with EXACTLY top-500 highest-confidence matches (cluster by community_id, " +
      "one row per community). Columns: community_id, canonical_name, city, zip_code, current_unit_count (NULL), proposed_unit_count, source_file " +
      "(LaCie path), source_row_key, match_score (0..1), evidence_snippet (≤200 chars). Reject any match with score < 0.85 — these rows do NOT " +
      "appear in the CSV but are summed in the footer rejected_count. NO Supabase writes, NO LaCie modifications.",
    context_merge: {
      ...QC_STAMP,
      qc_notes:
        'Title cut 72→64 chars and named the confidence threshold. Required EXACTLY top-500 (not "up to 500") so Seven cannot underdeliver. ' +
        'Required match_score ≥0.85 cutoff to be enforced at CSV-write time so admin never sees low-confidence rows mixed with high. ' +
        'Added source_row_key column so the eventual write-back batch can deterministically re-locate the LaCie source row. Pinned the trailing-space LaCie path per memory.',
      deliverables: [
        'scripts/output/cama-unit-count-top500-2026-05-23.csv (exactly 500 data rows)',
        'Footer comment lines: gap_total (3123), scanned_rows, matched_rows, rejected_count_below_threshold, top500_min_score, top500_median_score',
      ],
      effort_estimate: {
        time_min: 90,
        complexity: 'medium',
        risk: 'low',
        dependencies: [
          'LaCie mounted at "/Volumes/LaCie/FL-Palm Beach County Data /" (trailing space — quote always)',
          'Supabase SELECT id, canonical_name, city, zip_code FROM communities WHERE status=\'published\' AND unit_count IS NULL',
        ],
        blockers: ['LaCie unmounted → task pauses; do not proceed with partial scan'],
      },
      success_criteria: [
        'scripts/output/cama-unit-count-top500-2026-05-23.csv exists with EXACTLY 500 data rows',
        'Columns: community_id (uuid), canonical_name, city, zip_code, current_unit_count (always empty/NULL), proposed_unit_count (positive int), source_file (absolute LaCie path with trailing-space quoted), source_row_key (string), match_score (0.85..1.00), evidence_snippet (≤200 chars, no newlines)',
        'Every row has match_score ≥ 0.85; rows below threshold are excluded but counted in footer rejected_count_below_threshold',
        'One row per community_id — no duplicate community_id values in CSV',
        'Footer reports: gap_total=3123, scanned_rows, matched_rows (total ≥0.85), rejected_count_below_threshold, top500_min_score, top500_median_score',
        'top500_min_score ≥ 0.85 (sanity check on the threshold being applied)',
        'Zero Supabase writes — verified by SELECT COUNT(*) FROM communities WHERE unit_count IS NULL AND status=\'published\' returning identical pre/post count (≈3123)',
        'Zero LaCie modifications — verified by `ls -la "/Volumes/LaCie/FL-Palm Beach County Data /"` mtime unchanged on top-level files',
      ],
      verification_query:
        "SELECT COUNT(*) FROM communities WHERE unit_count IS NULL AND status='published'; -- expected ~3123, must match pre-task exactly",
    },
  },
];

(async () => {
  await status.start('hoa-goal', 'Tuvix: QC refining 3 newest hoa-dir proposals (2026-05-24 batch)', refinements.length);

  let n = 0;
  for (const r of refinements) {
    const { data: existing, error: readErr } = await supabase
      .from('agent_review_queue')
      .select('context')
      .eq('id', r.id)
      .single();
    if (readErr) {
      await status.error('hoa-goal', `Read failed for ${r.id}: ${readErr.message}`);
      continue;
    }

    const mergedContext = { ...(existing.context || {}), ...r.context_merge };

    const { error: updErr } = await supabase
      .from('agent_review_queue')
      .update({
        title: r.title,
        description: r.description,
        context: mergedContext,
      })
      .eq('id', r.id);

    if (updErr) {
      await status.error('hoa-goal', `Update failed for ${r.id}: ${updErr.message}`);
      continue;
    }

    n++;
    await status.progress('hoa-goal', n, `Refined: ${r.title}`);
    console.log(`OK ${r.id} -> ${r.title} (${r.title.length} chars)`);
  }

  await status.complete('hoa-goal', `Refined ${n} hoa-dir proposals: tightened titles <80 chars, added measurable success_criteria + verification_query + effort_estimate.`);
  console.log(`\nDone. ${n}/${refinements.length} proposals refined.`);
})();
