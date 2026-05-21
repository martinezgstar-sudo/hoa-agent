const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: process.env.HOME + '/Documents/hoa-agent/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // sanity: count any community with the word 'Abacoa'
  const { data, error, count } = await supabase
    .from('communities')
    .select('canonical_name, slug, city, registered_agent, management_company, phone, website_url', { count: 'exact' })
    .ilike('canonical_name', '%abacoa%');
  console.log('count:', count, 'err:', error?.message);
  (data || []).slice(0, 5).forEach(r => console.log(r.canonical_name, '|', r.city, '|', r.phone));

  // Try fetching all master HOAs by checking unique master_hoa_id values
  const { data: masterIds } = await supabase
    .from('communities')
    .select('master_hoa_id')
    .not('master_hoa_id', 'is', null)
    .eq('status', 'published');
  const ids = Array.from(new Set((masterIds || []).map(r => r.master_hoa_id)));
  console.log(`\nDistinct master_hoa_id values: ${ids.length}`);

  // Get master rows with sub_count
  const subCounts = {};
  (masterIds || []).forEach(r => { subCounts[r.master_hoa_id] = (subCounts[r.master_hoa_id] || 0) + 1; });
  const { data: masters } = await supabase
    .from('communities')
    .select('id, canonical_name, slug, city, registered_agent, management_company, phone, website_url, status')
    .in('id', ids);
  const ranked = (masters || []).map(m => ({ ...m, subs: subCounts[m.id] || 0 })).sort((a, b) => b.subs - a.subs);
  console.log('\nTop 12 masters by sub-count:');
  ranked.slice(0, 12).forEach(m => {
    console.log(`  ${m.subs.toString().padStart(3)} subs | ${m.canonical_name} | ${m.city} | RA=${m.registered_agent || '-'} | mgmt=${m.management_company || '-'} | phone=${m.phone || '-'} | site=${m.website_url || '-'}`);
  });
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
