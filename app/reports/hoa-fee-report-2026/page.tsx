import NavBar from '@/app/components/NavBar'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Palm Beach County HOA Fee Report 2026 | HOA Agent',
  description: 'Average and median HOA fees by city across Palm Beach County in 2026. Fee distributions, highest and lowest communities, and data analysis.',
  alternates: { canonical: 'https://www.hoa-agent.com/reports/hoa-fee-report-2026' },
  openGraph: {
    title: 'Palm Beach County HOA Fee Report 2026',
    description: 'HOA fee data for 8,000+ communities in Palm Beach County. Average fees by city, distribution analysis, and highest/lowest communities.',
    url: 'https://hoa-agent.com/reports/hoa-fee-report-2026',
    siteName: 'HOA Agent',
    type: 'website',
    images: [{ url: 'https://hoa-agent.com/logo.png', width: 400, height: 400, alt: 'HOA Agent' }],
  },
  twitter: {
    card: 'summary',
    title: 'Palm Beach County HOA Fee Report 2026',
    description: 'HOA fee analysis for Palm Beach County — by city, property type, and distribution.',
  },
}

function safeFloat(val: unknown): number | null {
  const f = parseFloat(String(val))
  return isFinite(f) && f > 0 && f < 100_000 ? f : null
}

function repFee(c: any): number | null {
  const med = safeFloat(c.monthly_fee_median)
  const lo = safeFloat(c.monthly_fee_min)
  const hi = safeFloat(c.monthly_fee_max)
  if (med) return med
  if (lo && hi) return (lo + hi) / 2
  return lo
}

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

async function getFeeData() {
  const { data } = await supabase
    .from('communities')
    .select('canonical_name, city, monthly_fee_min, monthly_fee_max, monthly_fee_median, property_type')
    .eq('status', 'published')
    .not('monthly_fee_min', 'is', null)

  const records = (data || [])
    .map((c: any) => ({ ...c, rep: repFee(c) }))
    .filter((c: any) => c.rep !== null) as Array<any>

  const allFees = records.map((r) => r.rep as number)

  // By city
  const cityMap = new Map<string, number[]>()
  for (const r of records) {
    const city = (r.city || 'Unknown').trim()
    if (!cityMap.has(city)) cityMap.set(city, [])
    cityMap.get(city)!.push(r.rep)
  }
  const cityStats = Array.from(cityMap.entries())
    .filter(([, fees]) => fees.length >= 3)
    .map(([city, fees]) => ({
      city,
      count: fees.length,
      average: Math.round(mean(fees)),
      median: Math.round(median(fees)),
      min: Math.round(Math.min(...fees)),
      max: Math.round(Math.max(...fees)),
    }))
    .sort((a, b) => b.count - a.count)

  // Distribution
  const buckets = { 'Under $200': 0, '$200–$400': 0, '$400–$600': 0, 'Over $600': 0 }
  for (const fee of allFees) {
    if (fee < 200) buckets['Under $200']++
    else if (fee < 400) buckets['$200–$400']++
    else if (fee < 600) buckets['$400–$600']++
    else buckets['Over $600']++
  }

  const sorted = [...records].sort((a, b) => a.rep - b.rep)
  const lowest = sorted.slice(0, 8).map((r) => ({ name: r.canonical_name, city: r.city, fee: Math.round(r.rep) }))
  const highest = sorted.slice(-8).reverse().map((r) => ({ name: r.canonical_name, city: r.city, fee: Math.round(r.rep) }))

  return {
    total: records.length,
    overall: {
      average: Math.round(mean(allFees)),
      median: Math.round(median(allFees)),
      min: Math.round(Math.min(...allFees)),
      max: Math.round(Math.max(...allFees)),
    },
    cityStats,
    buckets,
    lowest,
    highest,
  }
}

