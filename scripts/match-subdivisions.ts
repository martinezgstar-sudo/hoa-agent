/**
 * Second-pass subdivision matching for CAMA plat names vs Supabase communities.
 * Run: npx ts-node scripts/match-subdivisions.ts
 *
 * Input (default): scripts/output/unmatched_candidates.csv
 *   columns: subdiv_name, parcel_count
 *
 * Env: UNMATCHED_CSV — override input path
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js"
import { parse as parseSync } from "csv-parse/sync"
import dotenv from "dotenv"
import fastLevenshtein from "fast-levenshtein"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import {
  buildEnhancedMatchMaps,
  communityLabelStrings,
  matchKeyForLevenshtein,
  matchKeyLevel1,
  matchKeyLevel2,
  matchKeyLevel3,
  matchKeyLevel3Sorted,
  type CommunityLabel,
  type IndexedCommunity,
} from "./lib/subdivision-matching"

dotenv.config({ path: join(process.cwd(), ".env.local") })
dotenv.config()

type InputRow = { subdiv_name: string; parcel_count: number }

type Confidence = "high" | "medium" | "low"

type OutputRow = {
  subdiv_name: string
  parcel_count: number
  match_level: string
  matched_community_id: string
  matched_community_name: string
  confidence: Confidence | ""
  notes: string
}

function escCell(v: string | number): string {
  const s = v === null || v === undefined ? "" : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function writeCsv(path: string, headers: string[], rows: Record<string, string | number>[]) {
  const lines = [headers.join(",")]
  for (const r of rows) {
    lines.push(headers.map((h) => escCell(r[h] ?? "")).join(","))
  }
  writeFileSync(path, lines.join("\n"), "utf8")
}

async function fetchCommunities(supabase: SupabaseClient): Promise<CommunityLabel[]> {
  const pageSize = 1000
  const out: CommunityLabel[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from("communities")
      .select("id, canonical_name, subdivision_names, city, slug")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`Supabase: ${error.message}`)
    const batch = (data || []) as CommunityLabel[]
    out.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
  }
  return out
}

function readUnmatchedCsv(filePath: string): InputRow[] {
  if (!existsSync(filePath)) {
    throw new Error(`Input not found: ${filePath}`)
  }
  const buf = readFileSync(filePath, "utf8")
  const records = parseSync(buf, {
    columns: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
    skip_empty_lines: true,
  }) as Record<string, string>[]

  return records.map((row) => {
    const subdiv =
      row.subdiv_name ?? row.SUBDIV_NAME ?? row["Subdiv_Name"] ?? ""
    const pc = row.parcel_count ?? row.PARCEL_COUNT ?? "0"
    return {
      subdiv_name: String(subdiv),
      parcel_count: parseInt(String(pc).replace(/,/g, ""), 10) || 0,
    }
  })
}

function tryLevels(
  subdivName: string,
  maps: ReturnType<typeof buildEnhancedMatchMaps>,
): { level: 1 | 2 | 3; row: IndexedCommunity; note: string } | null {
  const k1 = matchKeyLevel1(subdivName)
  if (k1 && maps.level1.has(k1)) {
    return { level: 1, row: maps.level1.get(k1)!, note: "phase_strip+normalize" }
  }

  const k2 = matchKeyLevel2(subdivName)
  if (k2 && maps.level2.has(k2)) {
    return { level: 2, row: maps.level2.get(k2)!, note: "word_order_independence" }
  }

  const k3 = matchKeyLevel3(subdivName)
  if (k3 && maps.level3.has(k3)) {
    return { level: 3, row: maps.level3.get(k3)!, note: "abbreviation_expansion" }
  }

  const k3s = matchKeyLevel3Sorted(subdivName)
  if (k3s && maps.level3Sorted.has(k3s)) {
    return {
      level: 3,
      row: maps.level3Sorted.get(k3s)!,
      note: "abbreviation_expansion+word_sort",
    }
  }

  return null
}

function confidenceForLevel(level: 1 | 2 | 3): Confidence {
  if (level === 1) return "high"
  if (level === 2) return "medium"
  return "low"
}

type LevHit = { row: IndexedCommunity; distance: number; label: string }

function collectLevenshteinHits(
  subdivName: string,
  communities: CommunityLabel[],
  maxDist: number,
): LevHit[] {
  const keySub = matchKeyForLevenshtein(subdivName)
  if (!keySub) return []

  const hits: LevHit[] = []
  for (const c of communities) {
    for (const label of communityLabelStrings(c)) {
      const keyComm = matchKeyForLevenshtein(label)
      if (!keyComm) continue
      const distance = fastLevenshtein.get(keySub, keyComm)
      if (distance <= maxDist) {
        hits.push({
          row: {
            id: c.id,
            name: (c.canonical_name || "").trim(),
            city: c.city ?? null,
            slug: c.slug ?? null,
          },
          distance,
          label,
        })
      }
    }
  }

  hits.sort((a, b) => a.distance - b.distance || a.row.id.localeCompare(b.row.id))
  const best = hits[0]?.distance ?? 999
  return hits.filter((h) => h.distance === best)
}

function dedupeHitsByCommunity(hits: LevHit[]): LevHit[] {
  const seen = new Set<string>()
  const out: LevHit[] = []
  for (const h of hits) {
    if (seen.has(h.row.id)) continue
    seen.add(h.row.id)
    out.push(h)
  }
  return out
}

async function main() {
  const inputPath =
    process.env.UNMATCHED_CSV?.trim() ||
    join(__dirname, "output", "unmatched_candidates.csv")
  const outDir = join(__dirname, "output")
  mkdirSync(outDir, { recursive: true })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }

  process.stderr.write(`Reading ${inputPath}\n`)
  const candidates = readUnmatchedCsv(inputPath)
  process.stderr.write(`… ${candidates.length.toLocaleString()} rows\n`)

  process.stderr.write("Fetching communities…\n")
  const supabase = createClient(url, key)
  const communities = await fetchCommunities(supabase)
  process.stderr.write(`… ${communities.length.toLocaleString()} communities\n`)

  const maps = buildEnhancedMatchMaps(communities)

  const improved: OutputRow[] = []
  const review: OutputRow[] = []
  const still: { subdiv_name: string; parcel_count: number }[] = []

  for (const row of candidates) {
    const hit = tryLevels(row.subdiv_name, maps)
    if (hit) {
      improved.push({
        subdiv_name: row.subdiv_name,
        parcel_count: row.parcel_count,
        match_level: String(hit.level),
        matched_community_id: hit.row.id,
        matched_community_name: hit.row.name,
        confidence: confidenceForLevel(hit.level),
        notes: hit.note,
      })
      continue
    }

    const levHits = dedupeHitsByCommunity(
      collectLevenshteinHits(row.subdiv_name, communities, 2),
    )
    if (levHits.length > 0) {
      const parts = levHits.map(
        (h) => `${h.row.name} (id=${h.row.id}, d=${h.distance}, key="${matchKeyForLevenshtein(h.label)}")`,
      )
      const single = levHits.length === 1
      review.push({
        subdiv_name: row.subdiv_name,
        parcel_count: row.parcel_count,
        match_level: "possible_match",
        matched_community_id: single ? levHits[0]!.row.id : "",
        matched_community_name: single ? levHits[0]!.row.name : "",
        confidence: "low",
        notes: `Levenshtein<=2 on normalized keys; ${single ? "single best" : "multiple"}: ${parts.join("; ")}`,
      })
      continue
    }

    still.push({ subdiv_name: row.subdiv_name, parcel_count: row.parcel_count })
  }

  const headers = [
    "subdiv_name",
    "parcel_count",
    "match_level",
    "matched_community_id",
    "matched_community_name",
    "confidence",
    "notes",
  ]

  writeCsv(
    join(outDir, "improved_matches.csv"),
    headers,
    improved.map((r) => ({
      subdiv_name: r.subdiv_name,
      parcel_count: r.parcel_count,
      match_level: r.match_level,
      matched_community_id: r.matched_community_id,
      matched_community_name: r.matched_community_name,
      confidence: r.confidence,
      notes: r.notes,
    })),
  )

  writeCsv(
    join(outDir, "needs_review.csv"),
    headers,
    review.map((r) => ({
      subdiv_name: r.subdiv_name,
      parcel_count: r.parcel_count,
      match_level: r.match_level,
      matched_community_id: r.matched_community_id,
      matched_community_name: r.matched_community_name,
      confidence: r.confidence,
      notes: r.notes,
    })),
  )

  writeCsv(join(outDir, "still_unmatched.csv"), ["subdiv_name", "parcel_count"], still)

  process.stderr.write(
    `Wrote improved_matches=${improved.length}, needs_review=${review.length}, still_unmatched=${still.length}\n`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
