import type { Metadata } from "next"
import NavBar from "@/app/components/NavBar"
import ContactForm from "@/app/components/ContactForm"

export const metadata: Metadata = {
  title: "Contact HOA Agent",
  description: "Get in touch with HOA Agent — questions, partnerships, corrections, and press inquiries. We typically respond within 2 business days.",
  alternates: { canonical: "https://www.hoa-agent.com/contact" },
}

export default function ContactPage() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", backgroundColor: "#f9f9f9", minHeight: "100vh" }}>
      <NavBar shareHref="/search" shareLabel="Find my HOA" />
      <div style={{ maxWidth: "640px", margin: "0 auto", padding: "48px 20px 60px" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#1D9E75", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>
          Contact
        </div>
        <h1 style={{ fontSize: "32px", fontWeight: 700, color: "#1B2B6B", letterSpacing: "-0.02em", marginBottom: "12px" }}>
          Contact HOA Agent
        </h1>
        <p style={{ fontSize: "14px", color: "#666", lineHeight: 1.7, marginBottom: "28px" }}>
          We typically respond within 2 business days. For corrections, please use our{" "}
          <a href="/corrections" style={{ color: "#1D9E75", fontWeight: 500 }}>corrections page</a>.
          For press inquiries, see <a href="/press" style={{ color: "#1D9E75", fontWeight: 500 }}>/press</a>.
        </p>
        <ContactForm
          subject="General Inquiry"
          fields="full"
          successMessage="Thank you. We'll respond within 2 business days."
        />
      </div>
    </main>
  )
}
