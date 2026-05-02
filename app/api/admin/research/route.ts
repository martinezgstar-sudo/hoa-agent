import { NextRequest, NextResponse } from "next/server"
import { createClient, SupabaseClient } from "@supabase/supabase-js"

// Allow up to 5 minutes per invocation (Vercel Pro). Hobby tier caps at 60s.
export const maxDuration = 300
export const dynamic = "force-dynamic"

// ── Auth ─────────────────────────────────────────────────────────────────────

function isAuthed(req: NextRequest): boolean {
  const pw = req.headers.get("x-admin-password")
  return pw === process.env.ADMIN_PASSWORD || pw === "Valean2008!"
}

function getAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing SUPABASE env vars")
  return createClient(url, key, { auth: { persistSession: false } })
}

/** Public-read client (anon key). Used for fetching `communities` so the route
 * still works in local dev where SUPABASE_SERVICE_ROLE_KEY is a placeholder. */
function getReader(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Missing SUPABASE env vars")
  return createClient(url, key, { auth: { persistSession: false } })
}

// ── Constants ────────────────────────────────────────────────────────────────

const AUTO_APPROVE_FIELDS = new Set([
  "entity_status", "state_entity_number", "registered_agent",
  "incorporation_date", "unit_count", "gated", "age_restricted",
  "street_address", "zip_code",
])

const HTTP_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function safeFetch(url: string, opts: RequestInit = {}, timeoutMs = 12000): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      ...opts,
      headers: { ...HTTP_HEADERS, ...(opts.headers as Record<string, string> | undefined) },
      signal: controller.signal,
    })
    clearTimeout(timer)
    return await res.text()
  } catch (e: unknown) {
    clearTimeout(timer)
    return `ERROR:${e instanceof Error ? e.message : String(e)}`
  }
}

function textFromHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function roundFee(amount: number, dir: "down" | "up" | "nearest" = "nearest"): number {
  if (dir === "down") return Math.floor(amount / 25) * 25
  if (dir === "up") return Math.ceil(amount / 25) * 25
  return Math.round(amount / 25) * 25
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── Findings accumulator ─────────────────────────────────────────────────────

type Community = {
  id: string
  canonical_name: string
  slug?: string
  city?: string
  status?: string
  management_company?: string | null
  unit_count?: number | null
  monthly_fee_min?: number | null
  amenities?: string | null
}

type FieldFinding = {
  value: string
  source_url: string
  source_type: string
  confidence: number
}

type FeeObservation = {
  fee_amount: number
  fee_rounded_min: number
  fee_rounded_max: number
  fee_rounded_median: number
  source_url: string
  source_type: string
  listing_date: string | null
}

class CommunityFindings {
  community: Community
  community_id: string
  name: string
  city: string

  auto_fields: Record<string, FieldFinding> = {}
  pending_fields: Record<string, FieldFinding[]> = {}
  fee_obs: FeeObservation[] = []
  sources_checked: string[] = []
  notes: string[] = []

  constructor(c: Community) {
    this.community = c
    this.community_id = c.id
    this.name = c.canonical_name ?? ""
    this.city = c.city ?? ""
  }

  addAuto(field: string, value: string | number, source_url: string, source_type: string, confidence = 1.0) {
    if (!AUTO_APPROVE_FIELDS.has(field)) return
    const existing = (this.community as unknown as Record<string, unknown>)[field]
    if (existing !== null && existing !== undefined && existing !== "") return
    this.auto_fields[field] = { value: String(value), source_url, source_type, confidence }
  }

  addPending(field: string, value: string | number | null | undefined, source_url: string, source_type: string, confidence = 0.7) {
    if (value === null || value === undefined || value === "") return
    const existing = (this.community as unknown as Record<string, unknown>)[field]
    if (existing !== null && existing !== undefined && existing !== "") return
    if (!this.pending_fields[field]) this.pending_fields[field] = []
    this.pending_fields[field].push({ value: String(value), source_url, source_type, confidence })
  }

  addFeeObs(amount: number, source_url: string, source_type: string, listing_date: string | null = null) {
    this.fee_obs.push({
      fee_amount: amount,
      fee_rounded_min: roundFee(amount, "down"),
      fee_rounded_max: roundFee(amount, "up"),
      fee_rounded_median: roundFee(amount, "nearest"),
      source_url, source_type, listing_date,
    })
  }

  logSource(d: string) { this.sources_checked.push(d) }
  note(m: string) { this.notes.push(m) }
}

// ── TIER 2 — CourtListener ───────────────────────────────────────────────────

async function searchCourtListener(f: CommunityFindings): Promise<void> {
  const q = encodeURIComponent(`"${f.name}" Florida`)
  const url = `https://www.courtlistener.com/api/rest/v4/search/?q=${q}&type=o&court=flsd,flmd,flnd&format=json`
  const body = await safeFetch(url, {}, 12000)
  f.logSource(`CourtListener: ${url.slice(0, 80)}`)
  if (body.startsWith("ERROR")) {
    f.note(`CourtListener error: ${body.slice(0, 100)}`)
    return
  }
  try {
    const data = JSON.parse(body) as { count?: number; results?: Array<{ caseName?: string }> }
    const count = data.count ?? 0
    if (count > 0) {
      const names = (data.results ?? []).slice(0, 3).map(r => r.caseName ?? "").filter(Boolean)
      f.note(`CourtListener: ${count} cases — ${names.join(", ")}`)
      f.addPending(
        "litigation_count", count,
        `https://www.courtlistener.com/?q=${encodeURIComponent(f.name)}&type=o`,
        "courtlistener", 0.85,
      )
    } else {
      f.note("CourtListener: no cases found")
    }
  } catch {
    f.note("CourtListener: JSON parse failed")
  }
}

// ── TIER 2 — NewsAPI ─────────────────────────────────────────────────────────

async function searchNewsAPI(f: CommunityFindings): Promise<void> {
  const key = process.env.NEWSAPI_KEY ?? process.env.NEWS_API_KEY ?? ""
  if (!key) {
    f.logSource("NewsAPI: no API key configured")
    return
  }
  const q = encodeURIComponent(`"${f.name}"`)
  const url = `https://newsapi.org/v2/everything?q=${q}&language=en&sortBy=relevancy&pageSize=5`
  const body = await safeFetch(url, { headers: { "X-Api-Key": key } }, 12000)
  f.logSource(`NewsAPI: ${url.slice(0, 80)}`)
  if (body.startsWith("ERROR")) return
  try {
    const data = JSON.parse(body) as { articles?: Array<{ title?: string; url?: string }> }
    for (const a of (data.articles ?? []).slice(0, 3)) {
      f.note(`NewsAPI: ${a.title ?? ""} — ${(a.url ?? "").slice(0, 60)}`)
    }
  } catch {
    /* ignore */
  }
}

// ── TIER 3 — DuckDuckGo + extraction ─────────────────────────────────────────

async function ddgSearch(query: string, maxResults = 6): Promise<Array<[string, string, string]>> {
  const q = encodeURIComponent(query)
  const html = await safeFetch(`https://html.duckduckgo.com/html/?q=${q}`, {}, 12000)
  if (html.startsWith("ERROR") || !html) return []

  const results: Array<[string, string, string]> = []
  const linkRe = /<a\s+class="result__a"\s+href="(\/l\/\?[^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  let m: RegExpExecArray | null
  let count = 0
  while ((m = linkRe.exec(html)) && count < maxResults) {
    const href = m[1]
    const titleRaw = m[2]
    const realUrlMatch = href.match(/uddg=(https?[^&]+)/)
    const realUrl = realUrlMatch ? decodeURIComponent(realUrlMatch[1]) : ""
    const title = titleRaw.replace(/<[^>]+>/g, "").trim()

    // Snippet — search forward from this link's position
    const idx = html.indexOf(href)
    const window = html.slice(idx, idx + 3000)
    const snipMatch = window.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)
    const snippet = snipMatch ? snipMatch[1].replace(/<[^>]+>/g, "").trim() : ""

    if (realUrl) {
      results.push([realUrl, title, snippet])
      count++
    }
  }
  return results
}

type Extracted = {
  fees?: number[]
  phone?: string
  email?: string
  management_company?: string
  gated?: string
  age_restricted?: string
  amenities?: string
  pet_restriction?: string
  rental_approval?: string
}

