const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ids = [
  '2b44e189-019e-416b-ad96-dd010d218563',
  'd5b01a1d-912a-48fa-a80f-15be41044f01',
  'bec5792b-d7f3-42be-98d1-9899c60aac19',
];

(async () => {
  const { data, error } = await supabase
    .from('agent_review_queue')
    .select('id, priority, title, description, status, context, created_at')
    .in('id', ids);
  if (error) {
    console.error('ERROR:', error);
    process.exit(1);
  }
  for (const r of data) {
    console.log('================');
    console.log('ID:', r.id);
    console.log('PRIORITY:', r.priority);
    console.log('TITLE:', r.title);
    console.log('CREATED:', r.created_at);
    console.log('DESCRIPTION:');
    console.log(r.description);
    console.log('CONTEXT:');
    console.log(JSON.stringify(r.context, null, 2));
    console.log('');
  }
})();
