import type { Metadata } from "next"
import ArticleLayout from "@/app/components/ArticleLayout"

const SLUG = "/guides/how-to-evaluate-hoa-before-buying"
const TITLE = "How to Evaluate an HOA Before Buying in Florida"
const DESC = "Ten questions every Florida buyer should answer before closing on a property in an HOA or condo community. How to read litigation history, news scores, and fee trends."
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
        { id: "ten-questions", label: "Ten questions every Florida buyer should ask" },
        { id: "litigation", label: "How to interpret litigation history" },
        { id: "reputation", label: "How to read news reputation scores" },
        { id: "fees", label: "Fee trends and what they mean" },
        { id: "agent-due-diligence", label: "Using HOA Agent for due diligence" },
        { id: "agents", label: "For real estate agents" },
      ]}
      faq={[
        { q: "How much time should I spend on HOA due diligence?", a: "At minimum 2-4 hours: read the CC&Rs, the past 12 months of board meeting minutes, the budget, and the reserve study. For higher-priced or higher-fee communities, more is warranted." },
        { q: "Can I back out if I do not like the HOA documents?", a: "In Florida, most contracts give you a 3-day right to cancel after receiving a complete set of HOA or condo documents. Read them carefully during that window." },
      ]}
    >
      <h2 id="ten-questions">Ten questions every Florida buyer should ask</h2>
      <ol>
        <li><strong>What is the current monthly fee and what does it cover?</strong> Get a line-item breakdown — insurance, reserves, water, landscaping, management, security.</li>
        <li><strong>When was the last special assessment, and what was it for?</strong> A capital improvement assessment can be a positive sign. A repair assessment from under-funded reserves is a warning.</li>
        <li><strong>What does the most recent reserve study say?</strong> Compare recommended balance to actual balance. The gap tells you future special assessment risk.</li>
        <li><strong>Has the master insurance policy had any major claims?</strong> Big past claims drive up future premiums.</li>
        <li><strong>Is there pending litigation?</strong> Check both as plaintiff and defendant.</li>
        <li><strong>What is the rental restriction?</strong> Critical if you plan to rent the unit out, even occasionally.</li>
        <li><strong>What is the pet restriction?</strong> Breed, weight, and number limits matter.</li>
        <li><strong>How active is the board?</strong> Read the past year of meeting minutes — a healthy board addresses issues, a troubled board postpones them.</li>
        <li><strong>Who is the management company?</strong> Larger professional management firms tend to run associations more smoothly than self-managed boards.</li>
        <li><strong>What recent news exists about this community?</strong> Search the community name in Google News, then check our <a href="/search">community profile</a> for our news reputation score.</li>
      </ol>

      <h2 id="litigation">How to interpret litigation history</h2>
      <p>
        Litigation involving an HOA falls into a few categories. Some are normal and expected:
      </p>
      <ul>
        <li><strong>Assessment collection lawsuits</strong> — every association has a few owners who fall behind. A handful per year on a large community is normal.</li>
        <li><strong>Lien foreclosures</strong> — same. Routine collection activity.</li>
      </ul>
      <p>
        Others are warning signs:
      </p>
      <ul>
        <li><strong>Construction defect lawsuits</strong> — the association is suing the developer or contractor over building defects. Often signals expensive repairs ahead, but also signals the board is being proactive.</li>
        <li><strong>Owner vs board lawsuits</strong> — multiple owners suing the board over governance, fines, or denied modifications signals dysfunction.</li>
        <li><strong>Discrimination or fair housing complaints</strong> — major red flag.</li>
        <li><strong>Embezzlement or fraud cases</strong> — disqualifying.</li>
      </ul>
      <p>
        HOA Agent pulls litigation data from CourtListener (federal and state courts). Every community profile shows the litigation count and links to the underlying cases.
      </p>

      <h2 id="reputation">How to read news reputation scores</h2>
      <p>
        HOA Agent assigns each community a 1–10 news reputation score based on AI matching of news articles to the community and scoring sentiment and severity:
      </p>
      <ul>
        <li><strong>1–3 (High Risk)</strong> — significant negative coverage. Lawsuits, fraud, fines, milestone inspection failures, board scandals. Buy with caution.</li>
        <li><strong>4–5 (Under Scrutiny)</strong> — mixed coverage. Some negative items but not at the High Risk level.</li>
        <li><strong>6–7 (Mixed)</strong> — balanced coverage, both positive and negative.</li>
        <li><strong>8–9 (Good Standing)</strong> — only positive coverage found.</li>
        <li><strong>10 (Excellent)</strong> — multiple sources of positive coverage with no negatives.</li>
      </ul>
      <p>
        No score (the most common case) means we have not yet matched any news articles to the community. Absence of news is not a problem — most HOAs are below the news threshold and that is fine.
      </p>

      <h2 id="fees">Fee trends and what they mean</h2>
      <p>
        Look at the past 5 years of fee history if available. Florida HOAs and especially condos have been under enormous fee pressure since 2022 due to:
      </p>
      <ul>
        <li>Insurance premium spikes (often 30–50% per year on condos).</li>
        <li>Reserve catch-up requirements after SB 4-D.</li>
        <li>Inflation in landscaping, security, and management labor.</li>
      </ul>
      <p>
        A 5–10% annual increase is normal. A 50%+ jump in a single year is unusual and worth investigating. A flat fee for 5 years is a warning sign — the association is probably under-funding reserves to keep the fee artificially low.
      </p>

      <h2 id="agent-due-diligence">Using HOA Agent for due diligence</h2>
      <p>
        HOA Agent is a free public database of every HOA and condo community in Palm Beach County. For any community you can:
      </p>
      <ul>
        <li>Search by name, address, or city — try our <a href="/search">search</a>.</li>
        <li>See the current Florida entity status and registration.</li>
        <li>See the management company on file.</li>
        <li>See the litigation count from CourtListener.</li>
        <li>See the news reputation score and underlying articles.</li>
        <li>See resident reviews and comments.</li>
        <li>See verified fee data from residents and listing observations.</li>
      </ul>
      <p>
        Detailed reports with full source citations and fee history are available for $2.99 per community.
      </p>

      <h2 id="agents">For real estate agents</h2>
      <p>
        We&apos;re building agent-specific tools — bulk lookup, client report generation, and CMA-style comparisons. Sign up at <a href="/for-agents">/for-agents</a> to get early access.
      </p>
    </ArticleLayout>
  )
}
