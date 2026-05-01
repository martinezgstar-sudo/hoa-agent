import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

function safeFloat(val: unknown): number | null {
  const f = parseFloat(String(val))
  return isFinite(f) && f > 0 && f < 100_000 ? f : null
}

function repFee(min: unknown, max: unknown, med: unknown): number | null {
  const m = safeFloat(med)
  const lo = safeFloat(min)
  const hi = safeFloat(max)
  if (m) return m
  if (lo && hi) return (lo + hi) / 2
  return lo
}

export async function GET() {
  const { data } = await supabase
    .from('communities')
    .select('canonical_name, city, monthly_fee_min, monthly_fee_max, monthly_fee_median, property_type')
    .eq('status', 'published')
    .not('monthly_fee_min', 'is', null)
    .order('city', { ascending: true })

  const rows = (data || [])
    .map((c: any) => ({
      community: c.canonical_name,
      city: c.city || '',
      property_type: c.property_type || '',
      fee_min: safeFloat(c.monthly_fee_min) ?? '',
      fee_max: safeFloat(c.monthly_fee_max) ?? '',
      fee_median: safeFloat(c.monthly_fee_median) ?? '',
      representative_fee: repFee(c.monthly_fee_min, c.monthly_fee_max, c.monthly_fee_median) ?? '',
    }))
    .filter((r: any) => r.representative_fee !== '')

  const header = 'community,city,property_type,fee_min,fee_max,fee_median,representative_fee\n'
  const lines = rows.map((r: any) =>
    [r.community, r.city, r.property_type, r.fee_min, r.fee_max, r.fee_median, r.representative_fee]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  )
  const csv = header + lines.join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="palm-beach-hoa-fee-report-2026.csv"',
    },
  })
}
