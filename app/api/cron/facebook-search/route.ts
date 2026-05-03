import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes (Vercel Pro)

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const adminHeader = request.headers.get('x-admin-password')
  return (
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    adminHeader === ADMIN_PASSWORD
  )
}

const QUERIES_GENERAL = [
  'site:facebook.com "HOA" "Palm Beach County" assessment',
  'site:facebook.com "homeowners association" "Palm Beach" complaint',
  'site:facebook.com "HOA" "West Palm Beach" board',
  'site:facebook.com "condo association" "Palm Beach" fees',
  'site:facebook.com "HOA" "Delray Beach" lawsuit',
  'site:facebook.com "HOA" "Boynton Beach" special assessment',
  'site:facebook.com "HOA" "Jupiter" Florida complaint',
  'site:facebook.com "HOA" "Boca Raton" board dispute',
  'site:facebook.com "HOA" "Wellington" Florida fees',
  'site:facebook.com "HOA" "Lake Worth" Florida assessment',
]

const LARGE_COMMUNITIES = [
  'Huntington Pointe', 'Golden Lakes Village',
  'Palm Isles', 'Century Village',
  'Kings Point Delray', 'Valencia Falls',
  'Valencia Shores', 'Fountains of Palm Beach',
  'BallenIsles', 'PGA National',
  'Abacoa', 'Ibis Golf',
  'Mirasol', 'Olympia Wellington',
  'Seven Bridges', 'Lotus Boca',
  'Covered Bridge Lake Worth',
  'High Point Delray',
]

const QUERIES_ISSUES = [
  'site:facebook.com "special assessment" "Palm Beach" HOA 2025',
  'site:facebook.com "special assessment" "Palm Beach" HOA 2026',
  'site:facebook.com "HOA board" "Palm Beach" recall 2025',
  'site:facebook.com "HOA board" "Palm Beach" recall 2026',
  'site:facebook.com "HOA fraud" "Palm Beach" Florida',
  'site:facebook.com "HOA lawsuit" "Palm Beach" Florida 2025',
  'site:facebook.com "HOA lawsuit" "Palm Beach" Florida 2026',
  'site:facebook.com "condo assessment" "Palm Beach" 2026',
  'site:facebook.com "HOA fees increase" "Palm Beach"',
  'site:facebook.com "HOA management" "Palm Beach" fired',
]

const ALL_QUERIES = [
  ...QUERIES_GENERAL,
  ...LARGE_COMMUNITIES.map((n) => `site:facebook.com "${n}" HOA`),
  ...QUERIES_ISSUES,
]

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

type DDGResult = { title: string; url: string; snippet: string; query: string }

async function ddgSearch(query: string): Promise<DDGResult[]> {
  const qenc = encodeURIComponent(query)
  try {
    const r = await fetch(`https://html.duckduckgo.com/html/?q=${qenc}`, {
      headers: { 'User-Agent': UA },
    })
    const html = await r.text()
    const out: DDGResult[] = []
    const linkRe = /<a\s+class="result__a"\s+href="(\/l\/\?[^"]+)"[^>]*>([\s\S]*?)<\/a>/g
    let m: RegExpExecArray | null
    while ((m = linkRe.exec(html)) !== null) {
      const href = m[1]
      const titleRaw = m[2]
      const real = /uddg=(https?[^&]+)/.exec(href)
      const url = real ? decodeURIComponent(real[1]) : ''
      if (!url || !url.toLowerCase().includes('facebook.com')) continue
      const title = titleRaw.replace(/<[^>]+>/g, '').trim()
      const idx = html.indexOf(href)
      const snipMatch = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(
        html.slice(idx, idx + 3000),
      )
      const snippet = snipMatch ? snipMatch[1].replace(/<[^>]+>/g, '').trim() : ''
      out.push({ title, url, snippet, query })
    }
    return out
  } catch {
    return []
  }
}

type AIResult = {
  relevant: boolean
  community_mentioned?: string | null
  topic?: string
  sentiment?: string
  useful: boolean
  summary?: string
}

