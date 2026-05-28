import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export const runtime = 'nodejs'

function timingSafeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const adminPasswordEnv = process.env.ADMIN_PASSWORD

  if (!supabaseUrl || !serviceRoleKey || !adminPasswordEnv) {
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    )
  }

  const adminPassword = request.headers.get('x-admin-password') ?? ''
  if (!timingSafeEqual(adminPassword, adminPasswordEnv)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    const [scoreboard, activity, stuck, pendingData, pendingFees] = await Promise.all([
      supabase.from('v_county_expansion').select('*'),
      supabase.from('v_recent_research_activity').select('*'),
      supabase.from('v_stuck_queue').select('*'),
      supabase.from('pending_community_data').select('id', { count: 'exact', head: true }),
      supabase.from('pending_fee_observations').select('id', { count: 'exact', head: true }),
    ])

    const queryErrors = [
      scoreboard.error,
      activity.error,
      stuck.error,
      pendingData.error,
      pendingFees.error,
    ].filter(Boolean)

    if (queryErrors.length > 0) {
      const message = queryErrors.map((e) => e?.message).join(' | ')
      return NextResponse.json({ error: message }, { status: 500 })
    }

    return NextResponse.json({
      scoreboard: scoreboard.data ?? [],
      activity: activity.data ?? [],
      stuck: stuck.data ?? [],
      pendingDataCount: pendingData.count ?? 0,
      pendingFeeCount: pendingFees.count ?? 0,
      lastFetched: new Date().toISOString(),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
