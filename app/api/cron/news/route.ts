import { NextRequest, NextResponse } from 'next/server'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''

export async function GET(request: NextRequest) {
  const adminHeader = request.headers.get('x-admin-password')
  const authHeader = request.headers.get('authorization')
  if (adminHeader !== ADMIN_PASSWORD && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const base = new URL(request.url).origin

  const fetchResp = await fetch(`${base}/api/cron/fetch-news`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
  const fetchResult = await fetchResp.json()

  const enrichResp = await fetch(`${base}/api/cron/enrich-news`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
  const enrichResult = await enrichResp.json()

  return NextResponse.json({
    success: true,
    fetch: fetchResult,
    enrich: enrichResult,
  })
}
