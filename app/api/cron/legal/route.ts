import { NextRequest, NextResponse } from 'next/server'
import { withRunLogging } from '@/lib/job-runs'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''

export async function GET(request: NextRequest) {
  const adminHeader = request.headers.get('x-admin-password')
  const authHeader = request.headers.get('authorization')
  if (adminHeader !== ADMIN_PASSWORD && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return withRunLogging('cron-legal', async () => {
    const base = new URL(request.url).origin

    const fetchResp = await fetch(`${base}/api/cron/fetch-legal`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    const fetchResult = await fetchResp.json()

    const verifyResp = await fetch(`${base}/api/cron/verify-legal`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    const verifyResult = await verifyResp.json()

    // Same situation as cron-news: both downstream routes are paused behind
    // CLAUDE_CRONS_ENABLED, so this is a no-op until they convert.
    const summary =
      `fetch-legal ${fetchResp.status}, verify-legal ${verifyResp.status}` +
      (fetchResp.status === 503 || verifyResp.status === 503
        ? ' — downstream paused (CLAUDE_CRONS_ENABLED unset)'
        : '')

    return {
      result: NextResponse.json({
        success: true,
        fetch: fetchResult,
        verify: verifyResult,
      }),
      summary,
    }
  })
}
