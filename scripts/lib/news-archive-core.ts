import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const OUTPUT_DIR = join(process.cwd(), 'scripts', 'output')
const PROGRESS_PATH = join(OUTPUT_DIR, 'archive_progress.json')
const MAX_ARTICLES_PER_RUN = 25
const MAX_CONTENT_CHARS = 3000
const FETCH_DELAY_MS = 500
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514'

type GdeltArticle = {
  title?: string
  url?: string
  domain?: string
  seendate?: string
  tone?: string | number
  language?: string
}

type ArchiveProgress = {
  current_start: string
  current_end: string
  total_articles_processed: number
  total_matches_found: number
  last_run: string
  completed: boolean
}

type ExtractedHoa = { name: string; location: string; context: string }
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
  return new Promise((r) => setTimeout(r, ms))
}

function fmtDateTime(ts: Date): string {
  const yyyy = ts.getUTCFullYear()
  const mm = String(ts.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(ts.getUTCDate()).padStart(2, '0')
  const hh = String(ts.getUTCHours()).padStart(2, '0')
  const mi = String(ts.getUTCMinutes()).padStart(2, '0')
  const ss = String(ts.getUTCSeconds()).padStart(2, '0')
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`
}

function parseDateTime(v: string): Date {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/)
  if (!m) return new Date('2015-01-01T00:00:00Z')
  return new Date(
    Date.UTC(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6]),
    ),
  )
}

function plusDays(dt: Date, days: number): Date {
  return new Date(dt.getTime() + days * 24 * 60 * 60 * 1000)
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

function loadProgress(now = new Date()): ArchiveProgress {
  if (!existsSync(PROGRESS_PATH)) {
    return {
      current_start: '20150101000000',
      current_end: '20150108000000',
      total_articles_processed: 0,
      total_matches_found: 0,
      last_run: now.toISOString(),
      completed: false,
    }
  }
  try {
    const parsed = JSON.parse(readFileSync(PROGRESS_PATH, 'utf8')) as ArchiveProgress
    return parsed
  } catch {
    return {
      current_start: '20150101000000',
      current_end: '20150108000000',
      total_articles_processed: 0,
      total_matches_found: 0,
      last_run: now.toISOString(),
      completed: false,
    }
  }
}

function saveProgress(progress: ArchiveProgress): void {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2), 'utf8')
}

function gdeltUrl(start: string, end: string): string {
  return (
    'https://api.gdeltproject.org/api/v2/doc/doc' +
    '?query=HOA+%22Palm+Beach+County%22+Florida' +
    '&mode=ArtList' +
    '&maxrecords=50' +
    '&format=json' +
    '&sort=DateDesc' +
    `&startdatetime=${start}` +
    `&enddatetime=${end}`
  )
}

async function fetchGdeltArticles(start: string, end: string): Promise<GdeltArticle[]> {
  const url = gdeltUrl(start, end)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GDELT error ${res.status}`)
  const payload = (await res.json()) as { articles?: GdeltArticle[] }
  return payload.articles || []
}

async function fetchUrlText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'hoa-agent-news-archive/1.0' },
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
  if (!res.ok) throw new Error(`Anthropic ${res.status}`)
  const payload = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
  const text = payload.content?.find((c) => c.type === 'text')?.text || ''
  return parseAnthropicJson(text)
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

async function fetchCommunities(sb: SupabaseClient): Promise<CommunityRow[]> {
  const out: CommunityRow[] = []
  let from = 0
  const pageSize = 1000
  for (;;) {
    const { data, error } = await sb
      .from('communities')
      .select('id, canonical_name, subdivision_names')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const batch = (data || []) as CommunityRow[]
    if (batch.length === 0) break
    out.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
  }
  return out
}

