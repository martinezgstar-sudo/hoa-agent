/**
 * Direct HTTP fetches to Sunbiz search (avoids headless/Cloudflare when the HTML
 * is returned without a challenge). Florida DOS does not ship a per-name public
 * JSON API; bulk files live on SFTP — we only probe the public data catalog.
 */

import { assertUrlAllowedForResearch } from "./research-sources-policy"

export const CHROME_LIKE_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

export const SUNBIZ_BASE = "https://search.sunbiz.org"

export type SunbizListRow = {
  entityName: string
  documentNumber: string
  status: string
  city: string
  detailHref: string
}

export function absSunbizUrl(href: string): string {
  if (href.startsWith("http")) return href
  if (href.startsWith("/")) return `${SUNBIZ_BASE}${href}`
  return `${SUNBIZ_BASE}/${href.replace(/^\.\//, "")}`
}

export function buildSunbizSearchUrl(searchTerm: string): string {
  const encoded = encodeURIComponent(searchTerm)
  return `${SUNBIZ_BASE}/Inquiry/CorporationSearch/SearchResults?inquiryType=EntityName&searchTerm=${encoded}`
}

export function isCloudflareOrBlockedBody(html: string, title: string): boolean {
  const t = title.toLowerCase()
  const h = html.slice(0, 120_000).toLowerCase()
  if (t.includes("just a moment")) return true
  if (h.includes("challenges.cloudflare.com")) return true
  if (h.includes("cf-chl-")) return true
  if (h.includes("verify you are human")) return true
  if (h.includes("enable javascript and cookies to continue")) return true
  return false
}

/** Extract list rows from search result HTML (no browser). */
export function parseListRowsFromHtml(html: string): SunbizListRow[] {
  const trChunks = html.split(/<tr[^>]*>/i).slice(1)
  const out: SunbizListRow[] = []
  const seen = new Set<string>()

  for (const chunk of trChunks) {
    if (out.length >= 3) break
    if (!/SearchResultDetail/i.test(chunk)) continue

    const hrefM = chunk.match(/href="([^"]*SearchResultDetail[^"]*)"/i)
    if (!hrefM) continue
    const rawHref = hrefM[1]!.replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    const detailHref = absSunbizUrl(rawHref)

    const nameM =
      chunk.match(
        /<a[^>]+href="[^"]*SearchResultDetail[^"]*"[^>]*>([^<]+)<\/a>/i,
      ) || chunk.match(/<a[^>]+>([^<]+)<\/a>\s*<\/td>/i)
    let entityName = (nameM?.[1] || "")
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim()
    if (!entityName) continue

    const rowText = chunk.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ")
    let status = "Unknown"
    const st = rowText.match(/\b(Active|Inactive|INACT[A-Z]*)\b/i)
    if (st) status = st[1] ?? status

    let documentNumber = ""
    const q = detailHref.match(/[?&]documentNumber=([^&]+)/i)
    if (q) documentNumber = decodeURIComponent(q[1]!)

    if (!documentNumber) {
      const d2 = rowText.match(/\b([A-Z]\d{6,}[A-Z0-9-]*)\b/)
      if (d2) documentNumber = d2[1]!
    }

    const key = (documentNumber || entityName).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    out.push({
      entityName,
      documentNumber: documentNumber || "",
      status,
      city: "",
      detailHref,
    })
  }
  return out
}

export async function fetchTextUrl(url: string, context: string): Promise<{
  ok: boolean
  status: number
  text: string
  finalUrl: string
}> {
  assertUrlAllowedForResearch(url, `fetch:${context}`)
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": CHROME_LIKE_UA,
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  })
  const text = await res.text()
  return { ok: res.ok, status: res.status, text, finalUrl: res.url }
}

/**
 * If Florida DOS public data catalog responds, we can later wire bulk/CKAN
 * — there is no official per-name search REST API in the catalog for Sunbiz
 * as of 2024; returns false when not usable for name search.
 */
export async function tryFloridaDosDataCatalogReachable(): Promise<boolean> {
  const urls = [
    "https://data.dos.state.fl.us/api/3/action/status_show",
    "https://data.dos.state.fl.us/api/3/action/site_read",
  ]
  for (const catalogUrl of urls) {
    try {
      assertUrlAllowedForResearch(catalogUrl, "fl:ckan:ping")
      const res = await fetch(catalogUrl, {
        signal: AbortSignal.timeout(12_000),
        headers: { "User-Agent": CHROME_LIKE_UA, Accept: "application/json" },
      })
      if (res.ok) return true
    } catch {
      /* try next */
    }
  }
  return false
}
