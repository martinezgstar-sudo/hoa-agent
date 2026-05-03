import type { Metadata } from "next"
import Link from "next/link"
import NavBar from "@/app/components/NavBar"

export const metadata: Metadata = {
  title: "HOA Guides — Florida Homeowner Association Resources | HOA Agent",
  description:
    "Plain-English guides on Florida HOA and condo associations. How to read HOA documents, evaluate communities before buying, understand special assessments, and navigate Florida HOA law.",
  alternates: { canonical: "https://www.hoa-agent.com/guides" },
}

const GUIDES = [
  {
    slug: "how-to-read-hoa-documents",
    title: "How to Read HOA Documents Before You Buy",
    description: "A practical guide to the CC&Rs, budget, reserve study, and rules and regulations every Florida buyer should request.",
  },
  {
    slug: "what-is-a-special-assessment",
    title: "What Is a Special Assessment?",
    description: "Special assessments explained — what they are, when Florida HOAs can charge them, and how to find out if a community has had any.",
  },
  {
    slug: "florida-hoa-vs-condo-association",
    title: "HOA vs Condo Association in Florida — Key Differences",
    description: "Florida Statute Chapter 718 governs condos. Chapter 720 governs HOAs. Owner rights, reserves, and election rules differ in important ways.",
  },
  {
    slug: "how-to-evaluate-hoa-before-buying",
    title: "How to Evaluate an HOA Before Buying in Florida",
    description: "Ten questions every Florida buyer should ask before closing on a property in an HOA or condo community.",
  },
  {
    slug: "palm-beach-county-hoa-fees",
    title: "Palm Beach County HOA Fees — 2026 Guide",
    description: "Average HOA and condo fees by city in Palm Beach County, what drives high fees, and how to verify before you buy.",
  },
]

export default function GuidesIndexPage() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", backgroundColor: "#f9f9f9", minHeight: "100vh" }}>
      <NavBar shareHref="/search" shareLabel="Find my HOA" />
      <div style={{ maxWidth: "780px", margin: "0 auto", padding: "48px 20px 60px" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#1D9E75", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>
          HOA Agent Guides
        </div>
        <h1 style={{ fontSize: "36px", fontWeight: 700, color: "#1B2B6B", letterSpacing: "-0.02em", marginBottom: "16px" }}>
          Florida HOA & Condo Guides
        </h1>
        <p style={{ fontSize: "15px", color: "#555", lineHeight: 1.7, marginBottom: "40px" }}>
          Plain-English guides written for buyers, renters, residents, and real estate agents working in Palm Beach County.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {GUIDES.map((g) => (
            <Link key={g.slug} href={`/guides/${g.slug}`} style={{ textDecoration: "none" }}>
              <div style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "20px 24px" }}>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "#1B2B6B", marginBottom: "6px" }}>{g.title}</div>
                <div style={{ fontSize: "13px", color: "#555", lineHeight: 1.6 }}>{g.description}</div>
                <div style={{ fontSize: "12px", color: "#1D9E75", fontWeight: 600, marginTop: "10px" }}>Read guide →</div>
              </div>
            </Link>
          ))}
        </div>
        <div style={{ marginTop: "32px", padding: "20px", backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px" }}>
          <div style={{ fontSize: "13px", color: "#666", marginBottom: "8px", fontWeight: 600 }}>Looking for Florida law explainers?</div>
          <Link href="/florida-hoa-law" style={{ fontSize: "13px", color: "#1D9E75", fontWeight: 600, textDecoration: "none" }}>
            Read the Florida HOA Law section →
          </Link>
        </div>
      </div>
    </main>
  )
}
