const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: process.env.HOME + '/Documents/hoa-agent/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // Recent activity
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: act, error: e1 } = await supabase
    .from('agent_activity')
    .select('agent_id, event_type, message, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50);
  console.log('=== Recent activity (24h) ===');
  if (e1) console.log('ERR:', e1.message);
  (act || []).forEach(r => console.log(`${r.created_at?.slice(0,16)} [${r.agent_id}] ${r.event_type}: ${r.message}`));

  // Pending and approved proposals
  const { data: prop, error: e2 } = await supabase
    .from('agent_review_queue')
    .select('id, agent_id, priority, title, status, created_at, context')
    .in('status', ['pending', 'approved'])
    .order('created_at', { ascending: false })
    .limit(50);
  console.log('\n=== Pending/Approved proposals ===');
  if (e2) console.log('ERR:', e2.message);
  (prop || []).forEach(r => {
    const assigns = r.context?.assigns_to || '?';
    console.log(`[${r.priority}] (${r.status}) [${r.agent_id}→${assigns}] ${r.title}`);
  });
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
