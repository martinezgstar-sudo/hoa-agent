import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const ADMIN_EMAIL = process.env.CLAIM_ADMIN_EMAIL || 'admin@hoa-agent.com'

function getResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY not set')
  return new Resend(key)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, title, email, phone, communityName, preferredContact } = body

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
  `.trim()

  try {
    const resend = getResend()
    await resend.emails.send({
      from: 'HOA Agent <noreply@hoa-agent.com>',
      to: ADMIN_EMAIL,
      subject: `Claim request: ${communityName}`,
      text: emailBody,
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Resend error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
