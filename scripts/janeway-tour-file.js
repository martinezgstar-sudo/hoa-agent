// Janeway (hoa-dir) — file 3 gap-targeted proposals to agent_review_queue.
// Tour 2026-05-24: Olympia village re-link (Tuvok) | entity_status Sunbiz backfill (Seven) | Assessment-signal board packet (B'Elanna)
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
const AGENT_ID = 'hoa-boards'; // process identity per status reporting rules
const PROPOSER = 'hoa-dir';    // Janeway is the proposing officer

const proposals = [
  {
    agent_id: PROPOSER,
    company: 'hoa-agent',
    priority: 'high',
    title: "Tuvok: Olympia Master village re-link evidence CSV — 2-signal, no writes",
    description: "CLAUDE.md flags Olympia Master Association at 1 sub (regression from prior ~17 village estimate) and explicitly says 'village links need a re-link sweep' per Rule #17 (never auto-unlink). Tuvok pulls all PBC published rows whose canonical_name contains 'Olympia' or 'Village of Olympia', cross-references registered_agent + street-address range + ZIP overlap with the Olympia Master row, and produces an evidence CSV (slug, canonical_name, current master_hoa_id, proposed master_hoa_id, 2-signal evidence columns, recommend_link_y_n). NO master_hoa_id writes — Admiral approves the link plan per Rule #17.",
    status: 'pending',
    context: {
      assigns_to: "Tuvok",
      assigns_to_agent_id: "hoa-updater",
      estimated_time: 45,
      why_now: "Named gap in CLAUDE.md Master/Sub System section, not duplicated in any of 40 pending proposals. Data integrity drift caught during 2026-05-20 live-count refresh — sub-count regressed from ~17 to 1. Cost of inaction: master page under-counts subs, weak SEO signal, owner-facing accuracy promise broken.",
      source: "CLAUDE.md §Master/Sub HOA System — Olympia drift note",
      success_criteria: [
        "CSV at scripts/output/olympia-relink-evidence-2026-05-24.csv",
        "≥10 candidate villages identified and scored",
        "Each row carries ≥2 independent signal columns (RA match, address-range, ZIP, name-pattern)",
        "recommend_link_y_n filled 'yes' only where 2-signal threshold met per Rule #16",
        "Zero writes to communities table (verified by pre/post row count snapshot)",
        "Markdown writeup includes count drift table and Admiral review checklist"
      ],
      effort_estimate: { time_min: 45, risk: "low", complexity: "medium", dependencies: ["Sunbiz LaCie read-access"], breakdown: "15m query + 20m signal scoring + 10m writeup" },
      rules_invoked: ["#16 (2-signal requirement)", "#17 (never auto-unlink)", "#18 (verification SELECT required)"]
    }
  },
  {
    agent_id: PROPOSER,
    company: 'hoa-agent',
    priority: 'high',
    title: "Seven: entity_status Sunbiz backfill evidence CSV — 500 Boca+WPB stubs, no writes",
    description: "entity_status sits at 33.67% live (CLAUDE.md), the largest sub-50% completeness gap among auto-approvable Sunbiz fields. No pending Seven proposal targets entity_status specifically — Lake Worth backfill (ed6a4451) is mgmt_company, CAMA backfills hit unit_count/property_type. Seven fuzzy-matches 500 published stubs in Boca Raton + West Palm Beach (NULL entity_status, has canonical_name) against LaCie Sunbiz cordata, produces evidence CSV (slug, canonical_name, city, match_score, proposed entity_status, proposed state_entity_number, evidence_line), no writes. Admiral reviews; Tuvok runs the UPDATE in a follow-up tour.",
    status: 'pending',
    context: {
      assigns_to: "Seven of Nine",
      assigns_to_agent_id: "hoa-research",
      estimated_time: 75,
      why_now: "DATA QUALITY tactic #2 in HOA_PLAN.md ('Fill entity_status / legal_name / state_entity_number from Sunbiz cordata') has zero coverage in the 40-row pending queue. Pre-Broward-expansion target is 85% on all fields; entity_status currently 33.67%. Boca+WPB are the two highest-volume PBC cities — biggest lift per row.",
      source: "HOA_PLAN.md §DATA QUALITY tactic #2 + CLAUDE.md baseline 33.67%",
      success_criteria: [
        "CSV at scripts/output/entity-status-backfill-evidence-2026-05-24.csv with exactly 500 rows (or all eligible if <500)",
        "Pre-filter: status='published' AND city IN ('Boca Raton','West Palm Beach') AND entity_status IS NULL",
        "Each row has match_score column with documented threshold (≥0.85)",
        "Sunbiz parser uses CORRECT slices line[:12] / line[12:204] per MEMORY.md sunbiz_parser_offset (NOT the buggy [:13]/[13:93])",
        "Zero writes to communities table",
        "Top-of-file comment cites Rule #15 dedupe-check before any future INSERT",
        "Summary block: count by match_score bucket, count rejected for low confidence"
      ],
      effort_estimate: { time_min: 75, risk: "low", complexity: "medium", dependencies: ["LaCie Sunbiz cordata", "scripts/lib/dedupe-check.py"], breakdown: "20m query + 35m fuzzy match + 20m writeup" },
      rules_invoked: ["#15 (dedupe-check before INSERT)", "#18 (verification SELECT)"]
    }
  },
  {
    agent_id: PROPOSER,
    company: 'hoa-agent',
    priority: 'medium',
    title: "B'Elanna: assessment-signal hotlist board outreach packet — 20 communities, no sends",
    description: "B'Elanna has only 2 pending proposals (Tier-2 master + PGA/Abacoa/Mirasol) vs Tuvok's 14 — queue is imbalanced. Communities with active assessment_signals are pre-qualified high-engagement targets: residents are already activated about HOA issues, so board chairs are likely responsive to a data-platform pitch. B'Elanna queries communities with assessment_signal_count ≥3, joins to assessment_signals for evidence snippets, ranks by news_reputation_score DESC + signal recency, produces CSV of top-20 (slug, canonical_name, city, signal_count, latest_signal_date, news_reputation_label, suggested-opening-line draft). NO sends, NO board-contact discovery (that's a downstream tour).",
    status: 'pending',
    context: {
      assigns_to: "B'Elanna Torres",
      assigns_to_agent_id: "hoa-boards",
      estimated_time: 60,
      why_now: "B'Elanna under-allocated in 40-row pending queue (2 vs Tuvok's 14). Plan §SOCIAL OUTREACH calls for board-chair engagement but no signal-driven targeting exists. Assessment-signal-heavy communities are the natural warmest audience — they have evidence of resident activation already on file.",
      source: "HOA_PLAN.md §SOCIAL OUTREACH crew (B'Elanna) + CLAUDE.md §11 communities scored (5 HIGH RISK, 6 UNDER SCRUTINY)",
      success_criteria: [
        "CSV at scripts/output/belanna-assessment-signal-hotlist-2026-05-24.csv with up to 20 rows",
        "Pre-filter: status='published' AND assessment_signal_count >= 3",
        "Each row carries: slug, canonical_name, city, signal_count, latest_signal_date, news_reputation_score, news_reputation_label",
        "suggested-opening-line column is a 1-sentence draft referencing the specific signal type, no real signal text quoted verbatim",
        "Zero writes, zero sends, zero contact discovery (downstream tour)",
        "Markdown writeup includes 'gate to next step' checklist: Admiral approval → board-contact discovery → outreach draft"
      ],
      effort_estimate: { time_min: 60, risk: "low", complexity: "low", dependencies: ["assessment_signals table read"], breakdown: "15m query + 30m ranking & opening-line drafts + 15m writeup" }
    }
  }
];

