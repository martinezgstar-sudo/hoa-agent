/**
 * Ingest new verified communities from community_profiles.csv into Supabase.
 *
 * Dry run: npx ts-node scripts/ingest-new-communities.ts
 * Apply:   npx ts-node scripts/ingest-new-communities.ts --apply
 * Override minimum parcels: --min-parcels=25
 */

import { createClient } from "@supabase/supabase-js"
import { parse as parseSync } from "csv-parse/sync"
import dotenv from "dotenv"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { stripPhaseSuffixes } from "./lib/subdivision-matching"

dotenv.config({ path: join(process.cwd(), ".env.local") })
dotenv.config()

type ProfileRow = {
  subdiv_name: string
  parcel_count: number
  city: string
  zip_code: string
  primary_property_type: string
  homestead_rate_pct: number
  sample_address: string
  cordata_entity_name: string
  entity_number: string
  cordata_confidence: string
  already_in_db: boolean
}

type GroupedRow = {
  primary: ProfileRow
  aliases: string[]
  parcel_count_sum: number
  best_cordata_confidence: string
}

type ExistingCommunity = {
  id: string
  canonical_name: string
  slug: string
}

const INPUT = join(__dirname, "output", "community_profiles.csv")
const ALLOWED_PROPERTY_TYPES = new Set([
  "SINGLE FAMILY",
  "CONDOMINIUM",
  "TOWNHOUSE",
  "COOPERATIVE",
  "MOBILE HOME/MANUFACTURED HOME",
  "MULTIFAMILY < 5 UNITS",
  "SINGLE FAMILY-COMM ZONING",
])
const EXCLUDED_NAME_FRAGMENTS = [
  "FARMS CO",
  "AGR PUD",
  "KELSEY CITY",
  "NORTH LAKE WORTH",
  "FLAMINGO PARK",
  "DELRAY TOWN OF",
  "NORTHWOOD ADD",
  "ROLLING GREEN RIDGE",
]
const KNOWN_EXISTING_PHASE_FRAGMENTS = [
  "KINGS POINT",
  "ABERDEEN PL",
  "VALENCIA SHORES PL",
  "VALENCIA FALLS PL",
  "MAJESTIC ISLES PL",
  "OAKS AT BOCA RATON PL",
  "BOYNTON LAKES PL",
  "DELRAY VILLAS PL",
]
const SQL_OUTPUT_PATH = join(__dirname, "output", "insert_communities.sql")

function toNumber(v: string | undefined): number {
  const n = parseFloat(String(v ?? "").replace(/[$,%\s,]/g, ""))
  return Number.isFinite(n) ? n : 0
}

function parseBool(v: string | undefined): boolean {
  const s = String(v ?? "").trim().toLowerCase()
  return s === "true" || s === "1" || s === "yes" || s === "y"
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "community"
  )
}

function cleanCanonicalBaseName(subdivName: string): string {
  let s = stripPhaseSuffixes(subdivName).trim()
  // remove county reference artifacts
  s = s.replace(/\bIN\s+PB\b[\s\S]*$/i, " ")
  s = s.replace(/\bIN\s+OR\b[\s\S]*$/i, " ")
  s = s.replace(/\bOR\d+\b/gi, " ")
  s = s.replace(/\bPB\d+\b/gi, " ")
  // remove legal suffix fragments
  s = s.replace(/\bDECL\b/gi, " ")
  s = s.replace(/\bAS\s+I\b/gi, " ")
  s = s.replace(/\bAS\s+IN\b/gi, " ")
  s = s.replace(/\bIN\b/gi, " ")
  s = s.replace(/\bPLAT\s+ONE\b/gi, " ")
  s = s.replace(/\bPLAT\s+TWO\b/gi, " ")
  s = s.replace(/\bCOND\b/gi, " ")
  s = s.replace(/[.,;:()/-]+/g, " ")
  s = s.replace(/\s+/g, " ").trim()
  return titleCase(s)
}

