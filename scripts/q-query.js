const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // recent proposals
  const { data: queue, error: qerr } = await supabase
    .from('agent_review_queue')
    .select('agent_id, company, priority, title, status, created_at, context')
    .order('created_at', { ascending: false })
    .limit(40);
  console.log('=== RECENT PROPOSALS (last 40) ===');
  if (qerr) console.error(qerr);
  else queue.forEach(r => {
    console.log(`[${r.created_at?.slice(0,10)}] ${r.priority?.toUpperCase()} ${r.agent_id} (${r.company}) ${r.status} :: ${r.title}`);
  });

  // recent activity
  const { data: act, error: aerr } = await supabase
    .from('agent_activity')
    .select('agent_id, event_type, message, created_at')
    .order('created_at', { ascending: false })
    .limit(30);
  console.log('\n=== RECENT ACTIVITY (last 30) ===');
  if (aerr) console.error(aerr);
  else act.forEach(r => {
    console.log(`[${r.created_at?.slice(0,16)}] ${r.agent_id} ${r.event_type} :: ${r.message?.slice(0,140)}`);
  });

  // agent status summary
  const { data: status, error: serr } = await supabase
    .from('agent_status')
    .select('agent_id, company, status, current_task, last_message, last_heartbeat')
    .order('last_heartbeat', { ascending: false })
    .limit(30);
  console.log('\n=== CREW STATUS (top 30 by last_heartbeat) ===');
  if (serr) console.error(serr);
  else status.forEach(r => {
    console.log(`${r.agent_id} (${r.company}) [${r.status}] task=${(r.current_task||'').slice(0,50)} hb=${r.last_heartbeat?.slice(0,16)}`);
  });
})();