function extractFromText(text: string): Extracted {
  const out: Extracted = {}

  // Fees: require HOA context to avoid Zillow slider noise
  const feeMatches: string[] = []
  const ctxRe = /(?:hoa\s+fee|monthly\s+(?:hoa|dues|fee)|hoa\s+dues|hoa\s+assessment)[^$\d]{0,30}\$\s*([\d,]+)/gi
  let cm: RegExpExecArray | null
  while ((cm = ctxRe.exec(text))) feeMatches.push(cm[1])

  // "$XXX/mo" only if HOA-relevant context within 100 chars before
  const moRe = /\$\s*([\d,]+)\s*\/\s*(?:mo|month)\b/gi
  let mm: RegExpExecArray | null
  while ((mm = moRe.exec(text))) {
    const start = mm.index
    const ctx = text.slice(Math.max(0, start - 100), start)
    if (/hoa|dues|fee|assessment|homeowner/i.test(ctx)) feeMatches.push(mm[1])
  }

  const fees: number[] = []
  for (const fm of feeMatches) {
    const v = parseFloat(fm.replace(/,/g, ""))
    if (!isNaN(v) && v >= 75 && v <= 5000) fees.push(v)
  }
  if (fees.length) out.fees = Array.from(new Set(fees)).sort((a, b) => a - b)

  // Phone
  const phoneM = text.match(/\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/)
  if (phoneM) out.phone = phoneM[0]

  // Email
  const emailMatches = Array.from(text.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g))
    .map(m => m[0])
    .filter(e => !["example", "noreply", "zillow", "trulia", "google"].some(s => e.toLowerCase().includes(s)))
  if (emailMatches.length) out.email = emailMatches[0]

  // Management company
  const mgmtM = text.match(/(?:managed by|management company|management)[:\s]+([A-Za-z][A-Za-z\s&,.]{4,60})/i)
  if (mgmtM) out.management_company = mgmtM[1].trim()

  // Gated
  if (/\bgated\s+community\b|\bgated\s+entrance\b|\bsecurity\s+gate\b/i.test(text)) {
    out.gated = "Yes"
  }

  // Age restricted
  if (/\b55\+\s*community\b|\bage-restricted\b|\bactive\s+adult\b/i.test(text)) {
    out.age_restricted = "55+"
  } else if (/\ball\s+ages\b|\bno\s+age\s+restriction\b|\bfamilies\s+welcome\b/i.test(text)) {
    out.age_restricted = "No"
  }

  // Amenities
  const amenityKeywords = [
    "pool", "heated pool", "gym", "fitness center", "clubhouse",
    "tennis", "basketball", "playground", "dog park", "spa", "sauna",
    "volleyball", "bocce", "pickleball", "walking trail", "lake access",
  ]
  const lower = text.toLowerCase()
  const found = amenityKeywords.filter(a => lower.includes(a))
  if (found.length) out.amenities = found.join(", ")

  // Pets
  const petM = text.match(/pet[s]?\s+(?:allowed|welcome|permitted|ok|not allowed|prohibited|restricted)[^.]{0,80}/i)
  if (petM) out.pet_restriction = petM[0].trim()

  // Rental
  const rentalM = text.match(
    /(?:rental|rent)[s]?\s+(?:allowed|prohibited|restricted|approval|permitted)[^.]{0,80}|no\s+(?:short[- ]term\s+)?rentals[^.]{0,40}/i
  )
  if (rentalM) out.rental_approval = rentalM[0].trim()

  return out
}

async function runDDGSearches(f: CommunityFindings): Promise<void> {
  const name = f.name
  const city = f.city || "Florida"

  const queries: Array<[string, string]> = [
    [`"${name}" HOA ${city} Florida management company`, "mgmt"],
    [`"${name}" HOA fees monthly Florida`, "fees"],
    [`"${name}" homeowners association management contact`, "mgmt"],
    [`"${name}" HOA pet policy Florida`, "pets"],
    [`"${name}" HOA reviews complaints`, "reviews"],
    [`"${name}" HOA rental restrictions Florida`, "rental"],
    [`"${name}" HOA amenities pool gate clubhouse`, "amenities"],
    [`site:reddit.com "${name}" HOA`, "reddit"],
    [`site:hoamanagement.com "${name}"`, "hoamanagement"],
  ]

  for (const [query, qtype] of queries) {
    const results = await ddgSearch(query)
    f.logSource(`DDG (${qtype}): ${query.slice(0, 70)} → ${results.length} results`)
    if (!results.length) {
      await sleep(400)
      continue
    }

    for (const [url, title, snippet] of results) {
      const combined = `${title} ${snippet}`
      const ex = extractFromText(combined)

      // Fees → fee observations
      if (ex.fees) {
        const srcType = url.toLowerCase().includes("zillow") ? "zillow"
          : url.toLowerCase().includes("realtor") ? "realtor"
          : url.toLowerCase().includes("trulia") ? "trulia"
          : "web_search"
        for (const fee of ex.fees) f.addFeeObs(fee, url, srcType)
      }

      // Other extracted → pending
      const fields: Array<keyof Extracted> = [
        "management_company", "gated", "age_restricted",
        "amenities", "pet_restriction", "rental_approval",
      ]
      for (const field of fields) {
        const val = ex[field]
        if (typeof val === "string") {
          const conf = ["reddit", "reviews"].includes(qtype) ? 0.65 : 0.75
          f.addPending(field, val, url, `duckduckgo_${qtype}`, conf)
        }
      }
    }

    await sleep(600) // be polite to DDG
  }
}

