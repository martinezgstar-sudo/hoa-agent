const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const since = new Date(Date.now() - 24*60*60*1000).toISOString();

  // Recent agent activity for morningstar agents
  const { data: activity, error: actErr } = await supabase
    .from('agent_activity')
    .select('agent_id, event_type, message, created_at, details')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(80);

  console.log('=== AGENT ACTIVITY (last 24h) ===');
  if (actErr) console.log('ERR:', actErr.message);
  (activity || []).forEach(a => {
    console.log(`${a.created_at?.slice(0,16)} | ${a.agent_id} | ${a.event_type} | ${(a.message||'').slice(0,120)}`);
  });

  // Pending/approved review queue for MorningStar
  const { data: queue, error: qErr } = await supabase
    .from('agent_review_queue')
    .select('id, agent_id, company, priority, title, description, status, context, created_at')
    .in('status', ['pending', 'approved'])
    .eq('company', 'morningstar')
    .order('created_at', { ascending: false })
    .limit(80);

  console.log('\n=== REVIEW QUEUE (morningstar, pending/approved) ===');
  if (qErr) console.log('ERR:', qErr.message);
  (queue || []).forEach(q => {
    console.log(`${q.created_at?.slice(0,16)} | ${q.status} | ${q.priority} | by ${q.agent_id} -> ${(q.context?.assigns_to||'?')} | ${q.title}`);
  });
  console.log(`Total open: ${(queue||[]).length}`);
})().catch(e => { console.error(e); process.exit(1); });
