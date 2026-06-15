const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // 1. Recent agent activity (24h) for hoa-* agents
  const since = new Date(Date.now() - 24*60*60*1000).toISOString();
  const { data: activity, error: ae } = await supabase
    .from('agent_activity')
    .select('agent_id, event_type, message, created_at')
    .like('agent_id', 'hoa-%')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(80);
  console.log('=== AGENT ACTIVITY (last 24h, hoa-*) ===');
  console.log('count:', activity?.length || 0, 'error:', ae?.message);
  if (activity) for (const a of activity) {
    console.log(`[${a.created_at.slice(11,19)}] ${a.agent_id} ${a.event_type}: ${a.message?.slice(0,140)}`);
  }

  // 2. Pending/approved proposals from hoa-dir or for hoa-agent company
  const { data: queue, error: qe } = await supabase
    .from('agent_review_queue')
    .select('id, agent_id, company, priority, title, status, created_at, context')
    .eq('company', 'hoa-agent')
    .in('status', ['pending','approved'])
    .order('created_at', { ascending: false })
    .limit(40);
  console.log('\n=== PENDING/APPROVED PROPOSALS (hoa-agent) ===');
  console.log('count:', queue?.length || 0, 'error:', qe?.message);
  if (queue) for (const q of queue) {
    const assignTo = q.context?.assigns_to || q.context?.assigns_to_agent_id || '?';
    console.log(`[${q.status}] ${q.priority} | ${q.agent_id} -> ${assignTo}: ${q.title} (${q.created_at.slice(0,10)})`);
  }

  // 3. Current agent status (so we know who is busy)
  const { data: status, error: se } = await supabase
    .from('agent_status')
    .select('agent_id, status, current_task, last_message, updated_at')
    .like('agent_id', 'hoa-%')
    .order('updated_at', { ascending: false });
  console.log('\n=== CREW STATUS ===');
  console.log('count:', status?.length || 0, 'error:', se?.message);
  if (status) for (const s of status) {
    console.log(`${s.agent_id} [${s.status}] task=${s.current_task?.slice(0,70) || '-'} | ${s.last_message?.slice(0,80) || ''}`);
  }
})();
