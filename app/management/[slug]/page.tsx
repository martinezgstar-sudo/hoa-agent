import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import NavBar from "@/app/components/NavBar"
import { supabase } from "@/lib/supabase"

export const revalidate = 3600

interface Props {
  params: Promise<{ slug: string }>
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80)
}

// Hard block: explicit junk slugs that should always 404, even if a stale
// row briefly slips back in with a placeholder management_company value.
const JUNK_SLUGS = new Set([
  "unknown", "n-a", "none", "null", "self-managed",
])

async function fetchCompanyAndCommunities(slug: string): Promise<{ name: string; communities: Array<Record<string, unknown>> } | null> {
  if (JUNK_SLUGS.has(slug) || slug.startsWith("self-managed")) return null
  // Lookup matches every published row whose slugified management_company == slug
  const all: Array<Record<string, unknown>> = []
  const PAGE = 1000
  let offset = 0
  for (let i = 0; i < 10; i++) {
    const { data, error } = await supabase
      .from("communities")
      .select("id, slug, canonical_name, city, monthly_fee_median, unit_count, property_type, management_company")
      .eq("status", "published")
      .not("management_company", "is", null)
      .range(offset, offset + PAGE - 1)
    if (error || !data || data.length === 0) break
    for (const row of data) {
      if (slugify((row.management_company ?? "") as string) === slug) all.push(row)
    }
    if (data.length < PAGE) break
    offset += PAGE
  }
  if (all.length === 0) return null
  const name = ((all[0].management_company ?? "") as string).trim()
  return { name, communities: all }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const result = await fetchCompanyAndCommunities(slug)
  if (!result) return { title: "Company Not Found — HOA Agent" }
  const { name, communities } = result
  const title = `${name} — HOA Management | HOA Agent`
  const description = `${name} is an HOA management company serving ${communities.length} communities in Palm Beach County, Florida. View the full list of communities they manage.`
  const canonical = `https://www.hoa-agent.com/management/${slug}`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, siteName: "HOA Agent", type: "website" },
  }
}

export default async function ManagementCompanyPage({ params }: Props) {
  const { slug } = await params
  const result = await fetchCompanyAndCommunities(slug)
  if (!result) notFound()
  const { name, communities } = result

  // Sort by city then name
  communities.sort((a, b) => {
    const ca = ((a.city ?? "") as string).localeCompare((b.city ?? "") as string)
    if (ca !== 0) return ca
    return ((a.canonical_name ?? "") as string).localeCompare((b.canonical_name ?? "") as string)
  })

  // Group by city for nicer presentation
  const byCity: Record<string, Array<Record<string, unknown>>> = {}
  for (const c of communities) {
    const city = ((c.city ?? "Unknown") as string)
    if (!byCity[city]) byCity[city] = []
    byCity[city].push(c)
  }

  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name,
    description: `HOA management company serving ${communities.length} communities in Palm Beach County, Florida`,
    areaServed: { "@type": "AdministrativeArea", name: "Palm Beach County, Florida" },
    url: `https://www.hoa-agent.com/management/${slug}`,
  }
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "HOA Agent", item: "https://www.hoa-agent.com" },
      { "@type": "ListItem", position: 2, name: "Management Companies", item: "https://www.hoa-agent.com/management" },
      { "@type": "ListItem", position: 3, name, item: `https://www.hoa-agent.com/management/${slug}` },
    ],
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", backgroundColor: "#f9f9f9", minHeight: "100vh" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <NavBar shareHref="/search" shareLabel="Find my HOA" />

      <div style={{ maxWidth: "780px", margin: "0 auto", padding: "40px 20px 60px" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#1D9E75", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>
          <Link href="/management" style={{ color: "#1D9E75", textDecoration: "none" }}>Management Companies</Link>
          {" › "}{name}
        </div>
        <h1 style={{ fontSize: "32px", fontWeight: 700, color: "#1B2B6B", letterSpacing: "-0.02em", marginBottom: "12px" }}>
          {name}
        </h1>
        <p style={{ fontSize: "14px", color: "#555", lineHeight: 1.7, marginBottom: "32px", maxWidth: "640px" }}>
          {name} manages {communities.length} HOA and condo {communities.length === 1 ? "community" : "communities"} in Palm Beach County, Florida.
        </p>

        {Object.entries(byCity).map(([city, list]) => (
          <div key={city} style={{ marginBottom: "24px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#1B2B6B", marginBottom: "10px" }}>
              {city} ({list.length})
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {list.map((c) => (
                <Link key={c.id as string} href={`/community/${c.slug}`} style={{ textDecoration: "none" }}>
                  <div style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "10px", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 500, color: "#1a1a1a" }}>{c.canonical_name as string}</div>
                      <div style={{ fontSize: "11px", color: "#888" }}>{[c.property_type, c.unit_count ? `${c.unit_count} units` : null].filter(Boolean).join(" · ")}</div>
                    </div>
                    {c.monthly_fee_median ? (
                      <div style={{ fontSize: "13px", color: "#1B2B6B", fontWeight: 600 }}>${c.monthly_fee_median as number}/mo</div>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
