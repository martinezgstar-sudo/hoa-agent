/**
 * Playwright research scraper: validate Palm Beach County subdivision names (HOA signals).
 *
 * SOURCE 1 (Sunbiz) implemented. Additional sources must follow
 * `scripts/lib/research-sources-policy.ts` — no listing sites, MLS aggregators,
 * agent listing pages, Google/open search, or active listing pages.
 *
 * Prerequisite: npx playwright install chromium
 *
 * Run: npx ts-node scripts/research-subdivisions.ts
 *
 * Env:
 *   RESEARCH_INPUT_CSV — default scripts/output/top500_unmatched.csv
 *   RESEARCH_MAX_ROWS — optional cap (e.g. 3 for smoke test)
 *   RESEARCH_HEADLESS — set to "true" to use headless Chromium (default: false, reduces Cloudflare)
 */

import { createObjectCsvWriter } from "csv-writer"
import { parse as parseSync } from "csv-parse/sync"
import { chromium, type Page } from "playwright"
import dotenv from "dotenv"
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs"
import { join } from "path"
import {
  assertUrlAllowedForResearch,
  RESEARCH_SOURCES_POLICY_SUMMARY,
} from "./lib/research-sources-policy"
import {
  absSunbizUrl,
  buildSunbizSearchUrl,
  CHROME_LIKE_UA,
  fetchTextUrl,
  isCloudflareOrBlockedBody,
  parseListRowsFromHtml,
  tryFloridaDosDataCatalogReachable,
  type SunbizListRow,
} from "./lib/sunbiz-http"
import { stripPhaseSuffixes } from "./lib/subdivision-matching"

dotenv.config({ path: join(process.cwd(), ".env.local") })
dotenv.config()

const INPUT_DEFAULT = join(__dirname, "output", "top500_unmatched.csv")
const RESULTS_CSV = join(__dirname, "output", "research_results.csv")
const PROGRESS_JSON = join(__dirname, "output", "research_progress.json")

type InputRow = { subdiv_name: string; parcel_count: number }

type ProgressFile = {
  completedNames: string[]
  lastSavedAt: string
  totalCompleted: number
}

type SunbizDetail = {
  exactName: string
  filingDate: string
  registeredAgent: string
  principalAddress: string
}

type ResearchOutputRow = {
  original_name: string
  parcel_count: number
  is_hoa: string
  clean_name: string
  city: string
  group: string
  sunbiz_status: string
  sunbiz_entity_name: string
  sunbiz_filing_date: string
  registered_agent: string
  management_company: string
  hoa_fee: string
  website: string
  facebook_group: string
  validation_sources: string
  notes: string
}

const CSV_HEADER: { id: keyof ResearchOutputRow; title: string }[] = [
  { id: "original_name", title: "original_name" },
  { id: "parcel_count", title: "parcel_count" },
  { id: "is_hoa", title: "is_hoa" },
  { id: "clean_name", title: "clean_name" },
  { id: "city", title: "city" },
  { id: "group", title: "group" },
  { id: "sunbiz_status", title: "sunbiz_status" },
  { id: "sunbiz_entity_name", title: "sunbiz_entity_name" },
  { id: "sunbiz_filing_date", title: "sunbiz_filing_date" },
  { id: "registered_agent", title: "registered_agent" },
  { id: "management_company", title: "management_company" },
  { id: "hoa_fee", title: "hoa_fee" },
  { id: "website", title: "website" },
  { id: "facebook_group", title: "facebook_group" },
  { id: "validation_sources", title: "validation_sources" },
  { id: "notes", title: "notes" },
]

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function jitter(minMs: number, maxMs: number): Promise<void> {
  await sleep(minMs + Math.random() * (maxMs - minMs))
}

function loadProgress(): Set<string> {
  if (!existsSync(PROGRESS_JSON)) return new Set()
  try {
    const j = JSON.parse(readFileSync(PROGRESS_JSON, "utf8")) as ProgressFile
    return new Set(j.completedNames || [])
  } catch {
    return new Set()
  }
}

function saveProgress(completed: Set<string>, totalCompleted: number) {
  const data: ProgressFile = {
    completedNames: [...completed],
    lastSavedAt: new Date().toISOString(),
    totalCompleted,
  }
  writeFileSync(PROGRESS_JSON, JSON.stringify(data, null, 2), "utf8")
}

