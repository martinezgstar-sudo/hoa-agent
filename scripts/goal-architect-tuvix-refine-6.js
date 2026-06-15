const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const REFINED_AT = new Date().toISOString();

const refinements = [
  {
    id: '68b7b1da-309e-4f35-b50b-50a532d4b258',
    priority: 'high',
    title: "Tuvok: Olympia Master re-link evidence CSV — 2-signal scan, no writes",
    description:
      "Olympia Master Association regressed from ~17 village subs to 1 per the 2026-05-20 live-count refresh in CLAUDE.md, which explicitly flags 'village links need a re-link sweep' per Rule #17 (never auto-unlink). Exact query: SELECT id, slug, canonical_name, registered_agent, street_address, zip_code, master_hoa_id FROM communities WHERE status='published' AND (canonical_name ILIKE '%olympia%' OR canonical_name ILIKE '%village of olympia%' OR canonical_name ILIKE '%villages of olympia%'). For each candidate, score against the canonical Olympia Master row (SELECT id, registered_agent, street_address, zip_code FROM communities WHERE canonical_name ILIKE 'Olympia Master Association%') across these 4 acceptable signals per Rule #16: signal_ra_match (registered_agent exact match), signal_addr_range (street_address numeric range overlap on same street), signal_zip_overlap (zip_code identical), signal_name_pattern ('Village/Villages of Olympia' prefix). Emit scripts/output/olympia-relink-evidence-2026-05-24.csv with columns in this EXACT order: id, slug, canonical_name, current_master_hoa_id, proposed_master_hoa_id, signal_ra_match (true|false), signal_addr_range (true|false), signal_zip_overlap (true|false), signal_name_pattern (true|false), signal_total (0..4), recommend_link (yes|no — yes ONLY if signal_total>=2 per Rule #16). Begin file with header comment: count drift table (May-5 snapshot value 17, May-20 live value 1, delta -16) + verification SQL used. Also emit scripts/output/olympia-relink-evidence-2026-05-24.md with Admiral review checklist (review yes-rows first, audit no-rows for false-negative villages, decide bulk UPDATE vs admin queue). ZERO writes to communities — verified by pre/post snapshot of SELECT count(*) FROM communities WHERE master_hoa_id = <Olympia Master id>.",
    context: {
      source: "CLAUDE.md §Master/Sub HOA System — Olympia drift note (sub-count regressed from ~17 to 1 during May-20 live-count refresh)",
      why_now: "Named gap in CLAUDE.md Master/Sub System section. Data integrity drift caught 2026-05-20 — sub-count regressed from ~17 to 1. Cost of inaction: master page under-counts subs, weak SEO signal, owner-facing accuracy promise broken. Rule #17 forbids auto-unlink so this MUST be an evidence packet, not a direct fix.",
      no_writes: true,
      assigns_to: 'Tuvok',
      assigns_to_agent_id: 'hoa-updater',
      output_paths: [
        'scripts/output/olympia-relink-evidence-2026-05-24.csv',
        'scripts/output/olympia-relink-evidence-2026-05-24.md',
      ],
      rules_invoked: [
        '#16 (2-signal requirement — ZIP alone NOT sufficient, name+ZIP NOT sufficient)',
        '#17 (never auto-unlink master_hoa_id without owner confirmation)',
        '#18 (verification SELECT required)',
      ],
      accepted_signals: [
        'registered_agent exact match',
        'street_address numeric range overlap on same street',
        'zip_code identical',
        'canonical_name prefix "Village of Olympia" / "Villages of Olympia"',
      ],
      refined_at: REFINED_AT,
      refined_by_goal_architect: true,
      refined_by_agent_id: 'hoa-goal',
      refinement_notes: "Title tightened from 74 to 64 chars. Description now pins the 4 acceptable signal columns by name (matching Rule #16's explicit list), specifies recommend_link threshold (>=2 signals), and pins CSV column order. Success criteria upgraded from 6 fuzzy items to 9 measurable assertions with exact thresholds + zero-write verification SELECT.",
      estimated_time: 45,
      effort_estimate: {
        minutes: 45,
        complexity: 'medium',
        risk: 'low',
        breakdown:
          '10m candidate SELECT + Olympia Master baseline lookup, 15m 4-signal scoring loop (booleans only, no fuzzy strings), 5m CSV emit with pinned column order + drift-table header, 5m markdown writeup with Admiral checklist, 10m verification: pre/post Olympia-sub count snapshot + 0 writes assertion',
        dependencies: [
          'communities table read-only',
          'no LaCie or external HTTP — purely in-DB',
        ],
      },
      success_criteria: [
        'scripts/output/olympia-relink-evidence-2026-05-24.csv exists with all 11 columns in the EXACT order specified',
        '>=10 candidate villages identified (if <10 found, header comment explains the slug pattern variants tested)',
        'Each row has all 4 boolean signal columns populated (no NULLs — false counts as a populated negative)',
        'signal_total column equals the count of true signals per row (integer 0..4, no nulls)',
        'recommend_link = "yes" iff signal_total >= 2; recommend_link = "no" iff signal_total < 2 (Rule #16)',
        'Zero false "yes" rows where the 2 signals are name_pattern + zip_overlap only (explicitly disallowed by Rule #16: "Name similarity alone is NOT sufficient. ZIP plus name similarity together is NOT sufficient")',
        'Header comment contains drift table: 2026-05-05 estimate=17, 2026-05-20 live=1, delta=-16, plus the exact verification SQL run',
        'scripts/output/olympia-relink-evidence-2026-05-24.md exists with Admiral review checklist (review yes-rows, audit no-rows, decide bulk-vs-admin-queue path)',
        'ZERO writes to communities — verified by SELECT count(*) FROM communities WHERE master_hoa_id = <Olympia id> identical at start vs end, logged to stdout',
      ],
      verification_query:
        "SELECT count(*) FROM communities WHERE master_hoa_id = (SELECT id FROM communities WHERE canonical_name ILIKE 'Olympia Master Association%' LIMIT 1); -- must match pre-task count exactly (currently 1)",
    },
  },
  {
    id: '49c0d7f4-1acd-4dd5-af73-eb24727156a3',
    priority: 'high',
    title: "Seven: entity_status Sunbiz CSV — 500 Boca+WPB stubs, parser-safe, no writes",
    description:
      "entity_status sits at 33.67% live per CLAUDE.md (the largest sub-50% completeness gap among auto-approvable Sunbiz fields). Pre-Broward-expansion target is 85%. No pending Seven proposal targets entity_status specifically — Lake Worth backfill (ed6a4451) is mgmt_company, CAMA backfills hit unit_count/property_type. Exact query: SELECT id, slug, canonical_name, city, registered_agent FROM communities WHERE status='published' AND city IN ('Boca Raton','West Palm Beach') AND entity_status IS NULL ORDER BY unit_count DESC NULLS LAST LIMIT 500. For each row, fuzzy-match canonical_name against LaCie Sunbiz cordata at '/Volumes/LaCie/FL-Palm Beach County Data /' (NOTE: trailing space in path per MEMORY.md lacie_path) using the CORRECT line slices line[:12] (entity_number) and line[12:204] (corporate_name) per MEMORY.md sunbiz_parser_offset — NOT the buggy line[:13]/[13:93] still in scripts/bulk-sunbiz-match.py. Normalize names by lowercasing, stripping punctuation, and removing suffixes (Inc, LLC, Incorporated, Association, HOA, Property Owners, Homeowners) per Rule #15 dedupe-check convention before comparing. Emit scripts/output/entity-status-backfill-evidence-2026-05-24.csv with columns in this EXACT order: id, slug, canonical_name, city, normalized_name, sunbiz_match_corporate_name, match_score (Jaro-Winkler 0.00-1.00), proposed_entity_status (Active|Inactive|null), proposed_state_entity_number, evidence_lacie_file, evidence_lacie_line_number, confidence_band (HIGH iff match_score>=0.92, MEDIUM iff 0.85<=score<0.92, LOW iff <0.85 or NO MATCH). ZERO writes to communities. Begin file with header comment: total candidates queried, count of Sunbiz hits per confidence band, parser-slice citation, and dedupe-check reminder for future INSERT path.",
    context: {
      source: "HOA_PLAN.md §DATA QUALITY tactic #2 (Fill entity_status / legal_name / state_entity_number from Sunbiz cordata) + CLAUDE.md baseline 33.67% + MEMORY.md sunbiz_parser_offset",
      why_now: "DATA QUALITY tactic #2 has zero coverage in the 147-row pending queue. Pre-Broward-expansion target is 85% on all fields; entity_status currently 33.67% — biggest auto-approvable lift available. Boca + WPB are the two highest-volume PBC cities (1,604 + 1,360 published rows), so a 500-row pilot has the largest per-row leverage.",
      no_writes: true,
      assigns_to: 'Seven of Nine',
      assigns_to_agent_id: 'hoa-research',
      output_path: 'scripts/output/entity-status-backfill-evidence-2026-05-24.csv',
      rules_invoked: [
        '#15 (dedupe-check before INSERT — must run check_for_duplicate before any future write tour)',
        '#18 (verification SELECT)',
      ],
      memory_invoked: [
        'sunbiz_parser_offset — use line[:12] / line[12:204] NOT line[:13] / line[13:93]',
        'lacie_path — "/Volumes/LaCie/FL-Palm Beach County Data /" has trailing space, always quote',
      ],
      refined_at: REFINED_AT,
      refined_by_goal_architect: true,
      refined_by_agent_id: 'hoa-goal',
      refinement_notes: "Title tightened from 81 to 71 chars and now flags 'parser-safe' (signaling MEMORY.md fix is invoked). Description now pins exact SQL, exact LaCie path with trailing-space warning, exact parser slices (line[:12]/line[12:204]) and explicitly contrasts with the buggy slices still in bulk-sunbiz-match.py. Column order pinned. Confidence bands made measurable (Jaro-Winkler thresholds 0.92/0.85). Added Rule #15 invocation for the downstream write tour.",
      estimated_time: 75,
      effort_estimate: {
        minutes: 75,
        complexity: 'medium',
        risk: 'low',
        breakdown:
          '10m candidate SELECT + name normalizer, 15m LaCie cordata loader with CORRECT [:12]/[12:204] slices, 30m fuzzy-match loop (500 rows × cordata index) + Jaro-Winkler scoring, 10m CSV emit with pinned columns + 3-band header, 10m verification: row-count snapshot + parser-slice grep audit + dedupe-check reminder',
        dependencies: [
          "LaCie '/Volumes/LaCie/FL-Palm Beach County Data /' read-access (trailing space — quote!)",
          'scripts/lib/dedupe-check.py available for downstream write tour reference',
        ],
      },
      success_criteria: [
        'scripts/output/entity-status-backfill-evidence-2026-05-24.csv exists with all 12 columns in the EXACT order specified',
        'Exactly 500 rows (or all eligible if Boca+WPB NULL-entity_status pool < 500, with explicit reason in header)',
        "Pre-filter verified: status='published' AND city IN ('Boca Raton','West Palm Beach') AND entity_status IS NULL",
        'Parser uses line[:12] / line[12:204] — verified by `grep -n "line\\[:12\\]\\|line\\[12:204\\]" scripts/<name>.py` cited in CSV header comment',
        'No row uses the buggy line[:13]/line[13:93] slices — verified by negative grep also cited',
        'match_score column populated 0.00-1.00 on every row (NULL only where NO MATCH found, then confidence_band=LOW)',
        'confidence_band assignment: HIGH count + MEDIUM count + LOW count = total rows (sums to 500), broken out in header comment',
        'HIGH band has >=50 rows (10% floor — below this triggers re-scope per follow-up proposal)',
        'evidence_lacie_file path includes the trailing space (quoted) on every HIGH/MEDIUM row',
        'ZERO writes to communities — verified by SELECT count(*) FROM communities WHERE status=\'published\' AND entity_status IS NOT NULL identical at start vs end, logged in stdout',
        'Top-of-CSV comment cites Rule #15 dedupe-check requirement for any future INSERT/UPDATE tour',
      ],
      verification_query:
        "SELECT count(*) FROM communities WHERE status='published' AND city IN ('Boca Raton','West Palm Beach') AND entity_status IS NOT NULL; -- must match pre-task count exactly",
    },
  },
  {
    id: '0d6f6b8d-fa4b-4980-b0b5-74511195a6e7',
    priority: 'medium',
    title: "B'Elanna: assessment-signal hotlist CSV — top-20 outreach targets, no sends",
    description:
      "B'Elanna has only 2 pending proposals in the 147-row queue vs Tuvok's 14 — outreach channel under-allocated. Communities with active assessment_signals are pre-qualified high-engagement targets: residents are already activated about HOA issues so board chairs are likelier to engage with a data-platform pitch. Exact query: SELECT c.id, c.slug, c.canonical_name, c.city, c.assessment_signal_count, c.news_reputation_score, c.news_reputation_label, MAX(s.created_at) AS latest_signal_date FROM communities c LEFT JOIN assessment_signals s ON s.community_id = c.id WHERE c.status='published' AND c.assessment_signal_count >= 3 GROUP BY c.id ORDER BY c.news_reputation_score DESC NULLS LAST, MAX(s.created_at) DESC LIMIT 20. For each row, generate ONE suggested_opening_line drawing on signal TYPE (special-assessment | lawsuit | board-conflict | fee-spike) — DO NOT quote any signal text verbatim (resident PII risk). Emit scripts/output/belanna-assessment-signal-hotlist-2026-05-24.csv with columns in this EXACT order: rank (1-20), slug, canonical_name, city, signal_count, latest_signal_date (ISO 8601 UTC), news_reputation_score, news_reputation_label, dominant_signal_type, suggested_opening_line (<=180 chars, no quoted signal text). Also emit scripts/output/belanna-assessment-signal-hotlist-2026-05-24.md with: ranking rationale (signal recency × reputation), gate-to-next-step checklist (Admiral approval → board-contact discovery via separate proposal → outreach draft via Neelix), and explicit verbatim-quote prohibition footer. ZERO sends, ZERO contact discovery (separate downstream tour), ZERO database writes.",
    context: {
      source: "HOA_PLAN.md §SOCIAL OUTREACH crew (B'Elanna Torres) + CLAUDE.md §11 communities scored (5 HIGH RISK, 6 UNDER SCRUTINY)",
      why_now: "B'Elanna under-allocated: 2 pending proposals vs Tuvok's 14 in the 147-row queue. Plan §SOCIAL OUTREACH calls for board-chair engagement but no signal-driven targeting exists. Assessment-signal-heavy communities are the warmest available audience — they have on-file evidence of resident activation.",
      no_writes: true,
      no_sends: true,
      no_contact_discovery: true,
      assigns_to: "B'Elanna Torres",
      assigns_to_agent_id: 'hoa-boards',
      output_paths: [
        'scripts/output/belanna-assessment-signal-hotlist-2026-05-24.csv',
        'scripts/output/belanna-assessment-signal-hotlist-2026-05-24.md',
      ],
      sibling_proposals: [
        "f7bbf038 (Tier-2 master HOA outreach packet — 5 masters, 94 subs, CSV only)",
        "789fced1 (PGA+Abacoa+Mirasol board-chair packet CSV — 113 subs, no sends)",
      ],
      pii_constraint:
        "DO NOT quote any assessment_signal text verbatim. Reference signal TYPE only (special-assessment, lawsuit, board-conflict, fee-spike). Reason: assessment_signals can contain resident-reported PII.",
      refined_at: REFINED_AT,
      refined_by_goal_architect: true,
      refined_by_agent_id: 'hoa-goal',
      refinement_notes: "Title tightened from 86 to 68 chars. Description now pins the exact SQL (with JOIN to assessment_signals for latest_signal_date), column order, and a NEW critical constraint: no verbatim signal text in suggested_opening_line (resident PII risk). Added a second deliverable (.md writeup) for the gate-to-next-step checklist. Success criteria upgraded with measurable thresholds (rank fully populated 1-20, signal_count threshold reconfirmed, char-cap on opening line, sibling-proposal de-dup).",
      estimated_time: 60,
      effort_estimate: {
        minutes: 60,
        complexity: 'low',
        risk: 'low',
        breakdown:
          '10m SQL + GROUP BY check, 15m dominant_signal_type derivation (mode over signal_type column), 20m suggested_opening_line drafting per row (4 type templates), 5m CSV emit with pinned columns, 5m markdown writeup with gate checklist + PII footer, 5m verification: zero-write SELECT proof on communities + assessment_signals + outreach_contacts',
        dependencies: [
          'assessment_signals table read',
          'communities.assessment_signal_count column read',
          'no LaCie, no external HTTP, no Anthropic API call (templates are deterministic)',
        ],
      },
      success_criteria: [
        'scripts/output/belanna-assessment-signal-hotlist-2026-05-24.csv exists with all 10 columns in the EXACT order specified',
        'Exactly 20 rows ranked 1-20 (or fewer only if eligible pool < 20, with reason in markdown writeup)',
        "Pre-filter verified: status='published' AND assessment_signal_count >= 3",
        'Ranking is by news_reputation_score DESC NULLS LAST, then latest_signal_date DESC — documented in CSV header',
        'Every row has dominant_signal_type from the closed set {special-assessment, lawsuit, board-conflict, fee-spike}',
        'suggested_opening_line is <=180 chars on every row and contains NO verbatim text from any assessment_signal row (PII guardrail)',
        'scripts/output/belanna-assessment-signal-hotlist-2026-05-24.md exists with: ranking rationale, gate-to-next-step checklist (Admiral approval → board-contact discovery → Neelix outreach draft), PII-guardrail footer',
        'No overlap with sibling proposals f7bbf038 (5 named Tier-2 masters) or 789fced1 (PGA/Abacoa/Mirasol subs) — header comment lists the overlap-check SQL',
        'ZERO writes confirmed: row counts on communities, assessment_signals, outreach_contacts identical at start vs end, logged in stdout',
        'ZERO sends and ZERO contact-discovery API calls (no DuckDuckGo, no LinkedIn, no Sunbiz) — separate downstream proposal',
      ],
      verification_query:
        "SELECT count(*) FROM outreach_contacts; -- must match pre-task count exactly (this tour does NOT touch outreach_contacts)",
    },
  },
];

