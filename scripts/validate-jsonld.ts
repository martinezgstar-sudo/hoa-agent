// scripts/validate-jsonld.ts
//
// Manual post-deploy validator. Fetches a handful of canonical URLs,
// extracts every <script type="application/ld+json"> block, parses
// each, and flags missing required fields per schema type.
//
// Run:
//   npx tsx scripts/validate-jsonld.ts
//   npx tsx scripts/validate-jsonld.ts https://staging.hoa-agent.com
//
// Exits 0 on success, 1 if any block fails to parse or fails a required-field
// check. Intended for ad-hoc verification, NOT for the build pipeline.

const DEFAULT_BASE = "https://www.hoa-agent.com"

const TARGETS = [
  "/",
  "/community/briar-bay-community-association-inc",
  "/community/abacoa-property-owners-assembly-inc",
  "/community/mirasol-property-owners-association-inc",
]

interface ParsedBlock {
  raw: string
  parsed: unknown
  error?: string
}

function extractBlocks(html: string): ParsedBlock[] {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  const out: ParsedBlock[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim()
    try {
      out.push({ raw, parsed: JSON.parse(raw) })
    } catch (e) {
      out.push({ raw, parsed: null, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return out
}

/** Required-fields check per schema @type. Returns list of complaints. */
function check(node: any, path = "$"): string[] {
  if (node === null || typeof node !== "object") return []
  // null/empty leakage flag (we filter via stripNulls server-side; this catches regressions)
  const complaints: string[] = []
  for (const [k, v] of Object.entries(node)) {
    if (v === null) complaints.push(`${path}.${k} === null`)
    if (typeof v === "string" && v.trim() === "") complaints.push(`${path}.${k} is empty string`)
  }

  const t = (node as any)["@type"]
  if (t === "BreadcrumbList") {
    if (!Array.isArray(node.itemListElement) || node.itemListElement.length === 0)
      complaints.push(`${path}: BreadcrumbList missing itemListElement`)
  }
  if (t === "Place") {
    if (!node.name) complaints.push(`${path}: Place missing name`)
    if (!node.url) complaints.push(`${path}: Place missing url`)
  }
  if (t === "Organization") {
    if (!node.name) complaints.push(`${path}: Organization missing name`)
  }
  if (t === "FAQPage") {
    if (!Array.isArray(node.mainEntity) || node.mainEntity.length === 0)
      complaints.push(`${path}: FAQPage missing mainEntity`)
  }
  if (t === "AggregateRating") {
    if (node.ratingValue == null) complaints.push(`${path}: AggregateRating missing ratingValue`)
    if (node.reviewCount == null) complaints.push(`${path}: AggregateRating missing reviewCount`)
  }
  if (t === "WebSite") {
    if (!node.url) complaints.push(`${path}: WebSite missing url`)
  }

  // Recurse into nested objects and arrays
  for (const [k, v] of Object.entries(node)) {
    if (Array.isArray(v)) {
      v.forEach((x, i) => complaints.push(...check(x, `${path}.${k}[${i}]`)))
    } else if (v && typeof v === "object") {
      complaints.push(...check(v, `${path}.${k}`))
    }
  }
  return complaints
}

async function fetchHtml(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "User-Agent": "hoa-agent-jsonld-validator/1.0" } })
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`)
  return r.text()
}

async function main() {
  const base = (process.argv[2] || DEFAULT_BASE).replace(/\/$/, "")
  console.log(`Validating JSON-LD against ${base}`)
  let totalBlocks = 0
  let totalComplaints = 0

  for (const path of TARGETS) {
    const url = base + path
    let html = ""
    try {
      html = await fetchHtml(url)
    } catch (e) {
      console.log(`\n=== ${path} ===\nFETCH FAILED: ${e instanceof Error ? e.message : e}`)
      totalComplaints++
      continue
    }
    const blocks = extractBlocks(html)
    console.log(`\n=== ${path} ===`)
    console.log(`  blocks: ${blocks.length}`)
    blocks.forEach((b, i) => {
      if (b.error) {
        console.log(`  block ${i + 1}: PARSE ERROR — ${b.error}`)
        totalComplaints++
        return
      }
      const node: any = b.parsed
      // @graph payload → iterate children; otherwise check the node itself
      const items = Array.isArray(node) ? node : node && Array.isArray(node["@graph"]) ? node["@graph"] : [node]
      console.log(`  block ${i + 1}: ${items.length} item(s) — types: ${items.map((x: any) => x["@type"] || "?").join(", ")}`)
      for (const it of items) {
        const complaints = check(it)
        if (complaints.length > 0) {
          totalComplaints += complaints.length
          for (const c of complaints) console.log(`    ! ${c}`)
        }
      }
    })
    totalBlocks += blocks.length
  }

  console.log("\n────────────────────────────────────────")
  console.log(`Total blocks scanned: ${totalBlocks}`)
  console.log(`Total complaints:     ${totalComplaints}`)
  if (totalComplaints === 0) {
    console.log("PASS — every block parsed and required fields present.")
    process.exit(0)
  } else {
    console.log("FAIL — see complaints above.")
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
