import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const adminHeader = request.headers.get('x-admin-password')
  return (
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    adminHeader === ADMIN_PASSWORD
  )
}

// All fields the research pipeline can fill.
// age_restricted and gated added in 20260501_research_stats migration.
const UPDATABLE_FIELDS = [
  'management_company', 'hoa_website', 'phone', 'email',
  'unit_count', 'monthly_fee_min', 'amenities', 'pet_restriction',
  'rental_approval', 'age_restricted', 'gated',
]

const BATCH_SIZE = 20
const RESEARCH_COOLDOWN_DAYS = 30

// ── helpers ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureResearchLogTable(supabase: any) {
  try {
    await supabase.from('community_research_log').select('id').limit(1)
  } catch {
    // If table is missing, log writes will fail silently below
  }
}

/**
 * Count published communities with >= threshold missing updatable fields.
 * Uses JS-side calculation since Supabase can't filter on computed expressions easily.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function countThin(communities: any[], threshold = 5): number {
  return communities.filter((c) => {
    const missing = UPDATABLE_FIELDS.filter((f) => !c[f]).length
    return missing >= threshold
  }).length
}

// ── DuckDuckGo instant-answer search ────────────────────────────────────────

async function duckduckgoSearch(
  query: string
): Promise<Array<{ title: string; snippet: string; url: string }>> {
  try {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      no_html: '1',
      skip_disambig: '1',
    })
    const resp = await fetch(`https://api.duckduckgo.com/?${params}`, {
      headers: { 'User-Agent': 'HOAAgent/1.0' },
      signal: AbortSignal.timeout(15000),
    })
    const data = await resp.json()
    const results: Array<{ title: string; snippet: string; url: string }> = []
    if (data.AbstractText) {
      results.push({
        title: data.Heading || '',
        snippet: data.AbstractText,
        url: data.AbstractURL || '',
      })
    }
    for (const r of (data.RelatedTopics || []).slice(0, 5)) {
      if (r && r.Text) {
        results.push({ title: r.Text.slice(0, 100), snippet: r.Text, url: r.FirstURL || '' })
      }
    }
    return results
  } catch {
    return []
  }
}

// ── Website contact scraper (Task 8) ────────────────────────────────────────

const PHONE_RE = /(\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4})/g
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g

async function scrapeWebsiteForContact(
  url: string
): Promise<{ phone: string | null; email: string | null }> {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'HOAAgent/1.0' },
      signal: AbortSignal.timeout(10000),
    })
    if (!resp.ok) return { phone: null, email: null }
    const html = await resp.text()

    // Strip tags and decode entities
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')

    const phones = [...text.matchAll(PHONE_RE)].map((m) => m[1])
    const emails = [...text.matchAll(EMAIL_RE)].filter(
      (m) => !m[0].includes('example.') && !m[0].endsWith('.png') && !m[0].endsWith('.jpg')
    )

    return {
      phone: phones[0] ?? null,
      email: emails[0]?.[0] ?? null,
    }
  } catch {
    return { phone: null, email: null }
  }
}

// ── AI extraction via Claude Haiku ──────────────────────────────────────────

async function aiExtractCommunityData(
  communityName: string,
  city: string,
  searchResults: Array<{ title: string; snippet: string; url: string }>,
  anthropicKey: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  if (!anthropicKey || searchResults.length === 0) return {}

  const combined = searchResults
    .slice(0, 10)
    .map((r) => `Source: ${r.url}\nTitle: ${r.title}\nText: ${r.snippet}`)
    .join('\n\n')

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [
          {
            role: 'user',
            content: `Extract HOA details for "${communityName}" in ${city}, Florida from these search results.

${combined}

Return a JSON object with ONLY the fields you found clear evidence for (omit fields you are not confident about):
- management_company: string or null
- hoa_website: string (full URL) or null
- phone: string or null
- email: string or null
- unit_count: integer or null
- monthly_fee_min: number or null
- amenities: comma-separated string or null
- pet_restriction: "Yes", "No", or descriptive string or null
- rental_approval: "Yes", "No", or descriptive string or null
- age_restricted: "55+", "No", or descriptive string or null
- gated: "Yes", "No", or null

Return only valid JSON. Do not include markdown fences.`,
          },
        ],
      }),
    })
    const data = await resp.json()
    let text = data.content?.[0]?.text?.trim() || '{}'
    if (text.startsWith('```')) {
      text = text.split('```')[1]
      if (text.startsWith('json')) text = text.slice(4)
    }
    return JSON.parse(text.trim())
  } catch {
    return {}
  }
}

// ── SQL output helper (dev / dry-run mode) ──────────────────────────────────

function toUpdateSQL(
  communityId: string,
  canonicalName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>
): string {
  const sets = Object.entries(payload)
    .map(([k, v]) => {
      const escaped =
        typeof v === 'string'
          ? `'${v.replace(/'/g, "''")}'`
          : v === null
          ? 'NULL'
          : String(v)
      return `  ${k} = ${escaped}`
    })
    .join(',\n')
  return `-- ${canonicalName}\nUPDATE communities SET\n${sets}\nWHERE id = '${communityId}';\n`
}

// ── Text report builder (Task 9) ─────────────────────────────────────────────

function buildTextReport(stats: {
  runAt: string
  researched: number
  updated: number
  fieldsFilled: number
  sourcesQueried: number
  thinBefore: number
  thinAfter: number
  websitesScrapped: number
  condosUpdated: number
  batchSize: number
}): string {
  const {
    runAt, researched, updated, fieldsFilled, sourcesQueried,
    thinBefore, thinAfter, websitesScrapped, condosUpdated, batchSize,
  } = stats
  const improvement = thinBefore - thinAfter
  return `============================================================
HOA Agent — Nightly Research Stats
Run: ${runAt}
============================================================

BATCH SIZE:           ${batchSize}
Communities researched: ${researched}
Communities updated:    ${updated}
Total fields filled:    ${fieldsFilled}
Sources queried:        ${sourcesQueried}

WEBSITE SCRAPE PASS
  Communities scrapped: ${websitesScrapped}

CONDO UNIT COUNT PASS
  Condos updated:       ${condosUpdated}

THIN COMMUNITY TREND (5+ missing fields)
  Before run:  ${thinBefore}
  After run:   ${thinAfter}
  Improvement: ${improvement > 0 ? `−${improvement}` : improvement === 0 ? 'none' : `+${Math.abs(improvement)}`}

============================================================
`
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dry_run') === 'true'

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

  await ensureResearchLogTable(supabase)

  // Skip recently-researched communities
  const cutoff = new Date(
    Date.now() - RESEARCH_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()
  const { data: recentLogs } = await supabase
    .from('community_research_log')
    .select('community_id')
    .gte('researched_at', cutoff)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recentIds = new Set((recentLogs || []).map((r: any) => r.community_id))

  // Fetch all published communities
  const { data: allCommunities } = await supabase
    .from('communities')
    .select(
      'id, canonical_name, city, county, property_type, management_company, hoa_website, phone, email, unit_count, monthly_fee_min, amenities, pet_restriction, rental_approval, age_restricted, gated, subdivision_aliases'
    )
    .eq('status', 'published')

  const all = allCommunities || []
  const thinCountBefore = countThin(all)

  // ── PASS 1: Main research batch (Task 6) ──────────────────────────────────

  // Sort by thinness, skip recently researched
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidates = all
    .filter((c: any) => !recentIds.has(c.id))
    .map((c: any) => ({
      ...c,
      thinness: UPDATABLE_FIELDS.filter((f) => !c[f]).length,
    }))
    .sort((a: any, b: any) => b.thinness - a.thinness)
    .slice(0, BATCH_SIZE)

  console.log(
    `[research] ${candidates.length} candidates (${recentIds.size} recently skipped, ${thinCountBefore} thin communities)`
  )

  let totalResearched = 0
  let totalUpdated = 0
  let totalFieldsFilled = 0
  let totalSourcesQueried = 0
  const dryRunSQLLines: string[] = dryRun
    ? ['-- thin-community-updates.sql — generated by /api/cron/research?dry_run=true\n']
    : []

  for (const community of candidates) {
    const { id, canonical_name: name, city = 'West Palm Beach' } = community

    // 10-source query set targeting DuckDuckGo, Yelp, hoamanagement.com,
    // DBPR, and Sunbiz via site-specific terms
    const queries = [
      `"${name}" HOA ${city} Florida`,
      `"${name}" homeowners association Palm Beach County management`,
      `"${name}" HOA phone email fees Florida`,
      `site:yelp.com "${name}" ${city} homeowners`,
      `site:hoamanagement.com "${name}" Florida`,
      `"${name}" DBPR Florida HOA registration`,
      `sunbiz "${name}" homeowners association Florida incorporated`,
      `"${name}" ${city} amenities pool gated age-restricted`,
    ]

    const allResults: Array<{ title: string; snippet: string; url: string }> = []
    for (const query of queries) {
      const results = await duckduckgoSearch(query)
      allResults.push(...results)
      totalSourcesQueried++
      if (allResults.length >= 20) break
      await new Promise((r) => setTimeout(r, 800))
    }

    const sourcesChecked = [...new Set(allResults.map((r) => r.url).filter(Boolean))].slice(0, 12)
    const extracted = await aiExtractCommunityData(name, city, allResults, ANTHROPIC_API_KEY)

    // Only fill null/empty fields — never overwrite existing data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatePayload: Record<string, any> = {}
    const fieldsUpdated: string[] = []
    for (const field of UPDATABLE_FIELDS) {
      if (extracted[field] != null && !community[field]) {
        updatePayload[field] = extracted[field]
        fieldsUpdated.push(field)
      }
    }

    if (Object.keys(updatePayload).length > 0) {
      if (dryRun) {
        dryRunSQLLines.push(toUpdateSQL(id, name, updatePayload))
      } else {
        await supabase.from('communities').update(updatePayload).eq('id', id)
      }
      totalUpdated++
      totalFieldsFilled += fieldsUpdated.length
    }

    // Log research run
    if (!dryRun) {
      try {
        await supabase.from('community_research_log').insert({
          community_id: id,
          researched_at: new Date().toISOString(),
          fields_updated: fieldsUpdated,
          sources_checked: sourcesChecked,
          notes:
            `Ran ${queries.length} queries, ${allResults.length} snippets` +
            (fieldsUpdated.length > 0 ? `, updated: ${fieldsUpdated.join(', ')}` : ', no new data'),
        })
      } catch {
        // Non-fatal
      }
    }

    totalResearched++
    console.log(
      `[${totalResearched}/${candidates.length}] ${name}: ${fieldsUpdated.length > 0 ? fieldsUpdated.join(', ') : 'no updates'}`
    )

    await new Promise((r) => setTimeout(r, 1500))
  }

  // ── PASS 2: Website scrape for contact info (Task 8) ─────────────────────
  // Target: published communities that have hoa_website but missing phone OR email

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const websiteScrapeTargets = all.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c: any) => c.hoa_website && (!c.phone || !c.email)
  ).slice(0, 30)

  let websitesScrapped = 0
  let websitesUpdated = 0

  for (const community of websiteScrapeTargets) {
    const { id, canonical_name: name, hoa_website, phone, email } = community
    const { phone: scrapedPhone, email: scrapedEmail } = await scrapeWebsiteForContact(hoa_website)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatePayload: Record<string, any> = {}
    const fieldsUpdated: string[] = []
    if (scrapedPhone && !phone) { updatePayload.phone = scrapedPhone; fieldsUpdated.push('phone') }
    if (scrapedEmail && !email) { updatePayload.email = scrapedEmail; fieldsUpdated.push('email') }

    if (Object.keys(updatePayload).length > 0) {
      if (dryRun) {
        dryRunSQLLines.push(toUpdateSQL(id, name + ' [website-scrape]', updatePayload))
      } else {
        await supabase.from('communities').update(updatePayload).eq('id', id)
        try {
          await supabase.from('community_research_log').insert({
            community_id: id,
            researched_at: new Date().toISOString(),
            fields_updated: fieldsUpdated,
            sources_checked: [hoa_website],
            notes: `Website scrape of ${hoa_website}, updated: ${fieldsUpdated.join(', ')}`,
          })
        } catch { /* non-fatal */ }
      }
      websitesUpdated++
      totalFieldsFilled += fieldsUpdated.length
    }

    websitesScrapped++
    console.log(`[scrape] ${name}: ${fieldsUpdated.join(', ') || 'no contact found'}`)
    await new Promise((r) => setTimeout(r, 500))
  }

  // ── PASS 3: Condo unit count research (Task 7) ────────────────────────────
  // Target: condos missing unit_count, not recently researched

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const condoTargets = all
    .filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) =>
        !recentIds.has(c.id) &&
        !c.unit_count &&
        c.property_type?.toLowerCase().includes('condo')
    )
    .slice(0, 15)

  let condosUpdated = 0

  for (const community of condoTargets) {
    const { id, canonical_name: name, city = 'West Palm Beach' } = community

    const queries = [
      `"${name}" ${city} condo total units how many`,
      `"${name}" condominium association ${city} Florida units`,
    ]

    const allResults: Array<{ title: string; snippet: string; url: string }> = []
    for (const query of queries) {
      allResults.push(...(await duckduckgoSearch(query)))
      totalSourcesQueried++
      await new Promise((r) => setTimeout(r, 800))
    }

    const extracted = await aiExtractCommunityData(name, city, allResults, ANTHROPIC_API_KEY)

    if (extracted.unit_count && !community.unit_count) {
      if (dryRun) {
        dryRunSQLLines.push(toUpdateSQL(id, name + ' [condo-units]', { unit_count: extracted.unit_count }))
      } else {
        await supabase.from('communities').update({ unit_count: extracted.unit_count }).eq('id', id)
        try {
          await supabase.from('community_research_log').insert({
            community_id: id,
            researched_at: new Date().toISOString(),
            fields_updated: ['unit_count'],
            sources_checked: allResults.map((r) => r.url).filter(Boolean).slice(0, 5),
            notes: `Condo unit count research: found ${extracted.unit_count} units`,
          })
        } catch { /* non-fatal */ }
      }
      condosUpdated++
      totalFieldsFilled++
    }

    console.log(`[condo] ${name}: ${extracted.unit_count ? `${extracted.unit_count} units` : 'not found'}`)
    await new Promise((r) => setTimeout(r, 1000))
  }

  // ── PASS 4: Fetch final thin count & save stats (Task 9) ─────────────────

  let thinCountAfter = thinCountBefore // default — will be recalculated if not dry run
  if (!dryRun) {
    // Refetch to get updated values
    const { data: allAfter } = await supabase
      .from('communities')
      .select(UPDATABLE_FIELDS.join(', ') + ', id')
      .eq('status', 'published')
    thinCountAfter = countThin(allAfter || [])

    try {
      await supabase.from('research_stats').insert({
        run_at: new Date().toISOString(),
        communities_researched: totalResearched + websitesScrapped + condoTargets.length,
        communities_updated: totalUpdated + websitesUpdated + condosUpdated,
        fields_filled: totalFieldsFilled,
        sources_queried: totalSourcesQueried,
        thin_count_before: thinCountBefore,
        thin_count_after: thinCountAfter,
        batch_size: BATCH_SIZE,
        mode: 'research',
        notes: `Pass1:${totalResearched} research, Pass2:${websitesScrapped} scrape, Pass3:${condoTargets.length} condo`,
      })
    } catch { /* non-fatal */ }
  }

  const runAt = new Date().toISOString()
  const report = buildTextReport({
    runAt,
    researched: totalResearched,
    updated: totalUpdated,
    fieldsFilled: totalFieldsFilled,
    sourcesQueried: totalSourcesQueried,
    thinBefore: thinCountBefore,
    thinAfter: thinCountAfter,
    websitesScrapped,
    condosUpdated,
    batchSize: BATCH_SIZE,
  })

  console.log(report)

  if (dryRun) {
    // Return the SQL that would have been executed
    return new NextResponse(dryRunSQLLines.join('\n'), {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  return NextResponse.json({
    success: true,
    researched: totalResearched,
    updated: totalUpdated,
    fields_filled: totalFieldsFilled,
    websites_scrapped: websitesScrapped,
    condos_updated: condosUpdated,
    thin_before: thinCountBefore,
    thin_after: thinCountAfter,
    skipped_recent: recentIds.size,
    report,
  })
}
