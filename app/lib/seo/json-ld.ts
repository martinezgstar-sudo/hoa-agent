// app/lib/seo/json-ld.ts
//
// Reusable JSON-LD builders for HOA Agent. Every builder returns a plain
// object that is then run through `stripNulls` so the output never carries
// null / undefined / empty-string properties — that's the difference
// between schema Google trusts and schema Google flags.
//
// Usage (community page):
//   const graph = [
//     buildBreadcrumbList([{ name: 'HOA Agent', url: SITE }, ...]),
//     buildPlaceSchema(community),
//     buildOrganizationSchema(community),
//     buildFAQPageSchema(faqs),
//     buildAggregateRatingSchema(avg, count),
//   ].filter(Boolean)
//   <script type="application/ld+json" ... __html: jsonLdGraph(graph) />

export const SITE = "https://www.hoa-agent.com"

// ─── Generic stripper ────────────────────────────────────────────────────────

/**
 * Deep-clean an object/array — remove null, undefined, empty strings,
 * empty arrays, and empty plain objects. Arrays preserve order. Non-plain
 * objects (Date, RegExp, etc.) are returned as-is. Top-level returns are
 * always plain.
 */
export function stripNulls<T = unknown>(value: T): T | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string") {
    return (value.trim() === "" ? undefined : value) as unknown as T
  }
  if (Array.isArray(value)) {
    const out = value
      .map((v) => stripNulls(v))
      .filter((v) => v !== undefined)
    return (out.length === 0 ? undefined : out) as unknown as T
  }
  if (typeof value === "object") {
    const src = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(src)) {
      const cleaned = stripNulls(v)
      if (cleaned !== undefined) out[k] = cleaned
    }
    return (Object.keys(out).length === 0 ? undefined : (out as unknown as T))
  }
  return value
}

/** Render an array of schemas as a @graph payload for one <script> tag. */
export function jsonLdGraph(items: Array<unknown>): string {
  const cleaned = items
    .map((it) => stripNulls(it))
    .filter((it) => it !== undefined)
  return JSON.stringify(
    { "@context": "https://schema.org", "@graph": cleaned },
  )
}

// ─── Builders ────────────────────────────────────────────────────────────────

export type Crumb = { name: string; url: string }

export function buildBreadcrumbList(items: Crumb[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  }
}

export function buildWebSiteSchema() {
  return {
    "@type": "WebSite",
    name: "HOA Agent",
    url: SITE,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  }
}

export function buildHoaAgentOrgSchema() {
  return {
    "@type": "Organization",
    "@id": `${SITE}#org`,
    name: "HOA Agent",
    legalName: "HOA Agent LLC",
    url: SITE,
    logo: `${SITE}/logo.png`,
    description: "Palm Beach County HOA research platform",
    foundingDate: "2026-04-20",
    email: "info@hoa-agent.com",
    address: {
      "@type": "PostalAddress",
      addressLocality: "West Palm Beach",
      addressRegion: "FL",
      postalCode: "33411",
      addressCountry: "US",
    },
    sameAs: [] as string[],
  }
}

export interface CommunityLike {
  id?: string
  canonical_name?: string | null
  slug?: string | null
  city?: string | null
  county?: string | null
  state?: string | null
  zip_code?: string | null
  street_address?: string | null
  property_type?: string | null
  unit_count?: number | null
  monthly_fee_min?: number | null
  monthly_fee_max?: number | null
  monthly_fee_median?: number | null
  amenities?: string | null
  management_company?: string | null
  website_url?: string | null
  legal_name?: string | null
  state_entity_number?: string | null
  entity_status?: string | null
  registered_agent?: string | null
  incorporation_date?: string | null
  is_gated?: boolean | null
  is_55_plus?: boolean | null
  is_age_restricted?: boolean | null
  review_avg?: number | null
  review_count?: number | null
  litigation_count?: number | null
  news_reputation_score?: number | null
}

/** Best-effort address object — omits fields that are missing. */
function buildAddress(c: CommunityLike) {
  return {
    "@type": "PostalAddress",
    streetAddress: c.street_address || undefined,
    addressLocality: c.city || undefined,
    addressRegion: c.state || "FL",
    postalCode: c.zip_code || undefined,
    addressCountry: "US",
  }
}

