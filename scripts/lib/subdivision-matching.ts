/**
 * Shared subdivision / plat name normalization for CAMA ↔ communities matching.
 */

const STOPWORDS = new Set([
  "PLAT",
  "PH",
  "NO",
  "THE",
  "POA",
  "HOA",
  "CONDO",
  "INC",
  "LLC",
  "ASSOC",
  "ASSOCIATION",
  "PHASE",
])

/** Longest / most specific first to avoid partial trims. */
const PHASE_STRIP_PATTERNS: RegExp[] = [
  /\bIN\s+PB\s+\d+\s+PGS\b/gi,
  /\bAS\s+IN\s+DECL\b/gi,
  /\bDECL\s+FILE\b/gi,
  /\bIN\s+OR\s+\d+\b/gi,
  /\bCOND\s+\d+\s*-\s*\d+\b/gi,
  /\bPL\s+NO\s+\d+\b/gi,
  /\bPL\s+\d+\b/gi,
  /\bPHASE\s+\d+\b/gi,
  /\bPH\s+\d+\b/gi,
  /\bNO\s+\d+\b/gi,
  /\bUNIT\s+\d+\b/gi,
  /\bSECTION\s+\d+\b/gi,
  /\bA\s+THRU\s+[A-Z]\b/gi,
  /\bA\s+B\s+C\s+D\b/gi,
  /\bALL\s+T\b/gi,
  /\bREPLAT\b/gi,
  /\bREPL\b/gi,
  /\s+TR\s+\d+/gi,
  /\s+COND\s+\d+/gi,
  /\s+NO\s+\d+/gi,
  /\s+\d{1,2}$/g,
  /,.*$/g,
]

/** Whole-token / phrase replacements (order: longer phrases first). */
const ABBREV_REPLACERS: { re: RegExp; rep: string }[] = [
  { re: /\bTWNHS\b/gi, rep: "TOWNHOUSES" },
  { re: /\bPUD\b/gi, rep: "PLANNED UNIT DEVELOPMENT" },
  { re: /\bPOA\b/gi, rep: "PROPERTY OWNERS ASSOCIATION" },
  { re: /\bHOA\b/gi, rep: "HOMEOWNERS ASSOCIATION" },
  { re: /\bCOND\b/gi, rep: "CONDOMINIUM" },
  { re: /\bAGR\b/gi, rep: "AGRICULTURAL" },
  { re: /\bREPL\b/gi, rep: "REPLAT" },
]

export function splitSubdivisions(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** Strip plat / phase / declaration suffix tokens (Level 1 grouping). */
export function stripPhaseSuffixes(input: string): string {
  let s = input.toUpperCase().replace(/\s+/g, " ").trim()
  for (let i = 0; i < 12; i++) {
    const before = s
    for (const re of PHASE_STRIP_PATTERNS) {
      s = s.replace(re, " ")
    }
    s = s.replace(/\s+/g, " ").trim()
    if (s === before) break
  }
  return s
}

/** Level 3 — common abbreviation expansion. */
export function expandAbbreviations(input: string): string {
  let s = input
  for (const { re, rep } of ABBREV_REPLACERS) {
    s = s.replace(re, rep)
  }
  return s.replace(/\s+/g, " ").trim()
}

/** Collapse to A–Z / 0–9 tokens for comparison. */
export function normalizeComparable(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Level 2 — sort tokens alphabetically (word-order independence). */
export function sortWordsAlphabetically(normalizedSpaceSeparated: string): string {
  const parts = normalizedSpaceSeparated.split(/\s+/).filter(Boolean)
  parts.sort((a, b) => a.localeCompare(b))
  return parts.join(" ")
}

/** Legacy fuzzy: strip stopwords and digits (used alongside enhanced keys in analyze-cama). */
export function normalizeFuzzyLegacy(input: string): string {
  let s = input.toUpperCase().replace(/\d/g, "")
  s = s.replace(/[^A-Z\s]/g, " ")
  const parts = s
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((tok) => !STOPWORDS.has(tok))
  return parts.join(" ").replace(/\s+/g, " ").trim()
}

/** Level 1 key: strip phase group, normalize. */
export function matchKeyLevel1(raw: string): string {
  return normalizeComparable(stripPhaseSuffixes(raw))
}

/** Level 2 key: strip, normalize, sort words. */
export function matchKeyLevel2(raw: string): string {
  return sortWordsAlphabetically(matchKeyLevel1(raw))
}

/** Level 3a key: expand abbrev, strip, normalize (no sort). */
export function matchKeyLevel3(raw: string): string {
  return normalizeComparable(stripPhaseSuffixes(expandAbbreviations(raw)))
}

/** Level 3b: expand + strip + normalize + sort. */
export function matchKeyLevel3Sorted(raw: string): string {
  return sortWordsAlphabetically(matchKeyLevel3(raw))
}

/** Key used for Levenshtein (Level 4): same as Level 3a for stable edit distance. */
export function matchKeyForLevenshtein(raw: string): string {
  return matchKeyLevel3(raw)
}

export type CommunityLabel = {
  id: string
  canonical_name: string
  subdivision_names: string | null
  city: string | null
  slug?: string | null
}

/** All lookup strings derived from a community row (canonical + aliases). */
export function communityLabelStrings(c: CommunityLabel): string[] {
  const out: string[] = []
  const n = (c.canonical_name || "").trim()
  if (n) out.push(n)
  for (const p of splitSubdivisions(c.subdivision_names)) {
    if (p && !out.some((x) => x.toLowerCase() === p.toLowerCase())) out.push(p)
  }
  return out
}

export type MatchLevel = 1 | 2 | 3 | 4

export type IndexedCommunity = {
  id: string
  name: string
  city: string | null
  slug: string | null
}

/** Build maps: key → community (first insert wins for stable tie-break). */
export function buildEnhancedMatchMaps(communities: CommunityLabel[]): {
  level1: Map<string, IndexedCommunity>
  level2: Map<string, IndexedCommunity>
  level3: Map<string, IndexedCommunity>
  level3Sorted: Map<string, IndexedCommunity>
} {
  const level1 = new Map<string, IndexedCommunity>()
  const level2 = new Map<string, IndexedCommunity>()
  const level3 = new Map<string, IndexedCommunity>()
  const level3Sorted = new Map<string, IndexedCommunity>()

  const add = (map: Map<string, IndexedCommunity>, key: string, row: IndexedCommunity) => {
    if (!key) return
    if (!map.has(key)) map.set(key, row)
  }

  for (const c of communities) {
    const row: IndexedCommunity = {
      id: c.id,
      name: (c.canonical_name || "").trim(),
      city: c.city ?? null,
      slug: c.slug ?? null,
    }
    if (!row.name) continue

    for (const label of communityLabelStrings(c)) {
      add(level1, matchKeyLevel1(label), row)
      add(level2, matchKeyLevel2(label), row)
      add(level3, matchKeyLevel3(label), row)
      add(level3Sorted, matchKeyLevel3Sorted(label), row)
    }
  }

  return { level1, level2, level3, level3Sorted }
}
