const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const since = new Date(Date.now() - 24*60*60*1000).toISOString();
  
  const { data: activity } = await supabase
    .from('agent_activity')
    .select('agent_id, event_type, message, created_at, details')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(80);
  
  console.log('=== AGENT ACTIVITY (last 24h) ===');
  console.log('Count:', activity?.length || 0);
  if (activity) {
    const byAgent = {};
    activity.forEach(a => {
      byAgent[a.agent_id] = (byAgent[a.agent_id] || 0) + 1;
    });
    console.log('By agent:', byAgent);
    console.log('\nMost recent 30:');
    activity.slice(0, 30).forEach(a => {
      console.log(`  [${a.created_at.slice(11,19)}] ${a.agent_id} | ${a.event_type} | ${(a.message || '').slice(0,100)}`);
    });
  }
  
  console.log('\n=== REVIEW QUEUE (pending/approved) ===');
  const { data: queue } = await supabase
    .from('agent_review_queue')
    .select('id, agent_id, priority, title, status, created_at, context')
    .in('status', ['pending', 'approved'])
    .order('created_at', { ascending: false })
    .limit(40);
  console.log('Count:', queue?.length || 0);
  if (queue) {
    queue.forEach(q => {
      const assigns = q.context?.assigns_to || '?';
      console.log(`  [${q.status}/${q.priority}] (${q.agent_id} → ${assigns}) ${q.title}`);
    });
  }
  
  console.log('\n=== AGENT STATUS ===');
  const { data: status } = await supabase
    .from('agent_status')
    .select('agent_id, status, current_task, last_message, last_heartbeat')
    .like('agent_id', 'ms-%')
    .order('agent_id');
  if (status) {
    status.forEach(s => {
      console.log(`  ${s.agent_id} | ${s.status} | ${(s.current_task || '').slice(0,60)} | ${(s.last_message || '').slice(0,60)}`);
    });
  }
})();
