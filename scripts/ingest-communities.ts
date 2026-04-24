/**
 * Ingest new communities from cordata matches into Supabase.
 *
 * Default: dry run (no writes)
 * Apply:   npx ts-node scripts/ingest-communities.ts --apply
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { parse as parseSync } from "csv-parse/sync"
import dotenv from "dotenv"
import { existsSync, readFileSync } from "fs"
import { join } from "path"

dotenv.config({ path: join(process.cwd(), ".env.local") })
dotenv.config()

type CordataMatchRow = {
  subdiv_name: string
  parcel_count: number
  cordata_entity_name: string
  entity_number: string
  entity_type_code: string
  match_level: string
  confidence: "high" | "medium" | "low" | string
  notes: string
}

type ExistingCommunity = {
  id: string
  canonical_name: string
  subdivision_names: string | null
  slug: string | null
}

const INPUT_CSV = join(__dirname, "output", "cordata_matches.csv")

function splitAliases(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(/[,|]/g)
    .map((s) => s.trim())
    .filter(Boolean)
}

function slugify(s: string): string {
  const out = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return out || "community"
}

function confidenceToScore(conf: string): number {
  const c = conf.toLowerCase()
  if (c === "high") return 4
  if (c === "medium") return 3
  return 2
}

function readCordataMatches(path: string): CordataMatchRow[] {
  if (!existsSync(path)) throw new Error(`Input not found: ${path}`)
  const buf = readFileSync(path, "utf8")
  const records = parseSync(buf, {
    columns: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
    skip_empty_lines: true,
  }) as Record<string, string>[]

  return records
    .map((r) => ({
      subdiv_name: String(r.subdiv_name ?? "").trim(),
      parcel_count: parseInt(String(r.parcel_count ?? "0").replace(/,/g, ""), 10) || 0,
      cordata_entity_name: String(r.cordata_entity_name ?? "").trim(),
      entity_number: String(r.entity_number ?? "").trim(),
      entity_type_code: String(r.entity_type_code ?? "").trim(),
      match_level: String(r.match_level ?? "").trim(),
      confidence: String(r.confidence ?? "").trim().toLowerCase(),
      notes: String(r.notes ?? "").trim(),
    }))
    .filter((r) => r.subdiv_name && r.cordata_entity_name)
}

async function fetchAllCommunities(sb: SupabaseClient): Promise<ExistingCommunity[]> {
  const out: ExistingCommunity[] = []
  const pageSize = 1000
  let from = 0
  for (;;) {
    const { data, error } = await sb
      .from("communities")
      .select("id, canonical_name, subdivision_names, slug")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`Fetch communities: ${error.message}`)
    const batch = (data || []) as ExistingCommunity[]
    out.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
  }
  return out
}

async function columnExists(sb: SupabaseClient, col: string): Promise<boolean> {
  const { error } = await sb.from("communities").select(col).limit(1)
  return !error
}

async function main() {
  const apply = process.argv.includes("--apply")

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY).",
    )
  }

  const sb = createClient(url, key)
  const matches = readCordataMatches(INPUT_CSV)
  const existing = await fetchAllCommunities(sb)

  const existingNameSet = new Set<string>()
  const existingSlugSet = new Set<string>()
  for (const c of existing) {
    if (c.canonical_name) existingNameSet.add(c.canonical_name.trim().toUpperCase())
    for (const a of splitAliases(c.subdivision_names)) {
      existingNameSet.add(a.toUpperCase())
    }
    if (c.slug) existingSlugSet.add(c.slug)
  }

  const hasEntityNumber = await columnExists(sb, "entity_number")
  const hasConfidenceScore = await columnExists(sb, "confidence_score")
  const hasMetadata = await columnExists(sb, "metadata")

  const byCanonical = new Map<string, CordataMatchRow[]>()
  for (const m of matches) {
    const k = m.cordata_entity_name.toUpperCase()
    if (!byCanonical.has(k)) byCanonical.set(k, [])
    byCanonical.get(k)!.push(m)
  }

  let skippedExisting = 0
  let prepared = 0
  let inserted = 0

  for (const [canonUpper, rows] of byCanonical) {
    const canonicalName = rows[0]!.cordata_entity_name
    if (existingNameSet.has(canonUpper)) {
      skippedExisting++
      continue
    }

    const aliasSet = new Set<string>()
    for (const r of rows) aliasSet.add(r.subdiv_name)
    const subdivisionNames = [...aliasSet].join(", ")

    // Avoid collisions with existing and this run.
    const baseSlug = slugify(canonicalName)
    let slug = baseSlug
    let suffix = 2
    while (existingSlugSet.has(slug)) {
      slug = `${baseSlug}-${suffix}`
      suffix++
    }
    existingSlugSet.add(slug)

    const bestConfidence =
      rows.find((r) => r.confidence === "high")?.confidence ||
      rows.find((r) => r.confidence === "medium")?.confidence ||
      rows[0]!.confidence
    const bestEntityNumber = rows.find((r) => r.entity_number)?.entity_number || ""
    const bestEntityType = rows.find((r) => r.entity_type_code)?.entity_type_code || ""

    const payload: Record<string, unknown> = {
      canonical_name: canonicalName,
      subdivision_names: subdivisionNames,
      slug,
      county: "Palm Beach",
      state: "FL",
      status: "published",
    }
    if (hasConfidenceScore) payload.confidence_score = confidenceToScore(bestConfidence)
    if (hasEntityNumber && bestEntityNumber) payload.entity_number = bestEntityNumber
    if (hasMetadata) {
      payload.metadata = {
        source: "cordata",
        confidence: bestConfidence,
        entity_number: bestEntityNumber || null,
        entity_type_code: bestEntityType || null,
        matched_subdivisions: [...aliasSet],
      }
    }

    prepared++

    if (!apply) {
      process.stderr.write(
        `[dry-run] insert ${canonicalName}\n` +
          `  slug=${slug}\n` +
          `  subdivision_names=${subdivisionNames}\n` +
          `  confidence=${bestConfidence}, entity_number=${bestEntityNumber || "(none)"}\n`,
      )
      continue
    }

    const { error } = await sb.from("communities").insert(payload)
    if (error) {
      process.stderr.write(`[error] ${canonicalName}: ${error.message}\n`)
      continue
    }
    inserted++
    existingNameSet.add(canonUpper)
    for (const a of aliasSet) existingNameSet.add(a.toUpperCase())
    process.stderr.write(`[inserted] ${canonicalName}\n`)
  }

  process.stderr.write(
    `\nDone (${apply ? "apply" : "dry-run"}):\n` +
      `  input rows: ${matches.length}\n` +
      `  existing communities: ${existing.length}\n` +
      `  skipped_existing: ${skippedExisting}\n` +
      `  prepared_new: ${prepared}\n` +
      `  inserted: ${inserted}\n`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

