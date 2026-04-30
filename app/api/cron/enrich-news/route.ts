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
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

  const { data: articles } = await supabase
    .from('news_items')
    .select('id, title, raw_content, ai_summary, status')
    .in('status', ['approved', 'pending'])
    .order('published_date', { ascending: false })
    .limit(100)

  let totalMatched = 0
  let autoApproved = 0
  let flagged = 0

  for (const article of (articles || [])) {
    const title = article.title || ''
    const body = article.raw_content || article.ai_summary || ''

    const existing = await supabase
      .from('community_news')
      .select('id')
      .eq('news_item_id', article.id)
    if (existing.data && existing.data.length > 0) continue

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
Excerpt: ${body.slice(0, 2000)}

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
          .eq('news_item_id', article.id)
          .eq('community_id', community.id)
        if (existingMatch.data && existingMatch.data.length > 0) continue

        const matchStatus = confidence >= 0.90 ? 'approved' : 'pending'
        await supabase.from('community_news').insert({
          news_item_id: article.id,
          community_id: community.id,
          match_confidence: confidence,
          match_reason: `Enrich: '${name}' -> '${community.canonical_name}'`,
          status: matchStatus,
        })
        totalMatched++
        if (confidence >= 0.90) { hasHighConfidence = true; autoApproved++ }
        else flagged++
      }
    }

    if (hasHighConfidence) {
      await supabase.from('news_items').update({ status: 'approved' }).eq('id', article.id)
    }

    await new Promise(r => setTimeout(r, 300))
  }

  // Update reputation scores for communities with new approved matches
  const { data: approvedMatches } = await supabase
    .from('community_news')
    .select('community_id')
    .eq('status', 'approved')

  const communityIds = [...new Set((approvedMatches || []).map((r: any) => r.community_id))]
  let scoresUpdated = 0

  for (const communityId of communityIds.slice(0, 20)) {
    const { data: communityArticles } = await supabase
      .from('community_news')
      .select('news_items(id, title, ai_summary, published_date)')
      .eq('community_id', communityId)
      .eq('status', 'approved')

    const arts = (communityArticles || []).map((r: any) => r.news_items).filter(Boolean)
    if (!arts.length || !ANTHROPIC_API_KEY) continue

    const combined = arts.slice(0, 10).map((a: any) =>
      `Title: ${a.title}\nSummary: ${a.ai_summary || ''}`
    ).join('\n\n')

    try {
      const scoreResp = await fetch('https://api.anthropic.com/v1/messages', {
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
            content: `Score this HOA's reputation 1-10 based on news articles.
1-3=High Risk, 4-5=Under Scrutiny, 6-7=Mixed, 8-9=Good Standing, 10=Excellent

Articles:
${combined}

Return only JSON: {"score": N, "label": "...", "summary": "..."}`,
          }],
        }),
      })
      const scoreData = await scoreResp.json()
      let text = scoreData.content?.[0]?.text?.trim() || ''
      if (text.startsWith('```')) { text = text.split('```')[1]; if (text.startsWith('json')) text = text.slice(4) }
      const result = JSON.parse(text.trim())
      await supabase.from('communities').update({
        news_reputation_score: result.score,
        news_reputation_label: result.label,
        news_reputation_updated_at: new Date().toISOString(),
      }).eq('id', communityId)
      scoresUpdated++
    } catch { }

    await new Promise(r => setTimeout(r, 500))
  }

  return NextResponse.json({
    success: true,
    articles_processed: articles?.length || 0,
    matched: totalMatched,
    auto_approved: autoApproved,
    flagged,
    scores_updated: scoresUpdated,
  })
}