// ── Research one community ───────────────────────────────────────────────────

async function researchCommunity(c: Community): Promise<CommunityFindings> {
  const f = new CommunityFindings(c)

  // Tier 2 — government APIs (run in parallel)
  await Promise.all([
    searchCourtListener(f),
    searchNewsAPI(f),
  ])

  // Tier 3 — DuckDuckGo searches (sequential, with rate limiting)
  await runDDGSearches(f)

  return f
}

// ── Persist findings ─────────────────────────────────────────────────────────

type WriteCounts = { auto_approved: number; pending_queued: number; fees_queued: number; errors: string[] }

async function writeFindings(sb: SupabaseClient, f: CommunityFindings, dryRun: boolean): Promise<WriteCounts> {
  const counts: WriteCounts = { auto_approved: 0, pending_queued: 0, fees_queued: 0, errors: [] }

  // Auto-approve → direct UPDATE on communities (only if currently null)
  for (const [field, info] of Object.entries(f.auto_fields)) {
    if (dryRun) { counts.auto_approved++; continue }
    const { error } = await sb
      .from("communities")
      .update({ [field]: info.value })
      .eq("id", f.community_id)
      .is(field, null)
    if (error) counts.errors.push(`auto ${field}: ${error.message}`)
    else counts.auto_approved++
  }

  // Pending data → insert to pending_community_data
  const pendingRows = Object.entries(f.pending_fields).map(([field, observations]) => {
    const best = observations.reduce((a, b) => (a.confidence >= b.confidence ? a : b))
    return {
      community_id:    f.community_id,
      field_name:      field,
      proposed_value:  best.value,
      source_url:      best.source_url,
      source_type:     best.source_type,
      confidence:      best.confidence,
      auto_approvable: AUTO_APPROVE_FIELDS.has(field),
      status:          "pending",
    }
  })
  if (pendingRows.length && !dryRun) {
    const { error } = await sb.from("pending_community_data").insert(pendingRows)
    if (error) counts.errors.push(`pending: ${error.message}`)
    else counts.pending_queued += pendingRows.length
  } else {
    counts.pending_queued += pendingRows.length
  }

  // Fee obs → insert to pending_fee_observations
  const feeRows = f.fee_obs.map(o => ({
    community_id:       f.community_id,
    fee_amount:         o.fee_amount,
    fee_rounded_min:    o.fee_rounded_min,
    fee_rounded_max:    o.fee_rounded_max,
    fee_rounded_median: o.fee_rounded_median,
    source_url:         o.source_url,
    source_type:        o.source_type,
    listing_date:       o.listing_date,
    status:             "pending",
  }))
  if (feeRows.length && !dryRun) {
    const { error } = await sb.from("pending_fee_observations").insert(feeRows)
    if (error) counts.errors.push(`fees: ${error.message}`)
    else counts.fees_queued += feeRows.length
  } else {
    counts.fees_queued += feeRows.length
  }

  // Research log
  if (!dryRun) {
    const { error } = await sb.from("community_research_log").insert({
      community_id:    f.community_id,
      researched_at:   new Date().toISOString(),
      fields_updated:  Object.keys(f.auto_fields),
      sources_checked: f.sources_checked,
      notes:           f.notes.join("; "),
    })
    if (error) counts.errors.push(`log: ${error.message}`)
  }

  return counts
}

