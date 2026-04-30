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

const FLORIDA_COURT_IDS = new Set([
  'fladistctapp', 'fla', 'flsd', 'flmd', 'flnd',
  'flaapp1', 'flaapp2', 'flaapp3', 'flaapp4', 'flaapp5',
])

const QUERIES = [
  'Florida homeowners association',
  'Florida condo association',
  'Florida HOA fraud',
  'Florida HOA special assessment',
  'Florida HOA foreclosure',
  'Florida condominium structural',
  'homeowners association Palm Beach',
  'HOA assessment Palm Beach',
  'special assessment Palm Beach County',
  'condominium association Palm Beach',
  'community association lien Palm Beach',
  'HOA foreclosure Palm Beach County',
]

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const COURTLISTENER_TOKEN = process.env.COURTLISTENER_TOKEN || ''
  if (!COURTLISTENER_TOKEN) {
    return NextResponse.json({ error: 'COURTLISTENER_TOKEN not configured' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

  let totalSaved = 0
  let totalMatched = 0

  for (const query of QUERIES) {
    try {
      const params = new URLSearchParams({
        q: query,
        type: 'o',
        page_size: '20',
        order_by: 'dateFiled desc',
      })
      const resp = await fetch(
        `https://www.courtlistener.com/api/rest/v4/search/?${params}`,
        { headers: { Authorization: `Token ${COURTLISTENER_TOKEN}` } }
      )
      if (!resp.ok) continue
      const data = await resp.json()

      for (const result of (data.results || [])) {
        const courtId = result.court_id || ''
        if (!FLORIDA_COURT_IDS.has(courtId)) continue

        const clId = String(result.cluster_id || '')
        if (!clId) continue

        const existing = await supabase
          .from('legal_cases')
          .select('id')
          .eq('court_listener_id', clId)
        if (existing.data && existing.data.length > 0) continue

        const caseName = result.caseName || ''
        const snippet = result.opinions?.[0]?.snippet || ''

        let aiSummary: string | null = null
        if (ANTHROPIC_API_KEY && snippet) {
          try {
            const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 256,
                messages: [{
                  role: 'user',
                  content: `Summarize this Florida HOA court case in 1-2 sentences for a homeowner.

Case: ${caseName}
Excerpt: ${snippet.slice(0, 1000)}

Return only the summary.`,
                }],
              }),
            })
            const aiData = await aiResp.json()
            aiSummary = aiData.content?.[0]?.text?.trim() || null
          } catch { }
        }

        const { data: inserted } = await supabase.from('legal_cases').insert({
          court_listener_id: clId,
          case_name: caseName.slice(0, 500),
          court: result.court || '',
          court_id: courtId,
          docket_number: result.docketNumber || '',
          date_filed: result.dateFiled || null,
          absolute_url: 'https://www.courtlistener.com' + (result.absolute_url || ''),
          snippet: snippet.slice(0, 2000),
          tags: [],
          ai_summary: aiSummary,
          status: 'published',
        }).select('id')

        if (!inserted || inserted.length === 0) continue
        const caseId = inserted[0].id
        totalSaved++

        const stopWords = new Set(['homeowners', 'association', 'condominium', 'community',
          'incorporated', 'versus', 'appellant', 'appellee', 'plaintiff', 'defendant', 'inc', 'llc'])
        const words = caseName.split(' ')
          .filter((w: string) => w.length > 4 && !stopWords.has(w.toLowerCase()))
          .slice(0, 3)

        for (const word of words) {
          const { data: communities } = await supabase
            .from('communities')
            .select('id, canonical_name, city')
            .ilike('canonical_name', `%${word}%`)
            .limit(3)

          for (const community of (communities || [])) {
            const existingMatch = await supabase
              .from('community_legal_cases')
              .select('id')
              .eq('legal_case_id', caseId)
              .eq('community_id', community.id)
            if (existingMatch.data && existingMatch.data.length > 0) continue

            await supabase.from('community_legal_cases').insert({
              legal_case_id: caseId,
              community_id: community.id,
              match_confidence: 0.75,
              match_reason: `Keyword match: '${word}'`,
              status: 'pending',
            })
            totalMatched++
          }
        }

        await new Promise(r => setTimeout(r, 300))
      }
    } catch (err: any) {
      console.error(`Query error for "${query}":`, err.message)
    }
    await new Promise(r => setTimeout(r, 2000))
  }

  return NextResponse.json({ success: true, cases_saved: totalSaved, matches: totalMatched })
}
