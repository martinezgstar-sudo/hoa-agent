import { NextRequest, NextResponse } from 'next/server'

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

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
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
    '/api/communities-search',
    '/api/address-search',
    '/api/address-lookup',
    '/api/suggest',
    '/api/comments',
  ],
}
