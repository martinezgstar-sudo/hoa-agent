const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: process.env.HOME + '/Documents/hoa-agent/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const patterns = ['Abacoa', 'PGA National', 'Mirasol', 'Boca West', 'Ibis', 'Jonathans Landing', 'Golden Lakes Village', 'River Bridge', 'Villages Of Palm Beach Lakes', 'Polo Club Of Boca Raton', 'Breakers West', 'Indian Spring Village', 'Woodbine Master', 'Evergrene Master', 'Baywinds Community', 'Ballenisles'];
  for (const p of patterns) {
    const { data: rows } = await supabase
      .from('communities')
      .select('id, canonical_name, city, registered_agent, management_company, email, phone, website_url')
      .eq('status', 'published')
      .ilike('canonical_name', `%${p}%`)
      .limit(3);
    if (rows && rows.length) {
      rows.forEach(r => console.log(`[${p}] ${r.canonical_name} | RA=${r.registered_agent||'-'} | mgmt=${r.management_company||'-'} | email=${r.email||'-'} | phone=${r.phone||'-'} | site=${r.website_url||'-'}`));
    } else {
      console.log(`[${p}] NO MATCH`);
    }
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
