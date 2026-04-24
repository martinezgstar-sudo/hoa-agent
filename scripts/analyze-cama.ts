/**
 * Step 1: Palm Beach County subdivision → Supabase communities matching analysis.
 * Run: npx ts-node scripts/analyze-cama.ts
 * (Uses root tsconfig.json `ts-node` overrides for CommonJS.)
 *
 * Optional env:
 *   PBC_DATA_DIR — folder containing county CSVs/PDF (default: /Volumes/LaCie/FL-Palm Beach County Data)
 *   PBC_PROPERTY_CSV, PBC_HOA_LIST_CSV, PBC_HOA_REGISTRY_PDF — override file paths
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js"
import { execFileSync } from "child_process"
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
import {
  buildEnhancedMatchMaps,
  matchKeyLevel1,
  matchKeyLevel2,
  matchKeyLevel3,
  matchKeyLevel3Sorted,
  normalizeFuzzyLegacy,
  splitSubdivisions,
} from "./lib/subdivision-matching"
import type { IndexedCommunity } from "./lib/subdivision-matching"

dotenv.config({ path: join(process.cwd(), ".env.local") })
dotenv.config()

type MatchType = "exact_subdiv" | "exact_name" | "fuzzy" | "none"

type CommunityRow = {
  id: string
  canonical_name: string
  subdivision_names: string | null
  city: string | null
  slug?: string | null
}

type CommunityMatch = { id: string; name: string }

type MatchIndexes = {
  exactSubdiv: Map<string, CommunityMatch>
  exactName: Map<string, CommunityMatch>
  fuzzy: Map<string, CommunityMatch>
  enhanced: ReturnType<typeof buildEnhancedMatchMaps>
}

function indexedToMatch(r: IndexedCommunity): CommunityMatch {
  return { id: r.id, name: r.name }
}

function buildMatchIndexes(communities: CommunityRow[]): MatchIndexes {
  const exactSubdiv = new Map<string, CommunityMatch>()
  const exactName = new Map<string, CommunityMatch>()
  const fuzzy = new Map<string, CommunityMatch>()
  const enhanced = buildEnhancedMatchMaps(communities)

  for (const c of communities) {
    const name = (c.canonical_name || "").trim()
    if (!name) continue
    const m: CommunityMatch = { id: c.id, name }

    for (const part of splitSubdivisions(c.subdivision_names)) {
      const k = part.toLowerCase()
      if (!exactSubdiv.has(k)) exactSubdiv.set(k, m)
    }

    const nk = name.toLowerCase()
    if (!exactName.has(nk)) exactName.set(nk, m)

    const fkName = normalizeFuzzyLegacy(name)
    if (fkName && !fuzzy.has(fkName)) fuzzy.set(fkName, m)

    for (const part of splitSubdivisions(c.subdivision_names)) {
      const fk = normalizeFuzzyLegacy(part)
      if (fk && !fuzzy.has(fk)) fuzzy.set(fk, m)
    }
  }

  return { exactSubdiv, exactName, fuzzy, enhanced }
}

function matchLabel(
  label: string,
  idx: MatchIndexes,
): { match: CommunityMatch | null; matchType: MatchType } {
  const trimmed = label.trim()
  const lower = trimmed.toLowerCase()

  const bySub = idx.exactSubdiv.get(lower)
  if (bySub) return { match: bySub, matchType: "exact_subdiv" }

  const byName = idx.exactName.get(lower)
  if (byName) return { match: byName, matchType: "exact_name" }

  const k1 = matchKeyLevel1(trimmed)
  if (k1 && idx.enhanced.level1.has(k1)) {
    return { match: indexedToMatch(idx.enhanced.level1.get(k1)!), matchType: "fuzzy" }
  }
  const k2 = matchKeyLevel2(trimmed)
  if (k2 && idx.enhanced.level2.has(k2)) {
    return { match: indexedToMatch(idx.enhanced.level2.get(k2)!), matchType: "fuzzy" }
  }
  const k3 = matchKeyLevel3(trimmed)
  if (k3 && idx.enhanced.level3.has(k3)) {
    return { match: indexedToMatch(idx.enhanced.level3.get(k3)!), matchType: "fuzzy" }
  }
  const k3s = matchKeyLevel3Sorted(trimmed)
  if (k3s && idx.enhanced.level3Sorted.has(k3s)) {
    return { match: indexedToMatch(idx.enhanced.level3Sorted.get(k3s)!), matchType: "fuzzy" }
  }

  const fz = normalizeFuzzyLegacy(trimmed)
  if (fz) {
    const byFz = idx.fuzzy.get(fz)
    if (byFz) return { match: byFz, matchType: "fuzzy" }
  }

  return { match: null, matchType: "none" }
}

async function fetchAllCommunities(
  supabase: SupabaseClient,
): Promise<CommunityRow[]> {
  const pageSize = 1000
  const out: CommunityRow[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from("communities")
      .select("id, canonical_name, subdivision_names, city, slug")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw new Error(`Supabase communities: ${error.message}`)
    const batch = data || []
    out.push(...(batch as CommunityRow[]))
    if (batch.length < pageSize) break
    from += pageSize
  }
  return out
}

function countByType(types: MatchType[]): Record<MatchType, number> {
  const acc: Record<MatchType, number> = {
    exact_subdiv: 0,
    exact_name: 0,
    fuzzy: 0,
    none: 0,
  }
  for (const t of types) acc[t]++
  return acc
}

function defaultDataDir(): string {
  const env = process.env.PBC_DATA_DIR?.trim()
  if (env) return env
  return join("/Volumes/LaCie", "FL-Palm Beach County Data")
}

function resolvePaths() {
  const dir = defaultDataDir()
  return {
    propertyCsv:
      process.env.PBC_PROPERTY_CSV?.trim() ||
      join(dir, "Property_Information_Table_-6553152689149400476.csv"),
    hoaListCsv:
      process.env.PBC_HOA_LIST_CSV?.trim() ||
      join(dir, "palm_beach_hoa_list.csv"),
    registryPdf:
      process.env.PBC_HOA_REGISTRY_PDF?.trim() ||
      join(
        dir,
        "Homeowners and Property Owners Associations 2025 - Public_202508131220250121.pdf",
      ),
  }
}

async function streamSubdivParcelCounts(
  propertyCsvPath: string,
): Promise<Map<string, number>> {
  if (!existsSync(propertyCsvPath)) {
    throw new Error(`Property CSV not found: ${propertyCsvPath}`)
  }

  const counts = new Map<string, number>()
  const parser = createReadStream(propertyCsvPath, { encoding: "utf8" }).pipe(
    parse({
      columns: true,
      bom: true,
      relax_quotes: true,
      relax_column_count: true,
      skip_records_with_error: true,
      trim: true,
    }),
  )

  let n = 0
  for await (const row of parser as AsyncIterable<Record<string, string>>) {
    n++
    const raw = row.SUBDIV_NAME ?? row.subdiv_name ?? ""
    const key = typeof raw === "string" ? raw : String(raw)
    counts.set(key, (counts.get(key) ?? 0) + 1)
    if (n % 100_000 === 0) {
      process.stderr.write(`… ${n.toLocaleString()} property rows\r`)
    }
  }
  process.stderr.write(`… done ${n.toLocaleString()} property rows\n`)
  return counts
}

function readPbgHoaRows(
  path: string,
): { associationName: string; cityArea: string; row: Record<string, string> }[] {
  if (!existsSync(path)) {
    throw new Error(`palm_beach_hoa_list.csv not found: ${path}`)
  }
  const buf = readFileSync(path, "utf8")
  const records = parseSync(buf, {
    columns: true,
    bom: true,
    relax_column_count: true,
    trim: true,
    skip_empty_lines: true,
  }) as Record<string, string>[]

  return records.map((row) => {
    const associationName =
      row["Association Name"] ||
      row["association name"] ||
      row["Association name"] ||
      ""
    const cityArea = row["City/Area"] || row["city/area"] || ""
    return { associationName, cityArea, row }
  })
}

function extractPdfHoasViaPython(pdfPath: string): { names: string[]; error?: string } {
  const script = join(__dirname, "extract_pdf_hoas.py")
  if (!existsSync(script)) {
    return { names: [], error: `Missing ${script}` }
  }
  if (!existsSync(pdfPath)) {
    return { names: [], error: `PDF not found: ${pdfPath}` }
  }
  try {
    const out = execFileSync("python3", [script, pdfPath], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
    const parsed = JSON.parse(out) as { names?: string[]; error?: string }
    if (parsed.error && (!parsed.names || parsed.names.length === 0)) {
      return { names: [], error: parsed.error }
    }
    return { names: parsed.names || [] }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { names: [], error: msg }
  }
}

function writeJson(path: string, data: unknown) {
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8")
}

async function main() {
  const paths = resolvePaths()
  const outDir = join(__dirname, "output")
  mkdirSync(outDir, { recursive: true })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (.env.local or env).",
    )
  }
  const supabase = createClient(url, key)

  process.stderr.write("Fetching communities from Supabase…\n")
  const communities = await fetchAllCommunities(supabase)
  process.stderr.write(`… ${communities.length.toLocaleString()} communities\n`)

  const idx = buildMatchIndexes(communities)

  process.stderr.write(`Streaming property CSV:\n  ${paths.propertyCsv}\n`)
  const subdivCounts = await streamSubdivParcelCounts(paths.propertyCsv)

  const subdivRows: {
    subdiv_name: string
    parcel_count: number
    matched_community_id: string | null
    matched_community_name: string | null
    match_type: MatchType
  }[] = []

  for (const [subdivName, parcelCount] of subdivCounts) {
    const { match, matchType } = matchLabel(subdivName, idx)
    subdivRows.push({
      subdiv_name: subdivName,
      parcel_count: parcelCount,
      matched_community_id: match?.id ?? null,
      matched_community_name: match?.name ?? null,
      match_type: matchType,
    })
  }

  subdivRows.sort((a, b) => b.parcel_count - a.parcel_count)

  const totalUnique = subdivRows.length
  const matchedSubdiv = subdivRows.filter((r) => r.match_type !== "none").length
  const unmatchedSubdiv = totalUnique - matchedSubdiv
  const subdivByType = countByType(subdivRows.map((r) => r.match_type))

  const MIN_NEW = 5
  const newCandidates = subdivRows
    .filter((r) => r.match_type === "none" && r.parcel_count >= MIN_NEW)
    .map((r) => ({
      subdiv_name: r.subdiv_name,
      parcel_count: r.parcel_count,
    }))

  process.stderr.write(`Reading Palm Beach Gardens HOA list:\n  ${paths.hoaListCsv}\n`)
  const pbgRows = readPbgHoaRows(paths.hoaListCsv)
  const pbgMatches = pbgRows.map((r) => {
    const { match, matchType } = matchLabel(r.associationName, idx)
    return {
      association_name: r.associationName,
      city_area: r.cityArea,
      matched_community_id: match?.id ?? null,
      matched_community_name: match?.name ?? null,
      match_type: matchType,
    }
  })
  const pbgMatched = pbgMatches.filter((m) => m.match_type !== "none").length

  process.stderr.write(`Extracting HOA names from PDF via Python…\n  ${paths.registryPdf}\n`)
  const pdfResult = extractPdfHoasViaPython(paths.registryPdf)
  if (pdfResult.error) {
    process.stderr.write(`PDF helper: ${pdfResult.error}\n`)
  }
  const pdfMatches = pdfResult.names.map((name) => {
    const { match, matchType } = matchLabel(name, idx)
    return {
      extracted_name: name,
      matched_community_id: match?.id ?? null,
      matched_community_name: match?.name ?? null,
      match_type: matchType,
    }
  })
  const pdfMatched = pdfMatches.filter((m) => m.match_type !== "none").length

  const generatedAt = new Date().toISOString()

  writeJson(join(outDir, "subdiv_analysis.json"), {
    generatedAt,
    note:
      "Communities use canonical_name and subdivision_names (comma-separated). Match order: exact_subdiv → exact_name → fuzzy (phase strip, word-sort, abbrev expansion keys, then legacy token fuzzy).",
    rows: subdivRows,
  })

  writeJson(join(outDir, "match_summary.json"), {
    generatedAt,
    subdivisions: {
      totalUniqueSubdivNames: totalUnique,
      matched: matchedSubdiv,
      unmatched: unmatchedSubdiv,
      matchRatePercent:
        totalUnique === 0 ? 0 : Math.round((matchedSubdiv / totalUnique) * 10_000) / 100,
      byMatchType: subdivByType,
    },
    palm_beach_hoa_list: {
      source: paths.hoaListCsv,
      totalRows: pbgRows.length,
      matched: pbgMatched,
      unmatched: pbgRows.length - pbgMatched,
      matchRatePercent:
        pbgRows.length === 0
          ? 0
          : Math.round((pbgMatched / pbgRows.length) * 10_000) / 100,
      byMatchType: countByType(pbgMatches.map((m) => m.match_type)),
      rows: pbgMatches,
    },
    pdf_registry: {
      source: paths.registryPdf,
      namesExtracted: pdfResult.names.length,
      matched: pdfMatched,
      unmatched: pdfResult.names.length - pdfMatched,
      matchRatePercent:
        pdfResult.names.length === 0
          ? 0
          : Math.round((pdfMatched / pdfResult.names.length) * 10_000) / 100,
      byMatchType: countByType(pdfMatches.map((m) => m.match_type)),
      pythonError: pdfResult.error ?? null,
      rows: pdfMatches,
    },
  })

  writeJson(join(outDir, "new_communities.json"), {
    generatedAt,
    minParcels: MIN_NEW,
    count: newCandidates.length,
    candidates: newCandidates,
  })

  process.stderr.write(
    `Wrote:\n  ${join(outDir, "subdiv_analysis.json")}\n  ${join(outDir, "match_summary.json")}\n  ${join(outDir, "new_communities.json")}\n`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
