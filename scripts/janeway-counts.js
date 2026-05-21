const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: process.env.HOME + '/Documents/hoa-agent/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // Lake Worth published count + mgmt gap
  const { count: lwTotal } = await supabase
    .from('communities')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published')
    .eq('city', 'Lake Worth');
  const { count: lwMissing } = await supabase
    .from('communities')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published')
    .eq('city', 'Lake Worth')
    .is('management_company', null);
  console.log(`Lake Worth published: ${lwTotal}, missing mgmt: ${lwMissing}`);

  // 30-day stale count
  const cutoff = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
  const { count: stale } = await supabase
    .from('communities')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published')
    .lt('updated_at', cutoff);
  console.log(`Published rows not updated in 30 days: ${stale}`);

  // Verify confirmed master HOAs have decent data → use them as B'Elanna's pilot board list
  const { data: masters } = await supabase
    .from('communities')
    .select('id, canonical_name, slug, city, registered_agent, management_company, unit_count')
    .eq('status', 'published')
    .not('registered_agent', 'is', null)
    .in('canonical_name', [
      "Abacoa Property Owners' Assembly, Inc.",
      'PGA National',
      'Mirasol Property Owners Association, Inc.',
      'Boca West Master Association, Inc.',
      "The Club At Ibis Property Owners' Association, Inc.",
      'Jonathans Landing Property Owners Association',
      'Jonathan\'s Landing Property Owners Association',
      'Golden Lakes Village Association, Inc.',
      "River Bridge Property Owners' Association, Inc.",
      "Villages Of Palm Beach Lakes Property Owners' Association, Inc.",
      'The Polo Club Of Boca Raton Property Owners Association, Inc.',
      'Breakers West Master Association',
      "Indian Spring Village Homeowners' Association, Inc.",
      'Woodbine Master Association, Inc.',
      'Evergrene Master Association, Inc.',
      'Baywinds Community Association, Inc.',
      'Ballenisles Community Association, Inc.',
    ]);
  console.log(`Master HOAs with registered_agent populated (B'Elanna pilot pool):`);
  (masters || []).forEach(m => console.log(`  ${m.canonical_name} [${m.city}] RA=${m.registered_agent} mgmt=${m.management_company || 'NULL'}`));
  console.log(`Count: ${(masters||[]).length}`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