function readInput(path: string): InputRow[] {
  if (!existsSync(path)) {
    throw new Error(`Input CSV not found: ${path}`)
  }
  const buf = readFileSync(path, "utf8")
  const records = parseSync(buf, {
    columns: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
    skip_empty_lines: true,
  }) as Record<string, string>[]

  return records.map((row) => ({
    subdiv_name: String(row.subdiv_name ?? row.SUBDIV_NAME ?? "").trim(),
    parcel_count: parseInt(String(row.parcel_count ?? row.PARCEL_COUNT ?? "0").replace(/,/g, ""), 10) || 0,
  })).filter((r) => r.subdiv_name.length > 0)
}

function titleCaseWords(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function isPlatNoHoa(name: string): boolean {
  const u = name.toUpperCase()
  return /\b(FARMS|VACANT|GOVERNMENT|SCHOOL|PARK)\b/.test(u)
}

function hoaKeywordsInText(s: string): boolean {
  return /\b(HOA|HOMEOWNERS?|CONDO(MINIUM)?|ASSOCIATION|PROPERTY\s+OWNERS|P\.?O\.?A\.?)\b/i.test(s)
}

function deriveIsHoa(args: {
  original: string
  sunbizActive: boolean
  sunbizEntityName: string
  anySunbizResult: boolean
  platLike: boolean
}): "yes" | "maybe" | "no" {
  if (args.platLike) return "no"
  const text = `${args.original} ${args.sunbizEntityName}`
  if (args.sunbizActive && hoaKeywordsInText(text)) return "yes"
  if (args.anySunbizResult) return "maybe"
  if (hoaKeywordsInText(args.original)) return "maybe"
  return "no"
}

function flagNotesFromText(blob: string): string[] {
  const flags: string[] = []
  const u = blob.toUpperCase()
  if (/\b(55\+|ACTIVE\s+ADULT|AGE\s*55|OVER\s*55|DEL WEBB|VITALIA)\b/i.test(blob)) flags.push("55+")
  if (/\bGATED\b|\bGATE\s+COMMUNITY\b/i.test(blob)) flags.push("GATED")
  if (/\b(SHORT[\s-]*TERM|AIR\s*BNB|VRBO|NO\s*STR|STR\s*RESTRICT|RENTAL\s*RESTRICT)\b/i.test(blob))
    flags.push("STR-RESTRICTED")
  if (/\bMASTER\s+(HOA|ASSOCIATION|COMMUNITY)\b/i.test(blob) || /\bMASTER\s+ASSOCIATION\b/i.test(u))
    flags.push("MASTER-HOA")
  return flags
}

function isBlockedPage(html: string, title: string): boolean {
  return isCloudflareOrBlockedBody(html, title)
}

async function parseListRows(page: Page): Promise<SunbizListRow[]> {
  const anchors = page.locator('a[href*="SearchResultDetail"]')
  const n = await anchors.count()
  const out: SunbizListRow[] = []
  const seenDoc = new Set<string>()

  for (let i = 0; i < n && out.length < 3; i++) {
    const link = anchors.nth(i)
    const href = await link.getAttribute("href")
    if (!href) continue
    const detailHref = href.startsWith("http") ? href : absSunbizUrl(href)

    const entityName = (await link.innerText()).trim().replace(/\s+/g, " ")
    if (!entityName) continue

    const row = link.locator("xpath=ancestor::tr[1]")
    const cells = await row.locator("td").allInnerTexts().catch(() => [] as string[])
    const parts = cells.map((c) => c.trim()).filter(Boolean)

    let status = ""
    let documentNumber = ""
    let city = ""

    const docMatch = detailHref.match(/documentNumber=([^&]+)/i)
    if (docMatch) documentNumber = decodeURIComponent(docMatch[1]!)

    for (const p of parts) {
      if (/^(Active|Inactive|INACT)/i.test(p)) status = p.split(/\s+/)[0] || p
      if (!documentNumber && /^[A-Z]\d{6}[A-Z0-9-]*$/i.test(p.replace(/\s/g, "")))
        documentNumber = p.replace(/\s/g, "")
    }

    if (!documentNumber) {
      const fromName = entityName.match(/\b([A-Z]\d{6,}[A-Z0-9-]*)\b/i)
      if (fromName) documentNumber = fromName[1]!
    }

    const key = documentNumber || entityName.toLowerCase()
    if (seenDoc.has(key)) continue
    seenDoc.add(key)

    out.push({
      entityName,
      documentNumber: documentNumber || "",
      status: status || "Unknown",
      city,
      detailHref,
    })
  }
  return out
}

function aggregateSunbizStatus(rows: SunbizListRow[]): "Active" | "Inactive" | "Not Found" {
  if (rows.length === 0) return "Not Found"
  const anyActive = rows.some((r) => /^active$/i.test(r.status.trim()))
  if (anyActive) return "Active"
  const anyInactive = rows.some((r) => /inactive|inact/i.test(r.status))
  if (anyInactive) return "Inactive"
  return "Inactive"
}

function pickActiveRow(rows: SunbizListRow[]): SunbizListRow | null {
  const active = rows.find((r) => /^active$/i.test(r.status.trim()))
  return active ?? null
}

function parseDetailBody(body: string): SunbizDetail {
  const exactName =
    body.match(/^\s*Corporate\s+Name\s*\n+\s*([^\n]+)/im)?.[1]?.trim() ||
    body.match(/Entity\s+Name\s*\n+\s*([^\n]+)/im)?.[1]?.trim() ||
    ""

  let filingDate = ""
  const fd1 = body.match(/(?:Filing|Event)\s+Date\s+Filed[^\n]*\n+\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)
  const fd2 = body.match(/\bDate\s+Filed\s*\n+\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)
  const fd3 = body.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/)
  filingDate = (fd1?.[1] || fd2?.[1] || fd3?.[1] || "").trim()

  let registeredAgent = ""
  const ra = body.match(
    /Registered\s+Agent\s+Name\s*(?:&|and)?\s*Address\s*\n+([^\n]+(?:\n[^\n]+){0,4})/i,
  )
  if (ra?.[1]) {
    registeredAgent = ra[1]
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(" — ")
  }

  let principalAddress = ""
  const pa = body.match(/Principal\s+Address\s*\n+([\s\S]{0,400}?)(?:\n\s*Mailing|\n\s*Registered|\n\s*Authorized|$)/i)
  if (pa?.[1]) principalAddress = pa[1].split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 3).join(", ")

  return {
    exactName: exactName || "",
    filingDate,
    registeredAgent: registeredAgent.replace(/\s+/g, " ").trim(),
    principalAddress: principalAddress.replace(/\s+/g, " ").trim(),
  }
}