function getMatches(
  hoaName: string,
  communities: CommunityRow[],
): Array<{ community_id: string; confidence: number; reason: string }> {
  const out: Array<{ community_id: string; confidence: number; reason: string }> = []
  if (!hoaName?.trim()) return out
  for (const c of communities) {
    const hay = `${c.canonical_name || ''} ${c.subdivision_names || ''}`
    const conf = similarity(hoaName, hay)
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

export async function runNewsArchive(options?: {
  logger?: Pick<Console, 'log' | 'warn' | 'error'>
}): Promise<void> {
  const logger = options?.logger || console
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  if (!anthropicKey) throw new Error('Missing ANTHROPIC_API_KEY')

  const sb = createClient(supabaseUrl, serviceKey)
  const now = new Date()
  const progress = loadProgress(now)

  let runStart = progress.current_start
  let runEnd = progress.current_end
  if (progress.completed) {
    // Weekly rolling mode after full historical backfill.
    const end = now
    const start = plusDays(end, -7)
    runStart = fmtDateTime(start)
    runEnd = fmtDateTime(end)
  }

  logger.log(`Processing range: ${runStart} → ${runEnd}`)
  const gdelt = await fetchGdeltArticles(runStart, runEnd)
  logger.log(`GDELT rows found: ${gdelt.length}`)

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
    .slice(0, MAX_ARTICLES_PER_RUN)

  const existing = await fetchExistingUrls(
    sb,
    candidates.map((a) => a.url),
  )
  const toProcess = candidates.filter((a) => !existing.has(a.url))

  const communities = await fetchCommunities(sb)

  let processed = 0
  let matched = 0
  for (const art of toProcess) {
    const content = await fetchUrlText(art.url)
    if (!content) {
      await sleep(FETCH_DELAY_MS)
      continue
    }

    let extracted: ExtractedPayload | null = null
    try {
      extracted = await analyzeWithAnthropic(anthropicKey, art.title, content)
    } catch (err) {
      logger.warn('Anthropic failed for URL:', art.url, err)
    }
    if (!extracted) {
      await sleep(FETCH_DELAY_MS)
      continue
    }

    const { data: newsItem, error: newsErr } = await sb
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
    if (newsErr || !newsItem?.id) {
      logger.error('Insert news_items failed:', newsErr?.message)
      await sleep(FETCH_DELAY_MS)
      continue
    }

    processed++
    const allMatches: Array<{
      news_item_id: string
      community_id: string
      match_confidence: number
      match_reason: string
      status: string
    }> = []

    for (const hoa of extracted.hoas_mentioned || []) {
      if (!hoa?.name) continue
      const found = getMatches(hoa.name, communities)
      for (const f of found) {
        allMatches.push({
          news_item_id: newsItem.id as string,
          community_id: f.community_id,
          match_confidence: Number(f.confidence.toFixed(4)),
          match_reason: f.reason,
          status: 'pending',
        })
      }
    }

    const deduped = new Map<string, (typeof allMatches)[number]>()
    for (const m of allMatches) {
      const key = `${m.news_item_id}:${m.community_id}`
      const prev = deduped.get(key)
      if (!prev || m.match_confidence > prev.match_confidence) deduped.set(key, m)
    }
    const insertMatches = [...deduped.values()]
    if (insertMatches.length > 0) {
      const { error: matchErr } = await sb.from('community_news').insert(insertMatches)
      if (matchErr) logger.error('Insert community_news failed:', matchErr.message)
      else matched += insertMatches.length
    }

    await sleep(FETCH_DELAY_MS)
  }

  // Advance by one week for next historical chunk.
  const startDate = parseDateTime(runStart)
  const nextStartDate = plusDays(startDate, 7)
  const nextEndDate = plusDays(nextStartDate, 7)
  let completed = progress.completed
  if (!completed && nextEndDate.getTime() > now.getTime()) completed = true

  const nextStart = fmtDateTime(nextStartDate)
  const nextEnd = fmtDateTime(nextEndDate)
  const weeksRemaining = completed
    ? 0
    : Math.max(0, Math.ceil((now.getTime() - nextEndDate.getTime()) / (7 * 24 * 60 * 60 * 1000)))

  const updated: ArchiveProgress = {
    current_start: nextStart,
    current_end: nextEnd,
    total_articles_processed: progress.total_articles_processed + processed,
    total_matches_found: progress.total_matches_found + matched,
    last_run: new Date().toISOString(),
    completed,
  }
  saveProgress(updated)

  logger.log('\n--- News Archive Summary ---')
  logger.log(`Current date range processed: ${runStart} → ${runEnd}`)
  logger.log(`Articles found: ${gdelt.length}`)
  logger.log(`Articles processed: ${processed}`)
  logger.log(`Communities matched: ${matched}`)
  logger.log(`Next date range: ${updated.current_start} → ${updated.current_end}`)
  logger.log(`Estimated weeks remaining: ${weeksRemaining}`)
  logger.log(`Progress file: ${PROGRESS_PATH}`)
}
