import { NextRequest, NextResponse } from 'next/server'
import { createSessionToken, ADMIN_COOKIE_NAME, ADMIN_SESSION_TTL_MS } from '@/lib/admin-auth'

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const password = typeof body?.password === 'string' ? body.password : ''
  const expected = process.env.ADMIN_PASSWORD || ''

  if (!expected || !constantTimeEqual(password, expected)) {
    return NextResponse.json({ ok: false, error: 'Invalid password' }, { status: 401 })
  }

  const token = await createSessionToken()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