function cityFromPrincipal(addr: string): string {
  const m = addr.match(/,\s*([A-Za-z][A-Za-z\s]+),\s*FL\b/i)
  return m?.[1]?.trim() || ""
}

type SunbizResearch = {
  blocked: boolean
  error?: string
  listRows: SunbizListRow[]
  status: "Active" | "Inactive" | "Not Found"
  entityName: string
  filingDate: string
  registeredAgent: string
  city: string
  /** How data was loaded */
  channel?: "http" | "playwright"
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function extractTitleFromHtml(html: string): string {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  return (m?.[1] || "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim()
}

function emptyResult(): SunbizResearch {
  return {
    blocked: false,
    listRows: [],
    status: "Not Found",
    entityName: "",
    filingDate: "",
    registeredAgent: "",
    city: "",
  }
}

/**
 * 1) GET search results (no JS) when Cloudflare does not block.
 * 2) If blocked or unparseable, caller falls back to Playwright (non-headless).
 */
async function trySunbizHttpSearch(subdivName: string): Promise<{
  data: SunbizResearch | null
  useBrowser: boolean
}> {
  const url = buildSunbizSearchUrl(subdivName)
  try {
    const { ok, text } = await fetchTextUrl(url, "sunbiz:list:GET")
    const title = extractTitleFromHtml(text)
    if (isCloudflareOrBlockedBody(text, title)) {
      return { data: null, useBrowser: true }
    }
    if (!ok && text.length < 300) {
      return { data: null, useBrowser: true }
    }

    const bodyPlain = htmlToPlainText(text)
    if (
      /no\s+results|did\s+not\s+match|no\s+matching|list\s+of\s+records\s+is\s+empty|0\s+records|no data available|there are no records|does not have any records found/i.test(
        bodyPlain + text,
      )
    ) {
      return { data: { ...emptyResult(), channel: "http" }, useBrowser: false }
    }

    const listRows = parseListRowsFromHtml(text)
    if (listRows.length === 0) {
      return { data: null, useBrowser: true }
    }

    const status = aggregateSunbizStatus(listRows)
    const primary = pickActiveRow(listRows) ?? listRows[0]!
    let entityName = primary.entityName
    let filingDate = ""
    let registeredAgent = ""
    let city = primary.city

    if (pickActiveRow(listRows) && primary.detailHref) {
      await jitter(3000, 7000)
      try {
        assertUrlAllowedForResearch(primary.detailHref, "sunbiz:detail:GET")
        const dRes = await fetchTextUrl(primary.detailHref, "sunbiz:detail:GET")
        const dTitle = extractTitleFromHtml(dRes.text)
        if (isCloudflareOrBlockedBody(dRes.text, dTitle)) {
          return { data: null, useBrowser: true }
        }
        const detailBody = htmlToPlainText(dRes.text) || dRes.text
        const d = parseDetailBody(detailBody)
        if (d.exactName) entityName = d.exactName
        filingDate = d.filingDate
        registeredAgent = d.registeredAgent
        const pc = cityFromPrincipal(d.principalAddress)
        if (pc) city = pc
      } catch {
        /* list-only */
      }
    }

    return {
      data: {
        blocked: false,
        listRows,
        status,
        entityName,
        filingDate,
        registeredAgent,
        city,
        channel: "http",
      },
      useBrowser: false,
    }
  } catch (e) {
    return {
      data: { ...emptyResult(), error: e instanceof Error ? e.message : String(e) },
      useBrowser: true,
    }
  }
}

async function researchSunbizPlaywright(page: Page, subdivName: string): Promise<SunbizResearch> {
  const empty = emptyResult()
  const url = buildSunbizSearchUrl(subdivName)
  try {
    assertUrlAllowedForResearch(url, "sunbiz:list:browser")
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 })
    await jitter(3000, 7000)

    const html = await page.content()
    const title = await page.title()

    if (isBlockedPage(html, title)) {
      return { ...empty, blocked: true, channel: "playwright" }
    }

    const bodyText = await page.innerText("body").catch(() => "")
    if (
      /no\s+results|did\s+not\s+match|no\s+matching|list\s+of\s+records\s+is\s+empty|0\s+records|there are no records|does not have any records found/i.test(
        bodyText + html,
      )
    ) {
      return { ...empty, channel: "playwright" }
    }

    const listRows = await parseListRows(page)
    if (listRows.length === 0) {
      return { ...empty, channel: "playwright" }
    }

    const status = aggregateSunbizStatus(listRows)
    const primary = pickActiveRow(listRows) ?? listRows[0]!
    let entityName = primary.entityName
    let filingDate = ""
    let registeredAgent = ""
    let city = primary.city

    if (pickActiveRow(listRows) && primary.detailHref) {
      await jitter(3000, 7000)
      try {
        assertUrlAllowedForResearch(primary.detailHref, "sunbiz:detail:browser")
        await page.goto(primary.detailHref, { waitUntil: "domcontentloaded", timeout: 60_000 })
        await sleep(2000)
        const dHtml = await page.content()
        const dTitle = await page.title()
        if (isBlockedPage(dHtml, dTitle)) {
          return {
            blocked: true,
            listRows,
            status,
            entityName,
            filingDate: "",
            registeredAgent: "",
            city,
            channel: "playwright",
          }
        }
        const detailBody = await page.innerText("body").catch(() => "")
        const d = parseDetailBody(detailBody)
        if (d.exactName) entityName = d.exactName
        filingDate = d.filingDate
        registeredAgent = d.registeredAgent
        const pc = cityFromPrincipal(d.principalAddress)
        if (pc) city = pc
      } catch {
        /* detail optional */
      }
    }

    return {
      blocked: false,
      listRows,
      status,
      entityName,
      filingDate,
      registeredAgent,
      city,
      channel: "playwright",
    }
  } catch (e) {
    return {
      ...empty,
      error: e instanceof Error ? e.message : String(e),
      channel: "playwright",
    }
  }
}

