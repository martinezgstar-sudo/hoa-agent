/**
 * Build enriched community profiles from Palm Beach CAMA parcel data.
 * Run: npx ts-node scripts/extract-communities.ts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { parse } from "csv-parse"
import { parse as parseSync } from "csv-parse/sync"
import dotenv from "dotenv"
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs"
import { join } from "path"
import { normalizeFuzzyLegacy, splitSubdivisions } from "./lib/subdivision-matching"

dotenv.config({ path: join(process.cwd(), ".env.local") })
dotenv.config()

type CordataRow = {
  subdiv_name: string
  cordata_entity_name: string
  entity_number: string
  match_level: string
  confidence: string
}

type CommunityRow = {
  id: string
  canonical_name: string
  subdivision_names: string | null
  city: string | null
}

type GroupAgg = {
  subdiv_name: string
  parcel_count: number
  municipalityCounts: Map<string, number>
  zipCounts: Map<string, number>
  propertyUseCounts: Map<string, number>
  homestead_yes_count: number
  sample_address: string
  market_values: number[]
  last_sale_ts: number | null
  last_sale_date: string
  last_sale_price: number
  municipalities_set: Set<string>
}

type CordataBest = {
  cordata_entity_name: string
  entity_number: string
  match_level: string
  confidence: string
}

type Profile = {
  subdiv_name: string
  parcel_count: number
  city: string
  zip_code: string
  property_types: string
  primary_property_type: string
  homestead_rate_pct: number
  sample_address: string
  median_market_value: number
  last_sale_date: string
  last_sale_price: number
  municipalities: string
  cordata_entity_name: string
  entity_number: string
  cordata_match_level: string
  cordata_confidence: string
  already_in_db: boolean
  existing_community_id: string
  existing_community_name: string
}

const DATA_DIR_DEFAULT = join("/Volumes/LaCie", "FL-Palm Beach County Data")
const DATA_DIR_ALT = "/Volumes/LaCie/FL-Palm Beach County Data "
const OUT_DIR = join(__dirname, "output")
const CORDATA_MATCHES_CSV = join(OUT_DIR, "cordata_matches.csv")
const OUT_JSON = join(OUT_DIR, "community_profiles.json")
const OUT_CSV = join(OUT_DIR, "community_profiles.csv")
const OUT_SUMMARY = join(OUT_DIR, "community_profiles_summary.json")
const PROGRESS_EVERY = 50_000

const RESIDENTIAL_KEYWORDS = [
  "SINGLE FAMILY",
  "CONDO",
  "TOWNHOUSE",
  "VILLA",
  "RESIDENTIAL",
  "MULTIFAMILY",
  "MULTI FAMILY",
  "ZERO LOT",
  "MOBILE HOME",
  "COOPERATIVE",
]
const EXCLUDED_KEYWORDS = [
  "VACANT",
  "AGRICULTURAL",
  "COMMERCIAL",
  "INDUSTRIAL",
  "GOVERNMENT",
  "INSTITUTIONAL",
  "UTILITY",
  "PARKING",
  "COMMON AREA",
  "COMMON ELEMENT",
]

function resolvePropertyCsvPath(): string {
  const override = process.env.PBC_PROPERTY_CSV?.trim()
  if (override) return override
  const p1 = join(DATA_DIR_DEFAULT, "Property_Information_Table_-6553152689149400476.csv")
  if (existsSync(p1)) return p1
  return join(DATA_DIR_ALT, "Property_Information_Table_-6553152689149400476.csv")
}

function toNumber(raw: string | undefined): number {
  if (!raw) return 0
  const n = parseFloat(String(raw).replace(/[$,]/g, "").trim())
  return Number.isFinite(n) ? n : 0
}

function parseSaleDateToTs(raw: string | undefined): number | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null
  const ts = Date.parse(s)
  if (Number.isFinite(ts)) return ts
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/)
  if (!m) return null
  const mm = parseInt(m[1]!, 10)
  const dd = parseInt(m[2]!, 10)
  let yy = parseInt(m[3]!, 10)
  if (yy < 100) yy += yy >= 70 ? 1900 : 2000
  const d = new Date(yy, mm - 1, dd).getTime()
  return Number.isFinite(d) ? d : null
}

function increment(map: Map<string, number>, keyRaw: string | undefined) {
  const key = (keyRaw || "").trim()
  if (!key) return
  map.set(key, (map.get(key) ?? 0) + 1)
}

function mostCommon(map: Map<string, number>): string {
  let best = ""
  let bestN = -1
  for (const [k, n] of map) {
    if (n > bestN) {
      best = k
      bestN = n
    }
  }
  return best
}

function topN(map: Map<string, number>, n: number): Array<[string, number]> {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const a = [...nums].sort((x, y) => x - y)
  const mid = Math.floor(a.length / 2)
  if (a.length % 2 === 0) return Math.round((a[mid - 1]! + a[mid]!) / 2)
  return a[mid]!
}

function propertyIsResidential(primary: string): boolean {
  const p = primary.toUpperCase()
  if (!p) return false
  if (EXCLUDED_KEYWORDS.some((k) => p.includes(k))) return false
  return RESIDENTIAL_KEYWORDS.some((k) => p.includes(k))
}

function escCell(v: string | number | boolean): string {
  const s = String(v ?? "")
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function writeCsv(path: string, headers: string[], rows: Profile[]) {
  const lines = [headers.join(",")]
  for (const r of rows) {
    const obj = r as unknown as Record<string, string | number | boolean>
    lines.push(headers.map((h) => escCell(obj[h] ?? "")).join(","))
  }
  writeFileSync(path, lines.join("\n"), "utf8")
}

function readCordataMatches(path: string): Map<string, CordataBest> {
  const out = new Map<string, CordataBest>()
  if (!existsSync(path)) return out

  const buf = readFileSync(path, "utf8")
  const rows = parseSync(buf, {
    columns: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
    skip_empty_lines: true,
  }) as CordataRow[]

  const score = (m: string, c: string) => {
    const ml = m === "exact" ? 3 : m === "fuzzy" ? 2 : 1
    const cf = c === "high" ? 3 : c === "medium" ? 2 : 1
    return ml * 10 + cf
  }

  for (const r of rows) {
    const key = (r.subdiv_name || "").trim().toUpperCase()
    if (!key) continue
    const cand: CordataBest = {
      cordata_entity_name: (r.cordata_entity_name || "").trim(),
      entity_number: (r.entity_number || "").trim(),
      match_level: (r.match_level || "").trim(),
      confidence: (r.confidence || "").trim(),
    }
    const prev = out.get(key)
    if (!prev || score(cand.match_level, cand.confidence) > score(prev.match_level, prev.confidence)) {
      out.set(key, cand)
    }
  }

  return out
}

async function fetchAllCommunities(sb: SupabaseClient): Promise<CommunityRow[]> {
  const out: CommunityRow[] = []
  const pageSize = 1000
  let from = 0
  for (;;) {
    const { data, error } = await sb
      .from("communities")
      .select("id, canonical_name, subdivision_names, city")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`Supabase communities: ${error.message}`)
    const batch = (data || []) as CommunityRow[]
    out.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
  }
  return out
}

function buildCommunityLookup(communities: CommunityRow[]) {
  const exact = new Map<string, { id: string; name: string }>()
  const fuzzy = new Map<string, { id: string; name: string }>()

  const add = (label: string, id: string, name: string) => {
    const key = label.trim().toUpperCase()
    if (!key) return
    if (!exact.has(key)) exact.set(key, { id, name })
    const fz = normalizeFuzzyLegacy(label)
    if (fz && !fuzzy.has(fz)) fuzzy.set(fz, { id, name })
  }

  for (const c of communities) {
    add(c.canonical_name || "", c.id, c.canonical_name || "")
    for (const a of splitSubdivisions(c.subdivision_names)) add(a, c.id, c.canonical_name || "")
  }
  return { exact, fuzzy }
}

async function main() {
  const propertyCsv = resolvePropertyCsvPath()
  if (!existsSync(propertyCsv)) throw new Error(`Property CSV not found: ${propertyCsv}`)
  mkdirSync(OUT_DIR, { recursive: true })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }
  const sb = createClient(url, key)

  process.stderr.write(`Fetching communities from Supabase...\n`)
  const communities = await fetchAllCommunities(sb)
  const dbLookup = buildCommunityLookup(communities)
  process.stderr.write(`... ${communities.length.toLocaleString()} communities\n`)

  const cordataBySubdiv = readCordataMatches(CORDATA_MATCHES_CSV)

  const groups = new Map<string, GroupAgg>()
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

  let rowsSeen = 0
  for await (const row of parser as AsyncIterable<Record<string, string>>) {
    rowsSeen++
    if (rowsSeen % PROGRESS_EVERY === 0) {
      process.stderr.write(`... processed ${rowsSeen.toLocaleString()} rows\n`)
    }

    const subdiv = String(row.SUBDIV_NAME ?? "").trim()
    if (!subdiv) continue
    const keySub = subdiv.toUpperCase()

    let g = groups.get(keySub)
    if (!g) {
      g = {
        subdiv_name: subdiv,
        parcel_count: 0,
        municipalityCounts: new Map(),
        zipCounts: new Map(),
        propertyUseCounts: new Map(),
        homestead_yes_count: 0,
        sample_address: "",
        market_values: [],
        last_sale_ts: null,
        last_sale_date: "",
        last_sale_price: 0,
        municipalities_set: new Set(),
      }
      groups.set(keySub, g)
    }

    g.parcel_count++
    const muni = String(row.MUNICIPALITY ?? "").trim()
    const zip = String(row.ZIP1 ?? "").trim()
    const propertyUse = String(row.PROPERTY_USE ?? "").trim()
    const addr = String(row.SITE_ADDR_STR ?? "").trim()
    const hm = String(row.HMSTD_FLG ?? "").trim().toUpperCase()

    increment(g.municipalityCounts, muni)
    increment(g.zipCounts, zip)
    increment(g.propertyUseCounts, propertyUse)
    if (muni) g.municipalities_set.add(muni)
    if (!g.sample_address && addr) g.sample_address = addr
    if (hm === "Y") g.homestead_yes_count++

    const market = toNumber(row.TOTAL_MARKET)
    if (market > 0) g.market_values.push(market)

    const saleTs = parseSaleDateToTs(row.SALE_DATE)
    if (saleTs !== null && (g.last_sale_ts === null || saleTs > g.last_sale_ts)) {
      g.last_sale_ts = saleTs
      g.last_sale_date = String(row.SALE_DATE ?? "").trim()
      g.last_sale_price = toNumber(row.PRICE)
    }
  }

  const profiles: Profile[] = []
  const byCity = new Map<string, number>()
  const byPropertyType = new Map<string, number>()
  const byCordataConfidence = new Map<string, number>()

  for (const [, g] of groups) {
    if (g.parcel_count < 5) continue

    const primaryPropertyType = mostCommon(g.propertyUseCounts)
    if (!propertyIsResidential(primaryPropertyType)) continue

    const city = mostCommon(g.municipalityCounts)
    const zipCode = mostCommon(g.zipCounts)
    const propertyTypesTop3 = topN(g.propertyUseCounts, 3)
      .map(([k, n]) => `${k} (${n})`)
      .join(" | ")

    const homesteadRate = g.parcel_count === 0 ? 0 : (g.homestead_yes_count / g.parcel_count) * 100
    const cordata = cordataBySubdiv.get(g.subdiv_name.toUpperCase())

    const exact = dbLookup.exact.get(g.subdiv_name.toUpperCase())
    const fuzzy = dbLookup.fuzzy.get(normalizeFuzzyLegacy(g.subdiv_name))
    const dbMatch = exact || fuzzy || null

    const profile: Profile = {
      subdiv_name: g.subdiv_name,
      parcel_count: g.parcel_count,
      city,
      zip_code: zipCode,
      property_types: propertyTypesTop3,
      primary_property_type: primaryPropertyType,
      homestead_rate_pct: Math.round(homesteadRate * 100) / 100,
      sample_address: g.sample_address,
      median_market_value: median(g.market_values),
      last_sale_date: g.last_sale_date,
      last_sale_price: g.last_sale_price,
      municipalities: [...g.municipalities_set].sort((a, b) => a.localeCompare(b)).join(" | "),
      cordata_entity_name: cordata?.cordata_entity_name ?? "",
      entity_number: cordata?.entity_number ?? "",
      cordata_match_level: cordata?.match_level ?? "",
      cordata_confidence: cordata?.confidence ?? "",
      already_in_db: !!dbMatch,
      existing_community_id: dbMatch?.id ?? "",
      existing_community_name: dbMatch?.name ?? "",
    }
    profiles.push(profile)

    if (city) byCity.set(city, (byCity.get(city) ?? 0) + 1)
    if (primaryPropertyType) byPropertyType.set(primaryPropertyType, (byPropertyType.get(primaryPropertyType) ?? 0) + 1)
    const cc = profile.cordata_confidence || "none"
    byCordataConfidence.set(cc, (byCordataConfidence.get(cc) ?? 0) + 1)
  }

  profiles.sort((a, b) => b.parcel_count - a.parcel_count || a.subdiv_name.localeCompare(b.subdiv_name))

  writeFileSync(OUT_JSON, JSON.stringify(profiles, null, 2), "utf8")
  writeCsv(
    OUT_CSV,
    [
      "subdiv_name",
      "parcel_count",
      "city",
      "zip_code",
      "primary_property_type",
      "homestead_rate_pct",
      "sample_address",
      "median_market_value",
      "last_sale_date",
      "last_sale_price",
      "municipalities",
      "cordata_entity_name",
      "entity_number",
      "cordata_match_level",
      "cordata_confidence",
      "already_in_db",
      "existing_community_id",
      "existing_community_name",
    ],
    profiles,
  )

  const total = profiles.length
  const inDb = profiles.filter((p) => p.already_in_db).length
  const notInDb = total - inDb
  const notInDbWithCordata = profiles.filter((p) => !p.already_in_db && !!p.cordata_entity_name).length
  const notInDbNoCordata = profiles.filter((p) => !p.already_in_db && !p.cordata_entity_name).length
  const topCities = [...byCity.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([city, count]) => ({ city, count }))
  const summary = {
    total_communities_found: total,
    already_in_db: inDb,
    not_in_db: notInDb,
    not_in_db_with_cordata_match: notInDbWithCordata,
    not_in_db_no_cordata: notInDbNoCordata,
    by_city: topCities,
    by_property_type: Object.fromEntries([...byPropertyType.entries()].sort((a, b) => b[1] - a[1])),
    by_cordata_confidence: Object.fromEntries(
      [...byCordataConfidence.entries()].sort((a, b) => b[1] - a[1]),
    ),
  }
  writeFileSync(OUT_SUMMARY, JSON.stringify(summary, null, 2), "utf8")

  process.stderr.write(
    `Done. rows=${rowsSeen.toLocaleString()} groups=${groups.size.toLocaleString()} profiles=${profiles.length.toLocaleString()}\n` +
      `Wrote ${OUT_JSON}\n` +
      `Wrote ${OUT_CSV}\n` +
      `Wrote ${OUT_SUMMARY}\n`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

