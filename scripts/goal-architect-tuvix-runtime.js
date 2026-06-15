const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // Get the most recent batch — proposals created in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('agent_review_queue')
    .select('id, title, description, priority, context, created_at')
    .eq('status', 'pending')
    .eq('agent_id', 'hoa-dir')
    .gte('created_at', oneHourAgo)
    .order('created_at', { ascending: false });
  if (error) { console.error(error); process.exit(1); }
  console.log('Recent batch (last hour):', data?.length || 0);
  for (const p of data) {
    console.log('---');
    console.log('ID:', p.id);
    console.log('Created:', p.created_at);
    console.log('Priority:', p.priority);
    console.log('Title:', p.title);
    console.log('Description:', p.description);
    console.log('Context:', JSON.stringify(p.context, null, 2));
  }
})();