async function researchSunbiz(page: Page, subdivName: string): Promise<SunbizResearch> {
  const http = await trySunbizHttpSearch(subdivName)
  if (http.data && !http.useBrowser) {
    return http.data
  }
  return researchSunbizPlaywright(page, subdivName)
}

function buildOutputRow(
  row: InputRow,
  sun: SunbizResearch,
): ResearchOutputRow {
  const original = row.subdiv_name
  const platLike = isPlatNoHoa(original)
  const anyResult = sun.listRows.length > 0
  const active = sun.status === "Active"
  const entityForLogic = sun.entityName || sun.listRows[0]?.entityName || ""

  const isHoa = deriveIsHoa({
    original,
    sunbizActive: active,
    sunbizEntityName: entityForLogic,
    anySunbizResult: anyResult,
    platLike,
  })

  const stripped = stripPhaseSuffixes(original)
  const clean_name =
    sun.entityName && active ? titleCaseWords(sun.entityName) : titleCaseWords(stripped.toLowerCase())

  const notesParts: string[] = []
  if (sun.channel) notesParts.push(`sunbiz_channel:${sun.channel}`)
  if (sun.blocked) notesParts.push("SUNBIZ_BLOCKED_OR_CHALLENGE")
  if (sun.error) notesParts.push(`sunbiz_error:${sun.error}`)
  if (!sun.blocked && !sun.error && anyResult) {
    notesParts.push(
      `sunbiz_top3:${sun.listRows.map((r) => `${r.entityName} [${r.status}]`).join(" | ")}`,
    )
  }
  notesParts.push(
    ...flagNotesFromText(`${original} ${sun.entityName} ${sun.registeredAgent} ${JSON.stringify(sun.listRows)}`),
  )
  notesParts.push(
    "pending_sources: PBCPAO, HOA-USA, MyHOA, payment portals, vetted community/management URLs only",
  )

  return {
    original_name: original,
    parcel_count: row.parcel_count,
    is_hoa: isHoa,
    clean_name,
    city: sun.city || "",
    group: "",
    sunbiz_status: sun.blocked ? "Blocked" : sun.error ? "Error" : sun.status,
    sunbiz_entity_name: sun.entityName || (sun.listRows[0]?.entityName ?? ""),
    sunbiz_filing_date: sun.filingDate,
    registered_agent: sun.registeredAgent,
    management_company: "",
    hoa_fee: "",
    website: "",
    facebook_group: "",
    validation_sources: "sunbiz",
    notes: notesParts.filter(Boolean).join("; "),
  }
}

