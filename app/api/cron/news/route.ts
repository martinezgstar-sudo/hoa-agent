import { NextRequest, NextResponse } from 'next/server'
import { withRunLogging } from '@/lib/job-runs'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''

// Fetch a downstream route and safely parse its body. Downstream may return a
// non-JSON body (Vercel deployment protection, a 308 redirect, an HTML error
// page from the platform) — throwing "Unexpected token '<'" turns a diagnosable
// hiccup into a cron failure. Log the status + body preview and return null.
async function jsonOrTrace(url: string, label: string): Promise<{ status: number; body: unknown }> {
  const r = await fetch(url, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
  const ct = r.headers.get('content-type') || ''
  if (!ct.includes('application/json')) {
    const preview = (await r.text()).slice(0, 200)
    console.warn(`[${label}] non-JSON response ${r.status} ct=${ct} body="${preview}"`)
    return { status: r.status, body: { non_json: true, content_type: ct, preview } }
  }
  try {
    return { status: r.status, body: await r.json() }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`[${label}] JSON parse failed ${r.status}: ${msg}`)
    return { status: r.status, body: { parse_error: msg } }
  }
}

export async function GET(request: NextRequest) {
  const adminHeader = request.headers.get('x-admin-password')
  const authHeader = request.headers.get('authorization')
  if (adminHeader !== ADMIN_PASSWORD && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Logged before auth would record every unauthenticated probe as a run.
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Owner-requested early exit: while CLAUDE_CRONS_ENABLED is unset the
  // downstream routes always return 503, so calling them just to hear "paused"
  // is noise. Return 200 with a paused summary; the run row records the skip.
  if (process.env.CLAUDE_CRONS_ENABLED !== '1') {
    return withRunLogging('cron-news', async () => ({
      result: NextResponse.json({ success: true, skipped: true, reason: 'downstream paused (CLAUDE_CRONS_ENABLED unset)' }),
      summary: 'downstream paused, skipping',
    }))
  }

  return withRunLogging('cron-news', async () => {
    const base = new URL(request.url).origin

    const fetchRes = await jsonOrTrace(`${base}/api/cron/fetch-news`, 'cron-news→fetch-news')
    const enrichRes = await jsonOrTrace(`${base}/api/cron/enrich-news`, 'cron-news→enrich-news')

    const summary = `fetch-news ${fetchRes.status}, enrich-news ${enrichRes.status}`

    return {
      result: NextResponse.json({
        success: true,
        fetch: fetchRes.body,
        enrich: enrichRes.body,
      }),
      summary,
    }
  })
}
