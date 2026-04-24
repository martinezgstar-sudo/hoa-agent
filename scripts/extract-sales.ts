/**
 * Extract recent verified CAMA sales and aggregate by subdivision.
 * Run: npx ts-node scripts/extract-sales.ts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { parse } from "csv-parse"
import dotenv from "dotenv"
import { createReadStream, existsSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import * as readline from "readline"
import {
  normalizeFuzzyLegacy,
  stripPhaseSuffixes,
} from "./lib/subdivision-matching"

dotenv.config({ path: join(process.cwd(), ".env.local") })
dotenv.config()

type CommunityRow = {
  id: string
  canonical_name: string
  subdivision_names: string | null
  city: string | null
}

type SalesAgg = {
  subdiv_name: string
  parcel_set: Set<string>
  prices: number[]
  sales_1yr: number
  sales_2yr: number
  sales_3yr: number
  sales_5yr: number
  sales_10yr: number
  last_sale_ts: number | null
  last_sale_date: string
  last_sale_price: number
}

type OutRow = {
  subdiv_name: string
  parcel_count: number
  total_sales_10yr: number
  sales_1yr: number
  sales_2yr: number
  sales_3yr: number
  sales_5yr: number
  sales_10yr: number
  median_sale_price: number
  mean_sale_price: number
  last_sale_date: string
  last_sale_price: number
  matched_community_id: string
  matched_community_name: string
}

const DATA_DIR_DEFAULT = join("/Volumes/LaCie", "FL-Palm Beach County Data")
const DATA_DIR_ALT = "/Volumes/LaCie/FL-Palm Beach County Data "
const OUTPUT_DIR = join(__dirname, "output")
const OUT_CSV = join(OUTPUT_DIR, "sales_by_subdivision.csv")
const OUT_SUMMARY = join(OUTPUT_DIR, "sales_summary.json")

const INSTRUMENT_ALLOWED = new Set(["WD", "SW", "SB", "QC", "CT", "TD", "PR", "CL", "WC"])
const PROGRESS_EVERY = 500_000
const MAX_PRICE = 5_000_000

const RESIDENTIAL_USE_KEYS = [
  "SINGLE FAMILY",
  "CONDOMINIUM",
  "TOWNHOUSE",
  "VILLA",
  "COOPERATIVE",
  "MOBILE HOME",
  "ZERO LOT",
  "RESIDENTIAL",
]
const EXCLUDED_USE_KEYS = [
  "VACANT",
  "AGRICULTURAL",
  "COMMERCIAL",
  "INDUSTRIAL",
  "GOVERNMENT",
  "PARKING",
  "COMMON AREA",
  "COMMON ELEMENT",
]

function resolvePath(defaultRel: string, envOverride?: string): string {
  if (envOverride?.trim()) return envOverride.trim()
  const p1 = join(DATA_DIR_DEFAULT, defaultRel)
  if (existsSync(p1)) return p1
  return join(DATA_DIR_ALT, defaultRel)
}

function toNumber(raw: string | undefined): number {
  const n = parseFloat(String(raw ?? "").replace(/[$,]/g, "").trim())
  return Number.isFinite(n) ? n : 0
}

const MONTHS = new Map([
  ["JAN", 0],
  ["FEB", 1],
  ["MAR", 2],
  ["APR", 3],
  ["MAY", 4],
  ["JUN", 5],
  ["JUL", 6],
  ["AUG", 7],
  ["SEP", 8],
  ["OCT", 9],
  ["NOV", 10],
  ["DEC", 11],
])

function parseDdMmmYy(raw: string): number | null {
  const m = raw.trim().toUpperCase().match(/^(\d{1,2})-([A-Z]{3})-(\d{2,4})$/)
  if (!m) return null
  const dd = parseInt(m[1]!, 10)
  const mon = MONTHS.get(m[2]!)
  if (mon === undefined) return null
  let yy = parseInt(m[3]!, 10)
  if (yy < 100) {
    const cutoff = new Date().getFullYear() - 2000
    yy += yy <= cutoff ? 2000 : 1900
  }
  const ts = new Date(yy, mon, dd).getTime()
  return Number.isFinite(ts) ? ts : null
}

function isResidentialUse(propertyUse: string): boolean {
  const u = propertyUse.toUpperCase()
  if (!u) return false
  if (EXCLUDED_USE_KEYS.some((k) => u.includes(k))) return false
  return RESIDENTIAL_USE_KEYS.some((k) => u.includes(k))
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const a = [...nums].sort((x, y) => x - y)
  const mid = Math.floor(a.length / 2)
  if (a.length % 2 === 0) return Math.round((a[mid - 1]! + a[mid]!) / 2)
  return a[mid]!
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 100) / 100
}

function escCell(v: string | number): string {
  const s = String(v ?? "")
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function writeCsv(path: string, headers: string[], rows: OutRow[]) {
  const lines = [headers.join(",")]
  for (const r of rows) {
    const rec = r as unknown as Record<string, string | number>
    lines.push(headers.map((h) => escCell(rec[h] ?? "")).join(","))
  }
  writeFileSync(path, lines.join("\n"), "utf8")
}

async function fetchAllCommunities(sb: SupabaseClient): Promise<CommunityRow[]> {
  const out: CommunityRow[] = []
  const pageSize = 1000
  let from = 0
  let page = 0
  for (;;) {
    page++
    const { data, error } = await sb
      .from("communities")
      .select("id, canonical_name, subdivision_names, city")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`Supabase communities: ${error.message}`)
    const batch = (data || []) as CommunityRow[]
    out.push(...batch)
    process.stderr.write(
      `... communities page ${page}: ${batch.length} rows (total ${out.length})\n`,
    )
    if (batch.length < pageSize) break
    from += pageSize
  }
  process.stderr.write(`Total communities fetched: ${out.length}\n`)
  return out
}

function splitAliases(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(/[,|]/g)
    .map((s) => s.trim())
    .filter(Boolean)
}

function buildCommunityLookup(communities: CommunityRow[]) {
  const exactSubdiv = new Map<string, { id: string; name: string }>()
  const exactName = new Map<string, { id: string; name: string }>()
  const exactNameNormalized = new Map<string, { id: string; name: string }>()
  const fuzzy = new Map<string, { id: string; name: string }>()

  for (const c of communities) {
    const name = (c.canonical_name || "").trim()
    if (!name) continue
    const m = { id: c.id, name }
    const nk = name.toUpperCase()
    if (!exactName.has(nk)) exactName.set(nk, m)
    const nNorm = stripPhaseSuffixes(name).toUpperCase()
    if (nNorm && !exactNameNormalized.has(nNorm)) exactNameNormalized.set(nNorm, m)
    const nf = normalizeFuzzyLegacy(name)
    if (nf && !fuzzy.has(nf)) fuzzy.set(nf, m)
    for (const s of splitAliases(c.subdivision_names)) {
      const sk = s.toUpperCase()
      if (!exactSubdiv.has(sk)) exactSubdiv.set(sk, m)
      const sf = normalizeFuzzyLegacy(s)
      if (sf && !fuzzy.has(sf)) fuzzy.set(sf, m)
    }
  }
  return { exactSubdiv, exactName, exactNameNormalized, fuzzy }
}

function matchCommunity(
  subdivName: string,
  lookup: ReturnType<typeof buildCommunityLookup>,
): { id: string; name: string } | null {
  const k = subdivName.toUpperCase()
  const bySub = lookup.exactSubdiv.get(k)
  if (bySub) return bySub
  const byName = lookup.exactName.get(k)
  if (byName) return byName
  const byNameNorm = lookup.exactNameNormalized.get(stripPhaseSuffixes(subdivName).toUpperCase())
  if (byNameNorm) return byNameNorm
  const fz = normalizeFuzzyLegacy(subdivName)
  if (fz) return lookup.fuzzy.get(fz) || null
  return null
}

async function buildParcelSubdivMap(propertyCsv: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const parser = createReadStream(propertyCsv, { encoding: "utf8" }).pipe(
    parse({
      columns: true,
      bom: true,
      relax_quotes: true,
      relax_column_count: true,
      skip_records_with_error: true,
      trim: true,
    }),
  )

  let rows = 0
  for await (const row of parser as AsyncIterable<Record<string, string>>) {
    rows++
    if (rows % PROGRESS_EVERY === 0) {
      process.stderr.write(`... property map rows ${rows.toLocaleString()}\n`)
    }
    const parcel = String(row.PARCEL_NUMBER ?? "").trim()
    const subdiv = String(row.SUBDIV_NAME ?? "").trim()
    const propertyUse = String(row.PROPERTY_USE ?? "").trim()
    const municipality = String(row.MUNICIPALITY ?? "").trim()
    if (!parcel || !subdiv) continue
    if (!municipality) continue
    if (!isResidentialUse(propertyUse)) continue
    out.set(parcel, subdiv)
  }
  process.stderr.write(`Property map built: ${out.size.toLocaleString()} parcels\n`)
  return out
}

async function main() {
  const propertyCsv = resolvePath(
    "Property_Information_Table_-6553152689149400476.csv",
    process.env.PBC_PROPERTY_CSV,
  )
  const camaTxt = resolvePath(
    join("CAMA_CERT2025_CSV", "PAS405_CERT2025_CSV_20251029.TXT"),
    process.env.CAMA_TXT_PATH,
  )
  if (!existsSync(propertyCsv)) throw new Error(`Property CSV not found: ${propertyCsv}`)
  if (!existsSync(camaTxt)) throw new Error(`CAMA TXT not found: ${camaTxt}`)

  mkdirSync(OUTPUT_DIR, { recursive: true })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY")
  const sb = createClient(url, key)

  process.stderr.write("Fetching communities...\n")
  const communities = await fetchAllCommunities(sb)
  const communityLookup = buildCommunityLookup(communities)
  process.stderr.write(`... communities: ${communities.length.toLocaleString()}\n`)

  process.stderr.write(`Building parcel→subdivision map from:\n  ${propertyCsv}\n`)
  const parcelToSubdiv = await buildParcelSubdivMap(propertyCsv)

  const nowDate = new Date()
  const ts10y = new Date(nowDate.getFullYear() - 10, nowDate.getMonth(), nowDate.getDate()).getTime()
  const ts5y = new Date(nowDate.getFullYear() - 5, nowDate.getMonth(), nowDate.getDate()).getTime()
  const ts3y = new Date(nowDate.getFullYear() - 3, nowDate.getMonth(), nowDate.getDate()).getTime()
  const ts2y = new Date(nowDate.getFullYear() - 2, nowDate.getMonth(), nowDate.getDate()).getTime()
  const ts1y = new Date(nowDate.getFullYear() - 1, nowDate.getMonth(), nowDate.getDate()).getTime()

  const bySubdiv = new Map<string, SalesAgg>()
  let linesSeen = 0
  let salesProcessed = 0
  let earliestTs: number | null = null
  let latestTs: number | null = null
  const countyPrices: number[] = []

  process.stderr.write(`Streaming CAMA sales file:\n  ${camaTxt}\n`)
  const rl = readline.createInterface({
    input: createReadStream(camaTxt, { encoding: "utf8" }),
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    linesSeen++
    if (linesSeen % PROGRESS_EVERY === 0) {
      process.stderr.write(`... cama lines ${linesSeen.toLocaleString()} | kept sales ${salesProcessed.toLocaleString()}\n`)
    }
    if (!line) continue
    const fields = line.split(",")
    if (fields.length < 9) continue
    const parcel = (fields[0] || "").trim()
    const recType = (fields[1] || "").trim().toUpperCase()
    if (recType !== "SALE") continue
    if (!parcel) continue

    const subdiv = parcelToSubdiv.get(parcel)
    if (!subdiv) continue

    let agg = bySubdiv.get(subdiv)
    if (!agg) {
      agg = {
        subdiv_name: subdiv,
        parcel_set: new Set<string>(),
        prices: [],
        sales_1yr: 0,
        sales_2yr: 0,
        sales_3yr: 0,
        sales_5yr: 0,
        sales_10yr: 0,
        last_sale_ts: null,
        last_sale_date: "",
        last_sale_price: 0,
      }
      bySubdiv.set(subdiv, agg)
    }

    for (let i = 0; i < 5; i++) {
      const base = 2 + i * 7
      if (base + 6 >= fields.length) break
      const dateRaw = (fields[base + 2] || "").trim()
      const instrument = (fields[base + 3] || "").trim().toUpperCase()
      const validity = (fields[base + 5] || "").trim().toUpperCase()
      const price = toNumber(fields[base + 6])

      if (validity !== "V") continue
      if (!INSTRUMENT_ALLOWED.has(instrument)) continue
      if (instrument === "QC" && price <= 50_000) continue
      if (price <= 10_000) continue
      if (price > MAX_PRICE) continue
      const saleTs = parseDdMmmYy(dateRaw)
      if (saleTs === null) continue
      if (saleTs < ts10y) continue

      salesProcessed++
      agg.parcel_set.add(parcel)
      agg.prices.push(price)
      countyPrices.push(price)
      if (saleTs >= ts1y) agg.sales_1yr++
      if (saleTs >= ts2y) agg.sales_2yr++
      if (saleTs >= ts3y) agg.sales_3yr++
      if (saleTs >= ts5y) agg.sales_5yr++
      if (saleTs >= ts10y) agg.sales_10yr++

      if (agg.last_sale_ts === null || saleTs > agg.last_sale_ts) {
        agg.last_sale_ts = saleTs
        agg.last_sale_date = new Date(saleTs).toISOString().slice(0, 10)
        agg.last_sale_price = price
      }
      if (earliestTs === null || saleTs < earliestTs) earliestTs = saleTs
      if (latestTs === null || saleTs > latestTs) latestTs = saleTs
    }
  }

  const rows: OutRow[] = []
  let matchedCommunities = 0
  for (const [, agg] of bySubdiv) {
    if (agg.prices.length === 0) continue
    const med = median(agg.prices)
    const total10 = agg.prices.length
    const m = matchCommunity(agg.subdiv_name, communityLookup)
    if (m) matchedCommunities++
    rows.push({
      subdiv_name: agg.subdiv_name,
      parcel_count: agg.parcel_set.size,
      total_sales_10yr: total10,
      sales_1yr: agg.sales_1yr,
      sales_2yr: agg.sales_2yr,
      sales_3yr: agg.sales_3yr,
      sales_5yr: agg.sales_5yr,
      sales_10yr: agg.sales_10yr,
      median_sale_price: med,
      mean_sale_price: mean(agg.prices),
      last_sale_date: agg.last_sale_date,
      last_sale_price: agg.last_sale_price,
      matched_community_id: m?.id || "",
      matched_community_name: m?.name || "",
    })
  }

  rows.sort((a, b) => b.total_sales_10yr - a.total_sales_10yr || a.subdiv_name.localeCompare(b.subdiv_name))

  writeCsv(
    OUT_CSV,
    [
      "subdiv_name",
      "parcel_count",
      "total_sales_10yr",
      "sales_1yr",
      "sales_2yr",
      "sales_3yr",
      "sales_5yr",
      "sales_10yr",
      "median_sale_price",
      "mean_sale_price",
      "last_sale_date",
      "last_sale_price",
      "matched_community_id",
      "matched_community_name",
    ],
    rows,
  )

  const summary = {
    total_subdivisions_with_sales: rows.length,
    total_sales_processed: salesProcessed,
    total_communities_matched: rows.filter((r) => !!r.matched_community_id).length,
    median_sale_price_county: median(countyPrices),
    date_range: {
      earliest: earliestTs ? new Date(earliestTs).toISOString().slice(0, 10) : null,
      latest: latestTs ? new Date(latestTs).toISOString().slice(0, 10) : null,
    },
  }
  writeFileSync(OUT_SUMMARY, JSON.stringify(summary, null, 2), "utf8")

  process.stderr.write(
    `Done. lines=${linesSeen.toLocaleString()} sales=${salesProcessed.toLocaleString()} subdivisions=${rows.length.toLocaleString()}\n` +
      `Wrote ${OUT_CSV}\n` +
      `Wrote ${OUT_SUMMARY}\n`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

