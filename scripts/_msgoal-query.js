const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/izzymartinez/Documents/hoa-agent/.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  await status.start('ms-goal', 'Refining ms-dir proposals as Owen Paris (Goal Architect)', 0);

  // Query pending proposals from ms-dir
  const { data, error } = await supabase
    .from('agent_review_queue')
    .select('*')
    .eq('status', 'pending')
    .eq('agent_id', 'ms-dir')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Query error:', error.message);
    await status.error('ms-goal', error.message);
    process.exit(1);
  }

  console.log(`Found ${data.length} pending ms-dir proposals`);
  data.forEach((p, i) => {
    console.log(`\n--- Proposal ${i+1} (id=${p.id}) ---`);
    console.log('Title:', p.title);
    console.log('Priority:', p.priority);
    console.log('Created:', p.created_at);
    console.log('Description:', p.description);
    console.log('Context:', JSON.stringify(p.context, null, 2));
  });
})();