async function appendResultCsv(row: ResearchOutputRow) {
  const fileExists = existsSync(RESULTS_CSV) && statSync(RESULTS_CSV).size > 0
  const writer = createObjectCsvWriter({
    path: RESULTS_CSV,
    append: fileExists,
    header: fileExists ? [] : CSV_HEADER,
  })
  await writer.writeRecords([row])
}

async function main() {
  const inputPath = process.env.RESEARCH_INPUT_CSV?.trim() || INPUT_DEFAULT
  const maxRows = process.env.RESEARCH_MAX_ROWS
    ? parseInt(process.env.RESEARCH_MAX_ROWS, 10)
    : undefined

  mkdirSync(join(__dirname, "output"), { recursive: true })

  const allRows = readInput(inputPath)
  const completed = loadProgress()
  const pending = allRows.filter((r) => !completed.has(r.subdiv_name))
  const toRun = maxRows && Number.isFinite(maxRows) ? pending.slice(0, maxRows) : pending

  process.stderr.write(`${RESEARCH_SOURCES_POLICY_SUMMARY}\n\n`)

  let flDataCatalogOk = false
  try {
    flDataCatalogOk = await tryFloridaDosDataCatalogReachable()
  } catch {
    /* optional */
  }
  process.stderr.write(
    `Florida data.dos CKAN /status: ${flDataCatalogOk ? "reachable (no per-name search API; use HTTP Sunbiz or bulk SFTP for scale)" : "unreachable"}\n\n`,
  )

  process.stderr.write(
    `Input: ${inputPath} (${allRows.length} rows) | resume: ${completed.size} done | ` +
      `this run: ${toRun.length} rows\n`,
  )

  const headless = process.env.RESEARCH_HEADLESS === "true"
  process.stderr.write(
    `Playwright: headless=${headless} (set RESEARCH_HEADLESS=true for servers)\n`,
  )

  const browser = await chromium.launch({
    headless,
    args: ["--disable-blink-features=AutomationControlled"],
  })
  const context = await browser.newContext({
    userAgent: CHROME_LIKE_UA,
    locale: "en-US",
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()

  let processedThisRun = 0
  try {
    for (let i = 0; i < toRun.length; i++) {
      const row = toRun[i]!
      const idx = i + 1

      await jitter(3000, 7000)
      const sun = await researchSunbiz(page, row.subdiv_name)
      const out = buildOutputRow(row, sun)

      await appendResultCsv(out)
      completed.add(row.subdiv_name)
      saveProgress(completed, completed.size)
      processedThisRun++

      process.stderr.write(`[${idx}/${toRun.length}] ${row.subdiv_name.slice(0, 60)}… → ${out.sunbiz_status}\n`)

      if (idx % 10 === 0) {
        process.stderr.write(
          `… progress: ${idx}/${toRun.length} in this run | ${completed.size} total rows in progress file\n`,
        )
      }

      await jitter(3000, 7000)
    }
  } finally {
    saveProgress(completed, completed.size)
    await browser.close()
  }

  process.stderr.write(`Done. Results: ${RESULTS_CSV}\n`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