/** Parse amenities free-text into an array of LocationFeatureSpecification. */
function buildAmenityFeatures(c: CommunityLike) {
  const feats: Array<{ "@type": string; name: string; value: boolean | string }> = []
  if (c.is_gated) feats.push({ "@type": "LocationFeatureSpecification", name: "Gated community", value: true })
  if (c.is_55_plus) feats.push({ "@type": "LocationFeatureSpecification", name: "Age-restricted (55+)", value: true })
  else if (c.is_age_restricted) feats.push({ "@type": "LocationFeatureSpecification", name: "Age-restricted", value: true })

  const text = (c.amenities || "").toLowerCase()
  if (text) {
    const KNOWN: Array<{ key: RegExp; label: string }> = [
      { key: /\bpool|swimming pool\b/, label: "Pool" },
      { key: /\bclubhouse|club house\b/, label: "Clubhouse" },
      { key: /\bgym|fitness/, label: "Fitness center" },
      { key: /\btennis\b/, label: "Tennis court" },
      { key: /\bpickleball\b/, label: "Pickleball court" },
      { key: /\bgolf\b/, label: "Golf course" },
      { key: /\bplayground\b/, label: "Playground" },
      { key: /\bdog park\b/, label: "Dog park" },
      { key: /\bwalking trail|nature trail|trails?\b/, label: "Walking trails" },
      { key: /\bspa\b/, label: "Spa" },
      { key: /\bsauna\b/, label: "Sauna" },
      { key: /\bsecurity gate|guard house|guardhouse\b/, label: "Guard house" },
      { key: /\bboat dock|marina\b/, label: "Boat dock / marina" },
      { key: /\bbeach access\b/, label: "Beach access" },
    ]
    for (const { key, label } of KNOWN) {
      if (key.test(text) && !feats.find((f) => f.name === label)) {
        feats.push({ "@type": "LocationFeatureSpecification", name: label, value: true })
      }
    }
  }
  return feats.length > 0 ? feats : undefined
}

/** Generate a short description string from available fields (no nulls leak in). */
function buildPlaceDescription(c: CommunityLike): string {
  const parts: string[] = []
  parts.push(c.canonical_name || "This community")
  const type = (c.property_type || "").trim()
  parts.push(`is a ${type || "residential"} community`)
  if (c.unit_count && c.unit_count > 0) parts.push(`with ${c.unit_count} units`)
  parts.push(`in ${c.city || "Palm Beach County"}, FL`)
  if (c.zip_code) parts[parts.length - 1] += ` ${c.zip_code}`
  return parts.join(" ") + "."
}

/**
 * Place schema for the physical community. Always emit. Address fields
 * gracefully omit when missing — never emits address: null.
 */
export function buildPlaceSchema(c: CommunityLike) {
  if (!c.slug || !c.canonical_name) return undefined
  const url = `${SITE}/community/${c.slug}`
  const place: Record<string, unknown> = {
    "@type": "Place",
    "@id": `${url}#place`,
    name: c.canonical_name,
    url,
    description: buildPlaceDescription(c),
    address: buildAddress(c),
    containedInPlace: {
      "@type": "AdministrativeArea",
      name: "Palm Beach County, Florida",
    },
    amenityFeature: buildAmenityFeatures(c),
  }
  if (c.management_company) {
    place.manager = {
      "@type": "Organization",
      name: c.management_company,
    }
  }
  return place
}

/**
 * Organization schema for the HOA legal entity. Only emit when we have
 * at least one of: legal_name, state_entity_number, or
 * entity_status='Active'. Otherwise we'd be inventing a corporation.
 */
