import NavBar from "@/app/components/NavBar"
import Link from "next/link"
import type { Metadata } from "next"
import { supabase } from "@/lib/supabase"
import SponsoredCard from "@/app/components/SponsoredCard"

export const revalidate = 3600

export const metadata: Metadata = {
  title: "Advertise on HOA Agent — Reach Palm Beach County HOA Residents",
  description:
    "Reach 8,000+ HOA and condo communities in Palm Beach County. AI-built ads from your website. From $9.99/month.",
  alternates: { canonical: "https://www.hoa-agent.com/advertise" },
  openGraph: {
    title: "Advertise on HOA Agent",
    description: "Reach Palm Beach County HOA residents through targeted community-page advertising. From $9.99/month.",
    url: "https://www.hoa-agent.com/advertise",
    siteName: "HOA Agent",
    type: "website",
    images: [{ url: "https://www.hoa-agent.com/logo.png", width: 400, height: 400, alt: "HOA Agent" }],
  },
  twitter: { card: "summary", title: "Advertise on HOA Agent", description: "Reach Palm Beach County HOA residents." },
}

const PLANS = [
  {
    name: "Starter",
    price: 9.99,
    badge: null,
    features: [
      "1 ZIP code of your choice",
      "1 ad creative",
      "Exclusive in your category for that ZIP",
      "Basic analytics",
    ],
  },
  {
    name: "Growth",
    price: 29.99,
    badge: "Most Popular",
    features: [
      "Up to 5 ZIP codes",
      "3 ad creatives rotating",
      "Exclusive in your category in each ZIP",
      "Full analytics",
    ],
  },
  {
    name: "County",
    price: 89.99,
    badge: null,
    features: [
      "All Palm Beach County ZIPs included",
      "5 ad creatives rotating",
      "Exclusive countywide in your category",
      "Priority placement above Starter & Growth",
    ],
  },
]

const CATEGORIES = [
  { icon: "🧹", label: "Cleaning Services" },
  { icon: "🌴", label: "Landscaping" },
  { icon: "🏠", label: "Property Management" },
  { icon: "⚖️", label: "Legal Services" },
  { icon: "🛡️", label: "Insurance" },
  { icon: "📦", label: "Moving Services" },
  { icon: "🔧", label: "Home Services" },
  { icon: "🔑", label: "Real Estate" },
]

const FAQ = [
  { q: "How long until my ad goes live?", a: "Once you sign up and complete your plan, your ad goes live within minutes. Our AI ad generator builds 4 ad options from your website in about 30 seconds." },
  { q: "Can I change my ad after publishing?", a: "Yes. Edit your ads any time from the advertiser portal. You can pause, swap, or rotate ads at will." },
  { q: "What ZIP codes can I target?", a: "Starter targets 1 ZIP, Growth up to 5 ZIPs, County covers every Palm Beach County ZIP. Each tier guarantees category exclusivity within the selected ZIPs — no two advertisers in the same category will appear in the same ZIP." },
  { q: "How does Claude create my ad?", a: "Enter your website URL. Claude visits the site, reads your content, and generates 4 ad options with different angles. You pick the one you like and tweak any field before publishing." },
  { q: "Can I cancel anytime?", a: "Yes. Cancel from the billing tab in your portal. No long-term contracts." },
]

