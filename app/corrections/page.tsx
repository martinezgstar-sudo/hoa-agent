import type { Metadata } from "next"
import ArticleLayout from "@/app/components/ArticleLayout"

const SLUG = "/corrections"
const TITLE = "Corrections — HOA Agent"
const DESC = "How to report an error on a community profile. We acknowledge corrections within 7 days."
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
      <h2>How to report an error</h2>
      <p>
        Send corrections to <a href="mailto:hello@hoa-agent.com">hello@hoa-agent.com</a> with:
      </p>
      <ul>
        <li>The community name and URL</li>
        <li>The specific field that is incorrect</li>
        <li>The correct value</li>
        <li>A source we can verify (estoppel, board document, government record link)</li>
      </ul>

      <h2>Response time</h2>
      <p>
        We acknowledge every correction within <strong>7 days</strong>. If we accept the correction, we update the public profile and our internal audit trail. If we cannot verify the correction, we will respond explaining what additional source we need.
      </p>

      <h2>Recent corrections</h2>
      <p>
        We publish material corrections in our monthly internal log. Significant corrections affecting public profiles are reflected immediately on the affected community page.
      </p>

      <h2>For HOA representatives and managers</h2>
      <p>
        If you represent a community and want to update its profile in bulk (multiple fields, multiple residents&apos; submissions), claim the community page through our <a href="/search">search</a> &rarr; community page &rarr; &quot;Claim this page&quot; flow.
      </p>
    </ArticleLayout>
  )
}
