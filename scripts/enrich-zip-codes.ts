/**
 * Enrich community ZIP codes via Nominatim (free geocoding).
 * Outputs CSV + SQL only — does not write to Supabase.
 *
 * Run: npx ts-node scripts/enrich-zip-codes.ts
 *       npm run enrich-zip-codes
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)
 */

import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

dotenv.config({ path: join(process.cwd(), ".env.local") })
dotenv.config()

const OUTPUT_DIR = join(process.cwd(), "scripts", "output")
const PROGRESS_PATH = join(OUTPUT_DIR, "zip_enrichment_progress.json")
const CSV_PATH = join(OUTPUT_DIR, "zip_updates.csv")
const SQL_PATH = join(OUTPUT_DIR, "zip_updates.sql")

const CREATED_BEFORE = "2026-04-24"
const NOMINATIM_DELAY_MS = 1100
const PROGRESS_BATCH = 50
const MAX_ROWS = 5000
const PAGE_SIZE = 1000

/** Default city ZIPs assigned in bulk — treat as imprecise */
const DEFAULT_ZIPS = [
  "33401",
  "33432",
  "33444",
  "33460",
  "33426",
  "33458",
  "33410",
  "33414",
  "33480",
  "33463",
  "33408",
  "33404",
  "33411",
  "33469",
  "33487",
  "33461",
  "33462",
  "33403",
  "33470",
]

const NOMINATIM_UA = "hoa-agent/1.0 (zip enrichment; contact: https://hoa-agent.com)"

type CommunityRow = {
  id: string
  canonical_name: string
  city: string | null
  zip_code: string | null
}

type ProgressFile = {
  processedIds: string[]
  updatedAt?: string
}

function ensureOutputDir() {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true })
}

function loadProgress(): Set<string> {
  if (!existsSync(PROGRESS_PATH)) return new Set()
  try {
    const raw = readFileSync(PROGRESS_PATH, "utf8")
    const j = JSON.parse(raw) as ProgressFile
    return new Set(Array.isArray(j.processedIds) ? j.processedIds : [])
  } catch {
    return new Set()
  }
}

function saveProgress(processedIds: Set<string>) {
  const payload: ProgressFile = {
    processedIds: [...processedIds],
    updatedAt: new Date().toISOString(),
  }
  writeFileSync(PROGRESS_PATH, JSON.stringify(payload, null, 2), "utf8")
}

/** Strip legal / association boilerplate for a cleaner geocode query */
function cleanCanonicalName(name: string): string {
  let s = name.trim()
  const patterns = [
    /\binc\.?,?\s*$/i,
    /\bllc\.?,?\s*$/i,
    /\blp\.?,?\s*$/i,
    /\bl\.?l\.?c\.?,?\s*$/i,
    /\bhomeowners\s+association\b/gi,
    /\bhoa\b/gi,
    /\bproperty\s+owners\s+association\b/gi,
    /\bpoa\b/gi,
    /\bcondominium\b/gi,
    /\bcondo\b/gi,
    /\bassociation\b/gi,
    /\bcommunity\s+association\b/gi,
    /\bmaster\s+association\b/gi,
    /\bmanagement\b/gi,
    /[,.\s]+$/g,
  ]
  for (const re of patterns) {
    s = s.replace(re, " ").trim()
  }
  s = s.replace(/\s{2,}/g, " ").trim()
  return s || name.trim()
}

