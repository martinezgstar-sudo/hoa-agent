import type { Metadata } from "next"
import Link from "next/link"
import NavBar from "@/app/components/NavBar"
import { supabase } from "@/lib/supabase"

export const revalidate = 3600

export const metadata: Metadata = {
  title: "HOA Management Companies — Palm Beach County Directory | HOA Agent",
  description:
    "Browse Palm Beach County HOA and condo management companies. See which communities each firm manages and contact information for due diligence.",
  alternates: { canonical: "https://www.hoa-agent.com/management" },
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80)
}

export default async function ManagementIndexPage() {
  // Fetch up to 5000 published rows that have a management company; aggregate client-side
  const all: Record<string, number> = {}
  const PAGE = 1000
  for (let offset = 0; offset < 5000; offset += PAGE) {
    const { data } = await supabase
      .from("communities")
      .select("management_company")
      .eq("status", "published")
      .not("management_company", "is", null)
      .range(offset, offset + PAGE - 1)
    if (!data || data.length === 0) break
    for (const r of data) {
      const m = (r.management_company || "").trim()
      if (m) all[m] = (all[m] || 0) + 1
    }
    if (data.length < PAGE) break
  }
  const companies = Object.entries(all)
    .map(([name, count]) => ({ name, slug: slugify(name), count }))
    .filter((c) => c.slug)
    .sort((a, b) => b.count - a.count)

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", backgroundColor: "#f9f9f9", minHeight: "100vh" }}>
      <NavBar shareHref="/search" shareLabel="Find my HOA" />
      <div style={{ maxWidth: "780px", margin: "0 auto", padding: "48px 20px 60px" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#1D9E75", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>
          Palm Beach County Directory
        </div>
        <h1 style={{ fontSize: "32px", fontWeight: 700, color: "#1B2B6B", letterSpacing: "-0.02em", marginBottom: "12px" }}>
          HOA &amp; Condo Management Companies
        </h1>
        <p style={{ fontSize: "14px", color: "#555", lineHeight: 1.7, marginBottom: "32px", maxWidth: "640px" }}>
          {companies.length} management companies serving Palm Beach County HOA and condo associations, ordered by number of communities managed.
          Click any company to see the full list of communities they manage.
        </p>
        {companies.length === 0 ? (
          <div style={{ padding: "24px", textAlign: "center", color: "#888", backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px" }}>
            No management company data yet. <Link href="/search" style={{ color: "#1D9E75" }}>Search communities</Link>.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {companies.slice(0, 200).map((c) => (
              <Link key={c.slug} href={`/management/${c.slug}`} style={{ textDecoration: "none" }}>
                <div style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "10px", padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "14px", fontWeight: 500, color: "#1a1a1a" }}>{c.name}</span>
                  <span style={{ fontSize: "12px", color: "#1D9E75", fontWeight: 600 }}>
                    {c.count} {c.count === 1 ? "community" : "communities"} →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
