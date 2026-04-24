/**
 * Recalculate community unit_count from CAMA Property_Information_Table
 * (residential parcels only — same PROPERTY_USE filter as extract-sales).
 *
 * Outputs CSV + SQL only — does not write to Supabase.
 *
 * Run: npx ts-node scripts/fix-unit-counts.ts
 *       npm run fix-unit-counts
 *
 * Env:
 *   PBC_PROPERTY_CSV — optional path to Property_Information_Table CSV
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { parse } from "csv-parse"
import dotenv from "dotenv"
import { createReadStream, existsSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { stripPhaseSuffixes } from "./lib/subdivision-matching"

dotenv.config({ path: join(process.cwd(), ".env.local") })
dotenv.config()

const DATA_DIR_DEFAULT = join("/Volumes/LaCie", "FL-Palm Beach County Data")
const DATA_DIR_ALT = "/Volumes/LaCie/FL-Palm Beach County Data "
const OUTPUT_DIR = join(process.cwd(), "scripts", "output")
const CSV_OUT = join(OUTPUT_DIR, "unit_count_fixes.csv")
const SQL_OUT = join(OUTPUT_DIR, "unit_count_fixes.sql")

const PROPERTY_DEFAULT = "Property_Information_Table_-6553152689149400476.csv"
const PROGRESS_EVERY = 500_000

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

type CamaGroup = {
  byParcel: Map<string, { zip: string; muni: string }>
}

type SbCommunity = {
  id: string
  canonical_name: string
  subdivision_names: string | null
  city: string | null
  unit_count: number | null
  zip_code: string | null
}

function resolvePropertyCsv(): string {
  const env = process.env.PBC_PROPERTY_CSV?.trim()
  if (env) return env
  const p1 = join(DATA_DIR_DEFAULT, PROPERTY_DEFAULT)
  if (existsSync(p1)) return p1
  return join(DATA_DIR_ALT, PROPERTY_DEFAULT)
}

function isResidentialUse(propertyUse: string): boolean {
  const u = propertyUse.toUpperCase()
  if (!u) return false
  if (EXCLUDED_USE_KEYS.some((k) => u.includes(k))) return false
  return RESIDENTIAL_USE_KEYS.some((k) => u.includes(k))
}

/** Normalization key: stripPhaseSuffixes (already uppercases) + collapse spaces */
function subdivNormKey(raw: string): string {
  return stripPhaseSuffixes(raw).replace(/\s+/g, " ").trim()
}

function splitSubdivisionNames(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

function communityMatchKeys(row: SbCommunity): string[] {
  const keys = new Set<string>()
  const add = (s: string) => {
    const k = subdivNormKey(s)
    if (k) keys.add(k)
  }
  add(row.canonical_name)
  for (const part of splitSubdivisionNames(row.subdivision_names)) add(part)
  return [...keys]
}

async function buildCamaMap(propertyCsv: string): Promise<Map<string, CamaGroup>> {
  const map = new Map<string, CamaGroup>()
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
      process.stderr.write(`... CAMA rows ${rows.toLocaleString()} | keys ${map.size.toLocaleString()}\n`)
    }

    const subdiv = String(row.SUBDIV_NAME ?? "").trim()
    const parcel = String(row.PARCEL_NUMBER ?? "").trim()
    const municipality = String(row.MUNICIPALITY ?? "").trim()
    const zip = String(row.ZIP1 ?? "").trim()
    const propertyUse = String(row.PROPERTY_USE ?? "").trim()
    if (!subdiv || !parcel || !municipality) continue
    if (!isResidentialUse(propertyUse)) continue

    const key = subdivNormKey(subdiv)
    if (!key) continue

    let g = map.get(key)
    if (!g) {
      g = { byParcel: new Map() }
      map.set(key, g)
    }
    g.byParcel.set(parcel, { zip, muni: municipality })
  }

  process.stderr.write(`CAMA map: ${map.size.toLocaleString()} subdivision keys, ${rows.toLocaleString()} rows read\n`)
  return map
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>()
  for (const v of values) {
    const s = v.trim()
    if (!s) continue
    const z = s.match(/\b(\d{5})\b/)?.[1] || s
    counts.set(z, (counts.get(z) ?? 0) + 1)
  }
  let best = ""
  let n = 0
  for (const [k, c] of counts) {
    if (c > n) {
      n = c
      best = k
    }
  }
  return best
}

function aggregateForCommunity(
  keys: string[],
  cama: Map<string, CamaGroup>,
): {
  newCount: number
  matchedKeys: string[]
  verifiedZip: string
  topMuni: string
} {
  const parcelUnion = new Set<string>()
  const zips: string[] = []
  const munis: string[] = []
  const matchedKeys: string[] = []

  for (const k of keys) {
    const g = cama.get(k)
    if (!g) continue
    matchedKeys.push(k)
    for (const [p, meta] of g.byParcel) {
      if (parcelUnion.has(p)) continue
      parcelUnion.add(p)
      if (meta.zip) zips.push(meta.zip)
      if (meta.muni) munis.push(meta.muni)
    }
  }

  return {
    newCount: parcelUnion.size,
    matchedKeys: [...new Set(matchedKeys)],
    verifiedZip: mostCommon(zips),
    topMuni: mostCommon(munis),
  }
}