function buildQuery(row: CommunityRow): string {
  const name = cleanCanonicalName(row.canonical_name)
  const city = (row.city || "").trim() || "Palm Beach County"
  return `${name}, ${city}, FL`
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function sqlEscapeZip(z: string) {
  return z.replace(/'/g, "''")
}

function sqlEscapeUuid(id: string) {
  return id.replace(/'/g, "''")
}

async function nominatimPostcode(query: string): Promise<string | null> {
  const url =
    "https://nominatim.openstreetmap.org/search" +
    `?q=${encodeURIComponent(query)}` +
    "&format=json" +
    "&addressdetails=1" +
    "&countrycodes=us" +
    "&limit=1"

  const res = await fetch(url, {
    headers: {
      "User-Agent": NOMINATIM_UA,
      Accept: "application/json",
    },
  })
  if (!res.ok) return null
  const data = (await res.json()) as unknown
  if (!Array.isArray(data) || data.length === 0) return null
  const first = data[0] as { address?: { postcode?: string } }
  const raw = first?.address?.postcode
  if (!raw || typeof raw !== "string") return null
  const m = raw.trim().match(/\b(\d{5})\b/)
  return m ? m[1] : null
}

function isValidNewZip(zip: string | null, oldZip: string | null): zip is string {
  if (!zip || !/^\d{5}$/.test(zip)) return false
  if (!zip.startsWith("334")) return false
  const old = (oldZip || "").trim()
  if (old && zip === old) return false
  return true
}

async function fetchCandidates(processed: Set<string>, max: number): Promise<CommunityRow[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or Supabase key")

  const supabase = createClient(supabaseUrl, key)
  const zipList = DEFAULT_ZIPS.join(",")

  const out: CommunityRow[] = []
  let from = 0

  while (out.length < max) {
    const { data, error } = await supabase
      .from("communities")
      .select("id, canonical_name, city, zip_code")
      .or(`zip_code.is.null,zip_code.in.(${zipList})`)
      .lt("created_at", CREATED_BEFORE)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    const page = (data || []) as CommunityRow[]
    if (page.length === 0) break

    for (const row of page) {
      if (processed.has(row.id)) continue
      out.push(row)
      if (out.length >= max) break
    }

    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return out
}

function initCsv() {
  if (!existsSync(CSV_PATH)) {
    writeFileSync(CSV_PATH, "id,canonical_name,city,old_zip,new_zip,source\n", "utf8")
  }
}

function appendCsvLine(fields: string[]) {
  const line =
    fields
      .map((v) => {
        const s = String(v ?? "")
        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
        return s
      })
      .join(",") + "\n"
  appendFileSync(CSV_PATH, line, "utf8")
}

function appendSqlLine(id: string, zip: string) {
  const sql = `UPDATE communities SET zip_code = '${sqlEscapeZip(zip)}' WHERE id = '${sqlEscapeUuid(id)}';\n`
  appendFileSync(SQL_PATH, sql, "utf8")
}

async function main() {
  ensureOutputDir()
  const processed = loadProgress()
  initCsv()
  if (!existsSync(SQL_PATH)) writeFileSync(SQL_PATH, "", "utf8")

  console.log(`Loaded ${processed.size} IDs from progress (resume). Fetching up to ${MAX_ROWS} candidates…`)

  const candidates = await fetchCandidates(processed, MAX_ROWS)
  console.log(`Candidates to process this run: ${candidates.length}`)

  let totalProcessed = 0
  let totalUpdated = 0
  let totalSkipped = 0
  let sinceProgressWrite = 0

  for (let i = 0; i < candidates.length; i++) {
    const row = candidates[i]
    const query = buildQuery(row)
    const oldZip = row.zip_code?.trim() || ""

    let newZip: string | null = null
    try {
      newZip = await nominatimPostcode(query)
    } catch {
      newZip = null
    }

    processed.add(row.id)
    totalProcessed++
    sinceProgressWrite++

    if (isValidNewZip(newZip, row.zip_code)) {
      appendCsvLine([row.id, row.canonical_name, row.city || "", oldZip, newZip, "nominatim"])
      appendSqlLine(row.id, newZip)
      totalUpdated++
    } else {
      totalSkipped++
    }

    if (sinceProgressWrite >= PROGRESS_BATCH) {
      saveProgress(processed)
      sinceProgressWrite = 0
      console.log(`Progress: processed ${totalProcessed} (updated ${totalUpdated}, skipped ${totalSkipped})`)
    }

    if (i < candidates.length - 1) await sleep(NOMINATIM_DELAY_MS)
  }

  if (sinceProgressWrite > 0) saveProgress(processed)

  console.log("\n--- Summary ---")
  console.log(`Total processed: ${totalProcessed}`)
  console.log(`ZIP found & queued for update: ${totalUpdated}`)
  console.log(`Skipped (invalid / same / not found): ${totalSkipped}`)
  console.log(`CSV: ${CSV_PATH}`)
  console.log(`SQL: ${SQL_PATH}`)
  console.log(`Progress: ${PROGRESS_PATH}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