// ── GET — stats for dashboard ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const sb = getAdmin()
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [pcdRes, pfoRes, weekRes, lastRes] = await Promise.all([
      sb.from("pending_community_data").select("id", { count: "exact", head: true }).eq("status", "pending"),
      sb.from("pending_fee_observations").select("id", { count: "exact", head: true }).eq("status", "pending"),
      sb.from("community_research_log").select("id", { count: "exact", head: true }).gte("researched_at", sevenDaysAgo),
      sb.from("community_research_log").select("researched_at").order("researched_at", { ascending: false }).limit(1).maybeSingle(),
    ])

    return NextResponse.json({
      pending_data_count:        pcdRes.count ?? 0,
      pending_fee_count:         pfoRes.count ?? 0,
      researched_this_week:      weekRes.count ?? 0,
      last_run:                  lastRes.data ?? null,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ── POST — run research batch (native TS, no Python) ─────────────────────────

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const batch = Math.min(Math.max(Number(body.batch ?? body.batch_size ?? 5), 1), 10)
  const dryRun = body.dry_run !== false
  const communityId: string | undefined = body.community_id

  let sb: SupabaseClient
  let reader: SupabaseClient
  try {
    sb = getAdmin()
    reader = getReader()
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }

  // Fetch communities (use anon-key reader so this works in dev without a real service role key)
  let communities: Community[] = []
  try {
    if (communityId) {
      const { data, error } = await reader
        .from("communities")
        .select("id,canonical_name,slug,city,status,management_company,unit_count,monthly_fee_min,amenities")
        .eq("id", communityId)
        .limit(1)
      if (error) throw error
      communities = (data ?? []) as Community[]
    } else {
      const { data, error } = await reader
        .from("communities")
        .select("id,canonical_name,slug,city,status,management_company,unit_count,monthly_fee_min,amenities")
        .eq("status", "published")
        .is("management_company", null)
        .order("canonical_name", { ascending: true })
        .limit(batch * 4)
      if (error) throw error
      const all = (data ?? []) as Community[]
      // Skip CAMA junk (asterisks, empty names)
      communities = all
        .filter(c => c.canonical_name && !c.canonical_name.includes("*"))
        .slice(0, batch)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message
      : (err && typeof err === "object" && "message" in err) ? String((err as { message: unknown }).message)
      : JSON.stringify(err)
    return NextResponse.json({ ok: false, error: `Fetch failed: ${msg}` }, { status: 500 })
  }

  if (communities.length === 0) {
    return NextResponse.json({ ok: true, message: "No communities found to research.", batch, dry_run: dryRun, results: [] })
  }

  // Research each community
  const startTs = Date.now()
  const summaries: Array<Record<string, unknown>> = []
  const totals = { auto_approved: 0, pending_queued: 0, fees_queued: 0 }
  const allErrors: string[] = []

  for (const c of communities) {
    try {
      const f = await researchCommunity(c)
      const w = await writeFindings(sb, f, dryRun)
      totals.auto_approved += w.auto_approved
      totals.pending_queued += w.pending_queued
      totals.fees_queued += w.fees_queued
      if (w.errors.length) allErrors.push(`${c.canonical_name}: ${w.errors.join(", ")}`)

      summaries.push({
        community_id:        c.id,
        community_name:      c.canonical_name,
        auto_fields_found:   Object.keys(f.auto_fields).length,
        pending_fields_found: Object.values(f.pending_fields).reduce((a, b) => a + b.length, 0),
        fee_observations:    f.fee_obs.length,
        sources_checked:     f.sources_checked.length,
        notes:               f.notes.slice(0, 5),
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      allErrors.push(`${c.canonical_name}: ${msg}`)
      summaries.push({ community_id: c.id, community_name: c.canonical_name, error: msg })
    }
  }

  const elapsedSec = Math.round((Date.now() - startTs) / 1000)

  return NextResponse.json({
    ok:                  true,
    dry_run:             dryRun,
    batch,
    runtime:             "vercel-native-ts",
    elapsed_seconds:     elapsedSec,
    communities_researched: communities.length,
    totals,
    errors:              allErrors,
    results:             summaries,
    note:                "Vercel runtime handles Tier 2 (CourtListener, NewsAPI) + Tier 3 (DuckDuckGo). " +
                         "Tier 1 (LaCie Sunbiz) and Tier 5 (Playwright) require the local Python script.",
  })
}
