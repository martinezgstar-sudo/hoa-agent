const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // get all 158, fetch lighter detail and save to a file
  const fs = require('fs');
  const { data, error } = await supabase
    .from('agent_review_queue')
    .select('id, agent_id, priority, title, status, created_at, context')
    .eq('company', 'morningstar')
    .in('status', ['pending', 'approved'])
    .order('created_at', { ascending: false });
  if (error) { console.error(error); process.exit(1); }
  const out = data.map((q,i) => {
    const ctx = q.context || {};
    return `${i+1}. [${q.status}/${q.priority}] ${ctx.assigns_to || '?'} :: ${q.title}`;
  }).join('\n');
  fs.writeFileSync('/tmp/proposals-titles.txt', out);
  console.log(`Total proposals: ${data.length}`);
  console.log('Saved titles list to /tmp/proposals-titles.txt');

  // Tally by assignee
  const by = {};
  data.forEach(q => {
    const a = (q.context && q.context.assigns_to) || 'unknown';
    by[a] = (by[a]||0)+1;
  });
  console.log('\nBy assignee:');
  Object.entries(by).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(`  ${k}: ${v}`));
})();