async function aiEvaluate(r: DDGResult): Promise<AIResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { relevant: false, useful: false }
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system:
          'You evaluate Facebook posts and pages for relevance to HOA communities in Palm Beach County Florida. Return JSON only.',
        messages: [
          {
            role: 'user',
            content:
              `Evaluate this search result:\nTitle: ${r.title.slice(0, 300)}\nURL: ${r.url.slice(0, 200)}\nSnippet: ${r.snippet.slice(0, 400)}\n\n` +
              'Questions:\n1. Is this about an HOA or condo community in Palm Beach County Florida?\n2. Does it mention a specific community name?\n3. Topic? (assessment/fees/board/lawsuit/fraud/general/other)\n4. Useful intelligence for HOA research?\n\n' +
              'Return JSON only:\n{"relevant": true|false, "community_mentioned": "name"|null, "topic": "assessment|fees|board|lawsuit|fraud|general|other", "sentiment": "positive|negative|neutral", "useful": true|false, "summary": "one sentence"}',
          },
        ],
      }),
    })
    const data = await resp.json()
    let text = data?.content?.[0]?.text?.trim() || '{}'
    text = text.replace(/^```(?:json)?\s*|\s*```$/gm, '').trim()
    return JSON.parse(text) as AIResult
  } catch {
    return { relevant: false, useful: false }
  }
}

function fuzzy(name: string, candidates: Array<{ id: string; canonical_name: string }>) {
  const a = name.toLowerCase().trim()
  let best = 0
  let bestC: { id: string; canonical_name: string } | null = null
  for (const c of candidates) {
    const b = (c.canonical_name || '').toLowerCase()
    if (!b) continue
    // Cheap ratio: containment > char-overlap ratio
    let score = 0
    if (a.includes(b) || b.includes(a)) score = 0.9
    else {
      const setA = new Set(a.split(/\s+/))
      const setB = new Set(b.split(/\s+/))
      let common = 0
      for (const w of setA) if (setB.has(w)) common++
      score = (2 * common) / (setA.size + setB.size)
    }
    if (score > best) {
      best = score
      bestC = c
    }
  }
  return best >= 0.75 ? { match: bestC, score: best } : null
}

const TOPIC_TO_FIELD: Record<string, { field: string; conf: number }> = {
  assessment: { field: 'assessment_signal', conf: 0.5 },
  fees: { field: 'assessment_signal', conf: 0.5 },
  lawsuit: { field: 'litigation_signal', conf: 0.5 },
  fraud: { field: 'litigation_signal', conf: 0.5 },
  board: { field: 'community_signal', conf: 0.4 },
  general: { field: 'community_signal', conf: 0.4 },
  other: { field: 'community_signal', conf: 0.4 },
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // 1) DDG searches
  const raw: DDGResult[] = []
  for (const q of ALL_QUERIES) {
    const r = await ddgSearch(q)
    raw.push(...r)
    await new Promise((res) => setTimeout(res, 1000))
  }
  const seen = new Set<string>()
  const unique: DDGResult[] = []
  for (const r of raw) {
    if (!r.url || seen.has(r.url)) continue
    seen.add(r.url)
    unique.push(r)
  }

  // 2) AI filter
  const relevant: Array<DDGResult & { ai: AIResult }> = []
  for (const r of unique) {
    const ai = await aiEvaluate(r)
    if (ai.relevant && ai.useful) relevant.push({ ...r, ai })
    await new Promise((res) => setTimeout(res, 250))
  }

  // 3) Match to communities
  const { data: comms } = await supabase
    .from('communities')
    .select('id, canonical_name, slug, city')
    .eq('status', 'published')
    .limit(10000)
  const candidates = (comms || []) as Array<{ id: string; canonical_name: string }>

  let inserted = 0
  let matched = 0
  let unmatched = 0
  const topicCounts: Record<string, number> = {}

  for (const r of relevant) {
    const cname = r.ai.community_mentioned
    if (!cname) {
      unmatched++
      continue
    }
    const m = fuzzy(cname, candidates)
    if (!m || !m.match) {
      unmatched++
      continue
    }
    matched++
    const topic = (r.ai.topic || 'general').toLowerCase()
    topicCounts[topic] = (topicCounts[topic] || 0) + 1
    const map = TOPIC_TO_FIELD[topic] || TOPIC_TO_FIELD.general
    const { error } = await supabase.from('pending_community_data').insert({
      community_id: m.match.id,
      field_name: map.field,
      proposed_value: (r.ai.summary || '').slice(0, 1000),
      source_url: r.url.slice(0, 500),
      source_type: 'facebook_public',
      confidence: map.conf,
      auto_approvable: false,
      status: 'pending',
    })
    if (!error) inserted++
  }

  return NextResponse.json({
    success: true,
    queries_run: ALL_QUERIES.length,
    raw_results: raw.length,
    unique_results: unique.length,
    relevant_useful: relevant.length,
    matched,
    unmatched,
    inserted,
    topic_counts: topicCounts,
  })
}
