const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/izzymartinez/Documents/hoa-agent/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  await status.start('mission-goal', 'Audit pending_community_data sunbiz_mismatch_flag rows', 4);

  // Get all pending_community_data rows with source_type=sunbiz_mismatch_flag
  const { data: pending, error: e1 } = await supabase
    .from('pending_community_data')
    .select('*')
    .eq('source_type', 'sunbiz_mismatch_flag')
    .order('created_at', { ascending: false });

  if (e1) {
    console.error('Error querying pending_community_data:', e1);
    await status.error('mission-goal', e1.message);
    process.exit(1);
  }

  console.log(`Found ${pending.length} rows with source_type=sunbiz_mismatch_flag`);
  console.log('\n=== PENDING ROWS ===');
  console.log(JSON.stringify(pending, null, 2));

  // Also get the 4 named communities for cross-check
  const names = [
    'Frenchmans Creek HOA',
    '2701 PGA Boulevard Condominium',
    'Abacoa Plaza POA',
    'A Place In The Woods POA Inc'
  ];

  console.log('\n=== COMMUNITY ROWS (named) ===');
  for (const name of names) {
    const { data: comms } = await supabase
      .from('communities')
      .select('id, canonical_name, slug, city, zip_code, status, management_company, registered_agent, state_entity_number, legal_name, master_hoa_id')
      .ilike('canonical_name', `%${name.replace(' HOA','').replace(' Inc','').substring(0,20)}%`)
      .limit(5);
    console.log(`\n--- "${name}" matches:`);
    console.log(JSON.stringify(comms, null, 2));
  }

  await status.progress('mission-goal', 4, `Audited ${pending.length} flagged rows`);
  process.exit(0);
})();
