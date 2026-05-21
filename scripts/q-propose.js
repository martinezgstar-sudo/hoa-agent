const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });
const { createClient } = require('@supabase/supabase-js');
const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  await status.start('ms-adv', 'Q strategist: scanning both plans for blind spots', 2);

  const proposals = [
    {
      agent_id: 'ms-adv',
      company: 'shared',
      priority: 'low',
      status: 'pending',
      title: "FYI: ad engine is broken in 3 places AND the two ad-sales agents haven't run",
      description: [
        "The cross-company revenue path (Quark + vendor-ads → HOA Agent ad slots → MorningStar-style advertisers) has a stack of latent failures the rest of the crew is treating as separate tickets:",
        "(1) ms-marketing flagged ad_events.ad_id is NULL for every event (FK mismatch — clicks/impressions can't be attributed to ads). (2) advertiser_ads has zero rows for MorningStar (b5497ff3-…) even though MorningStar is the named 'first and only active advertiser'. (3) CLAUDE.md still references ad_analytics; production writes to ad_events — every future agent reads the wrong table name. Meanwhile vendor-ads has been idle since 2026-05-19 and Quark has never run.",
        "Each piece looks small in its own row. Together they mean the ad-sales pitch HOA Agent wants to make (\"look at MorningStar's case study\") rests on a tracking pipeline that doesn't attribute the data and a sales agent that has never dispatched. Suggest one consolidated ad-engine-health audit (read-only) before the next ad-sales push — fix attribution FK + CLAUDE.md table-name rot + assign Quark/vendor-ads a first task — instead of three separate fix tickets.",
        "—Q"
      ].join("\n\n"),
      context: {
        assigns_to: 'Admiral Izzy (then Janeway + Picard jointly)',
        assigns_to_agent_id: 'admiral',
        estimated_time: 15,
        why_now: 'Three independent flags pointing at one broken pipeline + two dormant ad-sales agents = revenue engine is offline. MorningStar case study already drafted (reports/morningstar-case-study-2026-05-21.md) is the asset that needs the pipeline working.',
        source: 'Cross-reference: ms-marketing flags 2026-05-21, CLAUDE.md ADVERTISER PORTAL section, HOA_PLAN P5 + MORNINGSTAR_PLAN ad-vendor acquisition',
        related_proposals: [
          'ad_events.ad_id attribution is null for every event (FK mismatch)',
          'advertiser_ads has zero rows for MorningStar',
          'CLAUDE.md references ad_analytics; production code writes to ad_events',
          "FYI: Quark / vendor-ads agent has never run — that's the actual HOA Agent revenue engine"
        ],
        tone: 'fyi'
      }
    },
    {
      agent_id: 'ms-adv',
      company: 'shared',
      priority: 'low',
      status: 'pending',
      title: "FYI: Sunday weekly brief has no owner — daily briefs are running, the weekly is the one Admiral reads",
      description: [
        "PRIORITIES.md calls for two reporting rhythms: Doctor writes the daily brief at 6am (running fine — reporter agent shipped today's at 09:42) AND Doctor writes the weekly summary Sunday night, which the Admiral reads Monday to edit PRIORITIES.md and shift direction. Today is Thursday 2026-05-21. Sunday is 2026-05-24. No agent has a queued task or cron entry for the weekly summary.",
        "The daily briefs are a tactical log. The weekly summary is the only artifact the Admiral uses to *re-prioritize*. If it slips, Monday's PRIORITIES.md edit slips with it, and next week's whole crew gets stale direction. Suggest either (a) extend the reporter agent with a Sunday-evening weekly-rollup mode that consumes the week's daily briefs + closed proposals from agent_review_queue, or (b) give Janeway and Picard each a Friday-afternoon \"write one paragraph of weekly wins/losses\" assignment that the reporter stitches together Sunday. Cross-pollination angle: this is exactly the pattern MorningStar already runs (Friday-afternoon week review per the operations rhythm) — HOA Agent can borrow it verbatim.",
        "Low priority because nothing's on fire yet — but the cadence breaks silently if no one notices it isn't scheduled.",
        "—Q"
      ].join("\n\n"),
      context: {
        assigns_to: 'reporter (Doctor) — needs a sunday_weekly mode',
        assigns_to_agent_id: 'reporter',
        estimated_time: 30,
        why_now: 'Sunday 2026-05-24 is 3 days out; cadence in PRIORITIES.md is unscheduled and unowned. Admiral reads weekly Monday to edit priorities — if it slips, next week opens stale.',
        source: 'PRIORITIES.md "REPORTING" section + MORNINGSTAR_PLAN.md Friday-afternoon review rhythm (cross-pollination)',
        cross_pollination: 'MorningStar already has Friday-afternoon weekly review baked into ops rhythm; HOA Agent can adopt the same pattern. The reporter agent can be the shared writer for both.',
        tone: 'fyi'
      }
    }
  ];

  for (let i = 0; i < proposals.length; i++) {
    const p = proposals[i];
    const { data, error } = await supabase.from('agent_review_queue').insert(p).select('id, title').single();
    if (error) {
      console.error('INSERT FAILED for', p.title, error);
      await status.error('ms-adv', `Insert failed: ${error.message}`);
      process.exit(1);
    }
    console.log(`Filed [${data.id}] ${data.title}`);
    await status.progress('ms-adv', i + 1, `Filed: ${p.title.slice(0, 80)}`);
  }

  await status.complete('ms-adv', `Q filed 2 low-priority FYI proposals: ad-engine-health audit (cross-company revenue engine has 3 broken pieces + 2 dormant agents) and Sunday weekly brief unowned (HOA Agent can borrow MorningStar's Friday-review pattern).`);
  console.log('done.');
})();
