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

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const NEWSAPI_KEY = process.env.NEWSAPI_KEY || ''
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

  if (!NEWSAPI_KEY) {
    return NextResponse.json({ error: 'NEWSAPI_KEY not configured' }, { status: 500 })
  }

  const queries = [
    '(Florida HOA) OR (Florida "homeowners association") OR (Florida "condo association")',
    'HOA Florida lawsuit',
    'homeowners association Palm Beach County',
    'HOA special assessment Florida 2025',
    'condominium association Florida dispute',
    'HOA board recall Florida',
    'HOA lien foreclosure Florida',
  ]

  const toDate = new Date().toISOString().split('T')[0]
  const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  let totalSaved = 0
  let totalMatched = 0

  for (const query of queries) {
    try {
      const params = new URLSearchParams({
        q: query,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: '100',
        page: '1',
        from: fromDate,
        to: toDate,
        apiKey: NEWSAPI_KEY,
      })
      const resp = await fetch(`https://newsapi.org/v2/everything?${params}`)
      const data = await resp.json()
      if (data.status !== 'ok') continue

      for (const article of (data.articles || [])) {
        const url = article.url
        if (!url || url === 'https://removed.com') continue

        const existing = await supabase.from('news_items').select('id').eq('url', url)
        if (existing.data && existing.data.length > 0) continue

        const title = article.title || ''
        const body = article.content || article.description || ''

        let hoas: any[] = []
        if (ANTHROPIC_API_KEY) {
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
                max_tokens: 512,
                messages: [{
                  role: 'user',
                  content: `Extract Florida HOA names from this article. Return JSON array of {name, city, zip} objects or [].

Title: ${title}
Excerpt: ${body.slice(0, 1000)}

Return only valid JSON.`,
                }],
              }),
            })
            const aiData = await aiResp.json()
            let text = aiData.content?.[0]?.text?.trim() || '[]'
            if (text.startsWith('```')) { text = text.split('```')[1]; if (text.startsWith('json')) text = text.slice(4) }
            hoas = JSON.parse(text.trim())
          } catch { hoas = [] }
        }

        const { data: inserted } = await supabase.from('news_items').insert({
          title: title.slice(0, 500),
          url,
          source: (article.source?.name || 'NewsAPI'),
          published_date: article.publishedAt,
          raw_content: body.slice(0, 10000),
          ai_summary: (article.description || '').slice(0, 1000),
          ai_extracted_hoas: hoas,
          status: 'pending',
        }).select('id')

        if (!inserted || inserted.length === 0) continue
        const newsId = inserted[0].id
        totalSaved++

        let hasHighConfidence = false
        for (const hoa of hoas) {
          const name = hoa.name?.trim()
          if (!name || name.length < 5) continue
          const { data: communities } = await supabase
            .from('communities')
            .select('id, canonical_name, zip_code, city')
            .ilike('canonical_name', `%${name}%`)
            .limit(3)

          for (const community of (communities || [])) {
            let confidence = 0.7
            if (hoa.zip && String(hoa.zip) === String(community.zip_code)) confidence = 0.95
            else if (hoa.city && community.city?.toLowerCase().includes(hoa.city.toLowerCase())) confidence = 0.85
            if (confidence < 0.70) continue

            const existingMatch = await supabase
              .from('community_news')
              .select('id')
              .eq('news_item_id', newsId)
              .eq('community_id', community.id)
            if (existingMatch.data && existingMatch.data.length > 0) continue

            const matchStatus = confidence >= 0.90 ? 'approved' : 'pending'
            await supabase.from('community_news').insert({
              news_item_id: newsId,
              community_id: community.id,
              match_confidence: confidence,
              match_reason: `Name match: '${name}' -> '${community.canonical_name}'`,
              status: matchStatus,
            })
            if (confidence >= 0.90) hasHighConfidence = true
            totalMatched++
          }
        }
        if (hasHighConfidence) {
          await supabase.from('news_items').update({ status: 'approved' }).eq('id', newsId)
        }

        await new Promise(r => setTimeout(r, 200))
      }
    } catch (err: any) {
      console.error(`Query error for "${query}":`, err.message)
    }
    await new Promise(r => setTimeout(r, 1000))
  }

  return NextResponse.json({ success: true, saved: totalSaved, matched: totalMatched })
}
