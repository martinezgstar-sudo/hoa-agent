import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Accessibility — HOA Agent",
  description:
    "Our commitment to WCAG 2.1 AA, current known limitations, and how to request an accommodation.",
  alternates: { canonical: "https://www.hoa-agent.com/accessibility" },
}

const LAST_REVIEWED = "2026-08-05"
const CONTACT_EMAIL = "martinezgstar@gmail.com"

export default function AccessibilityPage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "40px 24px 64px",
        fontFamily: "system-ui, sans-serif",
        lineHeight: 1.6,
        color: "#1a1a1a",
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Accessibility</h1>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 32 }}>
        Last reviewed: {LAST_REVIEWED}
      </p>

      <section aria-labelledby="commitment">
        <h2 id="commitment" style={{ fontSize: 20, marginTop: 32 }}>
          Our commitment
        </h2>
        <p>
          HOA Agent is designed to conform to{" "}
          <a
            href="https://www.w3.org/TR/WCAG21/"
            target="_blank"
            rel="noopener noreferrer"
          >
            WCAG 2.1 Level AA
          </a>
          . We treat accessibility as a shipping requirement: every page and
          feature is reviewed for keyboard operation, screen-reader labeling,
          color contrast, and clear focus indication.
        </p>
      </section>

      <section aria-labelledby="what-works">
        <h2 id="what-works" style={{ fontSize: 20, marginTop: 32 }}>
          What we test for
        </h2>
        <ul>
          <li>Keyboard-only navigation, with a visible focus ring on every interactive control.</li>
          <li>A skip-to-content link so keyboard users can bypass the header.</li>
          <li>Text alternatives on informative images and icons.</li>
          <li>Form fields with programmatic labels and clear error messages.</li>
          <li>Color contrast of at least 4.5:1 for text.</li>
          <li>Semantic headings and landmarks (<code>main</code>, <code>nav</code>, <code>footer</code>).</li>
        </ul>
      </section>

      <section aria-labelledby="known-limits">
        <h2 id="known-limits" style={{ fontSize: 20, marginTop: 32 }}>
          Known limitations
        </h2>
        <p>
          The interactive map on community detail pages is powered by Mapbox
          GL and offers limited screen-reader support. Community data
          available on the map is also presented as a text list on the same
          page so nothing is map-only. We are tracking Mapbox&apos;s
          accessibility roadmap and will re-audit when their v3 keyboard-nav
          work ships.
        </p>
        <p>
          Third-party embeds (Mapbox tiles, analytics beacons) are subject
          to their own accessibility posture; where they fall short, we
          disable non-essential ones.
        </p>
      </section>

      <section aria-labelledby="request">
        <h2 id="request" style={{ fontSize: 20, marginTop: 32 }}>
          Request an accommodation
        </h2>
        <p>
          If any part of the site is unusable for you, or you need
          information in an alternative format, email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Please
          include the page URL and the browser or assistive technology you
          are using. We aim to respond within two business days.
        </p>
      </section>

      <section aria-labelledby="feedback">
        <h2 id="feedback" style={{ fontSize: 20, marginTop: 32 }}>
          Report a barrier
        </h2>
        <p>
          Bug reports about accessibility carry the same priority as
          security reports. Send them to the address above or open an issue
          via the <a href="/corrections">Corrections</a> form.
        </p>
      </section>
    </main>
  )
}
