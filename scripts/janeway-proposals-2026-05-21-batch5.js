const path = require('path');
const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/izzymartinez/Documents/hoa-agent/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGENT_ID = 'hoa-boards'; // harness-tracked
const PROPOSER = 'hoa-dir';    // Janeway

const proposals = [
  {
    agent_id: PROPOSER,
    company: 'hoa-agent',
    priority: 'high',
    title: 'Neelix Week-22 social calendar — 3 FB + 2 IG + 2 LinkedIn drafts, no sends',
    description: 'Plan mandates 3 Facebook + 2 Instagram + 2 LinkedIn posts per week minimum; zero proposals exist for actual posting cadence (only brand-mention sweep is pending). Draft 7 post variants for week of 2026-05-25 to 2026-05-31. Source content from the 16 COMPLETE-status communities and the published /reports/hoa-fee-report-2026 page. Output: drafts/social-week-22-2026.md with one post per heading (channel, target community, copy ≤280 chars where applicable, suggested image, link). No scheduling, no sends until Admiral approves the calendar.',
    status: 'pending',
    context: {
      assigns_to: 'Neelix',
      assigns_to_agent_id: 'hoa-social',
      estimated_time: 60,
      why_now: 'Plan requires 7 posts/wk minimum; no posting proposals in queue; week 22 starts in 4 days (2026-05-25).',
      source: 'HOA_PLAN.md SOCIAL OUTREACH — tactics 1, 2, 3',
      output_path: '/Users/izzymartinez/Documents/hoa-agent/drafts/social-week-22-2026.md',
      success_criteria: '7 distinct drafts covering 3 FB + 2 IG + 2 LinkedIn; each names a specific community (slug) or report; no DB writes; no posts published; Admiral sign-off required before any send.',
      content_source_query: "SELECT canonical_name, slug, city FROM communities WHERE status='published' AND management_company IS NOT NULL AND monthly_fee_median IS NOT NULL AND unit_count IS NOT NULL AND entity_status IS NOT NULL LIMIT 16;",
      guardrails: ['no scheduling', 'no sends', 'no advertiser names', 'no fee numbers Neelix cannot point to in DB'],
    },
  },
  {
    agent_id: PROPOSER,
    company: 'hoa-agent',
    priority: 'medium',
    title: 'Harry Kim top-10 mgmt outreach packet — 3 email variants + contacts CSV, no sends',
    description: "Harry's research packet on the top 10 PBC mgmt companies is complete (`harry-mgmt-top10-notes.md`) but no outreach proposal is queued. Convert the research into a send-ready packet: 3 email template variants (intro / partnership / claim-your-listing), per-company personalization tokens, and a verified contacts CSV (name, role, email, phone, source URL with verification date). Output: scripts/output/harry-mgmt-outreach-packet-2026-05-21.{md,csv}. Dry-run only — no sends until Admiral approves a specific batch.",
    status: 'pending',
    context: {
      assigns_to: 'Harry Kim',
      assigns_to_agent_id: 'hoa-mgmt',
      estimated_time: 90,
      why_now: 'Research input already exists from prior cycle; outreach pipeline empty for Harry; pairs with Tom Paris vendor proposal as outreach Wave 1.',
      source: 'HOA_PLAN.md THE CREW — Harry Kim: Outreach to property management companies',
      input_path: '/Users/izzymartinez/Documents/hoa-agent/scripts/output/harry-mgmt-top10-notes.md',
      output_paths: [
        '/Users/izzymartinez/Documents/hoa-agent/scripts/output/harry-mgmt-outreach-packet-2026-05-21.md',
        '/Users/izzymartinez/Documents/hoa-agent/scripts/output/harry-mgmt-outreach-packet-2026-05-21.csv',
      ],
      success_criteria: '10 rows in CSV with verified contact + source URL + verification date; 3 distinct email templates ≤200 words each; merge tokens shown ({first_name},{company},{community_count}); zero sends.',
      guardrails: ['rate limit per existing outreach rules: 20 emails/day max once approved', 'never auto-send', 'Admiral signs off per-company before any send'],
    },
  },
  {
    agent_id: PROPOSER,
    company: 'hoa-agent',
    priority: 'medium',
    title: 'Tom Paris vendor target list — 25 PBC vendors × 5 categories + pitch outline, research only',
    description: 'Tom Paris (hoa-vendors) has zero proposals pending and no active workstream beyond a previous vendor-pitch-packet build. Plan tasks him with vendor signups. Build a research-only target list of 25 Palm Beach County vendors across 5 categories that pair with HOAs: (1) HOA-focused insurance, (2) landscaping/lawn, (3) painting/exterior, (4) security/access-control, (5) asphalt/paving. For each: company name, website, phone, owner/manager, est. employee count, signal of HOA work history. Plus a one-page pitch outline tailored to the HOA Agent ad product. Output: scripts/output/vendor-target-list-2026-05-21.{md,csv}. No outreach.',
    status: 'pending',
    context: {
      assigns_to: 'Tom Paris',
      assigns_to_agent_id: 'hoa-vendors',
      estimated_time: 75,
      why_now: 'Vendor pipeline is empty; MorningStar is the sole live advertiser; revenue diversification gated on having a credible target list before sales begin.',
      source: 'HOA_PLAN.md THE CREW — Tom Paris: Sign up vendors for the platform',
      output_paths: [
        '/Users/izzymartinez/Documents/hoa-agent/scripts/output/vendor-target-list-2026-05-21.md',
        '/Users/izzymartinez/Documents/hoa-agent/scripts/output/vendor-target-list-2026-05-21.csv',
      ],
      success_criteria: '25 rows × 7 cols; 5 vendors per category; each row has ≥2 source URLs and verification date; pitch outline names MorningStar precedent + 3 plan tiers + Sponsored Card v4; zero outreach.',
      categories: ['insurance', 'landscaping', 'painting', 'security/access', 'asphalt/paving'],
      guardrails: ['no outreach', 'no scraping of LinkedIn employee data', 'public web sources only', 'flag any vendor that competes with MorningStar (cleaning) for Admiral review'],
    },
  },
];

(async () => {
  await status.start(AGENT_ID, 'Janeway: file 3 gap-targeted outreach proposals (Neelix social / Harry mgmt outreach / Tom vendor list)', proposals.length);

  let i = 0;
  for (const p of proposals) {
    const { data, error } = await supabase.from('agent_review_queue').insert(p).select('id').single();
    if (error) {
      await status.error(AGENT_ID, `Insert failed: ${error.message}`, { title: p.title });
      console.error('FAIL', p.title, error.message);
      process.exit(1);
    }
    i++;
    await status.progress(AGENT_ID, i, `Filed: ${p.title}`);
    console.log(`[OK ${data.id}] ${p.priority} → ${p.context.assigns_to_agent_id} | ${p.title}`);
  }

  await status.complete(AGENT_ID,
    `Janeway filed 3/3 outreach-gap proposals: Neelix Week-22 social calendar (HIGH/hoa-social), Harry Kim top-10 mgmt outreach packet (MED/hoa-mgmt), Tom Paris 25-vendor target list (MED/hoa-vendors). All research/draft only — zero sends, zero DB writes.`,
    { count: proposals.length, proposer: PROPOSER }
  );
})();
