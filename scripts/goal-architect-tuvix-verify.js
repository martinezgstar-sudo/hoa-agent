const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const ids = ['2555bc06-72e6-4b58-99be-9f2122d0df28','75cbc0f8-2e69-45d6-be48-f4c035e54717','b958950c-2249-4ae4-b10a-5b79a82d6323'];
  const { data, error } = await supabase
    .from('agent_review_queue')
    .select('id, priority, title, context')
    .in('id', ids);
  if (error) { console.error(error); process.exit(1); }
  for (const r of data) {
    console.log('---');
    console.log('ID:', r.id, '| priority:', r.priority);
    console.log('Title:', r.title);
    console.log('Has success_criteria?', Array.isArray(r.context?.success_criteria), '| count:', r.context?.success_criteria?.length || 0);
    console.log('Has effort_estimate?', !!r.context?.effort_estimate, '| minutes:', r.context?.effort_estimate?.minutes);
  }
})();