export function buildOrganizationSchema(c: CommunityLike) {
  const hasEntity =
    !!(c.legal_name && c.legal_name.trim()) ||
    !!(c.state_entity_number && c.state_entity_number.trim()) ||
    String(c.entity_status || "").toLowerCase() === "active"
  if (!hasEntity || !c.slug || !c.canonical_name) return undefined

  const url = `${SITE}/community/${c.slug}`
  return {
    "@type": "Organization",
    "@id": `${url}#hoa-org`,
    name: c.legal_name || c.canonical_name,
    legalName: c.legal_name || undefined,
    identifier: c.state_entity_number
      ? {
          "@type": "PropertyValue",
          propertyID: "Florida Entity Number",
          value: c.state_entity_number,
        }
      : undefined,
    foundingDate: c.incorporation_date || undefined,
    description: `Homeowners' association governing ${c.canonical_name} in ${c.city || "Palm Beach County"}, FL.`,
    address: buildAddress(c),
    url,
  }
}

export interface FAQItem { question: string; answer: string }

export function buildFAQPageSchema(faqs: FAQItem[]) {
  const cleaned = (faqs || []).filter((f) => f && f.question && f.answer)
  if (cleaned.length === 0) return undefined
  return {
    "@type": "FAQPage",
    mainEntity: cleaned.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  }
}

export function buildAggregateRatingSchema(
  avg: number | null | undefined,
  count: number | null | undefined,
  itemName?: string,
  community?: CommunityLike,
) {
  const n = Number(count) || 0
  if (n < 1) return undefined
  const a = Number(avg)
  if (!isFinite(a) || a <= 0) return undefined
  // itemReviewed must be a LocalBusiness for Google Rich Results compliance.
  // Place is rejected with "invalid object type for field 'itemReviewed'".
  const itemReviewed = itemName
    ? {
        "@type": "LocalBusiness",
        name: itemName,
        address: community ? buildAddress(community) : undefined,
      }
    : undefined
  return {
    "@type": "AggregateRating",
    itemReviewed,
    ratingValue: Math.round(a * 10) / 10,
    reviewCount: n,
    bestRating: 5,
    worstRating: 1,
  }
}

export interface ReviewLike {
  rating?: number | null
  body?: string | null
  date?: string | null
  author?: string | null
}

export function buildReviewSchema(r: ReviewLike) {
  if (!r || (!r.body && !r.rating)) return undefined
  return {
    "@type": "Review",
    reviewRating: r.rating
      ? { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 }
      : undefined,
    reviewBody: r.body || undefined,
    datePublished: r.date || undefined,
    author: r.author
      ? { "@type": "Person", name: r.author }
      : { "@type": "Person", name: "Resident" },
  }
}

/** Trim a string to maxLen at the last word boundary, no trailing punctuation. */
export function truncate(s: string, maxLen: number): string {
  if (!s || s.length <= maxLen) return s
  const cut = s.slice(0, maxLen)
  const lastSpace = cut.lastIndexOf(" ")
  const safe = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\.,;:\-—\s]+$/, "")
  return safe
}

/**
 * Generate a richer meta description per community. Caps at 158 chars
 * (Google trims ~160). Uses only fields that exist on the row; never
 * outputs "null" or "undefined" string fragments.
 */
export function buildCommunityMetaDescription(c: CommunityLike): string {
  const name = c.canonical_name || "This community"
  const propertyType = (c.property_type || "").trim().toLowerCase() || "community"
  const city = c.city || "Palm Beach County"
  const zip = c.zip_code ? ` ${c.zip_code}` : ""
  const parts: string[] = []
  parts.push(`${name} is a ${propertyType} in ${city}, Florida${zip}.`)
  const min = Number(c.monthly_fee_min) || 0
  const max = Number(c.monthly_fee_max) || 0
  if (min > 0 && max > 0) {
    parts.push(`Monthly HOA fees range from $${Math.round(min)} to $${Math.round(max)}.`)
  } else if (c.monthly_fee_median && c.monthly_fee_median > 0) {
    parts.push(`Median HOA fee about $${Math.round(c.monthly_fee_median)}/mo.`)
  }
  if (c.management_company && c.management_company.trim()) {
    parts.push(`Managed by ${c.management_company}.`)
  }
  if (typeof c.litigation_count === "number" && c.litigation_count > 0) {
    parts.push(`Public litigation history available.`)
  }
  parts.push(`View fees, restrictions, reviews on HOA Agent.`)
  let out = parts.join(" ")
  if (out.length > 158) out = truncate(out, 158)
  return out
}
