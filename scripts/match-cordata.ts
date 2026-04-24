/**
 * Match CAMA unmatched subdivisions against Florida DOS cordata files.
 * Run: npx ts-node scripts/match-cordata.ts
 */

import { parse as parseSync } from "csv-parse/sync"
import fastLevenshtein from "fast-levenshtein"
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs"
import * as readline from "readline"
import { join } from "path"
import {
  expandAbbreviations,
  normalizeFuzzyLegacy,
  stripPhaseSuffixes,
} from "./lib/subdivision-matching"

type InputRow = { subdiv_name: string; parcel_count: number }

type SubdivEntry = InputRow & {
  normalized: string
  base_normalized: string
}

type MatchLevel = "exact" | "fuzzy" | "contains"
type Confidence = "high" | "medium" | "low"

type BestMatch = {
  subdiv_name: string
  parcel_count: number
  cordata_entity_name: string
  entity_number: string
  entity_type_code: string
  match_level: MatchLevel
  confidence: Confidence
  notes: string
}

const BASE_DATA_DIR_DEFAULT = join("/Volumes/LaCie", "FL-Palm Beach County Data")
const BASE_DATA_DIR_ALT = "/Volumes/LaCie/FL-Palm Beach County Data "
const INPUT_UNMATCHED = join(__dirname, "output", "unmatched_candidates.csv")
const INPUT_STILL = join(__dirname, "output", "still_unmatched.csv")
const OUTPUT_DIR = join(__dirname, "output")
const OUTPUT_MATCHES = join(OUTPUT_DIR, "cordata_matches.csv")
const OUTPUT_SUMMARY = join(OUTPUT_DIR, "cordata_summary.json")

const HOA_KEYWORDS = [
  "HOMEOWNERS",
  "HOA",
  "PROPERTY OWNERS",
  "CONDOMINIUM",
  "ASSOCIATION",
  "COMMUNITY",
  "CONDO",
  "POA",
  "RESIDENTS",
]

const PROGRESS_EVERY = 500_000
const MIN_CONTAINS_LEN = 8
const GENERIC_BASE_TOKENS = new Set([
  "COMMUNITY",
  "COMMUNITIES",
  "CONDOMINIUM",
  "CONDOMINIUMS",
  "CONDO",
  "CONDOS",
  "ASSOCIATION",
  "ASSOCIATIONS",
  "HOMEOWNERS",
  "HOMEOWNER",
  "RESIDENTS",
  "PROPERTY",
  "OWNERS",
  "POA",
  "HOA",
])
const HOA_RELEVANCE_REGEXES = [
  /\bHOMEOWNERS\b/i,
  /\bPROPERTY\s+OWNERS\b/i,
  /\bRESIDENTS\s+ASSOCIATION\b/i,
  /\bCOMMUNITY\s+ASSOCIATION\b/i,
  /\bCONDOMINIUM\s+ASSOCIATION\b/i,
  /\bASSOCIATION\b/i,
  /\bHOA\b/i,
  /\bPOA\b/i,
]
const UNRELATED_BUSINESS_WORDS = [
  "MORTGAGE",
  "CAPITAL",
  "RECOVERY",
  "BANK",
  "INSURANCE",
  "MEDICAL",
  "CHURCH",
  "SCHOOL",
  "TEMPLE",
  "MINISTRY",
  "CLINIC",
  "LLC",
]

function resolveCordataDir(): string {
  const fromEnv = process.env.CORDATA_DIR?.trim()
  if (fromEnv) return fromEnv

  const candidates = [
    join(BASE_DATA_DIR_DEFAULT, "cordata_extracted"),
    join(BASE_DATA_DIR_ALT, "cordata_extracted"),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return candidates[0]!
}

function escCell(v: string | number): string {
  const s = v === null || v === undefined ? "" : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function writeCsv(path: string, headers: string[], rows: BestMatch[]) {
  const lines = [headers.join(",")]
  for (const r of rows) {
    lines.push(
      headers
        .map((h) => escCell((r as unknown as Record<string, string | number>)[h] ?? ""))
        .join(","),
    )
  }
  writeFileSync(path, lines.join("\n"), "utf8")
}

function readCsvRows(path: string): InputRow[] {
  if (!existsSync(path)) return []
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
    }))
    .filter((r) => r.subdiv_name.length > 0)
}

