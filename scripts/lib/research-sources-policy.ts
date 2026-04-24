/**
 * Allowed vs forbidden research sources for HOA / subdivision validation scrapers.
 *
 * Do NOT use: real estate listing sites (Zillow, Realtor.com, Redfin, Trulia),
 * MLS-connected aggregators (Neighborhoods.com, PalmBeach1, SellingCentralPalmBeach,
 * Movoto, Homes.com), agent/team listing sites, or any property with active listings.
 * Do NOT use open web search (e.g. Google) — results routinely include forbidden domains.
 *
 * Only use: Sunbiz; PBCPAO; management company sites; HOA portals (CommPay, TownSq, AppFolio);
 * official community sites; city/county .gov; HOA directories (HOA-USA, MyHOA).
 */

/** Hostname substrings (after lowercasing, www stripped) — block if any match. */
export const FORBIDDEN_RESEARCH_HOST_SUBSTRINGS = [
  "zillow",
  "realtor.com",
  "redfin",
  "trulia",
  "neighborhoods.com",
  "movoto",
  "homes.com",
  "palmbeach1",
  "sellingcentralpalmbeach",
  "google.com",
  "bing.com",
  "duckduckgo.com",
] as const

const ALLOWED_HOA_DIRECTORY_SUBSTRINGS = ["hoa-usa.com", "myhoa.com"]

const ALLOWED_COUNTY_SUBSTRINGS = ["pbcpao.gov"]

const ALLOWED_PAYMENT_PORTAL_SUBSTRINGS = [
  "commpay",
  "townsq",
  "townsquare",
  "appfolio",
  "payhoa",
]

const ALLOWED_REGISTRY_SUBSTRINGS = [
  "sunbiz.org",
  "dos.fl.gov",
  "data.dos.state.fl", // public data catalog (CKAN), not a listing site
  "sftp.floridados.gov", // official bulk (if used)
]

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "")
}

export function isForbiddenResearchHost(hostname: string): boolean {
  const h = normalizeHost(hostname)
  for (const frag of FORBIDDEN_RESEARCH_HOST_SUBSTRINGS) {
    if (h.includes(frag)) return true
  }
  return false
}

export function isExplicitlyAllowedResearchHost(hostname: string): boolean {
  const h = normalizeHost(hostname)
  if (ALLOWED_REGISTRY_SUBSTRINGS.some((s) => h.includes(s))) return true
  if (ALLOWED_COUNTY_SUBSTRINGS.some((s) => h.includes(s))) return true
  if (ALLOWED_HOA_DIRECTORY_SUBSTRINGS.some((s) => h.includes(s))) return true
  if (ALLOWED_PAYMENT_PORTAL_SUBSTRINGS.some((s) => h.includes(s))) return true
  if (h.endsWith(".gov") || h.endsWith(".fl.us")) return true
  return false
}

export type ResearchUrlContext = string

/**
 * Call before `page.goto`. Always rejects forbidden (listings / search) hosts.
 * Without `allowVettedNonListingSite`, only explicitly allowed hosts pass (Sunbiz, PBCPAO, etc.).
 * Set `allowVettedNonListingSite` only for URLs you know are an official community or
 * management site (still must not match the forbidden substring list).
 */
export function assertUrlAllowedForResearch(
  url: string,
  context: ResearchUrlContext,
  options?: { allowVettedNonListingSite?: boolean },
): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`[${context}] Invalid URL: ${url}`)
  }
  const host = parsed.hostname
  if (isForbiddenResearchHost(host)) {
    throw new Error(`[${context}] Forbidden host (listings / MLS / search policy): ${host}`)
  }
  if (isExplicitlyAllowedResearchHost(host)) return
  if (options?.allowVettedNonListingSite) return
  throw new Error(
    `[${context}] Host not on allowlist — use only Sunbiz, PBCPAO, .gov, HOA-USA/MyHOA, ` +
      `payment portals, or pass allowVettedNonListingSite for a vetted community/management URL (${host}).`,
  )
}

export const RESEARCH_SOURCES_POLICY_SUMMARY = [
  "Research source policy (enforced in assertUrlAllowedForResearch):",
  "  ALLOWED: Sunbiz; pbcpao.gov; *.gov / *.fl.us; HOA-USA; MyHOA; CommPay / TownSq / AppFolio-style portals;",
  "           vetted management + official community sites (not in forbidden list).",
  "  FORBIDDEN: Zillow, Realtor.com, Redfin, Trulia; Neighborhoods.com, PalmBeach1,",
  "             SellingCentralPalmBeach, Movoto, Homes.com; Google/Bing/DuckDuckGo search;",
  "             agent listing / active MLS listing pages.",
].join("\n")
