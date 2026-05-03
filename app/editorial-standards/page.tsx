import type { Metadata } from "next"
import ArticleLayout from "@/app/components/ArticleLayout"

const SLUG = "/editorial-standards"
const TITLE = "Editorial Standards — HOA Agent"
const DESC = "How HOA Agent commits to accuracy, source citation, corrections, and verification of resident-submitted information."
const PUBLISHED = "2026-05-03"

export const metadata: Metadata = {
  title: `${TITLE} | HOA Agent`,
  description: DESC,
  alternates: { canonical: `https://www.hoa-agent.com${SLUG}` },
}

export default function Page() {
  return (
    <ArticleLayout
      category="ABOUT" title={TITLE} description={DESC}
      publishedDate={PUBLISHED} slug={SLUG}
    >
      <h2>Our commitment to accuracy</h2>
      <p>
        Every field on a community profile is sourced. We never publish information we cannot attribute to a specific public record, government API, or verified resident submission. When we are uncertain, we say so — &quot;Unverified&quot; or &quot;not on file&quot; is a feature, not a defect.
      </p>

      <h2>Source citation</h2>
      <p>
        Every data point is labeled by source: <em>Sunbiz</em>, <em>PBCPAO</em>, <em>CourtListener</em>, <em>NewsAPI</em>, <em>Resident submission</em>, etc. Premium reports include direct links to the underlying source documents wherever possible.
      </p>

      <h2>What we publish</h2>
      <ul>
        <li>Public records from government sources</li>
        <li>News articles that have been matched to specific communities by AI evaluation</li>
        <li>Court records from CourtListener</li>
        <li>Resident submissions that have been verified by admin review</li>
        <li>Aggregate statistics derived from the above</li>
      </ul>

      <h2>What we do not publish</h2>
      <ul>
        <li>Anonymous accusations without supporting evidence</li>
        <li>Personal contact information of board members or residents</li>
        <li>Allegations from non-public sources we cannot verify</li>
        <li>Speculation about the future financial health of a community</li>
      </ul>

      <h2>Corrections process</h2>
      <p>
        Corrections received via <a href="/contact">contact us</a> or our <a href="/corrections">corrections page</a> are reviewed within 7 days. When we make a material correction, we update the underlying field and (when significant) note the correction in our internal audit trail.
      </p>

      <h2>How resident submissions are verified</h2>
      <p>
        Submissions go to a private admin queue. We accept fees, restrictions, management company info, and other community-specific details that include enough context for verification (e.g. an estoppel reference, a date, a board document title). Submissions without verifiable context are marked &quot;pending&quot; and may be requested to provide more detail.
      </p>

      <h2>Independence</h2>
      <p>
        HOA Agent is not affiliated with any HOA, condo association, management company, real estate brokerage, or government agency. We accept advertising from local businesses (clearly labeled as &quot;Sponsored&quot;) but advertising does not affect editorial decisions.
      </p>
    </ArticleLayout>
  )
}
