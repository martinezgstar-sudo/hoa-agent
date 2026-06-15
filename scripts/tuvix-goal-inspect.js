// Inspect a few unrefined proposals in full to assess what refinement they need
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TARGET_IDS = process.argv.slice(2);

(async () => {
  let q = supabase
    .from('agent_review_queue')
    .select('*')
    .eq('status', 'pending')
    .eq('agent_id', 'hoa-dir');
  if (TARGET_IDS.length) {
    // Match by id prefix
    const { data: all } = await q;
    var data = all.filter(p => TARGET_IDS.some(t => p.id.startsWith(t)));
  } else {
    q = q.order('created_at', { ascending: false }).limit(3);
    var { data } = await q;
  }

  for (const p of data) {
    const c = p.context || {};
    console.log('='.repeat(80));
    console.log(`ID: ${p.id}`);
    console.log(`Title (${p.title.length} chars): ${p.title}`);
    console.log(`Priority: ${p.priority}`);
    console.log(`Created: ${p.created_at}`);
    console.log(`\n--- Description (${p.description?.length || 0} chars) ---`);
    console.log(p.description);
    console.log('\n--- Context ---');
    console.log(JSON.stringify(c, null, 2));
    console.log();
  }
})();