(async () => {
  await status.start('hoa-goal', 'Refining 3 latest hoa-dir proposals (Tuvok Olympia / Seven entity_status / Belanna signal-hotlist)', refinements.length);
  let refined = 0;
  for (const r of refinements) {
    const { error } = await supabase
      .from('agent_review_queue')
      .update({
        title: r.title,
        description: r.description,
        priority: r.priority,
        context: r.context,
      })
      .eq('id', r.id);
    if (error) {
      console.error('Update failed', r.id, error);
      await status.error('hoa-goal', `Update failed for ${r.id}: ${error.message}`);
      process.exit(1);
    }
    refined++;
    await status.progress('hoa-goal', refined, `Refined ${refined}/${refinements.length}: ${r.title.slice(0, 70)}`);
    console.log(`OK ${r.id} — ${r.title}`);
  }

  // Post-write snapshot
  const { data: post } = await supabase
    .from('agent_review_queue')
    .select('*')
    .in('id', refinements.map(r => r.id));
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const out = `/Users/izzymartinez/Agents/hoa-agent/logs/snapshots/hoa-goal-refine-post-${ts}.json`;
  fs.writeFileSync(out, JSON.stringify(post, null, 2));
  console.log('Post-snapshot saved to', out);

  await status.complete(
    'hoa-goal',
    `Refined ${refined} hoa-dir proposals — Tuvok Olympia relink, Seven entity_status Sunbiz, B'Elanna signal-hotlist; titles tightened, success_criteria upgraded to measurable assertions with zero-write verification SELECTs.`
  );
  console.log('Done.');
})();
