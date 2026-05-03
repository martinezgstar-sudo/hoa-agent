import type { Metadata } from "next"
import ArticleLayout from "@/app/components/ArticleLayout"

const SLUG = "/methodology"
const TITLE = "Methodology — How HOA Agent Collects and Verifies Data"
const DESC = "How HOA Agent sources community data, scores news reputation, fetches litigation history, and verifies fees. Full transparency on data sources and processing."
const PUBLISHED = "2026-05-03"

export const metadata: Metadata = {
  title: `${TITLE} | HOA Agent`,
  description: DESC,
  alternates: { canonical: `https://www.hoa-agent.com${SLUG}` },
  openGraph: { title: TITLE, description: DESC, url: `https://www.hoa-agent.com${SLUG}`, type: "article" },
}

export default function Page() {
  return (
    <ArticleLayout
      category="ABOUT" title={TITLE} description={DESC}
      publishedDate={PUBLISHED} slug={SLUG}
      toc={[
        { id: "sources", label: "Data sources" },
        { id: "research-pipeline", label: "Automated research pipeline" },
        { id: "fees", label: "Fee verification" },
        { id: "news", label: "News reputation scoring" },
        { id: "litigation", label: "Litigation data" },
        { id: "verification", label: "Verification and resident submissions" },
        { id: "freshness", label: "Update cadence" },
        { id: "corrections", label: "Corrections" },
      ]}
    >
      <h2 id="sources">Data sources</h2>
      <p>
        HOA Agent aggregates information from public records and resident submissions. Every field on a community profile is attributable to a specific source. Our primary sources:
      </p>
      <ul>
        <li><strong>Florida Division of Corporations (Sunbiz)</strong> — entity status, registered agent, incorporation date, state entity number, principal address.</li>
        <li><strong>Palm Beach County Property Appraiser (PBCPAO)</strong> — parcel records used to confirm subdivision membership, unit counts, and ZIP codes.</li>
        <li><strong>Palm Beach County Clerk of Courts</strong> — civil case records.</li>
        <li><strong>CourtListener</strong> — federal and state court opinions, case dockets, and party lookups.</li>
        <li><strong>NewsAPI &amp; Guardian API</strong> — news article matching.</li>
        <li><strong>Resident submissions</strong> — fees, restrictions, and management info verified through admin review.</li>
      </ul>

      <h2 id="research-pipeline">Automated research pipeline</h2>
      <p>
        We run a 5-tier nightly research pipeline against communities with thin profiles:
      </p>
      <ol>
        <li><strong>Tier 1 — Public records:</strong> Sunbiz cordata files and PBCPAO parcels (auto-approvable government data).</li>
        <li><strong>Tier 2 — Government APIs:</strong> CourtListener for litigation, NewsAPI for news.</li>
        <li><strong>Tier 3 — Web search:</strong> nine targeted search queries per community.</li>
        <li><strong>Tier 4 — Fee databases:</strong> property data sites with HOA fee fields. All findings go to a pending review queue — never auto-approved.</li>
        <li><strong>Tier 5 — Browser automation:</strong> live Florida government sites that block scraping (PBCPAO subdivision search, DBPR licenses).</li>
      </ol>
      <p>
        Auto-approvable fields (entity number, status, registered agent, incorporation date, address, ZIP code, unit count) are written directly to community profiles. Everything else (fees, management, restrictions, web findings) goes to an admin review queue.
      </p>

      <h2 id="fees">Fee verification</h2>
      <p>
        Fee data is the most error-prone field on any HOA listing. Our rules:
      </p>
      <ul>
        <li>All fees are stored as <strong>min, median, and max</strong> values — never a single number.</li>
        <li>All fees are rounded to the nearest <strong>$25</strong> — we never imply false precision.</li>
        <li>Listing-site fees never auto-approve. They go to a pending queue.</li>
        <li>We detect and discard <strong>slider noise</strong> — repeated $100/$200/$300/$400/$500 values that are actually filter UI artifacts, not real fees.</li>
        <li>Resident submissions are verified by admin before they affect the public profile.</li>
        <li>Each fee observation stores its source URL so users can audit the underlying data.</li>
      </ul>

      <h2 id="news">News reputation scoring</h2>
      <p>
        News articles are matched to communities by AI evaluation. For each article we ask Claude:
      </p>
      <ol>
        <li>Does this article specifically mention this community?</li>
        <li>If so, is the coverage positive, neutral, or negative?</li>
        <li>What is the severity (low / medium / high)?</li>
      </ol>
      <p>
        Communities accumulate a 1–10 score based on the volume and severity of matched coverage:
      </p>
      <ul>
        <li><strong>1–3 (High Risk):</strong> significant negative coverage</li>
        <li><strong>4–5 (Under Scrutiny):</strong> some negative coverage</li>
        <li><strong>6–7 (Mixed):</strong> balanced coverage</li>
        <li><strong>8–9 (Good Standing):</strong> only positive coverage</li>
        <li><strong>10 (Excellent):</strong> multiple positive sources</li>
      </ul>
      <p>
        Most communities have no news coverage at all and therefore no score — that is expected and not a problem.
      </p>

      <h2 id="litigation">Litigation data</h2>
      <p>
        Litigation counts come directly from CourtListener, which indexes federal and Florida state court records. We display the case count and link to the underlying case summaries. Cases are matched to communities by party-name AI matching with a confidence threshold; matches below the threshold are not shown.
      </p>

      <h2 id="verification">Verification and resident submissions</h2>
      <p>
        Residents and managers can submit corrections, fees, and restrictions through the public site. All submissions go to an admin review queue before they affect the public profile. We require enough context (e.g. an estoppel reference, a date, a verifiable source) to accept a submission.
      </p>

      <h2 id="freshness">Update cadence</h2>
      <ul>
        <li>News data: daily</li>
        <li>Litigation data: weekly</li>
        <li>Sunbiz entity data: monthly</li>
        <li>Resident submissions: reviewed within 7 days</li>
        <li>News reputation scoring: re-runs whenever new articles are matched</li>
      </ul>

      <h2 id="corrections">Corrections</h2>
      <p>
        See our <a href="/corrections">Corrections</a> page or email <a href="mailto:hello@hoa-agent.com">hello@hoa-agent.com</a> if you find an error. We acknowledge corrections within 7 days.
      </p>
    </ArticleLayout>
  )
}
