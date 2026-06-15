const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('=== PENDING & APPROVED PROPOSALS (morningstar) — full list ===');
  const { data, error } = await supabase
    .from('agent_review_queue')
    .select('id, agent_id, priority, title, description, status, created_at, context')
    .eq('company', 'morningstar')
    .in('status', ['pending', 'approved'])
    .order('created_at', { ascending: false });
  if (error) console.error(error);
  else {
    console.log(`Total: ${data.length}`);
    data.forEach((q, i) => {
      const ctx = q.context || {};
      console.log(`\n${i+1}. [${q.status}/${q.priority}] ${q.title}`);
      console.log(`   id=${q.id} created=${q.created_at}`);
      console.log(`   assigns_to=${ctx.assigns_to || '?'} | est=${ctx.estimated_time || '?'}m | source=${ctx.source || '?'}`);
      console.log(`   why_now: ${ctx.why_now || '?'}`);
      console.log(`   desc: ${(q.description || '').slice(0,180)}`);
    });
  }
})();
