import type { Metadata } from "next"
import ArticleLayout from "@/app/components/ArticleLayout"

const SLUG = "/guides/what-is-a-special-assessment"
const TITLE = "What Is a Special Assessment? Florida HOA Guide"
const DESC = "Special assessments explained: when Florida HOAs and condo associations can charge them, how to find out if a community has had any, and how HOA Agent tracks assessment signals."
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
      category="GUIDE" title={TITLE} description={DESC}
      publishedDate={PUBLISHED} slug={SLUG}
      toc={[
        { id: "definition", label: "What a special assessment is" },
        { id: "examples", label: "Common reasons for special assessments in Florida" },
        { id: "law", label: "What Florida law requires" },
        { id: "find-out", label: "How to find out if a community has had assessments" },
        { id: "agent-tracking", label: "How HOA Agent tracks assessment signals" },
        { id: "buyer-protection", label: "Buyer protection — assessments transfer with the property" },
      ]}
      faq={[
        { q: "Can my HOA charge a special assessment without a vote?", a: "It depends on the amount and the association's governing documents. Florida law and most CC&Rs require a membership vote for assessments above a defined threshold. Smaller assessments can usually be approved by board vote alone, but the board still has to provide written notice." },
        { q: "Do special assessments transfer to a new owner?", a: "Unpaid special assessment balances generally transfer with the property at closing. The closing agent will collect the unpaid amount via the estoppel certificate." },
        { q: "Can I deduct a special assessment on my taxes?", a: "Generally no — special assessments are usually not tax-deductible for primary residences. Talk to your tax preparer for your specific situation." },
      ]}
    >
      <h2 id="definition">What a special assessment is</h2>
      <p>
        A <strong>special assessment</strong> is a one-time charge levied by an HOA or condominium association on its members in addition to regular dues. Associations use special assessments to cover expenses that exceed the operating budget and the available reserves — typically major repairs, insurance premium spikes, deductibles after a hurricane, legal judgments, or capital improvements that members have voted to approve.
      </p>
      <p>
        Special assessments are different from regular monthly dues. Dues are the predictable recurring fees you pay every month. Special assessments are unpredictable lump sums that can range from a few hundred dollars to tens of thousands of dollars per unit, depending on the project.
      </p>

      <h2 id="examples">Common reasons for special assessments in Florida</h2>
      <ul>
        <li><strong>Roof replacement</strong> — a single roof replacement on a 60-unit condo building can run $400,000+. If reserves are short, the gap becomes a per-unit assessment.</li>
        <li><strong>Building envelope or concrete restoration</strong> — Florida coastal salt air degrades concrete and balconies. After milestone inspections under SB 4-D, many associations are funding multi-million-dollar restoration projects.</li>
        <li><strong>Hurricane deductibles</strong> — master policy deductibles in Florida are now commonly 5–10% of the building&apos;s insured value. After a major storm, owners are often assessed for the deductible.</li>
        <li><strong>Insurance premium spikes</strong> — when an association cannot cover the increase through the regular budget mid-year, they assess the difference.</li>
        <li><strong>Legal judgments</strong> — losing a major lawsuit or settlement that exceeds insurance coverage.</li>
        <li><strong>Pool, clubhouse, or amenity replacement</strong> — older communities frequently assess for amenity upgrades when reserves were not properly funded.</li>
        <li><strong>Asphalt and paving</strong> — large gated communities with miles of internal roads assess every 8–12 years for repaving.</li>
      </ul>

      <h2 id="law">What Florida law requires</h2>
      <p>
        Florida Statute Chapter 718 (condominiums) and Chapter 720 (HOAs) both require associations to provide written notice before levying a special assessment. The notice must include the purpose of the assessment, the amount, and the payment schedule. For larger assessments, a meeting and a vote of the membership is typically required.
      </p>
      <p>
        Owners must be given the chance to attend the meeting and ask questions. If the assessment is for capital improvements (rather than routine repair or maintenance), a higher voting threshold may apply — often a majority of all eligible voters, not just a majority of those present.
      </p>
      <p>
        The board cannot single you out. Assessments must be levied uniformly based on the formula in the CC&Rs — usually pro rata by unit ownership percentage. For more on Florida HOA law, see our <a href="/florida-hoa-law">Florida HOA Law explainer</a>.
      </p>

      <h2 id="find-out">How to find out if a community has had assessments</h2>
      <ol>
        <li><strong>Read the past 24 months of board meeting minutes.</strong> Special assessments must be discussed and voted on at meetings — they leave a paper trail.</li>
        <li><strong>Compare the budget year-over-year.</strong> A line item labeled &quot;capital improvement&quot; or &quot;reserve replenishment&quot; that is funded by an assessment will be visible in financials.</li>
        <li><strong>Read the seller disclosure.</strong> Sellers in Florida are required to disclose pending or recent special assessments that affect the property.</li>
        <li><strong>Get an estoppel certificate.</strong> The estoppel will show any unpaid balance — including unpaid assessments.</li>
        <li><strong>Check HOA Agent.</strong> We track assessment signals from public records and resident submissions. See the &quot;Special assessment signals&quot; section on every <a href="/search">community page</a>.</li>
      </ol>

      <h2 id="agent-tracking">How HOA Agent tracks assessment signals</h2>
      <p>
        HOA Agent maintains an &quot;assessment signal count&quot; on every community profile. A signal is anything in the public record that suggests an assessment has happened or is pending — news coverage, court filings about assessment collection, board meeting minutes, or resident reports.
      </p>
      <p>
        A high signal count does not necessarily mean assessments are bad — capital improvement assessments can mean the community is well-maintained. But it does mean the community has financial activity that buyers should investigate before closing.
      </p>

      <h2 id="buyer-protection">Buyer protection — assessments transfer with the property</h2>
      <p>
        Unpaid special assessments are typically a lien against the property. They transfer to the new owner at closing unless the seller pays them off. The estoppel certificate prepared by the association before closing will show any outstanding balance — review it carefully.
      </p>
      <p>
        If the association has <em>voted</em> on a future assessment but the payments have not yet started, the obligation may still attach to the property after closing. Always ask: &quot;Has the board approved any future assessments that are not yet payable?&quot; Get the answer in writing before you close.
      </p>
      <p>
        For more buyer protection tips, read our <a href="/guides/how-to-evaluate-hoa-before-buying">guide on evaluating an HOA before buying in Florida</a>.
      </p>
    </ArticleLayout>
  )
}
