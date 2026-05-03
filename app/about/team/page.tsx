import type { Metadata } from "next"
import ArticleLayout from "@/app/components/ArticleLayout"

const SLUG = "/about/team"
const TITLE = "HOA Agent Editorial Team"
const DESC = "The team and editorial principles behind HOA Agent's Florida HOA intelligence platform."
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
      <h2>Who we are</h2>
      <p>
        HOA Agent is built and maintained by a small editorial and engineering team based in West Palm Beach, Florida. The platform was founded in 2026 by a licensed Florida realtor who got fed up with HOA rules buried in documents that buyers never see until it&apos;s too late.
      </p>

      <h2>What we do</h2>
      <p>
        We aggregate publicly available information about every HOA and condo community in Palm Beach County, attribute every fact to its source, and make the database free to search. Premium reports with full source citations and detailed history are available for $2.99 per community.
      </p>

      <h2>Editorial principles</h2>
      <ul>
        <li>Sourcing first — every field is tied to a public record or verified submission.</li>
        <li>Honest about uncertainty — if we don&apos;t know, we say we don&apos;t know.</li>
        <li>No anonymous accusations — we don&apos;t publish unverifiable allegations.</li>
        <li>Independence — no affiliation with any HOA, manager, brokerage, or agency.</li>
        <li>Corrections within 7 days.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Editorial: <a href="mailto:hello@hoa-agent.com">hello@hoa-agent.com</a><br/>
        Press: <a href="mailto:press@hoa-agent.com">press@hoa-agent.com</a><br/>
        Corrections: <a href="/corrections">/corrections</a>
      </p>
      <p>
        HOA Agent LLC, West Palm Beach, Florida.
      </p>
    </ArticleLayout>
  )
}
