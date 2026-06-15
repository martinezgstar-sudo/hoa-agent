const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // Sample a recent ms-dir row to see all columns used
  const { data } = await supabase
    .from('agent_review_queue')
    .select('*')
    .eq('agent_id', 'ms-dir')
    .order('created_at', { ascending: false })
    .limit(1);
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
})();
