import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// In-memory rate limit: max 3 submissions per IP per 24 hours
const rateLimitMap = new Map<string, number[]>()
const WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_PER_WINDOW = 3

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const now = Date.now()

  const timestamps = (rateLimitMap.get(ip) || []).filter(t => now - t < WINDOW_MS)
  if (timestamps.length >= MAX_PER_WINDOW) {
    return NextResponse.json({ error: 'Too many submissions. Please try again tomorrow.' }, { status: 429 })
  }
  timestamps.push(now)
  rateLimitMap.set(ip, timestamps)

  const body = await request.json()
  const { community_id, fee_amount, signal_date, signal_type, notes } = body

  if (!community_id || !signal_type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const validTypes = ['Special Assessment', 'Fee Increase', 'Fee Decrease']
  if (!validTypes.includes(signal_type)) {
    return NextResponse.json({ error: 'Invalid signal type' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await supabase.from('assessment_signals').insert({
    community_id,
    fee_amount: fee_amount ? parseFloat(fee_amount) : null,
    signal_date: signal_date || null,
    signal_type,
    notes: notes?.trim() || null,
    submitted_ip: ip,
    status: 'pending',
  })

  if (error) {
    console.error('assessment_signals insert error:', error)
    return NextResponse.json({ error: 'Failed to submit signal' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
