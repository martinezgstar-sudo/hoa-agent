import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const ADMIN_EMAIL = process.env.CLAIM_ADMIN_EMAIL || 'admin@hoa-agent.com'

// In-memory rate limit (per-IP). Survives within a single serverless instance.
// Vercel may spin up multiple instances so this is a soft cap, not a hard one —
// the bigger protection is bot blocking in robots.txt.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const RATE_LIMIT_MAX = 3
const ipHits = new Map<string, number[]>()

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

function isOverLimit(ip: string): boolean {
  const now = Date.now()
  const recent = (ipHits.get(ip) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX) {
    ipHits.set(ip, recent)
    return true
  }
  ipHits.set(ip, [...recent, now])
  return false
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit
    const ip = getClientIp(request)
    if (isOverLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 },
      )
    }

    let body: Record<string, unknown> = {}
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { name, title, email, phone, communityName, preferredContact } = body as {
      name?: string
      title?: string
      email?: string
      phone?: string
      communityName?: string
      preferredContact?: string
    }

    if (!name || !email || !communityName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const emailBody = `
New HOA Representative Claim Request

Community: ${communityName}

Contact Details:
  Name: ${name}
  Title: ${title || 'Not specified'}
  Email: ${email}
  Phone: ${phone || 'Not provided'}
  Preferred contact: ${preferredContact || 'Not specified'}

Submitted: ${new Date().toISOString()}
IP: ${ip}
    `.trim()

    // If RESEND_API_KEY is missing, log + return success rather than 500
    if (!process.env.RESEND_API_KEY) {
      console.warn('[claim api] RESEND_API_KEY not set — logging submission only')
      console.log('[claim api submission]', { name, email, communityName })
      return NextResponse.json({ success: true, warning: 'Email not sent (server unconfigured)' })
    }

    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'HOA Agent <noreply@hoa-agent.com>',
        to: ADMIN_EMAIL,
        subject: `Claim request: ${communityName}`,
        text: emailBody,
      })
      return NextResponse.json({ success: true })
    } catch (err) {
      console.error('[claim api] Resend error:', err)
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
    }
  } catch (err) {
    console.error('[claim api] Unhandled error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
