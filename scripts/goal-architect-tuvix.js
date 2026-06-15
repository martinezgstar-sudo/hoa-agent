const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/izzymartinez/Documents/hoa-agent/.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await supabase
    .from('agent_review_queue')
    .select('id, title, context')
    .in('id', ['2875e200-6100-4fde-a4cc-2479f333704f', '99ef0219-e3dd-4139-9133-689a320d9523', 'c7d42cfa-dd07-4a5c-aa00-68e3d6faafca']);
  for (const r of data) {
    console.log(`\n${r.id}`);
    console.log(`  title: ${r.title} (${r.title.length} chars)`);
    console.log(`  effort_estimate: ${r.context.effort_estimate || 'MISSING'}`);
    console.log(`  success_criteria: ${(r.context.success_criteria || '').slice(0, 100)}...`);
  }
})();
