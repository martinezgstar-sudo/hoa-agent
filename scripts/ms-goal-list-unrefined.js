// List ms-dir pending proposals that have NOT yet been refined by ms-goal
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const { data, error } = await supabase
    .from('agent_review_queue')
    .select('id, priority, title, description, context, created_at')
    .eq('status', 'pending')
    .eq('agent_id', 'ms-dir')
    .order('created_at', { ascending: false });

  if (error) { console.error(error); process.exit(1); }

  const unrefined = data.filter(p => !p.context?.ms_goal_refined_at);
  const refined = data.filter(p => p.context?.ms_goal_refined_at);
  console.log(`TOTAL pending ms-dir proposals: ${data.length}`);
  console.log(`Already refined by ms-goal: ${refined.length}`);
  console.log(`UNREFINED (need refinement): ${unrefined.length}\n`);

  for (const p of unrefined) {
    const hasSC = Array.isArray(p.context?.success_criteria) && p.context.success_criteria.length > 0;
    const hasEE = !!p.context?.effort_estimate;
    console.log(`--- ${p.id} [${p.priority}] sc=${hasSC} ee=${hasEE}`);
    console.log(`    TITLE: ${p.title}`);
    console.log(`    DESC : ${(p.description || '').slice(0, 200)}${(p.description||'').length>200?'...':''}`);
    console.log(`    CTX  : ${JSON.stringify(p.context).slice(0, 300)}...`);
  }
})();
