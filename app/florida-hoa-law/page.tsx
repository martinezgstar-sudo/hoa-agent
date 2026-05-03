import type { Metadata } from "next"
import ArticleLayout from "@/app/components/ArticleLayout"

const SLUG = "/florida-hoa-law"
const TITLE = "Florida HOA Law — Plain English Guide to Chapters 718, 720 & SB 4-D"
const DESC = "Florida HOA and condo law explained. Chapter 718 governs condos, Chapter 720 governs HOAs, and SB 4-D added structural reserve and milestone inspection requirements after Surfside."
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
      category="FLORIDA HOA LAW" title={TITLE} description={DESC}
      publishedDate={PUBLISHED} slug={SLUG}
      toc={[
        { id: "chapter-718", label: "Chapter 718 — Condominium Act" },
        { id: "chapter-720", label: "Chapter 720 — Homeowners Association Act" },
        { id: "sb-4d", label: "SB 4-D — Surfside reforms (2022)" },
        { id: "owner-rights", label: "Owner rights under Florida law" },
        { id: "elections", label: "Board election rules" },
        { id: "assessments", label: "Assessment collection rules" },
        { id: "reserves", label: "Reserve requirements" },
      ]}
      faq={[
        { q: "What is the difference between Chapter 718 and Chapter 720?", a: "Chapter 718 governs Florida condominium associations. Chapter 720 governs Florida homeowners associations. They share many concepts but differ on insurance requirements, reserve funding, election procedures, and structural inspection requirements." },
        { q: "What is a Milestone Inspection?", a: "A Milestone Inspection is required for condo and cooperative buildings three stories or more, performed at 30 years of age (25 if within 3 miles of the coast) and every 10 years thereafter. It assesses life safety and structural integrity." },
        { q: "Can my Florida HOA force me to remove a satellite dish or solar panels?", a: "Federal and Florida law generally protect satellite dishes under one meter and solar panels from association restrictions, though associations can regulate placement to a limited extent." },
      ]}
    >
      <h2 id="chapter-718">Chapter 718 — Condominium Act</h2>
      <p>
        Florida Statute Chapter 718 (the &quot;Condominium Act&quot;) governs every condominium association in Florida. It defines the relationship between unit owners, the association, and the developer (during the developer-control period). Chapter 718 covers:
      </p>
      <ul>
        <li>Creation, governance, and termination of condominiums</li>
        <li>Owner rights to inspect records and attend board meetings</li>
        <li>Election of directors and removal procedures</li>
        <li>Assessment collection and lien rights</li>
        <li>Reserve funding requirements (substantially expanded by SB 4-D)</li>
        <li>Insurance requirements for the master policy</li>
        <li>Rental and leasing restrictions</li>
        <li>Resale disclosure obligations</li>
      </ul>
      <p>
        The Florida Department of Business and Professional Regulation (DBPR) Division of Florida Condominiums, Timeshares, and Mobile Homes regulates Chapter 718 associations. Owners can file complaints with DBPR for governance violations.
      </p>

      <h2 id="chapter-720">Chapter 720 — Homeowners Association Act</h2>
      <p>
        Florida Statute Chapter 720 governs traditional homeowners associations — typically single-family and townhome communities where owners hold fee-simple title to their lots. Key provisions include:
      </p>
      <ul>
        <li>Owner rights to inspect records (most documents within 10 business days)</li>
        <li>Notice requirements: 48 hours for board meetings, 14 days for membership meetings</li>
        <li>Annual budget approval procedures</li>
        <li>Assessment collection and lien procedures</li>
        <li>Architectural review board (ARB) authority and limits</li>
        <li>Fining and suspension procedures</li>
      </ul>
      <p>
        Chapter 720 is generally less prescriptive than Chapter 718 — bylaws and CC&Rs do more of the work in HOAs. There is no equivalent state regulator that handles routine HOA disputes, which is why members often have to file in civil court for enforcement.
      </p>

      <h2 id="sb-4d">SB 4-D — Surfside reforms (2022)</h2>
      <p>
        After the June 24, 2021 collapse of Champlain Towers South in Surfside, Florida, the legislature passed SB 4-D requiring two major changes to condominium governance:
      </p>
      <ol>
        <li>
          <strong>Milestone Inspections.</strong> Buildings three stories or taller must undergo Milestone Inspections at 30 years of age (25 years for coastal buildings within three miles of the coast) and every 10 years thereafter. The inspection assesses structural integrity and life safety.
        </li>
        <li>
          <strong>Structural Integrity Reserve Studies (SIRS).</strong> Condo associations must commission a SIRS every 10 years and fund reserves accordingly. The SIRS examines components like roof, structural concrete, plumbing, electrical, fire-protection systems, and waterproofing — and the association must fund reserves for any component flagged as needing replacement.
        </li>
      </ol>
      <p>
        SB 4-D also eliminated owners&apos; ability to vote to waive or partially fund reserves for SIRS-covered components. This is the single biggest reason Florida condo fees have escalated since 2024.
      </p>

      <h2 id="owner-rights">Owner rights under Florida law</h2>
      <p>
        Under both chapters, owners have the following baseline rights:
      </p>
      <ul>
        <li>Right to inspect official records (most within 10 business days of written request)</li>
        <li>Right to attend board meetings and speak on agenda items</li>
        <li>Right to vote on major matters according to the bylaws</li>
        <li>Right to receive financial reports annually</li>
        <li>Right to receive advance notice of meetings and assessments</li>
        <li>Right to challenge assessments and fines through dispute resolution</li>
      </ul>

      <h2 id="elections">Board election rules</h2>
      <p>
        For condos (Chapter 718), election procedures are tightly regulated. Candidates must self-nominate within a defined window. The election is by sealed ballot. Owners can recall directors with sufficient signatures.
      </p>
      <p>
        For HOAs (Chapter 720), election procedures are governed by the bylaws. Most HOAs hold annual elections at the membership meeting. Recall procedures are typically defined in the bylaws.
      </p>

      <h2 id="assessments">Assessment collection rules</h2>
      <p>
        When an owner falls behind on assessments, the association can record a claim of lien against the property after providing required notice. The lien attaches to the property and can be foreclosed. Florida law caps the late fees and interest the association can charge.
      </p>
      <p>
        Special assessments require advance notice. For larger amounts, a membership vote is typically required. Read our <a href="/guides/what-is-a-special-assessment">guide on special assessments</a> for buyer-side detail.
      </p>

      <h2 id="reserves">Reserve requirements</h2>
      <p>
        Chapter 718 condos must fund reserves for components identified in their reserve study. After SB 4-D, certain &quot;structural integrity&quot; components cannot have their reserves waived or partially funded by owner vote.
      </p>
      <p>
        Chapter 720 HOAs have less prescriptive reserve rules. Reserves are still recommended but waiving is more permissive.
      </p>
      <p>
        For more practical guidance, read <a href="/guides/how-to-read-hoa-documents">How to Read HOA Documents Before You Buy</a>.
      </p>
    </ArticleLayout>
  )
}
