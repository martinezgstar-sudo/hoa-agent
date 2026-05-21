// ms-adv-northern-pbc-mgmt.js
// Intel CSV: top 25 management companies by door-count across 6 northern PBC cities.
// Pure read; no DB writes. CSV → /Users/izzymartinez/Agents/hoa-agent/output/

const path = require('path');
const fs = require('fs');
const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGENT = 'ms-adv';
const CITIES = ['Jupiter', 'Palm Beach Gardens', 'North Palm Beach', 'Tequesta', 'Juno Beach', 'Singer Island'];
const OUT_DIR = '/Users/izzymartinez/Agents/hoa-agent/output';
const TODAY = new Date().toISOString().slice(0, 10);
const OUT_CSV = path.join(OUT_DIR, `northern-pbc-mgmt-top25-${TODAY}.csv`);
const OUT_FULL_CSV = path.join(OUT_DIR, `northern-pbc-mgmt-full-${TODAY}.csv`);

function normalize(name) {
  if (!name) return null;
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/,?\s*(inc|llc|l\.l\.c\.|incorporated|corp|corporation|co\.|company|ltd)\.?$/i, '')
    .replace(/[.,]+$/, '')
    .trim();
}

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function fetchAll() {
  // Pull all matching published rows in pages of 1000.
  const PAGE = 1000;
  let from = 0;
  const rows = [];
  while (true) {
    const { data, error } = await supabase
      .from('communities')
      .select('id, canonical_name, city, zip_code, unit_count, management_company, registered_agent, registered_agent_address, website_url')
      .eq('status', 'published')
      .in('city', CITIES)
      .not('management_company', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

(async () => {
  try {
    await status.start(AGENT, 'Northern PBC management-company intel (6 cities)', 0);

    const rows = await fetchAll();
    await status.progress(AGENT, rows.length, `Fetched ${rows.length} published communities w/ management_company across 6 cities`);

    // Aggregate by normalized management_company.
    const agg = new Map();
    for (const r of rows) {
      const key = normalize(r.management_company);
      if (!key) continue;
      const keyLower = key.toLowerCase();
      if (!agg.has(keyLower)) {
        agg.set(keyLower, {
          display_name: key,
          variants: new Set([r.management_company.trim()]),
          community_count: 0,
          total_doors: 0,
          doors_known_count: 0,
          doors_unknown_count: 0,
          cities: new Map(),
          communities: [],
          registered_agents: new Map(),
          registered_agent_addresses: new Map(),
          websites: new Map(),
        });
      }
      const a = agg.get(keyLower);
      a.variants.add(r.management_company.trim());
      a.community_count += 1;
      const doors = Number.isFinite(r.unit_count) ? r.unit_count : null;
      if (doors !== null && doors > 0) {
        a.total_doors += doors;
        a.doors_known_count += 1;
      } else {
        a.doors_unknown_count += 1;
      }
      a.cities.set(r.city, (a.cities.get(r.city) || 0) + 1);
      a.communities.push({ name: r.canonical_name, city: r.city, zip: r.zip_code, units: doors });
      if (r.registered_agent) a.registered_agents.set(r.registered_agent.trim(), (a.registered_agents.get(r.registered_agent.trim()) || 0) + 1);
      if (r.registered_agent_address) a.registered_agent_addresses.set(r.registered_agent_address.trim(), (a.registered_agent_addresses.get(r.registered_agent_address.trim()) || 0) + 1);
      if (r.website_url) a.websites.set(r.website_url.trim(), (a.websites.get(r.website_url.trim()) || 0) + 1);
    }

    // Helper: pick the most-frequent value from a Map, else null.
    const pickTop = (m) => {
      if (!m.size) return null;
      return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
    };

    const allRanked = [...agg.values()]
      .map(a => ({
        ...a,
        cities_list: [...a.cities.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}(${n})`).join('; '),
        top_registered_agent: pickTop(a.registered_agents),
        top_registered_agent_address: pickTop(a.registered_agent_addresses),
        top_website: pickTop(a.websites),
      }))
      .sort((a, b) => {
        if (b.total_doors !== a.total_doors) return b.total_doors - a.total_doors;
        return b.community_count - a.community_count;
      });

    const top25 = allRanked.slice(0, 25);

    // Top-25 CSV (ranked, intel format).
    // Note: communities table holds no phone/email columns. Closest contact
    // pointers stored on the row are registered_agent (name) and
    // registered_agent_address. Phone/email would require Sunbiz cordata or
    // outreach_contacts lookup — flagged in summary.
    const top25Header = [
      'rank', 'management_company', 'total_doors', 'community_count',
      'doors_known_count', 'doors_unknown_count',
      'cities_breakdown',
      'sample_registered_agent', 'sample_registered_agent_address',
      'sample_website', 'name_variants',
    ];
    const top25Lines = [top25Header.join(',')];
    top25.forEach((a, i) => {
      top25Lines.push([
        i + 1,
        a.display_name,
        a.total_doors,
        a.community_count,
        a.doors_known_count,
        a.doors_unknown_count,
        a.cities_list,
        a.top_registered_agent || '',
        a.top_registered_agent_address || '',
        a.top_website || '',
        [...a.variants].join(' | '),
      ].map(csvEscape).join(','));
    });
    fs.writeFileSync(OUT_CSV, top25Lines.join('\n') + '\n');

    // Full ranked CSV (everyone), for completeness.
    const fullHeader = [
      'rank', 'management_company', 'total_doors', 'community_count',
      'doors_known_count', 'doors_unknown_count', 'cities_breakdown',
      'sample_registered_agent', 'sample_registered_agent_address', 'sample_website',
    ];
    const fullLines = [fullHeader.join(',')];
    allRanked.forEach((a, i) => {
      fullLines.push([
        i + 1,
        a.display_name,
        a.total_doors,
        a.community_count,
        a.doors_known_count,
        a.doors_unknown_count,
        a.cities_list,
        a.top_registered_agent || '',
        a.top_registered_agent_address || '',
        a.top_website || '',
      ].map(csvEscape).join(','));
    });
    fs.writeFileSync(OUT_FULL_CSV, fullLines.join('\n') + '\n');

    // Summary stats.
    const totalCompanies = allRanked.length;
    const top25Doors = top25.reduce((s, a) => s + a.total_doors, 0);
    const top25Communities = top25.reduce((s, a) => s + a.community_count, 0);
    const allDoors = allRanked.reduce((s, a) => s + a.total_doors, 0);

    const summary = `Top 25 of ${totalCompanies} mgmt companies in northern PBC: ${top25Doors.toLocaleString()} doors / ${top25Communities} communities (of ${allDoors.toLocaleString()} total doors across ${rows.length} communities).`;
    console.log('\n=== ms-adv northern PBC mgmt-company intel ===');
    console.log(summary);
    console.log(`Top-25 CSV: ${OUT_CSV}`);
    console.log(`Full CSV:   ${OUT_FULL_CSV}`);
    console.log('\nTop 10 preview:');
    top25.slice(0, 10).forEach((a, i) => {
      console.log(`  ${String(i + 1).padStart(2)}. ${a.display_name.padEnd(50)} ${String(a.total_doors).padStart(6)} doors  ${a.community_count} comms  ${a.cities_list}`);
    });

    await status.complete(AGENT, summary, {
      total_companies: totalCompanies,
      top25_doors: top25Doors,
      top25_communities: top25Communities,
      total_doors: allDoors,
      total_rows: rows.length,
      top25_csv: OUT_CSV,
      full_csv: OUT_FULL_CSV,
    });
  } catch (err) {
    console.error('FATAL:', err);
    await status.error(AGENT, err.message || String(err), { stack: err.stack });
    process.exit(1);
  }
})();
