import Link from "next/link"

export default function SiteFooter() {
  const colStyle: React.CSSProperties = { minWidth: "150px" }
  const headerStyle: React.CSSProperties = {
    fontSize: "11px", fontWeight: 700, color: "#1a1a1a",
    textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px",
  }
  const linkStyle: React.CSSProperties = {
    display: "block", fontSize: "13px", color: "#666",
    textDecoration: "none", marginBottom: "6px",
  }

  return (
    <footer style={{
      backgroundColor: "#fff", borderTop: "1px solid #e5e5e5",
      padding: "40px 24px 32px", fontFamily: "system-ui, sans-serif",
      marginTop: "40px",
    }}>
      <div style={{ maxWidth: "1080px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "24px" }}>
        <div style={colStyle}>
          <div style={headerStyle}>Browse by City</div>
          <Link style={linkStyle} href="/city/west-palm-beach">West Palm Beach</Link>
          <Link style={linkStyle} href="/city/boca-raton">Boca Raton</Link>
          <Link style={linkStyle} href="/city/jupiter">Jupiter</Link>
          <Link style={linkStyle} href="/city/palm-beach-gardens">Palm Beach Gardens</Link>
          <Link style={linkStyle} href="/city/lake-worth">Lake Worth</Link>
          <Link style={linkStyle} href="/city/delray-beach">Delray Beach</Link>
          <Link style={linkStyle} href="/city/boynton-beach">Boynton Beach</Link>
          <Link style={linkStyle} href="/city/royal-palm-beach">Royal Palm Beach</Link>
          <Link style={linkStyle} href="/city/wellington">Wellington</Link>
          <Link style={{ ...linkStyle, color: "#1D9E75", fontWeight: 600, marginTop: "6px" }} href="/city">View all cities →</Link>
        </div>

        <div style={colStyle}>
          <div style={headerStyle}>Resources</div>
          <Link style={linkStyle} href="/guides">HOA Guides</Link>
          <Link style={linkStyle} href="/florida-hoa-law">Florida HOA Law</Link>
          <Link style={linkStyle} href="/management">Management Companies</Link>
          <Link style={linkStyle} href="/for-agents">For Real Estate Agents</Link>
          <Link style={linkStyle} href="/reports/hoa-fee-report-2026">PBC Fee Report 2026</Link>
          <Link style={linkStyle} href="/pricing">Pricing</Link>
        </div>

        <div style={colStyle}>
          <div style={headerStyle}>Company</div>
          <Link style={linkStyle} href="/about">About</Link>
          <Link style={linkStyle} href="/about/team">Editorial Team</Link>
          <Link style={linkStyle} href="/methodology">Methodology</Link>
          <Link style={linkStyle} href="/editorial-standards">Editorial Standards</Link>
          <Link style={linkStyle} href="/press">Press</Link>
          <Link style={linkStyle} href="/advertise">Advertise</Link>
        </div>

        <div style={colStyle}>
          <div style={headerStyle}>Legal</div>
          <Link style={linkStyle} href="/terms">Terms of Service</Link>
          <Link style={linkStyle} href="/privacy">Privacy Policy</Link>
          <Link style={linkStyle} href="/corrections">Corrections</Link>
          <a style={linkStyle} href="mailto:hello@hoa-agent.com">hello@hoa-agent.com</a>
        </div>
      </div>

      <div style={{ maxWidth: "1080px", margin: "32px auto 0", borderTop: "1px solid #f0f0f0", paddingTop: "20px" }}>
        <p style={{ fontSize: "12px", color: "#888", lineHeight: 1.6, marginBottom: "10px" }}>
          HOA Agent covers 8,000+ HOA and condo communities across Palm Beach County Florida including
          West Palm Beach, Boca Raton, Jupiter, Palm Beach Gardens, Lake Worth, Delray Beach,
          Boynton Beach, Royal Palm Beach, Wellington, and Riviera Beach. Find HOA fees, litigation
          history, special assessments, and community reviews before you buy or rent.
        </p>
        <p style={{ fontSize: "11px", color: "#aaa", marginTop: "8px" }}>
          © {new Date().getFullYear()} HOA Agent LLC · West Palm Beach, Florida ·
          {" "}HOA Agent LLC is not affiliated with any HOA, management company, or government agency.
          Always verify HOA information directly with the association before relying on it for a real estate transaction.
        </p>
      </div>
    </footer>
  )
}
