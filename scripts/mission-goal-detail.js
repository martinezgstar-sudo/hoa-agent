const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/izzymartinez/Documents/hoa-agent/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const ids = [
    'b4c4725e-2d6b-49f2-92e9-8d06a8116afb', // Frenchmans Creek HOA
    'df04724d-4629-4d37-8d40-d2e7d0325044', // 2701 PGA Boulevard Condominium
    '03701790-feda-4556-a678-4b18003abb9c', // Abacoa Plaza POA (unknown by name)
    'e4fb4cc4-a0fc-4c35-b19a-4ba7e218e557', // A Place In The Woods POA Inc
    'fe0c1310-17ae-4000-ab19-83c42bd213d6', // A Place In The Woods (possible dup)
  ];

  for (const id of ids) {
    const { data, error } = await supabase
      .from('communities')
      .select('id, canonical_name, slug, city, zip_code, status, management_company, registered_agent, state_entity_number, legal_name, incorporation_date, entity_status, master_hoa_id, is_sub_hoa, updated_at')
      .eq('id', id)
      .maybeSingle();
    console.log(`\n=== ${id} ===`);
    console.log(error ? `ERR: ${error.message}` : JSON.stringify(data, null, 2));
  }
})();
