const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });
const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const proposals = [
  {
    agent_id: 'hoa-dir',
    company: 'hoa-agent',
    priority: 'high',
    title: "B'Elanna Torres pilot: 10-board outreach packet from PBC master HOAs",
    description: "B'Elanna Torres (hoa-boards) currently has ZERO active proposals — the board-outreach role from HOA_PLAN.md is completely untouched. Build a 10-row pilot CSV at scripts/output/belanna-board-pilot-2026-05-21.csv drawn from confirmed PBC masters in CLAUDE.md (Abacoa, PGA National, Mirasol, Boca West, Ibis, Jonathan's Landing, Polo Club Boca, Breakers West, Indian Spring Village, Ballenisles — pick 10 with the best data coverage). For each: canonical_name, slug, city, registered_agent, board-contact source (Sunbiz officer, website /contact, public-records portal), and a 3-line personalized opener referencing the community's data we already show. ZERO emails sent — drafts only for Admiral review. Establishes the board-channel baseline so we have outreach evidence before any send.",
    status: 'pending',
    context: {
      assigns_to: "B'Elanna Torres",
      assigns_to_agent_id: 'hoa-boards',
      estimated_time: 90,
      why_now: 'hoa-boards has no active or approved proposals — only completely-untouched crew role; success criteria require board engagement for verified-data growth',
      source: 'HOA_PLAN.md SOCIAL OUTREACH + CREW (B\'Elanna Torres: Board Member Outreach)',
      output_files: ['scripts/output/belanna-board-pilot-2026-05-21.csv', 'scripts/output/belanna-board-pilot-2026-05-21.md'],
      candidate_pool: '24 distinct master_hoa_id rows confirmed in production (verified live 2026-05-21)',
      no_writes: true
    }
  },
  {
    agent_id: 'hoa-dir',
    company: 'hoa-agent',
    priority: 'high',
    title: 'Lake Worth mgmt_company toolkit — 1,218 missing rows, 5-source CSV, no writes',
    description: "Lake Worth is the last untouched city in the top-5 PBC management_company push (Jupiter done, WPB done, Boca Raton top-50 pending, Palm Beach Gardens started locally). Live count: 1,218 of 1,220 published Lake Worth rows are missing management_company (99.84% gap). Seven of Nine mirrors the jupiter-mgmt-backfill.py / wpb-mgmt-backfill.py pattern: produce scripts/lake-worth-mgmt-backfill.py + scripts/output/lake-worth-mgmt-report.txt with per-row evidence from the canonical 5 sources — (1) Sunbiz cordata officer entry on LaCie, (2) DuckDuckGo web search, (3) DBPR license lookup, (4) association website footer, (5) listing-site footer. Apply Rule 16 two-signal gate; ZERO writes this pass. Apply step is a separate proposal contingent on Admiral CSV approval.",
    status: 'pending',
    context: {
      assigns_to: 'Seven of Nine',
      assigns_to_agent_id: 'hoa-research',
      estimated_time: 120,
      why_now: 'Completes top-5 PBC city mgmt sweep — Lake Worth is largest remaining untouched single-city gap at 99.84%',
      source: 'HOA_PLAN.md DATA QUALITY tactic #1: Fill management_company for top 5 PBC cities',
      output_files: ['scripts/lake-worth-mgmt-backfill.py', 'scripts/output/lake-worth-mgmt-report.txt', 'scripts/output/lake-worth-mgmt-two-signal.csv', 'scripts/output/lake-worth-mgmt-single-source.csv'],
      gap_size: '1218 / 1220 published rows missing management_company (verified live 2026-05-21)',
      no_writes: true,
      depends_on_admiral_apply: true
    }
  },
  {
    agent_id: 'hoa-dir',
    company: 'hoa-agent',
    priority: 'medium',
    title: 'Tuvok stale-refresh census: 4,282 published rows past 30-day SLA — batch plan',
    description: "Success criterion is 'every record refreshed within the last 30 days' but a live count shows 4,282 of 8,007 published rows (53.5%) have updated_at older than 2026-04-21. Recent stale-refresh-retry script only touched 2 rows. Tuvok produces scripts/output/stale-census-2026-05-21.csv ranking all 4,282 rows by oldest updated_at, segmenting into three buckets: (A) rows with rich data (≥4 critical fields filled) needing lightweight re-verify, (B) rows missing critical fields where refresh = research, (C) rows last touched >180 days (priority refresh). Output a 30-day batch plan recommending daily refresh volume to clear the backlog by 2026-06-30. ZERO writes — census + plan only.",
    status: 'pending',
    context: {
      assigns_to: 'Tuvok',
      assigns_to_agent_id: 'hoa-updater',
      estimated_time: 60,
      why_now: 'Success criterion 30-day-refresh SLA is failing for 53.5% of published inventory; previous retry script only touched 2 rows so the gap is widening',
      source: 'HOA_PLAN.md SUCCESS CRITERIA: Every record refreshed within the last 30 days',
      output_files: ['scripts/output/stale-census-2026-05-21.csv', 'scripts/output/stale-refresh-plan-2026-05-21.md'],
      stale_count: '4,282 of 8,007 published (verified live 2026-05-21)',
      no_writes: true
    }
  }
];

async function main() {
  await status.start('hoa-dir', 'Janeway cycle: file 3 proposals to agent_review_queue', proposals.length);
  let written = 0;
  for (const p of proposals) {
    const { data, error } = await supabase
      .from('agent_review_queue')
      .insert(p)
      .select('id, title')
      .single();
    if (error) {
      console.error(`FAIL [${p.title}]: ${error.message}`);
    } else {
      console.log(`WROTE ${data.id} — ${data.title}`);
      written++;
    }
  }
  await status.complete('hoa-dir', `Janeway filed ${written} proposals: B'Elanna 10-board pilot (untouched role), Lake Worth mgmt toolkit (1,218 gap), Tuvok stale-census (4,282 past SLA).`);
  console.log(`\nWrote ${written}/${proposals.length} proposals.`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
