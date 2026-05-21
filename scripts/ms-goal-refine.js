// ms-goal (Owen Paris) — Goal Architect refinement pass
// Query agent_review_queue for pending proposals from ms-dir
// Refine title, description, and add success_criteria / effort_estimate

const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGENT_ID = 'ms-goal';

async function main() {
  await status.start(AGENT_ID, 'Refining ms-dir proposals in review queue', 0);

  // Step 1: Pull pending proposals from ms-dir
  const { data: proposals, error } = await supabase
    .from('agent_review_queue')
    .select('*')
    .eq('status', 'pending')
    .eq('agent_id', 'ms-dir')
    .order('created_at', { ascending: false });

  if (error) {
    await status.error(AGENT_ID, `Failed to fetch ms-dir proposals: ${error.message}`);
    console.error(error);
    process.exit(1);
  }

  console.log(`Found ${proposals?.length || 0} pending proposals from ms-dir`);
  await status.log(AGENT_ID, `Pulled ${proposals?.length || 0} pending ms-dir proposals for refinement`);

  if (!proposals || proposals.length === 0) {
    await status.complete(AGENT_ID, 'No pending ms-dir proposals found to refine');
    return;
  }

  // Print all proposals so we can see what we're working with
  console.log('\n=== PROPOSALS TO REFINE ===');
  for (const p of proposals) {
    console.log(`\nID: ${p.id}`);
    console.log(`Priority: ${p.priority}`);
    console.log(`Title: ${p.title}`);
    console.log(`Description: ${p.description}`);
    console.log(`Context: ${JSON.stringify(p.context, null, 2)}`);
    console.log(`Created: ${p.created_at}`);
  }

  // We'll return the proposals so the agent can decide refinement.
  // For now, dump them; refinement logic below.
}

main().catch(async (err) => {
  await status.error(AGENT_ID, err.message);
  console.error(err);
  process.exit(1);
});
