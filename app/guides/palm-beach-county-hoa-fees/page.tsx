import type { Metadata } from "next"
import ArticleLayout from "@/app/components/ArticleLayout"
import { supabase } from "@/lib/supabase"

const SLUG = "/guides/palm-beach-county-hoa-fees"
const TITLE = "Palm Beach County HOA Fees — 2026 Guide"
const DESC = "Average HOA and condo fees by city in Palm Beach County, Florida. What drives high fees, how to verify them, and our methodology for sourcing fee data."
const PUBLISHED = "2026-05-03"

export const metadata: Metadata = {
  title: `${TITLE} | HOA Agent`,
  description: DESC,
  alternates: { canonical: `https://www.hoa-agent.com${SLUG}` },
  openGraph: { title: TITLE, description: DESC, url: `https://www.hoa-agent.com${SLUG}`, type: "article" },
}

export const revalidate = 3600

const FOCUS_CITIES = [
  "West Palm Beach", "Boca Raton", "Jupiter", "Palm Beach Gardens",
  "Lake Worth", "Delray Beach", "Boynton Beach", "Royal Palm Beach", "Wellington",
]

async function getCityFeeStats() {
  const out: Array<{ city: string; count: number; avg: number; min: number; max: number }> = []
  for (const city of FOCUS_CITIES) {
    const { data } = await supabase
      .from("communities")
      .select("monthly_fee_min, monthly_fee_max, monthly_fee_median")
      .eq("status", "published")
      .ilike("city", city)
      .not("monthly_fee_median", "is", null)
    const fees = (data || []).map((r) => r.monthly_fee_median ?? r.monthly_fee_min).filter((v): v is number => typeof v === "number" && v > 0)
    if (fees.length >= 3) {
      const minFees = (data || []).map((r) => r.monthly_fee_min).filter((v): v is number => typeof v === "number" && v > 0)
      const maxFees = (data || []).map((r) => r.monthly_fee_max).filter((v): v is number => typeof v === "number" && v > 0)
      out.push({
        city,
        count: fees.length,
        avg: Math.round(fees.reduce((a, b) => a + b, 0) / fees.length),
        min: minFees.length ? Math.min(...minFees) : 0,
        max: maxFees.length ? Math.max(...maxFees) : 0,
      })
    }
  }
  return out
}

export default async function Page() {
  const stats = await getCityFeeStats()
  return (
    <ArticleLayout
      category="GUIDE" title={TITLE} description={DESC}
      publishedDate={PUBLISHED} slug={SLUG}
      toc={[
        { id: "averages", label: "Average HOA fees by city" },
        { id: "drivers", label: "What drives high fees in Palm Beach County" },
        { id: "by-type", label: "Fees by property type" },
        { id: "verify", label: "How to verify a community's fee" },
        { id: "methodology", label: "Methodology" },
      ]}
      faq={[
        { q: "What is the average HOA fee in Palm Beach County?", a: "Across all property types and cities in our database, the average monthly HOA fee is roughly $300-$400. Condos in coastal cities can run $700+. Single-family HOAs in inland cities can be under $150." },
        { q: "Why have Florida HOA fees gone up so much since 2022?", a: "Three reasons: (1) property insurance crisis — master condo policies have multiplied; (2) SB 4-D reserve requirements after the 2021 Surfside collapse; (3) labor and material inflation across landscaping, security, and maintenance." },
      ]}
    >
      <h2 id="averages">Average HOA fees by city</h2>
      <p>
        Below are average monthly HOA and condo fees by city in Palm Beach County, drawn from our live community database. Cities with fewer than three communities reporting fee data are excluded.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "24px" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e5e5e5" }}>
            <th style={{ textAlign: "left", padding: "8px 12px", fontSize: "13px" }}>City</th>
            <th style={{ textAlign: "right", padding: "8px 12px", fontSize: "13px" }}>Communities</th>
            <th style={{ textAlign: "right", padding: "8px 12px", fontSize: "13px" }}>Avg Fee</th>
            <th style={{ textAlign: "right", padding: "8px 12px", fontSize: "13px" }}>Range</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={s.city} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td style={{ padding: "8px 12px", fontSize: "13px" }}><a href={`/city/${s.city.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} style={{ color: "#1B2B6B", fontWeight: 500 }}>{s.city}</a></td>
              <td style={{ textAlign: "right", padding: "8px 12px", fontSize: "13px" }}>{s.count}</td>
              <td style={{ textAlign: "right", padding: "8px 12px", fontSize: "13px", fontWeight: 600 }}>${s.avg}</td>
              <td style={{ textAlign: "right", padding: "8px 12px", fontSize: "13px", color: "#666" }}>${s.min}–${s.max}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        For a deeper analysis with fee distribution charts and the highest- and lowest-fee communities, see the <a href="/reports/hoa-fee-report-2026">2026 Palm Beach County HOA Fee Report</a>.
      </p>

      <h2 id="drivers">What drives high fees in Palm Beach County</h2>
      <ul>
        <li><strong>Coastal master insurance.</strong> Condo buildings within 1,000 feet of the Intracoastal or ocean carry the highest premiums. A 60-unit condo a block from the beach can be paying $400+ per unit per month for insurance alone.</li>
        <li><strong>Amenity packages.</strong> Communities with 24-hour staffed gates, golf courses, equestrian facilities, or full-service clubhouses charge for that overhead.</li>
        <li><strong>Reserve catch-up.</strong> Older condos that previously waived reserves are now funding catch-up assessments under SB 4-D requirements.</li>
        <li><strong>Age and condition.</strong> 1980s-era condos generally need more reserve funding than newer construction.</li>
        <li><strong>Litigation overhead.</strong> Communities in active litigation pay legal fees out of dues.</li>
      </ul>

      <h2 id="by-type">Fees by property type</h2>
      <p>
        Single-family HOAs in Palm Beach County typically range from <strong>$80–$300</strong> per month. Townhome HOAs run <strong>$200–$500</strong>. Condos vary widely by age and location — <strong>$300–$1,500+</strong>. Luxury high-rise condos along the Intracoastal can exceed $2,000 per month.
      </p>

      <h2 id="verify">How to verify a community&apos;s fee</h2>
      <p>
        Listing-site fees are often outdated or wrong. The most reliable sources, in order:
      </p>
      <ol>
        <li><strong>Estoppel certificate.</strong> The official statement from the association — required at closing in Florida.</li>
        <li><strong>Current annual budget.</strong> Shows the dollar amount per unit and what it covers.</li>
        <li><strong>The management company directly.</strong> Call them and ask.</li>
        <li><strong>Resident submissions on HOA Agent.</strong> Verified resident reports tend to be accurate.</li>
        <li><strong>Listing site fees.</strong> Use only as a rough indicator, not as a verified number.</li>
      </ol>

      <h2 id="methodology">Methodology</h2>
      <p>
        HOA Agent collects fee observations from listing sites, resident submissions, public budget filings, and (when available) the Florida Division of Corporations. Every fee is rounded to the nearest $25 and stored as min/median/max so we never imply false precision. Listing-site fees are clearly labeled and require admin approval before they affect a community profile.
      </p>
      <p>
        We exclude any source that produces &quot;slider noise&quot; — repeated round-number values like $100/$200/$300/$400/$500 that are actually filter UI artifacts, not real fees. For full data sourcing details see <a href="/methodology">our methodology page</a>.
      </p>
    </ArticleLayout>
  )
}
