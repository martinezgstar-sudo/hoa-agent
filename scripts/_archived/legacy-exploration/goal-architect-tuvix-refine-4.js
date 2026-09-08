const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const refinements = [
  {
    id: '900f5a7f-13c8-4c06-b702-bfbf7eb0c568',
    priority: 'high',
    title: 'Tuvok: assessment-signal 90d evidence refresh — 6 rows + 11-vs-6 drift note (no writes)',
    description: "Pull every community where assessment_signal_count > 0 OR is referenced in commit 5e7f59e's 11-scored set, then re-query CourtListener, NewsAPI, and Guardian for the trailing 90 days (cutoff 2026-02-23 to 2026-05-24). Compare against current assessment_signals rows + communities.litigation_count and classify each community as worse|same|better|stale. Deliverable: scripts/output/assessment-signal-refresh-2026-05-24.csv with columns: community_id, community_slug, current_litigation_count, current_signal_count, new_evidence_count_90d, new_evidence_sources (CL|NewsAPI|Guardian), signal_drift_direction, recommend_action (refresh_score|publish_unchanged|escalate_admin|investigate_drift), evidence_urls (semicolon-delimited up to 5). Also emit scripts/output/assessment-signal-drift-2026-05-24.md explaining the 11-vs-6 discrepancy with git-blame on 5e7f59e + Sunbiz/snapshot cross-check. Zero UPDATEs to communities or assessment_signals — Admiral approves all score movements.",
    context: {
      source: "HOA_PLAN.md SUCCESS CRITERIA (every record refreshed within 30 days) + CLAUDE.md COMPLETED THIS WEEK (5e7f59e) drift + queue gap (assessment_signals untouched)",
      why_now: "CLAUDE.md COMPLETED THIS WEEK claims '11 communities scored — 5 HIGH RISK, 6 UNDER SCRUTINY' (commit 5e7f59e) but live DB shows only 6 rows with assessment_signal_count > 0 — a five-row drift never investigated. Risk scores are publicly displayed; verification is overdue. Zero existing queue coverage of assessment_signals or risk-score refresh.",
      no_writes: true,
      assigns_to: 'Tuvok',
      assigns_to_agent_id: 'hoa-updater',
      output_paths: [
        'scripts/output/assessment-signal-refresh-2026-05-24.csv',
        'scripts/output/assessment-signal-drift-2026-05-24.md'
      ],
      lookback_days: 90,
      lookback_cutoff: '2026-02-23',
      estimated_time: 90,
      effort_estimate: { minutes: 90, breakdown: '20m identify 6+5 candidate set & git-blame on 5e7f59e, 40m CourtListener+NewsAPI+Guardian sweep, 20m CSV emit + drift writeup, 10m QA SELECTs' },
      success_criteria: [
        'scripts/output/assessment-signal-refresh-2026-05-24.csv exists with one row per community that currently has assessment_signal_count > 0 OR was in the 5e7f59e set (>=6 rows, target 11)',
        'All 8 columns present in the order specified',
        'Every row populates signal_drift_direction with one of {worse, same, better, stale}',
        'Every row populates recommend_action with one of {refresh_score, publish_unchanged, escalate_admin, investigate_drift}',
        'evidence_urls contains 0–5 distinct working URLs from CL/NewsAPI/Guardian dated within last 90 days',
        'scripts/output/assessment-signal-drift-2026-05-24.md explains why 11 → 6 (with git-blame snippet from 5e7f59e + DB SELECT proof)',
        'Zero writes confirmed via SELECT count(*) FROM assessment_signals before/after — counts identical'
      ]
    }
  },
  {
    id: 'dc6463da-2049-4b3e-9f18-7d0707ebfc56',
    priority: 'medium',
    title: 'Kes: 20 oldest pending comments — reply drafts CSV w/ topic+SLA flags (no publish)',
    description: "SELECT 20 oldest community_comments WHERE status='pending' ORDER BY created_at ASC. For each, draft a 1–2 sentence reply in HOA Agent voice (helpful, factual; link to /corrections when comment is a correction request; never legal advice). Classify topic ∈ {correction, question, complaint, kudos, spam-likely} and flag SLA breach (created_at > 24h ago). Deliverable: scripts/output/comment-reply-templates-2026-05-24.csv with columns: id, community_slug, created_at, age_hours, sla_breach (true|false), comment_excerpt (<=200 chars), topic, drafted_reply (<=280 chars), confidence (high|medium|low), publish_recommended (true|false|admin_review). Zero writes to community_comments — Admiral hand-fields after review. Distinct from Kes's existing audit (16e4738b): that enumerated breaches; this produces the actual response playbook.",
    context: {
      source: "HOA_PLAN.md OPERATIONS DAILY (Kes comment moderation) + SUCCESS CRITERIA (<24hr comment response) + queue gap (audit filed, reply playbook missing)",
      why_now: "Kes's existing queue audit (16e4738b) identifies SLA-breach comments but proposes no reply playbook. HOA_PLAN.md success criteria require <24h response on public comments. Without drafted templates the audit output sits idle. This is the natural follow-on, distinct from the audit itself.",
      no_writes: true,
      assigns_to: 'Kes',
      assigns_to_agent_id: 'hoa-comments',
      output_path: 'scripts/output/comment-reply-templates-2026-05-24.csv',
      target_rows: 20,
      estimated_time: 60,
      effort_estimate: { minutes: 60, breakdown: '10m SELECT + topic taxonomy, 35m drafting (≈100s/comment), 10m SLA tagging + confidence scoring, 5m CSV QA' },
      success_criteria: [
        'scripts/output/comment-reply-templates-2026-05-24.csv exists with exactly 20 rows (or fewer only if total pending count < 20)',
        "All rows selected from community_comments WHERE status='pending' ORDER BY created_at ASC",
        'All 10 columns present in specified order',
        'Every drafted_reply <= 280 chars and uses second-person, no legal-advice phrasing',
        'Every correction-topic row mentions /corrections in drafted_reply',
        'sla_breach=true for every row where age_hours > 24',
        'Spam-likely rows must have publish_recommended=false',
        'Zero writes: SELECT count(*) FROM community_comments identical before/after run'
      ]
    }
  },
  {
    id: 'ed410231-bc9e-485b-b1b5-c231f8f7a42b',
    priority: 'high',
    title: 'Tom: end-to-end signup funnel test — 3 sandbox personas, bug log + go/no-go (no live signups)',
    description: "Walk /advertise/signup → /advertise/login → /advertise/portal → /advertise/portal/plan → /advertise/portal/create → /advertise/portal/checkout/[plan] as 3 sandbox personas (1 landscape, 1 pool, 1 pressure-washing — categories that do NOT overlap MorningStar/cleaning). Use throwaway Supabase test emails (e.g. tom-sandbox-{persona}@hoa-agent.com) and Stripe test keys only. Capture per-step: screenshot, HTTP status, console errors, time-to-render, Resend confirmation arrival latency, RLS errors, and Stripe placeholder behavior. Deliverable: scripts/output/vendor-signup-funnel-test-2026-05-24.md containing (1) bug log table (step | severity P0/P1/P2/P3 | repro steps | screenshot path | fix owner), (2) signup-readiness checklist with binary pass/fail per step, (3) explicit go/no-go verdict for Tom's queued 10-vendor outreach (4d9359f9). After test, DELETE the 3 sandbox advertiser_profiles + advertiser_ads rows so production stats stay clean. This proposal gates 4d9359f9 + 517f2986 — outreach holds until verdict='go'.",
    context: {
      source: "CLAUDE.md ADVERTISER PORTAL block + HOA_PLAN.md TOP-OF-MIND (Stripe wiring pending) + queue gap (vendor outreach proposals queued, funnel-test proposal missing)",
      why_now: "Two vendor-target CSVs (4d9359f9, 517f2986) and a 10-vendor pitch packet are queued, but no proposal verifies the signup funnel they'd be pitched into. Funnel was built in 59a4bee but never end-to-end tested. Sending pitches into a broken funnel burns first-contact opportunities — verify before outreach.",
      no_live_payments: true,
      gates: ['4d9359f9', '517f2986'],
      assigns_to: 'Tom Paris',
      assigns_to_agent_id: 'hoa-vendors',
      output_path: 'scripts/output/vendor-signup-funnel-test-2026-05-24.md',
      sandbox_personas: 3,
      sandbox_categories: ['landscape', 'pool', 'pressure-washing'],
      estimated_time: 75,
      effort_estimate: { minutes: 75, breakdown: '15m sandbox setup (test emails, Stripe test keys, screenshot tooling), 30m three walkthrough passes (10m/persona), 15m bug log writeup, 10m sandbox cleanup, 5m go/no-go verdict' },
      success_criteria: [
        'scripts/output/vendor-signup-funnel-test-2026-05-24.md exists with all three sections (bug log, checklist, verdict)',
        'Bug log lists >=1 row per funnel step traversed OR explicit "no issue" entry per step (>=6 steps × 3 personas = >=18 cells covered)',
        'Severity column uses only {P0, P1, P2, P3}',
        'Signup-readiness checklist has binary pass/fail for every step in the funnel',
        'Verdict is one of {go, no-go, conditional-go-with-P0-fixes} with named blocker IDs if not "go"',
        "Three sandbox advertiser_profiles rows are deleted after test (verified via SELECT count(*) WHERE email LIKE 'tom-sandbox-%' returning 0)",
        'Zero live Stripe charges (confirmed via Stripe dashboard test-mode log only)',
        'Zero production-facing advertiser_ads rows remain (verified via SELECT)'
      ]
    }
  }
];

(async () => {
  await status.start('hoa-goal', 'Refining 3 hoa-dir proposals (Tuvok/Kes/Tom)', 3);
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
      console.error('Failed to update', r.id, error);
      await status.error('hoa-goal', `Update failed for ${r.id}: ${error.message}`);
      process.exit(1);
    }
    refined++;
    await status.progress('hoa-goal', `Refined ${refined}/3: ${r.title.slice(0, 60)}`, refined, 3);
    console.log(`OK ${r.id} — ${r.title}`);
  }
  await status.complete('hoa-goal', `Refined ${refined} hoa-dir proposals with success_criteria + effort_estimate (Tuvok/Kes/Tom)`);
  console.log('Done.');
})();