(async () => {
  await status.start(AGENT_ID, "Janeway tour: 3 gap-targeted hoa-dir proposals (Olympia re-link, entity_status backfill, assessment-signal hotlist)", proposals.length);

  let filed = 0;
  const results = [];
  for (let i = 0; i < proposals.length; i++) {
    const p = proposals[i];
    try {
      const { data, error } = await supabase
        .from('agent_review_queue')
        .insert(p)
        .select('id, title, priority, context')
        .single();
      if (error) {
        await status.error(AGENT_ID, `Insert failed on #${i+1}: ${error.message}`, { proposal: p.title });
        console.error(`FAIL #${i+1}:`, error.message);
        process.exit(1);
      }
      filed++;
      results.push({ id: data.id, title: data.title, priority: data.priority, assigns_to: data.context.assigns_to });
      await status.progress(AGENT_ID, filed, `Filed ${filed}/${proposals.length}: ${data.context.assigns_to} (${data.id.slice(0,8)})`);
      console.log(`OK #${filed}: ${data.priority.toUpperCase()} / ${data.context.assigns_to} → ${data.id}`);
    } catch (e) {
      await status.error(AGENT_ID, `Exception on #${i+1}: ${e.message}`, { proposal: p.title });
      console.error(`EXCEPTION #${i+1}:`, e.message);
      process.exit(1);
    }
  }

  const summary = `Janeway filed ${filed}/${proposals.length} gap-targeted hoa-dir proposals: HIGH/Tuvok Olympia village re-link (${results[0].id.slice(0,8)}), HIGH/Seven entity_status Sunbiz backfill 500-row Boca+WPB (${results[1].id.slice(0,8)}), MEDIUM/B'Elanna assessment-signal hotlist 20-row board outreach packet (${results[2].id.slice(0,8)}). All read-only; targets Olympia drift, plan tactic #2 (entity_status fill), and B'Elanna under-allocation.`;
  await status.complete(AGENT_ID, summary, { proposals: results });
  console.log('\n=== COMPLETE ===');
  console.log(summary);
})();
