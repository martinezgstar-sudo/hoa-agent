import { supabase } from "@/lib/supabase"
import { notFound } from "next/navigation"
import NavBar from "@/app/components/NavBar"
import Link from "next/link"
import type { Metadata } from "next"

export const revalidate = 3600

// Curated city dictionary — must match parent /city/[slug] page
const CITIES: Record<string, string> = {
  "west-palm-beach": "West Palm Beach", "boca-raton": "Boca Raton",
  "jupiter": "Jupiter", "palm-beach-gardens": "Palm Beach Gardens",
  "lake-worth": "Lake Worth", "delray-beach": "Delray Beach",
  "boynton-beach": "Boynton Beach", "royal-palm-beach": "Royal Palm Beach",
  "wellington": "Wellington",
}

// Each filter is described as a series of key/op/value triplets that get
// applied to a PostgrestFilterBuilder via a small dispatcher below.
// Keeps types simple (no PostgrestFilterBuilder generic gymnastics).
type FilterClause =
  | { op: 'ilike'; col: string; val: string }
  | { op: 'not_ilike'; col: string; val: string }
  | { op: 'not_null'; col: string }
  | { op: 'gte'; col: string; val: number }
  | { op: 'lte'; col: string; val: number }
  | { op: 'gt'; col: string; val: number }

type FilterDef = { label: string; intro: string; clauses: FilterClause[] }

const FILTERS: Record<string, FilterDef> = {
  "condos": {
    label: "Condos",
    intro:
      "Condominium communities are governed by Florida Statute Chapter 718. Buyers should expect higher monthly fees than single-family HOAs because the master insurance, building exterior, and structural reserves are bundled into dues.",
    clauses: [{ op: 'ilike', col: 'property_type', val: '%condo%' }],
  },
  "single-family": {
    label: "Single-Family HOA",
    intro:
      "Single-family HOAs typically charge lower monthly fees because owners individually maintain their building and roof. Fees fund shared amenities and common areas, not structural reserves.",
    clauses: [
      { op: 'not_ilike', col: 'property_type', val: '%condo%' },
      { op: 'not_ilike', col: 'property_type', val: '%townhome%' },
    ],
  },
  "townhomes": {
    label: "Townhomes",
    intro:
      "Townhome communities can be governed by either Chapter 718 or Chapter 720 depending on how the property was platted. Read the CC&Rs carefully — your insurance and reserve obligations depend on the structure.",
    clauses: [{ op: 'ilike', col: 'property_type', val: '%townhome%' }],
  },
  "pet-friendly": {
    label: "Pet-Friendly",
    intro:
      "Pet-friendly communities have an explicit pet policy on file that allows residents to keep pets, often with size or breed limits. Always confirm current rules with the management company before closing.",
    clauses: [
      { op: 'not_null', col: 'pet_restriction' },
      { op: 'not_ilike', col: 'pet_restriction', val: '%no pet%' },
    ],
  },
  "affordable": {
    label: "Affordable Fee",
    intro:
      "Communities with monthly HOA fees under $250. Affordable does not necessarily mean under-funded — many single-family HOAs in inland Palm Beach County operate cleanly at low fees because they have minimal amenities and shared infrastructure.",
    clauses: [{ op: 'lte', col: 'monthly_fee_median', val: 250 }],
  },
  "high-fee": {
    label: "Premium",
    intro:
      "Communities with monthly HOA fees above $600. Premium fees typically reflect bundled amenities (golf, tennis, gated security, full-service management) or full coastal master insurance on coastal condos.",
    clauses: [{ op: 'gte', col: 'monthly_fee_median', val: 600 }],
  },
  "with-litigation": {
    label: "With Litigation History",
    intro:
      "Communities where public court records show one or more legal cases. Routine collection lawsuits are common and not a red flag. Construction defect, governance, or owner-vs-board cases warrant deeper diligence.",
    clauses: [{ op: 'gt', col: 'litigation_count', val: 0 }],
  },
  "good-standing": {
    label: "Good Standing",
    intro:
      "Communities with a news reputation score of 8 or higher. These are communities where matched news coverage is positive or neutral with no significant red flags.",
    clauses: [{ op: 'gte', col: 'news_reputation_score', val: 8 }],
  },
}

interface Props {
  params: Promise<{ slug: string; filter: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, filter } = await params
  const city = CITIES[slug]
  const f = FILTERS[filter]
  if (!city || !f) return { title: "Not Found — HOA Agent" }
  const title = `${f.label} HOA Communities in ${city}, FL | HOA Agent`
  const description = `${f.label.toLowerCase()} HOA and condo communities in ${city}, Palm Beach County, Florida. ${f.intro.slice(0, 100)}…`
  const canonical = `https://www.hoa-agent.com/city/${slug}/${filter}`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, siteName: "HOA Agent", type: "website" },
  }
}

