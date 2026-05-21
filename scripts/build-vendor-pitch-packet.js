#!/usr/bin/env node
// Build ready-to-send signup pitch packet for 10 PBC HOA-friendly vendors.
// Source: scripts/output/vendor-targets-2026-05-20.csv (Tom Paris's research target list).
// Output:  scripts/output/tom-vendor-pitch-packet.csv

const fs = require('fs');
const path = require('path');
const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');

const AGENT_ID = 'hoa-vendors';
const SRC = path.join(__dirname, 'output', 'vendor-targets-2026-05-20.csv');
const OUT = path.join(__dirname, 'output', 'tom-vendor-pitch-packet.csv');
const SIGNUP_BASE = 'https://www.hoa-agent.com/advertise/signup';

// Plan tiers, per CLAUDE.md > Ad System > Pricing tiers
const PLANS = {
  starter: { name: 'Starter', price: '$19.99/month', desc: '1 city, 1 ad' },
  growth:  { name: 'Growth',  price: '$69.99/month', desc: '5 cities, 3 rotating ads' },
  county:  { name: 'County',  price: '$99.99/month', desc: 'all PBC cities, 5 ads, priority placement' }
};

// Plan assignments by company name (geography → tier).
// Reasoning encoded inline so admin can audit before approval.
const PLAN_ASSIGNMENT = {
  'Palm Beach County Landscape (PBC Landscape)': {
    tier: 'county',
    reason: 'Self-described "PBC-only" with countywide HOA client base (30 to 2,000+ units across the county).'
  },
  "O'Hara Landscape & Maintenance": {
    tier: 'county',
    reason: '1,000+ residential & HOA clients across the county; spans WPB / Wellington / Boca / Lake Worth.'
  },
  'RCH Landscaping': {
    tier: 'growth',
    reason: 'Boca-anchored with stated coverage of Boca / Delray / Wellington / Boynton / WPB (~5 cities).'
  },
  'Hometown Pest Control': {
    tier: 'growth',
    reason: 'Delray HQ; named clients in PBG/Mirasol corridor — multi-city north-and-central PBC (~5 cities).'
  },
  'Native Pest Management': {
    tier: 'growth',
    reason: 'Dedicated PBC HOA landing pages for Atlantis, Boca, Jupiter, WPB (4–5 named cities).'
  },
  'Hoffer Pest Solutions': {
    tier: 'growth',
    reason: 'Dedicated PBC service line covering Wellington / Boca / Boynton plus surrounding (~5 cities).'
  },
  'Boca Pool Guys': {
    tier: 'growth',
    reason: 'Royal Palm Beach base with Boca / West Boca / Lake Worth / WPB commercial pool coverage (~4–5 cities).'
  },
  'Smith Pools': {
    tier: 'starter',
    reason: 'Jupiter-anchored with primary HOA/condo client base in Jupiter — single-city profile fits Starter.'
  },
  'TechPro Security': {
    tier: 'county',
    reason: '70+ named PBC HOA clients spanning Boca, Delray, Jupiter, PBG — countywide footprint.'
  },
  'AT&I Systems': {
    tier: 'county',
    reason: '800+ South Florida communities; partners with FirstService / Castle / GRS for countywide PBC access control.'
  }
};

// One-line value props tied to each vendor's service line.
const VALUE_PROPS = {
  'Palm Beach County Landscape (PBC Landscape)':
    'Put your 30-year PBC landscape track record in front of HOA boards searching for grounds maintenance on hoa-agent.com.',
  "O'Hara Landscape & Maintenance":
    'Reach the next 100 HOA boards looking for a 50-year-track-record landscape partner — surfaced on every PBC community page.',
  'RCH Landscaping':
    'Showcase your HOA-association vertical to boards in Boca, Delray, Wellington, Boynton and WPB the moment they research their community.',
  'Hometown Pest Control':
    'Be the first pest-control name HOA boards see when they review their community profile across the PBG / Delray corridor.',
  'Native Pest Management':
    'Pair your IPM / native-Florida pest approach with hoa-agent.com viewers actively comparing PBC HOAs in Atlantis, Boca, Jupiter and WPB.',
  'Hoffer Pest Solutions':
    'Carry your 50-year South Florida pest brand to HOA boards across Wellington, Boca and Boynton at the moment they research their community.',
  'Boca Pool Guys':
    'Sit alongside the Boca / West Boca / Lake Worth / WPB community pages where HOA boards research commercial pool service.',
  'Smith Pools':
    'Own Jupiter HOA and condo board mindshare — Sponsored placement on Admirals Cove, Abacoa and Frenchman’s Creek pages.',
  'TechPro Security':
    'Convert your 70+ named PBC HOA client list into inbound demand — Sponsored placement on every community page in the county.',
  'AT&I Systems':
    'Get in front of 8,000+ PBC HOA community pages your management-company partners (FirstService, Castle, GRS) already work with.'
};

function buildUtmUrl(company) {
  // UTM tracking per vendor: utm_source=outreach&utm_medium=email
  //                          &utm_campaign=tom-vendor-pitch-2026-05-20
  //                          &utm_content=<slug>
  const slug = company
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const params = new URLSearchParams({
    utm_source: 'outreach',
    utm_medium: 'email',
    utm_campaign: 'tom-vendor-pitch-2026-05-20',
    utm_content: slug
  });
  return `${SIGNUP_BASE}?${params.toString()}`;
}

