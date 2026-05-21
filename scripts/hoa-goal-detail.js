const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ids = [
  '10362c2f-18ea-4d73-9224-6eef154f6c7d',
  'edff8bf5-def1-4a91-be0e-3e6159ee62da',
  'b0bc7c67-7e12-4e1b-ba26-0d4d992f5074'
];

(async () => {
  const { data, error } = await supabase
    .from('agent_review_queue')
    .select('*')
    .in('id', ids);
  if (error) { console.error(error); process.exit(1); }
  data.forEach(r => {
    console.log('====================================');
    console.log('id:', r.id);
    console.log('priority:', r.priority);
    console.log('title:', r.title);
    console.log('description:', r.description);
    console.log('context:', JSON.stringify(r.context, null, 2));
    console.log('');
  });
})();
