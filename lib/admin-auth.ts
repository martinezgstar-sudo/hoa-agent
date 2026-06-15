// Edge-compatible signed admin session using Web Crypto HMAC-SHA256.
// No Node APIs are used here so this module is safe to import from
// middleware.ts (which runs in the Edge runtime) as well as route handlers.

export const ADMIN_COOKIE_NAME = 'hoa_admin'
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000 // 12 hours

function getSecret(): string {
  // Prefer a dedicated signing secret; fall back to ADMIN_PASSWORD so the
  // session still works in environments where only the password is set.
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || ''
}

// ── base64url helpers ───────────────────────────────────────────────────────

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const pad = (4 - (b64url.length % 4)) % 4
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function strToBase64Url(s: string): string {
  return bytesToBase64Url(new TextEncoder().encode(s))
}

function base64UrlToStr(b64url: string): string {
  return new TextDecoder().decode(base64UrlToBytes(b64url))
}

// ── HMAC-SHA256 over the payload, returned as base64url ─────────────────────

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return bytesToBase64Url(new Uint8Array(sig))
}

// Length-aware constant-time string comparison.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Create a signed session token: base64url(payload).base64url(hmac). */
export async function createSessionToken(): Promise<string> {
  const payload = strToBase64Url(JSON.stringify({ exp: Date.now() + ADMIN_SESSION_TTL_MS }))
  const sig = await sign(payload)
  return `${payload}.${sig}`
}

/** Verify a session token's signature and expiry. */
export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [payload, sig] = parts
  const expected = await sign(payload)
  if (!constantTimeEqual(sig, expected)) return false
  try {
    const data = JSON.parse(base64UrlToStr(payload))
    if (typeof data.exp !== 'number' || Date.now() > data.exp) return false
    return true
  } catch {
    return false
  }
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get('cookie')
  if (!header) return undefined
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim())
    }
  }
  return undefined
}

/**
 * True when the request carries a valid signed hoa_admin cookie OR an
 * x-admin-password header equal to ADMIN_PASSWORD (compared constant-time).
 */
export async function isAdminRequest(req: Request): Promise<boolean> {
  const header = req.headers.get('x-admin-password')
  const adminPassword = process.env.ADMIN_PASSWORD || ''
  if (header && adminPassword && constantTimeEqual(header, adminPassword)) return true
  return verifySessionToken(readCookie(req, ADMIN_COOKIE_NAME))
}
