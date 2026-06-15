const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
(async () => {
  // Just list summary of all pending hoa-dir proposals - id, created_at, title, has_refined marker
  const { data, error } = await supabase
    .from('agent_review_queue')
    .select('id, created_at, title, context')
    .eq('agent_id', 'hoa-dir')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) { console.error(error); process.exit(1); }
  console.log('Total:', data.length);
  for (const r of data) {
    const refined = r.context?.refined_by_goal_architect || r.context?.refined_at ? 'REFINED' : 'NEW';
    console.log(`${refined} ${r.created_at} ${r.id.slice(0,8)} :: ${r.title.slice(0,80)}`);
  }
})();