export async function generateStaticParams() {
  const out: Array<{ slug: string; filter: string }> = []
  for (const slug of Object.keys(CITIES)) {
    for (const filter of Object.keys(FILTERS)) {
      out.push({ slug, filter })
    }
  }
  return out
}

const SELECT_COLS =
  "id, slug, canonical_name, city, property_type, monthly_fee_min, monthly_fee_max, monthly_fee_median, unit_count, management_company, news_reputation_score, litigation_count"

function richness(c: Record<string, unknown>): number {
  let s = 0
  if (c.management_company) s += 15
  if (c.monthly_fee_median) s += 20
  if (c.unit_count) s += 10
  if (c.news_reputation_score) s += 15
  if (c.litigation_count !== null && c.litigation_count !== undefined) s += 5
  return s
}

export default async function CityFilterPage({ params }: Props) {
  const { slug, filter } = await params
  const city = CITIES[slug]
  const f = FILTERS[filter]
  if (!city || !f) notFound()

  let q = supabase
    .from("communities")
    .select(SELECT_COLS)
    .eq("status", "published")
    .ilike("city", city)
    .limit(200)

  for (const cl of f.clauses) {
    if (cl.op === 'ilike') q = q.ilike(cl.col, cl.val)
    else if (cl.op === 'not_ilike') q = q.not(cl.col, 'ilike', cl.val)
    else if (cl.op === 'not_null') q = q.not(cl.col, 'is', null)
    else if (cl.op === 'gte') q = q.gte(cl.col, cl.val)
    else if (cl.op === 'lte') q = q.lte(cl.col, cl.val)
    else if (cl.op === 'gt') q = q.gt(cl.col, cl.val)
  }
  const { data } = await q
  type Row = Record<string, unknown> & { richness_score: number }
  const rows = (data || []) as unknown as Record<string, unknown>[]
  const list: Row[] = rows
    .map((c) => ({ ...c, richness_score: richness(c) } as Row))
    .sort((a, b) => (b.richness_score - a.richness_score) || ((a.canonical_name as string) ?? "").localeCompare((b.canonical_name as string) ?? ""))

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "HOA Agent", item: "https://www.hoa-agent.com" },
      { "@type": "ListItem", position: 2, name: "Cities", item: "https://www.hoa-agent.com/city" },
      { "@type": "ListItem", position: 3, name: city, item: `https://www.hoa-agent.com/city/${slug}` },
      { "@type": "ListItem", position: 4, name: f.label, item: `https://www.hoa-agent.com/city/${slug}/${filter}` },
    ],
  }
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${f.label} HOA Communities in ${city}, Florida`,
    description: `${f.label} HOA and condo communities in ${city}, Palm Beach County, FL`,
    numberOfItems: list.length,
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", backgroundColor: "#f9f9f9", minHeight: "100vh" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />
      <NavBar shareHref="/search" shareLabel="Find my HOA" />

      <div style={{ maxWidth: "780px", margin: "0 auto", padding: "40px 20px" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#1D9E75", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>
          <Link href="/city" style={{ color: "#1D9E75", textDecoration: "none" }}>Cities</Link>
          {" › "}
          <Link href={`/city/${slug}`} style={{ color: "#1D9E75", textDecoration: "none" }}>{city}</Link>
          {" › "}{f.label}
        </div>
        <h1 style={{ fontSize: "32px", fontWeight: 700, color: "#1B2B6B", marginBottom: "12px", letterSpacing: "-0.02em" }}>
          {f.label} Communities in {city}, FL
        </h1>
        <p style={{ fontSize: "14px", color: "#555", lineHeight: 1.7, marginBottom: "32px", maxWidth: "640px" }}>
          {f.intro} HOA Agent tracks {list.length} {f.label.toLowerCase()} {list.length === 1 ? "community" : "communities"} in {city}.
        </p>

        {list.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", color: "#888" }}>
            No {f.label.toLowerCase()} communities found in {city}. <Link href={`/city/${slug}`} style={{ color: "#1D9E75" }}>← Back to {city}</Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {list.map((c) => (
              <Link key={c.id as string} href={`/community/${c.slug}`} style={{ textDecoration: "none" }}>
                <div style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                  <div>
                    <div style={{ fontSize: "15px", fontWeight: 600, color: "#1a1a1a" }}>{c.canonical_name as string}</div>
                    <div style={{ fontSize: "12px", color: "#888", marginTop: "3px" }}>
                      {[c.property_type, c.management_company].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {c.monthly_fee_median ? (
                      <div style={{ fontSize: "14px", fontWeight: 600, color: "#1B2B6B" }}>${c.monthly_fee_median as number}/mo</div>
                    ) : (
                      <div style={{ fontSize: "12px", color: "#bbb" }}>Fee unknown</div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div style={{ marginTop: "32px", textAlign: "center" }}>
          <Link href={`/city/${slug}`} style={{ fontSize: "13px", color: "#1B2B6B", fontWeight: 600, textDecoration: "none" }}>
            ← Back to all {city} communities
          </Link>
        </div>
      </div>
    </main>
  )
}
