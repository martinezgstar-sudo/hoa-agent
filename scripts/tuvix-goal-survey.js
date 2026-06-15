// Survey the hoa-dir queue: which proposals lack refinement markers?
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const { data: proposals } = await supabase
    .from('agent_review_queue')
    .select('id,title,priority,context,created_at')
    .eq('status', 'pending')
    .eq('agent_id', 'hoa-dir')
    .order('created_at', { ascending: false });

  let refined = 0;
  let unrefined = 0;
  const unrefinedList = [];

  for (const p of proposals) {
    const c = p.context || {};
    const hasRefinedAt = !!c.refined_at;
    const hasSuccessCriteria = !!c.success_criteria;
    const hasEffortEstimate = !!c.effort_estimate;
    const fullyRefined = hasRefinedAt && hasSuccessCriteria && hasEffortEstimate;

    if (fullyRefined) {
      refined++;
    } else {
      unrefined++;
      unrefinedList.push({
        id: p.id,
        title: p.title,
        priority: p.priority,
        created_at: p.created_at,
        hasRefinedAt,
        hasSuccessCriteria,
        hasEffortEstimate
      });
    }
  }

  console.log(`Total hoa-dir pending: ${proposals.length}`);
  console.log(`Fully refined (has refined_at + success_criteria + effort_estimate): ${refined}`);
  console.log(`Needs refinement: ${unrefined}`);
  console.log('\n--- Unrefined (newest first) ---');
  unrefinedList.slice(0, 30).forEach(p => {
    console.log(`${p.created_at} | ${p.priority.padEnd(8)} | ref=${p.hasRefinedAt?'Y':'N'} sc=${p.hasSuccessCriteria?'Y':'N'} ee=${p.hasEffortEstimate?'Y':'N'} | ${p.id.slice(0,8)} | ${p.title.slice(0, 80)}`);
  });
})();
