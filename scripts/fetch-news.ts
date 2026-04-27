/**
 * Fetch HOA-related news from GDELT, analyze with Anthropic, and stage rows in Supabase.
 *
 * Manual run only:
 *   npx ts-node scripts/fetch-news.ts
 *   npm run fetch-news
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY
 *
 * Optional env:
 *   ANTHROPIC_MODEL (default: claude-sonnet-4-20250514)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

dotenv.config({ path: join(process.cwd(), '.env.local') })
dotenv.config()

const OUTPUT_DIR = join(process.cwd(), 'scripts', 'output')
const PROGRESS_PATH = join(OUTPUT_DIR, 'news_fetch_progress.json')
const MAX_PROCESS = 100
const FETCH_DELAY_MS = 500
const MAX_CONTENT_CHARS = 3000
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514'

const GDELT_URL =
  'https://api.gdeltproject.org/api/v2/doc/doc' +
  '?query=HOA+%22Palm+Beach+County%22+Florida' +
  '&mode=ArtList' +
  '&maxrecords=50' +
  '&format=json' +
  '&sort=DateDesc'

type GdeltArticle = {
  title?: string
  url?: string
  domain?: string
  sourcecountry?: string
  seendate?: string
  tone?: string | number
  language?: string
}

type ProgressFile = {
  processed_urls: string[]
  last_run_at?: string
}

type ExtractedHoa = {
  name: string
  location: string
  context: string
}

type ExtractedPayload = {
  hoas_mentioned: ExtractedHoa[]
  summary: string
  sentiment: 'positive' | 'negative' | 'neutral'
  key_topics: string[]
  is_relevant: boolean
}

type CommunityRow = {
  id: string
  canonical_name: string | null
  subdivision_names: string | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function wordsSet(s: string): Set<string> {
  return new Set(norm(s).split(' ').filter((w) => w.length >= 3))
}

function similarity(a: string, b: string): number {
  const sa = wordsSet(a)
  const sb = wordsSet(b)
  if (sa.size === 0 || sb.size === 0) return 0
  let inter = 0
  for (const w of sa) {
    if (sb.has(w)) inter++
  }
  const union = new Set([...sa, ...sb]).size
  return union === 0 ? 0 : inter / union
}

function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function loadProgress(): ProgressFile {
  if (!existsSync(PROGRESS_PATH)) return { processed_urls: [] }
  try {
    return JSON.parse(readFileSync(PROGRESS_PATH, 'utf8')) as ProgressFile
  } catch {
    return { processed_urls: [] }
  }
}

function saveProgress(progress: ProgressFile) {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  writeFileSync(
    PROGRESS_PATH,
    JSON.stringify(
      {
        ...progress,
        last_run_at: new Date().toISOString(),
      },
      null,
      2,
    ),
    'utf8',
  )
}

async function fetchGdeltArticles(): Promise<GdeltArticle[]> {
  const maxAttempts = 4 // initial attempt + 3 retries
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)
    try {
      const response = await fetch(GDELT_URL, { signal: controller.signal })
      clearTimeout(timeout)

      if (!response.ok) {
        if (attempt === maxAttempts) {
          throw new Error(`GDELT error ${response.status} after ${maxAttempts} attempts`)
        }
        console.warn(
          `GDELT responded ${response.status}, retrying in 10s (${attempt}/${maxAttempts})...`,
        )
        await sleep(10_000)
        continue
      }

      const payload = (await response.json()) as { articles?: GdeltArticle[] }
      return payload.articles || []
    } catch (err) {
      clearTimeout(timeout)
      if (attempt === maxAttempts) {
        throw err instanceof Error ? err : new Error('GDELT fetch failed')
      }
      console.warn(`GDELT fetch failed, retrying in 10s (${attempt}/${maxAttempts})...`, err)
      await sleep(10_000)
    }
  }
  return []
}

async function fetchUrlText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'hoa-agent-news-pipeline/1.0',
      },
    })
    if (!res.ok) return null
    const html = await res.text()
    const text = stripHtml(html).slice(0, MAX_CONTENT_CHARS)
    return text.length > 120 ? text : null
  } catch {
    return null
  }
}

function parseAnthropicJson(content: string): ExtractedPayload | null {
  const trimmed = content.trim()
  try {
    return JSON.parse(trimmed) as ExtractedPayload
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as ExtractedPayload
      } catch {
        return null
      }
    }
    return null
  }
}

async function analyzeWithAnthropic(
  apiKey: string,
  title: string,
  content: string,
): Promise<ExtractedPayload | null> {
  const system =
    'You are an expert at analyzing news articles about homeowners associations (HOAs) in Palm Beach County, Florida. Extract structured information from the article.'
  const user =
    `Article title: ${title}\n\nArticle content: ${content}\n\n` +
    'Extract the following in JSON format only, no other text:\n' +
    '{\n' +
    '  hoas_mentioned: [{ \n' +
    '    name: string, \n' +
    '    location: string, \n' +
    '    context: string \n' +
    '  }],\n' +
    '  summary: string (2-3 sentences),\n' +
    "  sentiment: 'positive' | 'negative' | 'neutral',\n" +
    '  key_topics: string[],\n' +
    '  is_relevant: boolean (true if article is actually about a PBC HOA)\n' +
    '}'

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1200,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!res.ok) {
    const msg = await res.text()
    throw new Error(`Anthropic ${res.status}: ${msg.slice(0, 400)}`)
  }
  const payload = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>
  }
  const text = payload.content?.find((c) => c.type === 'text')?.text || ''
  return parseAnthropicJson(text)
}

function getMostLikelyCommunityMatches(
  hoaName: string,
  communities: CommunityRow[],
): Array<{ community_id: string; confidence: number; reason: string }> {
  const needle = norm(hoaName)
  const out: Array<{ community_id: string; confidence: number; reason: string }> = []
  if (!needle) return out

  for (const c of communities) {
    const canonical = c.canonical_name || ''
    const subdivisions = c.subdivision_names || ''
    const hay = `${canonical} ${subdivisions}`
    const conf = similarity(needle, hay)
    if (conf > 0.5) {
      out.push({
        community_id: c.id,
        confidence: conf,
        reason: `Token overlap similarity ${conf.toFixed(2)} for "${hoaName}"`,
      })
    }
  }

  return out.sort((a, b) => b.confidence - a.confidence).slice(0, 3)
}

async function fetchCommunitiesForMatching(sb: SupabaseClient): Promise<CommunityRow[]> {
  const out: CommunityRow[] = []
  const pageSize = 1000
  let from = 0
  for (;;) {
    const { data, error } = await sb
      .from('communities')
      .select('id, canonical_name, subdivision_names')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`communities fetch failed: ${error.message}`)
    const batch = (data || []) as CommunityRow[]
    if (batch.length === 0) break
    out.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
  }
  return out
}

async function fetchExistingUrls(sb: SupabaseClient, urls: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  if (urls.length === 0) return out
  const chunkSize = 100
  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunk = urls.slice(i, i + chunkSize)
    const { data, error } = await sb.from('news_items').select('url').in('url', chunk)
    if (error) throw new Error(`news_items url check failed: ${error.message}`)
    for (const row of data || []) {
      const url = String((row as { url?: string }).url || '').trim()
      if (url) out.add(url)
    }
  }
  return out
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  if (!anthropicKey) throw new Error('Missing ANTHROPIC_API_KEY')

  const sb = createClient(supabaseUrl, serviceKey)

  console.log('Fetching GDELT articles...')
  const gdelt = await fetchGdeltArticles()
  console.log(`GDELT returned ${gdelt.length} rows`)

  const progress = loadProgress()
  const alreadyDone = new Set(progress.processed_urls || [])

  const candidates = gdelt
    .map((a) => ({
      title: String(a.title || '').trim(),
      url: String(a.url || '').trim(),
      domain: String(a.domain || '').trim(),
      date: String(a.seendate || '').trim(),
      tone: Number(a.tone ?? 0),
      language: String(a.language || '').trim(),
    }))
    .filter((a) => a.title && a.url)
    .filter((a) => !alreadyDone.has(a.url))

  const existingInDb = await fetchExistingUrls(
    sb,
    candidates.slice(0, 250).map((a) => a.url),
  )
  const toProcess = candidates
    .filter((a) => !existingInDb.has(a.url))
    .slice(0, MAX_PROCESS)

  console.log(
    `Candidates after dedupe/progress: ${toProcess.length} (max ${MAX_PROCESS} per run)`,
  )

  const communities = await fetchCommunitiesForMatching(sb)
  console.log(`Loaded ${communities.length} communities for matching`)

  let processed = 0
  let matched = 0
  const newlyProcessedUrls: string[] = []

  for (const art of toProcess) {
    processed++
    console.log(`[${processed}/${toProcess.length}] ${art.title.slice(0, 90)}`)

    const content = await fetchUrlText(art.url)
    if (!content) {
      newlyProcessedUrls.push(art.url)
      saveProgress({
        processed_urls: [...alreadyDone, ...newlyProcessedUrls],
      })
      await sleep(FETCH_DELAY_MS)
      continue
    }

    let extracted: ExtractedPayload | null = null
    try {
      extracted = await analyzeWithAnthropic(anthropicKey, art.title, content)
    } catch (err) {
      console.error('Anthropic error:', err)
    }
    if (!extracted) {
      newlyProcessedUrls.push(art.url)
      saveProgress({
        processed_urls: [...alreadyDone, ...newlyProcessedUrls],
      })
      await sleep(FETCH_DELAY_MS)
      continue
    }

    const { data: newsItem, error: insertErr } = await sb
      .from('news_items')
      .insert({
        title: art.title,
        url: art.url,
        source: art.domain || null,
        published_date: art.date || null,
        raw_content: content.slice(0, MAX_CONTENT_CHARS),
        ai_summary: extracted.summary || null,
        ai_extracted_hoas: extracted as unknown as Record<string, unknown>,
        gdelt_tone: art.tone,
        status: 'pending',
      })
      .select('id')
      .single()

    if (insertErr || !newsItem?.id) {
      console.error('Insert news_items failed:', insertErr?.message)
      newlyProcessedUrls.push(art.url)
      saveProgress({
        processed_urls: [...alreadyDone, ...newlyProcessedUrls],
      })
      await sleep(FETCH_DELAY_MS)
      continue
    }

    const newsItemId = newsItem.id as string

    const allMatches: Array<{
      news_item_id: string
      community_id: string
      match_confidence: number
      match_reason: string
      status: string
    }> = []

    for (const hoa of extracted.hoas_mentioned || []) {
      if (!hoa?.name) continue
      const rowMatches = getMostLikelyCommunityMatches(hoa.name, communities)
      for (const m of rowMatches) {
        allMatches.push({
          news_item_id: newsItemId,
          community_id: m.community_id,
          match_confidence: Number(m.confidence.toFixed(4)),
          match_reason: m.reason,
          status: 'pending',
        })
      }
    }

    const deduped = new Map<string, (typeof allMatches)[number]>()
    for (const m of allMatches) {
      const key = `${m.news_item_id}:${m.community_id}`
      const prev = deduped.get(key)
      if (!prev || m.match_confidence > prev.match_confidence) {
        deduped.set(key, m)
      }
    }
    const matchesToInsert = [...deduped.values()]

    if (matchesToInsert.length > 0) {
      const { error: matchErr } = await sb.from('community_news').insert(matchesToInsert)
      if (matchErr) {
        console.error('Insert community_news failed:', matchErr.message)
      } else {
        matched += matchesToInsert.length
      }
    }

    newlyProcessedUrls.push(art.url)
    saveProgress({
      processed_urls: [...alreadyDone, ...newlyProcessedUrls],
    })
    await sleep(FETCH_DELAY_MS)
  }

  console.log('\n--- News Fetch Summary ---')
  console.log(`Articles fetched from GDELT: ${gdelt.length}`)
  console.log(`Articles processed this run: ${processed}`)
  console.log(`Community matches inserted: ${matched}`)
  console.log(`Progress file: ${PROGRESS_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
