import { NextRequest, NextResponse } from 'next/server'
import { withRunLogging } from '@/lib/job-runs'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''

// Same defensive fetch as cron-news: never let a non-JSON downstream body
// (redirect page, deployment protection HTML, platform error) surface as an
// "Unexpected token '<'" cron failure.
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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (process.env.CLAUDE_CRONS_ENABLED !== '1') {
    return withRunLogging('cron-legal', async () => ({
      result: NextResponse.json({ success: true, skipped: true, reason: 'downstream paused (CLAUDE_CRONS_ENABLED unset)' }),
      summary: 'downstream paused, skipping',
    }))
  }

  return withRunLogging('cron-legal', async () => {
    const base = new URL(request.url).origin

    const fetchRes = await jsonOrTrace(`${base}/api/cron/fetch-legal`, 'cron-legal→fetch-legal')
    const verifyRes = await jsonOrTrace(`${base}/api/cron/verify-legal`, 'cron-legal→verify-legal')

    const summary = `fetch-legal ${fetchRes.status}, verify-legal ${verifyRes.status}`

    return {
      result: NextResponse.json({
        success: true,
        fetch: fetchRes.body,
        verify: verifyRes.body,
      }),
      summary,
    }
  })
}
