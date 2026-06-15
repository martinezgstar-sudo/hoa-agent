const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
(async () => {
  const { data, error } = await supabase
    .from('agent_review_queue')
    .select('id, created_at, agent_id, priority, title, description, status, context')
    .eq('agent_id', 'hoa-dir')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) { console.error(error); process.exit(1); }
  console.log('Total hoa-dir pending:', data.length);
  for (const r of data) {
    console.log('---');
    console.log('id:', r.id);
    console.log('created_at:', r.created_at);
    console.log('priority:', r.priority);
    console.log('title:', r.title);
    console.log('description:', r.description);
    console.log('context:', JSON.stringify(r.context, null, 2));
  }
})();
