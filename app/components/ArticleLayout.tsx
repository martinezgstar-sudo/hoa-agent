import Link from "next/link"
import NavBar from "@/app/components/NavBar"

type Props = {
  category?: string         // e.g. "GUIDE" or "FLORIDA HOA LAW"
  title: string
  description: string
  publishedDate: string     // ISO date
  updatedDate?: string
  slug: string              // canonical path under https://www.hoa-agent.com
  toc?: Array<{ id: string; label: string }>
  faq?: Array<{ q: string; a: string }>
  children: React.ReactNode
}

export default function ArticleLayout({
  category, title, description, publishedDate, updatedDate, slug, toc, faq, children,
}: Props) {
  const fullUrl = `https://www.hoa-agent.com${slug}`
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    author: { "@type": "Organization", name: "HOA Agent Editorial Team", url: "https://www.hoa-agent.com" },
    datePublished: publishedDate,
    dateModified: updatedDate || publishedDate,
    publisher: {
      "@type": "Organization",
      name: "HOA Agent",
      logo: { "@type": "ImageObject", url: "https://www.hoa-agent.com/logo.png" },
    },
    mainEntityOfPage: fullUrl,
  }
  const faqSchema = faq && faq.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  } : null

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", backgroundColor: "#f9f9f9", minHeight: "100vh" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      {faqSchema && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      )}
      <NavBar shareHref="/search" shareLabel="Find my HOA" />

      <article style={{ maxWidth: "740px", margin: "0 auto", padding: "48px 20px 80px" }}>
        {category && (
          <div style={{ fontSize: "11px", fontWeight: 600, color: "#1D9E75", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>
            {category}
          </div>
        )}
        <h1 style={{ fontSize: "36px", fontWeight: 700, color: "#1B2B6B", lineHeight: 1.15, letterSpacing: "-0.02em", marginBottom: "16px" }}>
          {title}
        </h1>
        <p style={{ fontSize: "16px", color: "#555", lineHeight: 1.6, marginBottom: "24px" }}>
          {description}
        </p>
        <div style={{ fontSize: "12px", color: "#888", marginBottom: "32px" }}>
          By <strong>HOA Agent Editorial Team</strong> ·
          {" "}Published {new Date(publishedDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          {updatedDate && updatedDate !== publishedDate && (
            <> · Updated {new Date(updatedDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</>
          )}
        </div>

        {toc && toc.length > 0 && (
          <nav style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "10px", padding: "16px 20px", marginBottom: "28px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
              In this article
            </div>
            <ol style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", lineHeight: 1.8, color: "#1B2B6B" }}>
              {toc.map((t) => (
                <li key={t.id}><a href={`#${t.id}`} style={{ color: "#1B2B6B", textDecoration: "none" }}>{t.label}</a></li>
              ))}
            </ol>
          </nav>
        )}

        <div className="article-body" style={{ fontSize: "15px", color: "#222", lineHeight: 1.75 }}>
          {children}
        </div>

        {faq && faq.length > 0 && (
          <section style={{ marginTop: "40px", borderTop: "1px solid #e5e5e5", paddingTop: "32px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#1B2B6B", marginBottom: "16px" }}>Frequently asked questions</h2>
            {faq.map((f, i) => (
              <details key={i} style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "10px", padding: "12px 16px", marginBottom: "10px" }}>
                <summary style={{ cursor: "pointer", fontWeight: 600, color: "#1a1a1a" }}>{f.q}</summary>
                <p style={{ marginTop: "10px", color: "#555", lineHeight: 1.6 }}>{f.a}</p>
              </details>
            ))}
          </section>
        )}

        <div style={{ marginTop: "40px", padding: "20px", backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "10px", textAlign: "center" }}>
          <div style={{ fontSize: "13px", color: "#666", marginBottom: "10px" }}>Want more guides like this?</div>
          <Link href="/guides" style={{ fontSize: "13px", color: "#1D9E75", fontWeight: 600, textDecoration: "none" }}>Browse all HOA Agent guides →</Link>
        </div>
      </article>
    </main>
  )
}