export default async function FeeReportPage() {
  const data = await getFeeData()
  const pct = (n: number) => Math.round((n / data.total) * 100)

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#f9f9f9', minHeight: '100vh' }}>
      <NavBar
        shareHref="/search"
        shareLabel="Find my HOA"
      />

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '52px 24px 80px' }}>

        <div style={{ fontSize: '11px', fontWeight: 600, color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
          HOA Agent Reports
        </div>

        <h1 style={{ fontSize: '36px', fontWeight: 700, color: '#1B2B6B', lineHeight: 1.15, marginBottom: '16px', letterSpacing: '-0.02em' }}>
          Palm Beach County HOA Fee Report 2026
        </h1>

        <p style={{ fontSize: '15px', color: '#666', lineHeight: 1.8, marginBottom: '12px' }}>
          Analysis of monthly HOA and condo fees across {data.total.toLocaleString()} communities
          in Palm Beach County, Florida.
        </p>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '40px', flexWrap: 'wrap' }}>
          <Link
            href="/pricing"
            style={{ fontSize: '13px', color: '#fff', fontWeight: 600, textDecoration: 'none', backgroundColor: '#1B2B6B', padding: '8px 16px', borderRadius: '8px', display: 'inline-block' }}
          >
            Unlock Full Report — $2.99
          </Link>
          <span style={{ fontSize: '12px', color: '#888', alignSelf: 'center' }}>
            Get the full community table with citations, source URLs, and CSV export.
          </span>
        </div>

        {/* FREE TIER — only headline stats and city count */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '32px' }}>
          {[
            { label: 'Communities analyzed', value: data.total.toLocaleString() },
            { label: 'Cities covered', value: data.cityStats.length.toString() },
            { label: 'County-wide average', value: `$${data.overall.average}/mo` },
          ].map((s) => (
            <div key={s.label} style={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '18px', textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#1B2B6B', marginBottom: '4px' }}>{s.value}</div>
              <div style={{ fontSize: '11px', color: '#888', lineHeight: 1.4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* FREE TIER — fee distribution buckets without counts/percentages */}
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1B2B6B', marginBottom: '16px' }}>
          Fee distribution
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '48px' }}>
          {Object.keys(data.buckets).map((label) => (
            <div key={label} style={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Range</div>
              <div style={{ fontSize: '14px', color: '#1B2B6B', fontWeight: 700 }}>{label}</div>
              <div style={{ fontSize: '11px', color: '#bbb', marginTop: '6px', fontStyle: 'italic' }}>Unlock to see %</div>
            </div>
          ))}
        </div>

        {/* FREE TIER — teaser table: only first 3 cities */}
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1B2B6B', marginBottom: '16px' }}>
          Average fees by city <span style={{ fontSize: '13px', fontWeight: 400, color: '#888' }}>(preview — top 3 cities)</span>
        </h2>
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', overflow: 'hidden', marginBottom: '24px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '1px solid #e5e5e5' }}>
                {['City', 'Communities', 'Average/mo'].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#555', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.cityStats.slice(0, 3).map((row, i) => (
                <tr key={row.city} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 500, color: '#1a1a1a' }}>
                    <Link href={`/city/${row.city.toLowerCase().replace(/ /g, '-')}`} style={{ color: '#1B2B6B', textDecoration: 'none' }}>{row.city}</Link>
                  </td>
                  <td style={{ padding: '10px 16px', color: '#666' }}>{row.count.toLocaleString()}</td>
                  <td style={{ padding: '10px 16px', color: '#1a1a1a', fontWeight: 500 }}>${row.average}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Blurred preview of remaining cities */}
          <div style={{ position: 'relative' }}>
            <div style={{ filter: 'blur(4px)', pointerEvents: 'none', userSelect: 'none', maxHeight: '180px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <tbody>
                  {data.cityStats.slice(3, 12).map((row, i) => (
                    <tr key={row.city} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '10px 16px' }}>{row.city}</td>
                      <td style={{ padding: '10px 16px' }}>{row.count.toLocaleString()}</td>
                      <td style={{ padding: '10px 16px' }}>${row.average}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(255,255,255,0.4), rgba(255,255,255,0.95))' }} />
          </div>
        </div>

        {/* PAYWALL CTA */}
        <div style={{ backgroundColor: '#1B2B6B', color: '#fff', borderRadius: '14px', padding: '32px 28px', marginBottom: '48px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
            Premium Report
          </div>
          <h2 style={{ fontSize: '26px', fontWeight: 700, color: '#fff', marginTop: 0, marginBottom: '8px', letterSpacing: '-0.01em' }}>
            Unlock the Full 2026 Report
          </h2>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.85)', marginBottom: '20px', lineHeight: 1.6 }}>
            Get complete fee data for all {data.cityStats.length} cities and {data.total.toLocaleString()} communities in Palm Beach County. One-time $2.99 unlock.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px 0', fontSize: '14px', color: 'rgba(255,255,255,0.95)', lineHeight: 1.9 }}>
            <li>✓ Fee ranges, median, and average for every city</li>
            <li>✓ Individual community fee data — all {data.total.toLocaleString()} rows</li>
            <li>✓ Sortable and filterable by city, fee, community name</li>
            <li>✓ Highest and lowest fee communities revealed</li>
            <li>✓ CSV download for your records</li>
            <li>✓ Updated as new data is verified</li>
          </ul>
          <Link href="/pricing" style={{ display: 'inline-block', backgroundColor: '#1D9E75', color: '#fff', fontSize: '15px', fontWeight: 700, padding: '12px 24px', borderRadius: '10px', textDecoration: 'none' }}>
            Unlock Full Report — $2.99
          </Link>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)', marginTop: '10px' }}>
            One-time payment. No subscription required.
          </div>
        </div>

        {/* Methodology */}
        <div style={{ backgroundColor: '#FFFBF0', border: '1px solid #F5E6C8', borderRadius: '12px', padding: '20px 24px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#854F0B', marginBottom: '8px' }}>Methodology</div>
          <p style={{ fontSize: '13px', color: '#5a3a00', lineHeight: 1.7, margin: 0 }}>
            Fee data is sourced from public records and resident-submitted information. Representative
            fees use the median where available, otherwise the midpoint of the reported range.
            Communities with fees above $10,000/month are excluded as likely data errors.
            All data should be verified directly with the association before making real estate decisions.
          </p>
        </div>

      </div>
    </main>
  )
}
