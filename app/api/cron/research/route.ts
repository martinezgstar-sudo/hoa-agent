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

const UPDATABLE_FIELDS = [
  'management_company', 'hoa_website', 'phone', 'email',
  'unit_count', 'monthly_fee_min', 'amenities', 'pet_restriction', 'rental_approval',
]

const BATCH_SIZE = 20
const RESEARCH_COOLDOWN_DAYS = 30

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureResearchLogTable(supabase: any) {
  try {
    await supabase.from('community_research_log').select('id').limit(1)
  } catch {
    // Table doesn't exist — create via raw SQL through Supabase RPC if available
    // If this fails, logs will be skipped silently
  }
}

async function duckduckgoSearch(query: string): Promise<Array<{ title: string; snippet: string; url: string }>> {
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
      results.push({ title: data.Heading || '', snippet: data.AbstractText, url: data.AbstractURL || '' })
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

async function aiExtractCommunityData(
  communityName: string,
  city: string,
  searchResults: Array<{ title: string; snippet: string; url: string }>,
  anthropicKey: string
): Promise<Record<string, any>> {
  if (!anthropicKey || searchResults.length === 0) return {}

  const combined = searchResults.slice(0, 8).map(r =>
    `Source: ${r.url}\nTitle: ${r.title}\nText: ${r.snippet}`
  ).join('\n\n')

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
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `Extract HOA details for ${communityName} in ${city}, Florida from these search results.

${combined}

Return a JSON object with only the fields you found evidence for:
- management_company: string or null
- hoa_website: string (URL) or null
- phone: string or null
- email: string or null
- unit_count: integer or null
- monthly_fee_min: number or null
- amenities: comma-separated string or null
- pet_restriction: string or null
- rental_approval: string or null

Only include fields you are confident about. Return only valid JSON.`,
        }],
      }),
    })
    const data = await resp.json()
    let text = data.content?.[0]?.text?.trim() || '{}'
    if (text.startsWith('```')) { text = text.split('```')[1]; if (text.startsWith('json')) text = text.slice(4) }
    return JSON.parse(text.trim())
  } catch {
    return {}
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

  await ensureResearchLogTable(supabase)

  // Get recently-researched community IDs to skip
  const cutoff = new Date(Date.now() - RESEARCH_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentLogs } = await supabase
    .from('community_research_log')
    .select('community_id')
    .gte('researched_at', cutoff)
  const recentIds = new Set((recentLogs || []).map((r: any) => r.community_id))

  // Fetch all published communities
  const { data: allCommunities } = await supabase
    .from('communities')
    .select('id, canonical_name, city, county, management_company, hoa_website, phone, email, unit_count, monthly_fee_min, amenities, subdivision_aliases')
    .eq('status', 'published')

  // Sort by thinness (most missing fields first), skip recently researched
  const candidates = (allCommunities || [])
    .filter((c: any) => !recentIds.has(c.id))
    .map((c: any) => ({
      ...c,
      thinness: UPDATABLE_FIELDS.filter(f => !c[f]).length,
    }))
    .sort((a: any, b: any) => b.thinness - a.thinness)
    .slice(0, BATCH_SIZE)

  console.log(`Researching ${candidates.length} communities (excluded ${recentIds.size} recent)`)

  let totalResearched = 0
  let totalUpdated = 0

  for (const community of candidates) {
    const { id, canonical_name: name, city = 'West Palm Beach' } = community

    const queries = [
      `${name} HOA ${city}`,
      `${name} homeowners association Palm Beach County`,
      `${name} management company Florida`,
      `${name} HOA fees Florida`,
    ]

    const allResults: Array<{ title: string; snippet: string; url: string }> = []
    for (const query of queries) {
      const results = await duckduckgoSearch(query)
      allResults.push(...results)
      if (allResults.length >= 15) break
      await new Promise(r => setTimeout(r, 1000))
    }

    const sourcesChecked = [...new Set(allResults.map(r => r.url).filter(Boolean))].slice(0, 10)
    const extracted = await aiExtractCommunityData(name, city, allResults, ANTHROPIC_API_KEY)

    // Only update null/empty fields
    const updatePayload: Record<string, any> = {}
    const fieldsUpdated: string[] = []
    for (const field of UPDATABLE_FIELDS) {
      if (extracted[field] != null && !community[field]) {
        updatePayload[field] = extracted[field]
        fieldsUpdated.push(field)
      }
    }

    if (Object.keys(updatePayload).length > 0) {
      await supabase.from('communities').update(updatePayload).eq('id', id)
      totalUpdated++
    }

    // Log the research run
    try {
      await supabase.from('community_research_log').insert({
        community_id: id,
        researched_at: new Date().toISOString(),
        fields_updated: fieldsUpdated,
        sources_checked: sourcesChecked,
        notes: `Ran ${queries.length} queries, found ${allResults.length} snippets` +
          (fieldsUpdated.length > 0 ? `, updated: ${fieldsUpdated.join(', ')}` : ', no new data'),
      })
    } catch {
      // Log failure is non-fatal
    }

    totalResearched++
    console.log(`[${totalResearched}/${candidates.length}] ${name}: ${fieldsUpdated.length > 0 ? fieldsUpdated.join(', ') : 'no updates'}`)

    await new Promise(r => setTimeout(r, 2000))
  }

  return NextResponse.json({
    success: true,
    researched: totalResearched,
    updated: totalUpdated,
    skipped_recent: recentIds.size,
  })
}
