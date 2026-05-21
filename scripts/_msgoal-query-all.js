const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const { data, error } = await supabase
    .from('agent_review_queue')
    .select('*')
    .eq('agent_id', 'ms-dir')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) { console.error('ERR:', error); process.exit(1); }
  fs.writeFileSync('/tmp/msdir-pending.json', JSON.stringify(data, null, 2));
  console.log('count:', data.length);
  // Print summary list
  data.forEach((row, i) => {
    const refined = row.context?.ms_goal_refined_at ? 'REFINED' : 'NEW';
    console.log(`${i+1}. [${refined}] ${row.id.slice(0,8)} | ${row.priority} | ${row.title}`);
  });
})();
