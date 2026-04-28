import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

  try {
    const { data: newCases } = await supabase
      .from('legal_cases')
      .select('id, case_name, snippet')
      .eq('status', 'published')
      .is('ai_summary', null)
      .limit(20)

    let matched = 0
    let approved = 0
    let rejected = 0

    for (const legalCase of (newCases || [])) {
      const caseName = legalCase.case_name || ''
      const words = caseName.split(' ').filter((w: string) =>
        w.length > 4 &&
        !['homeowners', 'association', 'condominium', 'community', 'incorporated', 'versus', 'appellant', 'appellee', 'plaintiff', 'defendant'].includes(w.toLowerCase())
      ).slice(0, 3)

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
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
            content: `Summarize this Florida HOA court case in 1-2 plain English sentences for a homeowner.

Case: ${caseName}
Excerpt: ${(legalCase.snippet || '').slice(0, 500)}

Return only the summary, no labels.`,
          }],
        }),
      })
      const aiData = await aiRes.json()
      const summary = aiData.content?.[0]?.text?.trim() || null
      await supabase.from('legal_cases').update({ ai_summary: summary }).eq('id', legalCase.id)

      for (const word of words) {
        const { data: communities } = await supabase
          .from('communities')
          .select('id, canonical_name, city')
          .ilike('canonical_name', `%${word}%`)
          .limit(3)

        for (const community of (communities || [])) {
          const verifyRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 128,
              messages: [{
                role: 'user',
                content: `Does this court case specifically involve this Florida HOA?

Case: ${caseName}
Community: ${community.canonical_name}
City: ${community.city}

Reply with only JSON: {"match": true/false, "confidence": 0.0-1.0}`,
              }],
            }),
          })
          const verifyData = await verifyRes.json()
          let isMatch = false
          let confidence = 0.0
          try {
            let text = verifyData.content[0].text.trim()
            if (text.startsWith('```')) { text = text.split('```')[1]; if (text.startsWith('json')) text = text.slice(4) }
            const result = JSON.parse(text.trim())
            isMatch = result.match
            confidence = result.confidence
          } catch { }

          const existing = await supabase
            .from('community_legal_cases')
            .select('id')
            .eq('legal_case_id', legalCase.id)
            .eq('community_id', community.id)
          if (existing.data && existing.data.length > 0) continue

          const status = isMatch && confidence >= 0.75 ? 'approved' : 'rejected'
          await supabase.from('community_legal_cases').insert({
            legal_case_id: legalCase.id,
            community_id: community.id,
            match_confidence: confidence,
            match_reason: `Auto cron: ${word} keyword match`,
            status,
          })

          matched++
          if (status === 'approved') approved++
          else rejected++
        }
      }

      await new Promise(r => setTimeout(r, 500))
    }

    const { data: communitiesWithCases } = await supabase
      .from('community_legal_cases')
      .select('community_id')
      .eq('status', 'approved')

    const counts: Record<string, number> = {}
    for (const row of (communitiesWithCases || [])) {
      counts[row.community_id] = (counts[row.community_id] || 0) + 1
    }

    for (const [communityId, count] of Object.entries(counts)) {
      await supabase.from('communities').update({ litigation_count: count }).eq('id', communityId)
    }

    return NextResponse.json({ success: true, cases_processed: newCases?.length || 0, matched, approved, rejected })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
