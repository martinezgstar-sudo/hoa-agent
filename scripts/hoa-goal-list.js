const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const { data, error } = await supabase
    .from('agent_review_queue')
    .select('id, priority, title, created_at, context')
    .eq('status', 'pending')
    .eq('agent_id', 'hoa-dir')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) { console.error('Query error:', error); process.exit(1); }
  console.log(`Total pending hoa-dir proposals: ${data.length}\n`);
  data.forEach((row, i) => {
    const ctxKeys = row.context ? Object.keys(row.context).join(',') : '';
    console.log(`${i+1}. [${row.priority}] ${row.title}`);
    console.log(`   id=${row.id} created=${row.created_at}`);
    console.log(`   context_keys=${ctxKeys}\n`);
  });
})();
