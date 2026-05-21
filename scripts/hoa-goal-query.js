const path = require('path');
const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  await status.start('hoa-goal', 'Refining hoa-dir captain proposals', 0);

  const { data, error } = await supabase
    .from('agent_review_queue')
    .select('id, agent_id, priority, title, description, status, context, created_at')
    .eq('status', 'pending')
    .eq('agent_id', 'hoa-dir')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) { console.error('Query error:', error); process.exit(1); }
  console.log(JSON.stringify({ count: data.length, rows: data }, null, 2));
})();
