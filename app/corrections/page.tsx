import type { Metadata } from "next"
import ArticleLayout from "@/app/components/ArticleLayout"
import ContactForm from "@/app/components/ContactForm"

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
        Use the form below. Include the community name, the field that is wrong,
        the correct value, and a source we can verify (estoppel, board document,
        or government record link).
      </p>
      <div style={{ marginTop: "16px", marginBottom: "24px" }}>
        <ContactForm
          subject="Correction Request"
          fields="correction"
          successMessage="Thank you. We acknowledge all corrections within 7 days."
        />
      </div>

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
