const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const IDS = [
  '0d6f6b8d-fa4b-4980-b0b5-74511195a6e7',
  '49c0d7f4-1acd-4dd5-af73-eb24727156a3',
  '68b7b1da-309e-4f35-b50b-50a532d4b258',
];
(async () => {
  const { data, error } = await supabase
    .from('agent_review_queue')
    .select('*')
    .in('id', IDS);
  if (error) { console.error(error); process.exit(1); }
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const out = `/Users/izzymartinez/Agents/hoa-agent/logs/snapshots/hoa-goal-refine-pre-${ts}.json`;
  fs.writeFileSync(out, JSON.stringify(data, null, 2));
  console.log('Snapshot saved to', out, 'with', data.length, 'rows');
})();