function cleanSlugSource(s: string): string {
  const parts = s
    .replace(/[.,;:()/-]+/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
  // remove legal tail artifacts but keep meaningful short words like "of"
  let filtered = parts.filter(
    (w) =>
      !/^(in|as|decl|plat|one|two|cond)$/i.test(w) &&
      !/^or\d+$/i.test(w) &&
      !/^pb\d+$/i.test(w),
  )
  // trim trailing short fragments under 3 chars only
  while (filtered.length > 0 && filtered[filtered.length - 1]!.length < 3) {
    filtered = filtered.slice(0, -1)
  }
  return filtered.join(" ")
}

function confidenceRank(c: string): number {
  const x = c.toLowerCase()
  if (x === "high") return 3
  if (x === "medium") return 2
  if (x === "low") return 1
  return 0
}

function bestConfidence(a: string, b: string): string {
  return confidenceRank(a) >= confidenceRank(b) ? a : b
}

function readProfiles(path: string): ProfileRow[] {
  if (!existsSync(path)) throw new Error(`Missing input CSV: ${path}`)
  const buf = readFileSync(path, "utf8")
  const rows = parseSync(buf, {
    columns: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
    skip_empty_lines: true,
  }) as Record<string, string>[]

  return rows.map((r) => ({
    subdiv_name: String(r.subdiv_name ?? "").trim(),
    parcel_count: parseInt(String(r.parcel_count ?? "0").replace(/,/g, ""), 10) || 0,
    city: String(r.city ?? "").trim(),
    zip_code: String(r.zip_code ?? "").trim(),
    primary_property_type: String(r.primary_property_type ?? "").trim(),
    homestead_rate_pct: toNumber(r.homestead_rate_pct),
    sample_address: String(r.sample_address ?? "").trim(),
    cordata_entity_name: String(r.cordata_entity_name ?? "").trim(),
    entity_number: String(r.entity_number ?? "").trim(),
    cordata_confidence: String(r.cordata_confidence ?? "").trim().toLowerCase(),
    already_in_db: parseBool(r.already_in_db),
  }))
}

function parseMinParcels(argv: string[]): number {
  const arg = argv.find((a) => a.startsWith("--min-parcels="))
  if (!arg) return 10
  const n = parseInt(arg.split("=")[1] || "10", 10)
  return Number.isFinite(n) && n > 0 ? n : 10
}

async function columnExists(sb: ReturnType<typeof createClient>, col: string): Promise<boolean> {
  const { error } = await sb.from("communities").select(col).limit(1)
  return !error
}

function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL"
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL"
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE"
  if (Array.isArray(v)) {
    const vals = v
      .map((x) => String(x).replace(/'/g, "''"))
      .map((x) => `'${x}'`)
      .join(",")
    return `ARRAY[${vals}]`
  }
  const s = String(v).replace(/'/g, "''")
  return `'${s}'`
}

function writeInsertSql(path: string, table: string, rows: Record<string, unknown>[], batchSize = 100) {
  if (rows.length === 0) {
    writeFileSync(path, "-- No eligible rows to insert.\n", "utf8")
    return
  }
  const columns = Object.keys(rows[0]!)
  const chunks: string[] = []
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const values = batch
      .map((r) => `(${columns.map((c) => sqlLiteral(r[c])).join(", ")})`)
      .join(",\n")
    chunks.push(
      `INSERT INTO ${table} (${columns.join(", ")})\nVALUES\n${values}\nON CONFLICT (slug) DO NOTHING;`,
    )
  }
  writeFileSync(path, chunks.join("\n\n"), "utf8")
}

async function main() {
  const apply = process.argv.includes("--apply")
  const sqlOutput = process.argv.includes("--sql-output")
  const minParcels = parseMinParcels(process.argv)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY).",
    )
  }
  const sb = createClient(url, key)

  const rows = readProfiles(INPUT)
  const { data: existingData, error: existingErr } = await sb
    .from("communities")
    .select("id, canonical_name, slug")
  if (existingErr) throw new Error(`Fetch existing communities failed: ${existingErr.message}`)
  const existing = (existingData || []) as ExistingCommunity[]

  const slugSet = new Set(existing.map((c) => c.slug).filter(Boolean))
  const nameSet = new Set(existing.map((c) => c.canonical_name.trim().toUpperCase()))

  // Optional columns in case schema differs.
  const hasZipCode = await columnExists(sb, "zip_code")
  const hasZipCodes = await columnExists(sb, "zip_codes")
  const hasUnitCount = await columnExists(sb, "unit_count")
  const hasStreetAddress = await columnExists(sb, "street_address")
  const hasLegalName = await columnExists(sb, "legal_name")
  const hasStateEntityNumber = await columnExists(sb, "state_entity_number")
  const hasEntityStatus = await columnExists(sb, "entity_status")
  const hasConfidenceScore = await columnExists(sb, "confidence_score")
  const hasFreshnessDate = await columnExists(sb, "data_freshness_date")

  const grouped = new Map<string, GroupedRow>()
  for (const row of rows) {
    const up = row.subdiv_name.toUpperCase()
    if (EXCLUDED_NAME_FRAGMENTS.some((f) => up.includes(f))) continue
    if (KNOWN_EXISTING_PHASE_FRAGMENTS.some((f) => up.includes(f))) continue

    const baseKey = stripPhaseSuffixes(row.subdiv_name).trim().toUpperCase()
    if (!baseKey) continue
    const existingGroup = grouped.get(baseKey)
    if (!existingGroup) {
      grouped.set(baseKey, {
        primary: row,
        aliases: [row.subdiv_name],
        parcel_count_sum: row.parcel_count,
        best_cordata_confidence: row.cordata_confidence,
      })
      continue
    }
    existingGroup.aliases.push(row.subdiv_name)
    existingGroup.parcel_count_sum += row.parcel_count
    existingGroup.best_cordata_confidence = bestConfidence(
      existingGroup.best_cordata_confidence,
      row.cordata_confidence,
    )
    if (row.parcel_count > existingGroup.primary.parcel_count) {
      existingGroup.primary = row
    }
  }

  const eligible: Array<{
    row: GroupedRow
    canonical_name: string
    slug: string
    is_verified: boolean
  }> = []

  let skipped = 0
  for (const [, row] of grouped) {
    const primary = row.primary
    if (primary.already_in_db) {
      skipped++
      continue
    }
    if (row.parcel_count_sum < minParcels) {
      skipped++
      continue
    }
    if (!ALLOWED_PROPERTY_TYPES.has(primary.primary_property_type.toUpperCase())) {
      skipped++
      continue
    }
    const cordataOk =
      row.best_cordata_confidence === "high" || row.best_cordata_confidence === "medium"
    if (!cordataOk && row.parcel_count_sum < 50) {
      skipped++
      continue
    }

    const canonicalName = cleanCanonicalBaseName(primary.subdiv_name)
    if (!canonicalName || nameSet.has(canonicalName.toUpperCase())) {
      skipped++
      continue
    }

    const slugSource = cleanSlugSource(canonicalName)
    const base = slugify(slugSource)
    let slug = base
    let i = 2
    while (slugSet.has(slug)) {
      slug = `${base}-${i}`
      i++
    }
    slugSet.add(slug)
    nameSet.add(canonicalName.toUpperCase())

    eligible.push({
      row,
      canonical_name: canonicalName,
      slug,
      is_verified: row.best_cordata_confidence === "high",
    })
  }

  const byCity = new Map<string, number>()
  const byType = new Map<string, number>()
  for (const e of eligible) {
    const city = e.row.primary.city || "(unknown)"
    byCity.set(city, (byCity.get(city) ?? 0) + 1)
    byType.set(
      e.row.primary.primary_property_type,
      (byType.get(e.row.primary.primary_property_type) ?? 0) + 1,
    )
  }

  if (!apply && !sqlOutput) {
    process.stderr.write(
      `Dry run\n` +
        `  total_input: ${rows.length}\n` +
        `  total_eligible: ${eligible.length}\n` +
        `  total_skipped: ${skipped}\n` +
        `  sample (up to 10):\n`,
    )
    for (const e of eligible.slice(0, 10)) {
      process.stderr.write(
        `  - ${e.canonical_name} | slug=${e.slug} | city=${e.row.primary.city} | units=${e.row.parcel_count_sum} | cordata=${e.row.best_cordata_confidence || "none"} | aliases=${e.row.aliases.length}\n`,
      )
    }
    process.stderr.write(
      `  by_city: ${JSON.stringify(Object.fromEntries([...byCity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)))}\n` +
        `  by_property_type: ${JSON.stringify(Object.fromEntries([...byType.entries()].sort((a, b) => b[1] - a[1])))}\n`,
    )
    return
  }

  let inserted = 0
  const today = new Date().toISOString().slice(0, 10)
  const sqlRows: Record<string, unknown>[] = []
  for (const e of eligible) {
    const primary = e.row.primary
    const conf = e.row.best_cordata_confidence
    const confidenceScore = conf === "high" ? 90 : conf === "medium" ? 70 : 50
    const entityStatus = conf === "high" || conf === "medium" ? "Active" : "Unverified"
    const p: Record<string, unknown> = {
      canonical_name: e.canonical_name,
      subdivision_names: e.row.aliases.join(", "),
      city: primary.city || null,
      property_type: primary.primary_property_type || null,
      slug: e.slug,
      county: "Palm Beach",
      state: "FL",
      status: "active",
    }

    if (hasZipCode) p.zip_code = primary.zip_code || null
    if (hasZipCodes) p.zip_codes = primary.zip_code ? [primary.zip_code] : null
    if (hasUnitCount) p.unit_count = e.row.parcel_count_sum
    if (hasStreetAddress) p.street_address = primary.sample_address || null
    if (hasLegalName) p.legal_name = primary.cordata_entity_name || null
    if (hasStateEntityNumber) p.state_entity_number = primary.entity_number || null
    if (hasEntityStatus) p.entity_status = entityStatus
    if (hasConfidenceScore) p.confidence_score = confidenceScore
    if (hasFreshnessDate) p.data_freshness_date = today

    if (sqlOutput) {
      sqlRows.push(p)
      continue
    }

    const { error } = await sb.from("communities").insert(p)
    if (error) {
      process.stderr.write(`[error] ${e.canonical_name}: ${error.message}\n`)
      continue
    }
    inserted++
  }

  if (sqlOutput) {
    writeInsertSql(SQL_OUTPUT_PATH, "communities", sqlRows, 100)
    process.stderr.write(
      `SQL output complete\n` +
        `  total_input: ${rows.length}\n` +
        `  total_eligible: ${eligible.length}\n` +
        `  total_skipped: ${skipped}\n` +
        `  sql_rows: ${sqlRows.length}\n` +
        `  file: ${SQL_OUTPUT_PATH}\n` +
        `  by_city: ${JSON.stringify(Object.fromEntries([...byCity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)))}\n` +
        `  by_property_type: ${JSON.stringify(Object.fromEntries([...byType.entries()].sort((a, b) => b[1] - a[1])))}\n`,
    )
    return
  }

  process.stderr.write(
    `Apply complete\n` +
      `  total_input: ${rows.length}\n` +
      `  total_eligible: ${eligible.length}\n` +
      `  total_skipped: ${skipped}\n` +
      `  total_inserted: ${inserted}\n` +
      `  by_city: ${JSON.stringify(Object.fromEntries([...byCity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)))}\n` +
      `  by_property_type: ${JSON.stringify(Object.fromEntries([...byType.entries()].sort((a, b) => b[1] - a[1])))}\n`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

