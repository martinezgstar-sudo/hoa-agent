import type { Metadata } from "next"
import ArticleLayout from "@/app/components/ArticleLayout"

const SLUG = "/guides/how-to-read-hoa-documents"
const TITLE = "How to Read HOA Documents Before You Buy — Florida Guide"
const DESC = "A practical, step-by-step guide to the CC&Rs, budget, reserve study, meeting minutes, and rules every Florida HOA and condo buyer should request before closing."
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
        { id: "what-you-can-request", label: "What documents you are entitled to request" },
        { id: "ccr", label: "How to read the CC&Rs" },
        { id: "budget", label: "How to read the annual budget" },
        { id: "reserves", label: "Reserves and reserve studies" },
        { id: "minutes", label: "Why you should read board meeting minutes" },
        { id: "red-flags", label: "Red flags that should change your offer" },
        { id: "florida-law", label: "What Florida law requires" },
      ]}
      faq={[
        { q: "How long do I have to review HOA documents in Florida?", a: "Florida law gives buyers a three-day right to cancel after receiving a complete set of HOA or condo documents under most contracts. The clock does not start until the seller delivers the documents." },
        { q: "Who pays for the HOA documents?", a: "The seller is typically responsible for providing them. The HOA may charge a small estoppel fee for an updated balance. In Florida that fee is capped by statute." },
        { q: "What is an estoppel certificate?", a: "An estoppel is the HOA's official statement of how much the seller currently owes the association. It tells the closing agent the exact dues, special assessments, fines, and fees that follow the property." },
      ]}
    >
      <h2 id="what-you-can-request">What documents you are entitled to request</h2>
      <p>
        Florida law gives buyers and members a clear list of documents the HOA or condominium association must produce on request. Before you write an offer, ask the seller or your real estate agent to deliver:
      </p>
      <ul>
        <li><strong>Declaration of Covenants, Conditions & Restrictions (CC&Rs)</strong> — the legal document that defines what owners can and cannot do.</li>
        <li><strong>Articles of Incorporation</strong> — confirms the association is a Florida corporation in good standing.</li>
        <li><strong>Bylaws</strong> — how the board is elected, how meetings work, voting thresholds.</li>
        <li><strong>Rules and Regulations</strong> — the day-to-day rules that change more often than the CC&Rs.</li>
        <li><strong>Most recent annual budget</strong> — line-item operating budget plus reserve allocations.</li>
        <li><strong>Most recent year-end financial report</strong> — audited or reviewed statements depending on size.</li>
        <li><strong>Most recent reserve study</strong> — engineer&apos;s estimate of major repair timelines and costs.</li>
        <li><strong>Past 12 months of board meeting minutes</strong> — what the board has actually been discussing.</li>
        <li><strong>Estoppel certificate</strong> — the seller&apos;s current balance.</li>
        <li><strong>Insurance summary</strong> — what the master policy covers and what owners must carry separately.</li>
      </ul>

      <h2 id="ccr">How to read the CC&Rs</h2>
      <p>
        The CC&Rs are dense legal text but the parts that affect daily life are usually predictable. Look for sections covering pets, rentals, vehicles, signage, exterior modifications, holiday decorations, fences, satellite dishes, and short-term rentals (Airbnb / VRBO). If anything in the CC&Rs would change how you want to live in the home, it is a deal-breaker question now, not after closing.
      </p>
      <p>
        Pay close attention to the <strong>amendment clause</strong>. A community where the board can change rules with a simple majority vote behaves very differently from one where 75% of members must approve. The lower the threshold, the more rules can change after you buy.
      </p>

      <h2 id="budget">How to read the annual budget</h2>
      <p>
        The annual budget shows you where your monthly fee actually goes. Healthy budgets allocate roughly 60–70% to operating expenses (utilities, insurance, landscaping, management, payroll) and the rest to reserves. If reserves are under-funded relative to the reserve study, that gap is going to come back as a special assessment.
      </p>
      <p>
        Compare year-over-year insurance line items. In Florida, master condo and HOA insurance has spiked dramatically since 2022. A 30%+ jump in insurance year-over-year is normal — but it has to be funded through dues, not by quietly draining reserves.
      </p>

      <h2 id="reserves">Reserves and reserve studies</h2>
      <p>
        The reserve study is the most under-read document in Florida real estate. It is an engineer&apos;s projection of when each major component (roof, paint, asphalt, pool deck, elevators, structural envelope) will need replacement and what it will cost in today&apos;s dollars.
      </p>
      <p>
        After the 2021 Surfside collapse, Florida passed SB 4-D requiring condominium associations to <strong>fully fund</strong> reserves based on a Structural Integrity Reserve Study (SIRS). Communities that previously waived or partially-funded reserves are now required to catch up — which is why Florida condo fees have climbed rapidly since 2024.
      </p>
      <p>
        Look for two numbers: the <strong>fully funded balance</strong> the study recommends and the <strong>actual current balance</strong>. If the actual balance is well below recommended, expect either dues increases or a special assessment.
      </p>

      <h2 id="minutes">Why you should read board meeting minutes</h2>
      <p>
        The minutes tell you what the board is actually arguing about. A community where most meetings discuss landscape vendor changes is healthy. A community where every meeting features litigation updates, owner complaints about the manager, or postponed roof projects is a community with active problems.
      </p>
      <p>
        Pay attention to mentions of pending lawsuits, building code violations, or major repairs that keep getting deferred. Compare what is in the minutes to what is in the budget — if the minutes mention a $200,000 roof repair that is not in the budget or reserves, that is a future special assessment.
      </p>

      <h2 id="red-flags">Red flags that should change your offer</h2>
      <ul>
        <li>Pending litigation against the association (especially construction defect claims).</li>
        <li>Reserve balance below 50% of fully-funded recommendation.</li>
        <li>Recent board turnover — multiple board members resigning within a year.</li>
        <li>Minutes mention of any milestone inspection finding requiring structural repair.</li>
        <li>Special assessment in the past 24 months without a corresponding capital improvement.</li>
        <li>Insurance coverage gaps or claims that exhausted master policy limits.</li>
        <li>Restriction wording that conflicts with how you plan to use the property (rentals, pets, home office, vehicles).</li>
      </ul>

      <h2 id="florida-law">What Florida law requires</h2>
      <p>
        Florida Statute Chapter 718 (condos) and Chapter 720 (HOAs) both require associations to deliver these documents to prospective buyers and current members on request. Members have inspection rights for most records within 10 business days of a written request. A board that delays or refuses to produce documents is itself a red flag.
      </p>
      <p>
        For more detail on what Florida HOA and condo law specifically requires, read our <a href="/florida-hoa-law">Florida HOA Law explainer</a>. To check the entity status of any Palm Beach County HOA, <a href="/search">search for the community on HOA Agent</a> — every profile shows the Florida Division of Corporations entity number and current status.
      </p>
    </ArticleLayout>
  )
}