function normalizeForCordataMatch(name: string): string {
  return normalizeFuzzyLegacy(expandAbbreviations(stripPhaseSuffixes(name)))
}

function baseNameOnly(normalized: string): string {
  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !GENERIC_BASE_TOKENS.has(t))
    .join(" ")
    .trim()
}

function normalizeRawForPhraseContains(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function hasHoaRelevance(name: string): boolean {
  return HOA_RELEVANCE_REGEXES.some((re) => re.test(name))
}

function isUnrelatedEntityName(nameUpper: string): boolean {
  if (UNRELATED_BUSINESS_WORDS.some((w) => nameUpper.includes(w))) return true
  // Heuristic for non-HOA business-style names like "PURITAN ARMS ...", etc.
  if (/^[A-Z][A-Z'\-]+\s+(ARMS|MANOR|ESTATES)\b/.test(nameUpper) && !hasHoaRelevance(nameUpper)) {
    return true
  }
  return false
}

function tokenizeWords(s: string): string[] {
  return s.split(/\s+/).map((x) => x.trim()).filter(Boolean)
}

function fuzzyWordCoverageOk(subBase: string, cordataBase: string): boolean {
  const subWords = tokenizeWords(subBase)
  const corWordsSet = new Set(tokenizeWords(cordataBase))
  if (subWords.length === 0) return false

  const firstWord = subWords[0]!
  if (!corWordsSet.has(firstWord)) return false

  let matched = 0
  for (const w of subWords) {
    if (corWordsSet.has(w)) matched++
  }
  const ratio = matched / subWords.length
  return ratio >= 0.8
}

function hasHoaKeyword(nameUpper: string): boolean {
  return HOA_KEYWORDS.some((k) => nameUpper.includes(k))
}

function extractCordataFields(line: string): {
  entity_type_code: string
  entity_number: string
  cordata_entity_name: string
} {
  const entity_type_code = line.slice(0, 2).trim()
  const entity_number = line.slice(2, 12).replace(/\D/g, "")
  const tail = line.slice(12)
  // Name field ends before the first long blank run in fixed-width export.
  const cordata_entity_name = (tail.split(/\s{2,}/)[0] || "").trim()
  return { entity_type_code, entity_number, cordata_entity_name }
}

function scoreLevel(level: MatchLevel): number {
  if (level === "exact") return 3
  if (level === "fuzzy") return 2
  return 1
}

function shouldReplace(oldMatch: BestMatch, next: BestMatch): boolean {
  const oldScore = scoreLevel(oldMatch.match_level)
  const nextScore = scoreLevel(next.match_level)
  if (nextScore !== oldScore) return nextScore > oldScore
  if (next.parcel_count !== oldMatch.parcel_count) return next.parcel_count > oldMatch.parcel_count
  return next.cordata_entity_name.length < oldMatch.cordata_entity_name.length
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const cordataDir = resolveCordataDir()

  const combined = [...readCsvRows(INPUT_UNMATCHED), ...readCsvRows(INPUT_STILL)]
  const byName = new Map<string, InputRow>()
  for (const row of combined) {
    const k = row.subdiv_name.toUpperCase()
    const existing = byName.get(k)
    if (!existing || row.parcel_count > existing.parcel_count) byName.set(k, row)
  }

  const subdivisions: SubdivEntry[] = [...byName.values()].map((r) => ({
    ...r,
    normalized: normalizeForCordataMatch(r.subdiv_name),
    base_normalized: baseNameOnly(normalizeForCordataMatch(r.subdiv_name)),
  }))

  const exactMap = new Map<string, number[]>()
  const lengthMap = new Map<number, number[]>()
  const tokenMap = new Map<string, number[]>()

  subdivisions.forEach((s, idx) => {
    if (s.normalized) {
      if (!exactMap.has(s.normalized)) exactMap.set(s.normalized, [])
      exactMap.get(s.normalized)!.push(idx)

      const len = s.normalized.length
      if (!lengthMap.has(len)) lengthMap.set(len, [])
      lengthMap.get(len)!.push(idx)

      const tokens = new Set(s.base_normalized.split(/\s+/).filter((t) => t.length >= 4))
      for (const tok of tokens) {
        if (!tokenMap.has(tok)) tokenMap.set(tok, [])
        tokenMap.get(tok)!.push(idx)
      }
    }
  })

  const bestBySubdiv = new Map<string, BestMatch>()
  let linesSeen = 0
  let hoaLinesSeen = 0
  let filesSeen = 0

  for (let i = 0; i < 10; i++) {
    const path = join(cordataDir, `cordata${i}.txt`)
    if (!existsSync(path)) {
      process.stderr.write(`Skipping missing file: ${path}\n`)
      continue
    }
    filesSeen++
    process.stderr.write(`Reading ${path}\n`)

    const rl = readline.createInterface({
      input: createReadStream(path, { encoding: "utf8" }),
      crlfDelay: Infinity,
    })

    for await (const line of rl) {
      linesSeen++
      if (linesSeen % PROGRESS_EVERY === 0) {
        process.stderr.write(
          `… scanned ${linesSeen.toLocaleString()} lines (${hoaLinesSeen.toLocaleString()} HOA-like)\n`,
        )
      }
      if (line.length < 13) continue

      const parsed = extractCordataFields(line)
      const nameUpper = parsed.cordata_entity_name.toUpperCase()
      if (!hasHoaKeyword(nameUpper)) continue
      if (isUnrelatedEntityName(nameUpper)) continue
      hoaLinesSeen++

      const cordataNorm = normalizeForCordataMatch(parsed.cordata_entity_name)
      if (!cordataNorm) continue
      const cordataBase = baseNameOnly(cordataNorm)
      const cordataRawNormalized = normalizeRawForPhraseContains(parsed.cordata_entity_name)

      // 1) Exact normalized match
      const exactHits = exactMap.get(cordataNorm) ?? []
      for (const idx of exactHits) {
        const sub = subdivisions[idx]!
        const candidate: BestMatch = {
          subdiv_name: sub.subdiv_name,
          parcel_count: sub.parcel_count,
          cordata_entity_name: parsed.cordata_entity_name,
          entity_number: parsed.entity_number,
          entity_type_code: parsed.entity_type_code,
          match_level: "exact",
          confidence: "high",
          notes: "exact normalized key",
        }
        const prev = bestBySubdiv.get(sub.subdiv_name)
        if (!prev || shouldReplace(prev, candidate)) bestBySubdiv.set(sub.subdiv_name, candidate)
      }

      // 2) Fuzzy match (<= 2 edit distance) on normalized keys,
      //    with token coverage and first-word constraints.
      const fuzzyCandidateIdx = new Set<number>()
      const len = cordataNorm.length
      for (let l = len - 2; l <= len + 2; l++) {
        if (l < 1) continue
        for (const idx of lengthMap.get(l) ?? []) fuzzyCandidateIdx.add(idx)
      }

      for (const idx of fuzzyCandidateIdx) {
        const sub = subdivisions[idx]!
        if (!sub.normalized) continue
        const dist = fastLevenshtein.get(cordataNorm, sub.normalized)
        if (dist > 2) continue
        if (!fuzzyWordCoverageOk(sub.base_normalized, cordataBase)) continue

        const candidate: BestMatch = {
          subdiv_name: sub.subdiv_name,
          parcel_count: sub.parcel_count,
          cordata_entity_name: parsed.cordata_entity_name,
          entity_number: parsed.entity_number,
          entity_type_code: parsed.entity_type_code,
          match_level: "fuzzy",
          confidence: "medium",
          notes: `levenshtein=${dist}`,
        }
        const prev = bestBySubdiv.get(sub.subdiv_name)
        if (!prev || shouldReplace(prev, candidate)) bestBySubdiv.set(sub.subdiv_name, candidate)
      }

      // 3) Contains (two-pass):
      //    Pass 1: direct phrase contains using subdivision base name within original cordata name.
      //    Pass 2: ratio-based contains on stripped base names.
      const containsCandidateIdx = new Set<number>()
      const cordataTokens = new Set(cordataBase.split(/\s+/).filter((t) => t.length >= 4))
      for (const tok of cordataTokens) {
        for (const idx of tokenMap.get(tok) ?? []) containsCandidateIdx.add(idx)
      }

      for (const idx of containsCandidateIdx) {
        const sub = subdivisions[idx]!
        if (!sub.base_normalized || !cordataBase) {
          continue
        }
        if (sub.base_normalized.length < MIN_CONTAINS_LEN) {
          continue
        }

        const containsConfidenceByLen: Confidence =
          sub.base_normalized.length >= 12
            ? "high"
            : sub.base_normalized.length >= 8
              ? "medium"
              : "low"

        // PASS 1 — direct contains in original (non-boilerplate-stripped) cordata entity text.
        const directRegex = new RegExp(`\\b${escapeRegex(sub.base_normalized)}\\b`, "i")
        const directContains = directRegex.test(cordataRawNormalized)
        if (directContains) {
          if (!hasHoaRelevance(parsed.cordata_entity_name)) continue
          const candidate: BestMatch = {
            subdiv_name: sub.subdiv_name,
            parcel_count: sub.parcel_count,
            cordata_entity_name: parsed.cordata_entity_name,
            entity_number: parsed.entity_number,
            entity_type_code: parsed.entity_type_code,
            match_level: "contains",
            confidence: containsConfidenceByLen,
            notes: `contains pass1 direct; subdiv_base_len=${sub.base_normalized.length}`,
          }
          const prev = bestBySubdiv.get(sub.subdiv_name)
          if (!prev || shouldReplace(prev, candidate)) bestBySubdiv.set(sub.subdiv_name, candidate)
          continue
        }

        // PASS 2 — overlap-ratio contains on normalized base names.
        if (cordataBase.length < MIN_CONTAINS_LEN) continue
        if (!cordataBase.includes(sub.base_normalized) && !sub.base_normalized.includes(cordataBase)) {
          continue
        }
        const shorter = Math.min(sub.base_normalized.length, cordataBase.length)
        const longer = Math.max(sub.base_normalized.length, cordataBase.length)
        const overlapRatio = longer === 0 ? 0 : shorter / longer
        if (overlapRatio < 0.5) continue

        const candidate: BestMatch = {
          subdiv_name: sub.subdiv_name,
          parcel_count: sub.parcel_count,
          cordata_entity_name: parsed.cordata_entity_name,
          entity_number: parsed.entity_number,
          entity_type_code: parsed.entity_type_code,
          match_level: "contains",
          confidence: containsConfidenceByLen,
          notes: `contains pass2 ratio; overlap_ratio=${overlapRatio.toFixed(3)}; subdiv_base_len=${sub.base_normalized.length}`,
        }
        const prev = bestBySubdiv.get(sub.subdiv_name)
        if (!prev || shouldReplace(prev, candidate)) bestBySubdiv.set(sub.subdiv_name, candidate)
      }
    }
  }

  const matches = [...bestBySubdiv.values()].sort(
    (a, b) => b.parcel_count - a.parcel_count || a.subdiv_name.localeCompare(b.subdiv_name),
  )

  const total = subdivisions.length
  const matched = matches.length
  const unmatched = total - matched
  const byMatchLevel = {
    exact: matches.filter((m) => m.match_level === "exact").length,
    fuzzy: matches.filter((m) => m.match_level === "fuzzy").length,
    contains: matches.filter((m) => m.match_level === "contains").length,
  }
  const byConfidence = {
    high: matches.filter((m) => m.confidence === "high").length,
    medium: matches.filter((m) => m.confidence === "medium").length,
    low: matches.filter((m) => m.confidence === "low").length,
  }

  writeCsv(
    OUTPUT_MATCHES,
    [
      "subdiv_name",
      "parcel_count",
      "cordata_entity_name",
      "entity_number",
      "entity_type_code",
      "match_level",
      "confidence",
      "notes",
    ],
    matches,
  )

  const summary = {
    total_subdivisions_checked: total,
    total_matched: matched,
    total_unmatched: unmatched,
    match_rate_pct: total === 0 ? 0 : Math.round((matched / total) * 10_000) / 100,
    by_match_level: byMatchLevel,
    by_confidence: byConfidence,
    cordata_files_seen: filesSeen,
    lines_scanned: linesSeen,
    hoa_lines_scanned: hoaLinesSeen,
  }
  writeFileSync(OUTPUT_SUMMARY, JSON.stringify(summary, null, 2), "utf8")

  process.stderr.write(
    `Done. matched=${matched}/${total} (${summary.match_rate_pct}%)\n` +
      `Wrote ${OUTPUT_MATCHES}\n` +
      `Wrote ${OUTPUT_SUMMARY}\n`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

