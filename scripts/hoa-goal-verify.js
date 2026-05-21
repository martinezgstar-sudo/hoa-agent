const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ids = [
  '10362c2f-18ea-4d73-9224-6eef154f6c7d',
  'edff8bf5-def1-4a91-be0e-3e6159ee62da',
  'b0bc7c67-7e12-4e1b-ba26-0d4d992f5074'
];

(async () => {
  const { data, error } = await supabase
    .from('agent_review_queue')
    .select('id, title, context')
    .in('id', ids);
  if (error) { console.error(error); process.exit(1); }
  data.forEach(r => {
    const ctx = r.context || {};
    console.log(`\n=== ${r.id} ===`);
    console.log(`title: ${r.title}`);
    console.log(`refined_by: ${ctx.refined_by}`);
    console.log(`refined_at: ${ctx.refined_at}`);
    console.log(`effort_estimate: ${ctx.effort_estimate}`);
    console.log(`write_mode: ${ctx.write_mode}`);
    console.log(`stop_before: ${ctx.stop_before}`);
    console.log(`success_criteria count: ${Array.isArray(ctx.success_criteria) ? ctx.success_criteria.length : 'MISSING'}`);
    console.log(`sharpened_success_criteria count: ${Array.isArray(ctx.sharpened_success_criteria) ? ctx.sharpened_success_criteria.length : 'MISSING'}`);
    console.log(`precondition_query: ${ctx.precondition_query ? 'SET' : 'MISSING'}`);
    console.log(`rollback_plan: ${ctx.rollback_plan ? 'SET' : 'MISSING'}`);
    console.log(`blocker_handling: ${ctx.blocker_handling ? 'SET' : 'MISSING'}`);
    console.log(`output_files: ${Array.isArray(ctx.output_files) ? ctx.output_files.length + ' items' : 'MISSING'}`);
  });
})();
