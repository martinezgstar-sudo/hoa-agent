import NavBar from '@/app/components/NavBar'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Palm Beach County HOA Fee Report 2026 | HOA Agent',
  description: 'Average and median HOA fees by city across Palm Beach County in 2026. Fee distributions, highest and lowest communities, and data analysis.',
  openGraph: {
    title: 'Palm Beach County HOA Fee Report 2026',
    description: 'HOA fee data for 7,000+ communities in Palm Beach County. Average fees by city, distribution analysis, and highest/lowest communities.',
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
        desktopLinks={[
          { href: '/search', label: 'Search' },
          { href: '/city', label: 'Cities' },
          { href: '/reports', label: 'Reports' },
          { href: '/about', label: 'About' },
        ]}
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

        {/* Overall stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '48px' }}>
          {[
            { label: 'Communities analyzed', value: data.total.toLocaleString() },
            { label: 'County-wide average', value: `$${data.overall.average}/mo` },
            { label: 'County-wide median', value: `$${data.overall.median}/mo` },
            { label: 'Lowest fee found', value: `$${data.overall.min}/mo` },
            { label: 'Highest fee found', value: `$${data.overall.max}/mo` },
          ].map((s) => (
            <div key={s.label} style={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '18px', textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#1B2B6B', marginBottom: '4px' }}>{s.value}</div>
              <div style={{ fontSize: '11px', color: '#888', lineHeight: 1.4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Fee distribution */}
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1B2B6B', marginBottom: '16px' }}>
          Fee distribution
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '48px' }}>
          {Object.entries(data.buckets).map(([label, count]) => (
            <div key={label} style={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a', marginBottom: '4px' }}>{pct(count)}%</div>
              <div style={{ fontSize: '12px', color: '#1D9E75', fontWeight: 600, marginBottom: '2px' }}>{label}</div>
              <div style={{ fontSize: '11px', color: '#aaa' }}>{count.toLocaleString()} communities</div>
            </div>
          ))}
        </div>

        {/* By city table */}
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1B2B6B', marginBottom: '16px' }}>
          Average fees by city
        </h2>
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', overflow: 'hidden', marginBottom: '48px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '1px solid #e5e5e5' }}>
                {['City', 'Communities', 'Average/mo', 'Median/mo', 'Range'].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#555', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.cityStats.slice(0, 20).map((row, i) => (
                <tr key={row.city} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 500, color: '#1a1a1a' }}>
                    <Link href={`/city/${row.city.toLowerCase().replace(/ /g, '-')}`} style={{ color: '#1B2B6B', textDecoration: 'none' }}>{row.city}</Link>
                  </td>
                  <td style={{ padding: '10px 16px', color: '#666' }}>{row.count.toLocaleString()}</td>
                  <td style={{ padding: '10px 16px', color: '#1a1a1a', fontWeight: 500 }}>${row.average}</td>
                  <td style={{ padding: '10px 16px', color: '#1a1a1a' }}>${row.median}</td>
                  <td style={{ padding: '10px 16px', color: '#888' }}>${row.min}–${row.max}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Highest and lowest */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', marginBottom: '48px' }}>

          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1B2B6B', marginBottom: '14px' }}>Lowest fee communities</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.lowest.map((r) => (
                <div key={r.name} style={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '8px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#1a1a1a' }}>{r.name}</div>
                    <div style={{ fontSize: '11px', color: '#888' }}>{r.city}</div>
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#1D9E75' }}>${r.fee}/mo</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1B2B6B', marginBottom: '14px' }}>Highest fee communities</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.highest.map((r) => (
                <div key={r.name} style={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '8px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#1a1a1a' }}>{r.name}</div>
                    <div style={{ fontSize: '11px', color: '#888' }}>{r.city}</div>
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#854F0B' }}>${r.fee}/mo</div>
                </div>
              ))}
            </div>
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