function shouldUpdate(current: number | null | undefined, newCount: number): boolean {
  const cur =
    current === null || current === undefined || Number.isNaN(Number(current))
      ? null
      : Number(current)

  // Spec: flag if null OR new count differs by >10% from current.
  if (cur === null) return true

  if (newCount === cur) return false

  const denom = Math.max(cur, 1)
  return Math.abs(newCount - cur) / denom > 0.1
}

function escCsv(v: string | number): string {
  const s = String(v ?? "")
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function escSqlUuid(id: string) {
  return id.replace(/'/g, "''")
}

async function fetchAllCommunities(sb: SupabaseClient): Promise<SbCommunity[]> {
  const out: SbCommunity[] = []
  const pageSize = 1000
  let from = 0
  for (;;) {
    const { data, error } = await sb
      .from("communities")
      .select("id, canonical_name, subdivision_names, city, unit_count, zip_code")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`Supabase: ${error.message}`)
    const batch = (data || []) as SbCommunity[]
    if (batch.length === 0) break
    out.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
  }
  return out
}

async function main() {
  const propertyCsv = resolvePropertyCsv()
  if (!existsSync(propertyCsv)) {
    throw new Error(`Property CSV not found: ${propertyCsv}\nSet PBC_PROPERTY_CSV or install data under ${DATA_DIR_DEFAULT}`)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL and a Supabase key")

  mkdirSync(OUTPUT_DIR, { recursive: true })

  process.stderr.write(`Streaming CAMA:\n  ${propertyCsv}\n`)
  const cama = await buildCamaMap(propertyCsv)

  const sb = createClient(url, key)
  process.stderr.write("Fetching communities…\n")
  const communities = await fetchAllCommunities(sb)
  process.stderr.write(`Communities: ${communities.length.toLocaleString()}\n`)

  const csvLines: string[] = [
    "id,canonical_name,city,current_unit_count,new_unit_count,difference,matched_subdivisions,verified_zip,notes",
  ]
  const sqlLines: string[] = []

  let checked = 0
  let needingUpdate = 0
  let noCamaMatch = 0

  for (const row of communities) {
    checked++
    if (checked % 2000 === 0) {
      process.stderr.write(`... checked ${checked.toLocaleString()} / ${communities.length.toLocaleString()}\n`)
    }

    const keys = communityMatchKeys(row)
    const agg = aggregateForCommunity(keys, cama)
    const current = row.unit_count
    const curN =
      current === null || current === undefined || Number.isNaN(Number(current))
        ? null
        : Number(current)

    if (agg.matchedKeys.length === 0) {
      noCamaMatch++
    }

    if (!shouldUpdate(curN, agg.newCount)) continue

    needingUpdate++
    const diff = agg.newCount - (curN ?? 0)
    const pct =
      curN !== null && curN > 0
        ? `${(((agg.newCount - curN) / curN) * 100).toFixed(1)}% vs current`
        : curN === null || curN === 0
          ? "was null or zero"
          : ""
    const notes = [
      agg.topMuni ? `top_muni=${agg.topMuni}` : "",
      pct,
      agg.matchedKeys.length ? `matched_keys=${agg.matchedKeys.length}` : "",
    ]
      .filter(Boolean)
      .join("; ")

    csvLines.push(
      [
        escCsv(row.id),
        escCsv(row.canonical_name),
        escCsv(row.city ?? ""),
        escCsv(curN ?? ""),
        escCsv(agg.newCount),
        escCsv(diff),
        escCsv(agg.matchedKeys.join(" | ")),
        escCsv(agg.verifiedZip),
        escCsv(notes),
      ].join(","),
    )

    sqlLines.push(
      `UPDATE communities SET unit_count = ${Math.floor(agg.newCount)} WHERE id = '${escSqlUuid(row.id)}';`,
    )
  }

  writeFileSync(CSV_OUT, csvLines.join("\n") + "\n", "utf8")
  writeFileSync(SQL_OUT, sqlLines.join("\n") + (sqlLines.length ? "\n" : ""), "utf8")

  console.log("\n--- Summary ---")
  console.log(`Total communities checked: ${checked}`)
  console.log(`Total needing update (written to CSV/SQL): ${needingUpdate}`)
  console.log(`Total with no CAMA subdivision match: ${noCamaMatch}`)
  console.log(`CSV: ${CSV_OUT}`)
  console.log(`SQL: ${SQL_OUT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
