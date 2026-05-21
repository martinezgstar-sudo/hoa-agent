const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const trunc = (s, n) => {
  if (!s) return '';
  s = String(s).replace(/\s+/g, ' ');
  return s.length > n ? s.slice(0, n) + '…' : s;
};

(async () => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: activity } = await supabase
    .from('agent_activity')
    .select('agent_id, event_type, message, created_at')
    .gte('created_at', since)
    .like('agent_id', 'ms-%')
    .order('created_at', { ascending: false })
    .limit(150);

  console.log('=== ACTIVITY (last 24h, ms-*) — counts ===');
  const counts = {};
  for (const a of (activity || [])) {
    const k = `${a.agent_id}/${a.event_type}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  for (const k of Object.keys(counts).sort()) {
    console.log(`  ${k}: ${counts[k]}`);
  }

  console.log('\n=== ACTIVITY (last 24h) — non-start events ===');
  for (const a of (activity || [])) {
    if (a.event_type === 'start') continue;
    console.log(`[${a.created_at.slice(11,16)}] ${a.agent_id} ${a.event_type}: ${trunc(a.message, 160)}`);
  }

  const { data: queue } = await supabase
    .from('agent_review_queue')
    .select('id, agent_id, priority, title, description, status, context, created_at')
    .in('status', ['pending', 'approved'])
    .eq('company', 'morningstar')
    .order('created_at', { ascending: false })
    .limit(80);

  console.log('\n=== REVIEW QUEUE (pending/approved, morningstar) ===');
  for (const q of (queue || [])) {
    console.log(`\n[${q.status}/${q.priority}] ${q.title}`);
    console.log(`  by:${q.agent_id} at:${q.created_at.slice(0,10)}`);
    console.log(`  -> ${trunc(q.description, 260)}`);
    if (q.context) {
      console.log(`  assigns_to: ${q.context.assigns_to || '?'} (${q.context.assigns_to_agent_id || '?'}) src: ${q.context.source || '?'}`);
    }
  }

  console.log(`\nTotal pending/approved: ${(queue || []).length}`);
})();
