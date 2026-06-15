// Tuvix (hoa-goal) — Goal Architect refine duties
// Refine pending proposals written by hoa-dir (captain) with sharper titles,
// measurable success criteria, and effort estimates.

const path = require('path');
const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGENT_ID = 'hoa-goal';

(async () => {
  await status.start(AGENT_ID, 'Refining hoa-dir proposals in agent_review_queue', 0);

  const { data: proposals, error } = await supabase
    .from('agent_review_queue')
    .select('*')
    .eq('status', 'pending')
    .eq('agent_id', 'hoa-dir')
    .order('created_at', { ascending: false });

  if (error) {
    await status.error(AGENT_ID, `Query failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }

  console.log(`Found ${proposals?.length || 0} pending hoa-dir proposals`);
  if (!proposals || proposals.length === 0) {
    await status.complete(AGENT_ID, 'No pending hoa-dir proposals to refine');
    return;
  }

  // Show what we have
  for (const p of proposals) {
    console.log(`---\nID: ${p.id}\nTitle: ${p.title}\nPriority: ${p.priority}\nDesc: ${p.description?.slice(0, 200)}\nContext: ${JSON.stringify(p.context).slice(0, 400)}`);
  }
})();