export default async function AdvertisePage() {
  const { count } = await supabase
    .from("communities")
    .select("*", { count: "exact", head: true })
    .eq("status", "published")
  const totalCommunities = count || 8000

  const exampleAd = {
    id: "example-morningstar",
    company_name: "MorningStar Commercial & Residential Services",
    tagline: "Professional cleaning for HOA communities",
    phone: "561-567-4114",
    cta_text: "Get a Free Quote",
    cta_url: "https://morningstarpb.com",
    category: "cleaning",
    logo_url: null,
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", backgroundColor: "#f9f9f9", minHeight: "100vh" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Service",
        name: "HOA Agent Advertising",
        provider: { "@type": "Organization", name: "HOA Agent", url: "https://www.hoa-agent.com" },
        areaServed: { "@type": "AdministrativeArea", name: "Palm Beach County, Florida" },
        serviceType: "Local advertising for HOA-adjacent businesses",
        url: "https://www.hoa-agent.com/advertise",
      }) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "HOA Agent", item: "https://www.hoa-agent.com" },
          { "@type": "ListItem", position: 2, name: "Advertise", item: "https://www.hoa-agent.com/advertise" },
        ],
      }) }} />
      <NavBar shareHref="/search" shareLabel="Find my HOA" />

      <div style={{ backgroundColor: "#fff", borderBottom: "1px solid #e5e5e5", padding: "8px 24px", textAlign: "right", fontSize: "12px" }}>
        <span style={{ color: "#888" }}>Already an advertiser? </span>
        <Link href="/advertise/login" style={{ color: "#1D9E75", fontWeight: 600, textDecoration: "none" }}>Sign in →</Link>
      </div>

      <section style={{ backgroundColor: "#fff", padding: "64px 24px 56px", textAlign: "center" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#1D9E75", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "16px" }}>
          For Local Businesses
        </div>
        <h1 style={{ fontSize: "44px", fontWeight: 700, color: "#1B2B6B", lineHeight: 1.15, letterSpacing: "-0.02em", marginBottom: "16px", maxWidth: "680px", margin: "0 auto 16px" }}>
          Reach Palm Beach County HOA Residents
        </h1>
        <p style={{ fontSize: "16px", color: "#555", lineHeight: 1.6, maxWidth: "560px", margin: "0 auto 32px" }}>
          Your ad appears on the HOA community pages where homebuyers, renters, and residents are already researching. Targeted by city, low cost, AI-built from your website.
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/advertise/signup" style={{ display: "inline-block", padding: "14px 28px", backgroundColor: "#1D9E75", color: "#fff", fontSize: "15px", fontWeight: 700, borderRadius: "10px", textDecoration: "none" }}>
            Start Free Trial →
          </Link>
          <Link href="#pricing" style={{ display: "inline-block", padding: "14px 28px", backgroundColor: "#fff", color: "#1B2B6B", border: "2px solid #1B2B6B", fontSize: "15px", fontWeight: 700, borderRadius: "10px", textDecoration: "none" }}>
            See Pricing
          </Link>
        </div>
        <div style={{ marginTop: "24px", fontSize: "13px", color: "#888" }}>
          {totalCommunities.toLocaleString()}+ communities where your ad can appear
        </div>
      </section>

      <section style={{ padding: "48px 24px", backgroundColor: "#f9f9f9" }}>
        <div style={{ maxWidth: "560px", margin: "0 auto" }}>
          <div style={{ fontSize: "11px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px", textAlign: "center" }}>
            Example — How your ad appears on community pages
          </div>
          <SponsoredCard advertisers={[exampleAd]} />
        </div>
      </section>

      <section style={{ padding: "56px 24px", backgroundColor: "#fff", borderTop: "1px solid #e5e5e5", borderBottom: "1px solid #e5e5e5" }}>
        <div style={{ maxWidth: "880px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "26px", fontWeight: 700, color: "#1B2B6B", marginBottom: "32px", textAlign: "center" }}>How it works</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
            {[
              { num: 1, title: "Create your free account", desc: "Email + password. Takes a minute." },
              { num: 2, title: "Enter your website", desc: "Claude reads your site and writes 4 ad options in 30 seconds." },
              { num: 3, title: "Choose cities and plan", desc: "Pick a plan. Pick your target cities (or all of PBC)." },
              { num: 4, title: "Your ad goes live", desc: "Ad appears on community pages within minutes." },
            ].map((s) => (
              <div key={s.num} style={{ padding: "20px", backgroundColor: "#f9f9f9", border: "1px solid #e5e5e5", borderRadius: "12px" }}>
                <div style={{ fontSize: "12px", color: "#1D9E75", fontWeight: 700, marginBottom: "6px" }}>STEP {s.num}</div>
                <div style={{ fontSize: "15px", fontWeight: 600, color: "#1a1a1a", marginBottom: "6px" }}>{s.title}</div>
                <div style={{ fontSize: "13px", color: "#666", lineHeight: 1.6 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" style={{ padding: "64px 24px" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "28px", fontWeight: 700, color: "#1B2B6B", textAlign: "center", marginBottom: "10px" }}>Pricing</h2>
          <p style={{ textAlign: "center", color: "#666", fontSize: "14px", marginBottom: "36px" }}>Simple monthly plans. Cancel anytime.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
            {PLANS.map((p) => (
              <div key={p.name} style={{ position: "relative", backgroundColor: "#fff", borderRadius: "14px", padding: "28px 24px", border: p.badge ? "2px solid #1D9E75" : "1px solid #e5e5e5" }}>
                {p.badge && (
                  <div style={{ position: "absolute", top: "-12px", right: "20px", backgroundColor: "#1D9E75", color: "#fff", fontSize: "11px", fontWeight: 700, padding: "3px 12px", borderRadius: "12px" }}>{p.badge}</div>
                )}
                <div style={{ fontSize: "16px", fontWeight: 700, color: "#1B2B6B", marginBottom: "6px" }}>{p.name}</div>
                <div style={{ fontSize: "30px", fontWeight: 700, color: "#1a1a1a", marginBottom: "4px" }}>
                  ${p.price}<span style={{ fontSize: "13px", fontWeight: 400, color: "#888" }}>/month</span>
                </div>
                <div style={{ fontSize: "11px", color: "#1D9E75", fontWeight: 600, marginBottom: "16px", letterSpacing: "0.02em" }}>
                  ✓ Category exclusivity guaranteed
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 22px 0", fontSize: "13px", color: "#444", lineHeight: 1.9 }}>
                  {p.features.map((f) => <li key={f}>✓ {f}</li>)}
                </ul>
                <Link href="/advertise/signup" style={{ display: "block", textAlign: "center", padding: "11px", backgroundColor: "#1B2B6B", color: "#fff", fontSize: "14px", fontWeight: 700, borderRadius: "10px", textDecoration: "none" }}>Get Started</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: "48px 24px", backgroundColor: "#fff", borderTop: "1px solid #e5e5e5" }}>
        <div style={{ maxWidth: "880px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, color: "#1B2B6B", marginBottom: "24px", textAlign: "center" }}>Who advertises with us</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
            {CATEGORIES.map((c) => (
              <div key={c.label} style={{ padding: "18px", textAlign: "center", backgroundColor: "#f9f9f9", border: "1px solid #e5e5e5", borderRadius: "12px" }}>
                <div style={{ fontSize: "28px", marginBottom: "6px" }}>{c.icon}</div>
                <div style={{ fontSize: "12px", color: "#444", fontWeight: 500 }}>{c.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: "56px 24px" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, color: "#1B2B6B", marginBottom: "20px" }}>Frequently asked questions</h2>
          {FAQ.map((f, i) => (
            <details key={i} style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "10px", padding: "14px 18px", marginBottom: "10px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, color: "#1a1a1a" }}>{f.q}</summary>
              <p style={{ marginTop: "10px", color: "#555", lineHeight: 1.6, fontSize: "14px" }}>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section style={{ padding: "56px 24px", backgroundColor: "#1B2B6B", textAlign: "center", color: "#fff" }}>
        <h2 style={{ fontSize: "26px", fontWeight: 700, marginBottom: "12px" }}>Ready to reach HOA residents?</h2>
        <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.85)", marginBottom: "24px", maxWidth: "480px", margin: "0 auto 24px" }}>
          {totalCommunities.toLocaleString()}+ communities. Targeted by city. AI-built from your website.
        </p>
        <Link href="/advertise/signup" style={{ display: "inline-block", padding: "14px 28px", backgroundColor: "#1D9E75", color: "#fff", fontSize: "15px", fontWeight: 700, borderRadius: "10px", textDecoration: "none" }}>
          Get Started →
        </Link>
      </section>
    </main>
  )
}
