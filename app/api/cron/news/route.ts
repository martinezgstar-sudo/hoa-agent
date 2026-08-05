import { NextRequest, NextResponse } from 'next/server'
import { withRunLogging } from '@/lib/job-runs'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''

export async function GET(request: NextRequest) {
  const adminHeader = request.headers.get('x-admin-password')
  const authHeader = request.headers.get('authorization')
  if (adminHeader !== ADMIN_PASSWORD && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Logged before auth would record every unauthenticated probe as a run.
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return withRunLogging('cron-news', async () => {
    const base = new URL(request.url).origin

    const fetchResp = await fetch(`${base}/api/cron/fetch-news`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    const fetchResult = await fetchResp.json()

    const enrichResp = await fetch(`${base}/api/cron/enrich-news`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    const enrichResult = await enrichResp.json()

    // Both downstream routes are currently gated off behind
    // CLAUDE_CRONS_ENABLED and answer 503, so this orchestrator is a no-op
    // until they are converted. Recording their status codes in the summary is
    // what makes that visible in the Runs tab instead of looking healthy.
    const summary =
      `fetch-news ${fetchResp.status}, enrich-news ${enrichResp.status}` +
      (fetchResp.status === 503 || enrichResp.status === 503
        ? ' — downstream paused (CLAUDE_CRONS_ENABLED unset)'
        : '')

    return {
      result: NextResponse.json({
        success: true,
        fetch: fetchResult,
        enrich: enrichResult,
      }),
      summary,
    }
  })
}
