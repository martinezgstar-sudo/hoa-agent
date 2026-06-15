import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/admin-auth'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''

const rateLimit = new Map<string, { count: number; resetTime: number }>()

const RATE_LIMITS: Record<string, { requests: number; windowMs: number }> = {
  '/api/communities-search': { requests: 30, windowMs: 60 * 1000 },
  '/api/address-search': { requests: 30, windowMs: 60 * 1000 },
  '/api/address-lookup': { requests: 20, windowMs: 60 * 1000 },
  '/api/suggest': { requests: 5, windowMs: 60 * 1000 },
  '/api/comments': { requests: 5, windowMs: 60 * 1000 },
}

function getIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown'
  return ip
}

function isAdminLoginPath(pathname: string): boolean {
  return (
    pathname === '/admin/login' ||
    pathname === '/api/admin/login' ||
    pathname.startsWith('/admin/login/') ||
    pathname.startsWith('/api/admin/login/')
  )
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // ── Admin gating ──────────────────────────────────────────────────────────
  const isAdminPage = pathname === '/admin' || pathname.startsWith('/admin/')
  const isAdminApi = pathname === '/api/admin' || pathname.startsWith('/api/admin/')

  if ((isAdminPage || isAdminApi) && !isAdminLoginPath(pathname)) {
    const authed = await isAdminRequest(request)

    if (!authed) {
      if (isAdminApi) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const loginUrl = new URL('/admin/login', request.url)
      loginUrl.searchParams.set('next', pathname + request.nextUrl.search)
      return NextResponse.redirect(loginUrl)
    }

    // Authenticated: inject the admin password header so route handlers
    // pass their own checks without the browser ever holding the secret.
    if (isAdminApi) {
      const headers = new Headers(request.headers)
      headers.set('x-admin-password', ADMIN_PASSWORD)
      return NextResponse.next({ request: { headers } })
    }
    return NextResponse.next()
  }

  // ── Rate limiting (unchanged) ─────────────────────────────────────────────
  const limit = RATE_LIMITS[pathname]

  if (!limit) return NextResponse.next()

  const ip = getIP(request)
  const key = ip + ':' + pathname
  const now = Date.now()

  const current = rateLimit.get(key)

  if (!current || now > current.resetTime) {
    rateLimit.set(key, { count: 1, resetTime: now + limit.windowMs })
    return NextResponse.next()
  }

  if (current.count >= limit.requests) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((current.resetTime - now) / 1000)),
          'X-RateLimit-Limit': String(limit.requests),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }

  current.count++
  rateLimit.set(key, current)

  const response = NextResponse.next()
  response.headers.set('X-RateLimit-Limit', String(limit.requests))
  response.headers.set('X-RateLimit-Remaining', String(limit.requests - current.count))
  return response
}

export const config = {
  matcher: [
    '/admin',
    '/admin/:path*',
    '/api/admin/:path*',
    '/api/communities-search',
    '/api/address-search',
    '/api/address-lookup',
    '/api/suggest',
    '/api/comments',
  ],
}