function buildEmailDraft(row, planKey, valueProp, signupUrl) {
  const plan = PLANS[planKey];
  // Use one community evidence example to ground the email in their actual footprint.
  const example = row.community_1 || row.community_2 || row.community_3 || 'a PBC HOA';

  // 90-word target. Drafted to feel hand-written, never claims they're a current client.
  // Closes with the tracked signup link, not a phone request.
  const draft =
`Hi ${row.company_name} team,

I run hoa-agent.com — PBC's HOA directory, 8,000+ communities. When boards research ${example.replace(/"/g, '')}, your service line is the kind they look for.

${valueProp}

Our ${plan.name} plan fits your footprint: ${plan.price}, ${plan.desc}. No contract — you write the ad, we place it.

Sign up to test it: ${signupUrl}

— Izzy Martinez, HOA Agent`;

  // Sanity-check word count for the body (target 90 ± 15).
  return draft;
}

function parseCsvLine(line) {
  // RFC-4180-ish: handle quoted fields with embedded commas.
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else { cur += c; }
    } else {
      if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"') { inQ = true; }
      else { cur += c; }
    }
  }
  out.push(cur);
  return out;
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main() {
  const totalRows = 10;
  await status.start(AGENT_ID, 'Build vendor pitch packet (10 PBC vendors)', totalRows);

  if (!fs.existsSync(SRC)) {
    throw new Error(`Source not found: ${SRC}`);
  }

  const raw = fs.readFileSync(SRC, 'utf8').trim();
  const lines = raw.split('\n').filter(l => l.length > 0);
  const header = parseCsvLine(lines[0]);
  const idx = name => header.indexOf(name);

  const rows = lines.slice(1).map(l => {
    const cols = parseCsvLine(l);
    return {
      category: cols[idx('category')],
      company_name: cols[idx('company_name')],
      website: cols[idx('website')],
      phone: cols[idx('phone')],
      primary_city: cols[idx('primary_city')],
      why_fits_our_audience: cols[idx('why_fits_our_audience')],
      community_1: cols[idx('community_1')],
      community_1_evidence: cols[idx('community_1_evidence')],
      community_2: cols[idx('community_2')],
      community_2_evidence: cols[idx('community_2_evidence')],
      community_3: cols[idx('community_3')],
      community_3_evidence: cols[idx('community_3_evidence')]
    };
  });

  if (rows.length !== totalRows) {
    await status.warn(AGENT_ID, `Expected ${totalRows} vendors, got ${rows.length}`, { count: rows.length });
  }

  // Build packet rows.
  const outHeader = [
    'category','company_name','website','phone','primary_city',
    'value_prop_one_line',
    'plan_tier','plan_price','plan_description','plan_assignment_reason',
    'signup_url_with_utm',
    'utm_source','utm_medium','utm_campaign','utm_content',
    'email_subject','email_body_90w','email_word_count',
    'evidence_community_1','evidence_community_1_source',
    'admiral_approval_status'
  ];

  const outRows = [];
  let processed = 0;
  for (const r of rows) {
    const planMeta = PLAN_ASSIGNMENT[r.company_name];
    if (!planMeta) {
      await status.flagReview(AGENT_ID, 'medium',
        `No plan assignment for ${r.company_name}`,
        `Vendor present in target list but not in PLAN_ASSIGNMENT map — defaulting to Starter for safety.`,
        { company: r.company_name });
    }
    const planKey = planMeta?.tier || 'starter';
    const planReason = planMeta?.reason || 'Default Starter — admin to confirm geography.';
    const plan = PLANS[planKey];

    const valueProp = VALUE_PROPS[r.company_name] || `${r.why_fits_our_audience} — Sponsored placement on hoa-agent.com.`;
    const signupUrl = buildUtmUrl(r.company_name);
    const utm = new URL(signupUrl);

    const body = buildEmailDraft(r, planKey, valueProp, signupUrl);
    const wordCount = body.split(/\s+/).filter(Boolean).length;
    const subject = `${r.company_name} on hoa-agent.com — ${plan.name} plan fits your PBC footprint`;

    outRows.push([
      r.category, r.company_name, r.website, r.phone, r.primary_city,
      valueProp,
      plan.name, plan.price, plan.desc, planReason,
      signupUrl,
      utm.searchParams.get('utm_source'),
      utm.searchParams.get('utm_medium'),
      utm.searchParams.get('utm_campaign'),
      utm.searchParams.get('utm_content'),
      subject, body, wordCount,
      r.community_1, r.community_1_evidence,
      'PENDING_ADMIRAL_APPROVAL'
    ]);

    processed++;
    if (processed % 5 === 0 || processed === rows.length) {
      await status.progress(AGENT_ID, processed, `Built pitch ${processed}/${rows.length}: ${r.company_name}`);
    }
  }

  // Write CSV.
  const csv = [outHeader.map(csvEscape).join(','),
               ...outRows.map(r => r.map(csvEscape).join(','))].join('\n') + '\n';
  fs.writeFileSync(OUT, csv);

  // Final summary: word-count distribution.
  const wcs = outRows.map(r => r[outHeader.indexOf('email_word_count')]);
  const minWc = Math.min(...wcs);
  const maxWc = Math.max(...wcs);
  const avgWc = Math.round(wcs.reduce((a,b)=>a+b,0) / wcs.length);

  await status.complete(AGENT_ID,
    `Built ${outRows.length}-vendor pitch packet (word counts ${minWc}–${maxWc}, avg ${avgWc}); awaiting Admiral approval before outreach.`,
    { output: OUT, count: outRows.length, word_count_range: [minWc, maxWc, avgWc] }
  );

  console.log(`Wrote ${outRows.length} pitch rows to ${OUT}`);
  console.log(`Email word counts: min=${minWc}, max=${maxWc}, avg=${avgWc}`);
}

main().catch(async err => {
  console.error('FAILED:', err);
  try { await status.error(AGENT_ID, err.message, { stack: err.stack }); } catch (_) {}
  process.exit(1);
});
