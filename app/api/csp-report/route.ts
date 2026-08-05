import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

// Sink for browser CSP violation reports. CSP is deployed in report-only mode
// (see next.config.ts). Every violation the browser detects gets POSTed here;
// we row-insert into public.csp_reports for later review.
//
// Two body shapes exist in the wild:
//   - Legacy: { "csp-report": { document-uri, violated-directive, ... } }
//   - Reports API v1: [{ "type": "csp-violation", "body": { documentURL, ... } }]
// We normalise both and stash the raw payload in `raw` for anything we missed.
//
// This endpoint is public by design (browsers POST anonymously). It writes
// with the service_role key server-side; the row is not exposed via PostgREST.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function hashIp(ip: string | null): string | null {
  if (!ip) return null
  return createHash('sha256').update(ip).digest('hex').slice(0, 16)
}

interface Normalised {
  document_uri: string | null
  violated_directive: string | null
  blocked_uri: string | null
  source_file: string | null
  line_number: number | null
  column_number: number | null
  disposition: string | null
  original_policy: string | null
}

function normalise(payload: unknown): Normalised {
  const empty: Normalised = {
    document_uri: null, violated_directive: null, blocked_uri: null,
    source_file: null, line_number: null, column_number: null,
    disposition: null, original_policy: null,
  }
  if (!payload || typeof payload !== 'object') return empty
  const p = payload as Record<string, unknown>

  // Reports API v1: [{ type, body: {...} }]
  if (Array.isArray(payload)) {
    const first = (payload as unknown[]).find(
      (r): r is Record<string, unknown> =>
        typeof r === 'object' && r !== null && (r as Record<string, unknown>).type === 'csp-violation',
    )
    const body = (first?.body as Record<string, unknown>) || {}
    return {
      document_uri: (body.documentURL as string) || null,
      violated_directive: (body.effectiveDirective as string) || (body.violatedDirective as string) || null,
      blocked_uri: (body.blockedURL as string) || null,
      source_file: (body.sourceFile as string) || null,
      line_number: typeof body.lineNumber === 'number' ? body.lineNumber : null,
      column_number: typeof body.columnNumber === 'number' ? body.columnNumber : null,
      disposition: (body.disposition as string) || null,
      original_policy: (body.originalPolicy as string) || null,
    }
  }

  // Legacy csp-report shape
  const r = (p['csp-report'] as Record<string, unknown>) || p
  return {
    document_uri: (r['document-uri'] as string) || null,
    violated_directive: (r['effective-directive'] as string) || (r['violated-directive'] as string) || null,
    blocked_uri: (r['blocked-uri'] as string) || null,
    source_file: (r['source-file'] as string) || null,
    line_number: typeof r['line-number'] === 'number' ? (r['line-number'] as number) : null,
    column_number: typeof r['column-number'] === 'number' ? (r['column-number'] as number) : null,
    disposition: (r['disposition'] as string) || null,
    original_policy: (r['original-policy'] as string) || null,
  }
}

export async function POST(request: NextRequest) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    // Misconfigured — swallow so the browser never sees a 500 spam back at users.
    return new NextResponse(null, { status: 204 })
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    // Non-JSON body or empty — record enough to notice a broken client but
    // don't fail loudly.
    return new NextResponse(null, { status: 204 })
  }

  const n = normalise(raw)
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const ua = request.headers.get('user-agent')
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || null

  await supabase.from('csp_reports').insert({
    document_uri: n.document_uri,
    violated_directive: n.violated_directive,
    blocked_uri: n.blocked_uri,
    source_file: n.source_file,
    line_number: n.line_number,
    column_number: n.column_number,
    disposition: n.disposition,
    original_policy: n.original_policy,
    raw: raw as object,
    user_agent: ua,
    ip_hash: hashIp(ip),
  })

  return new NextResponse(null, { status: 204 })
}

// Handle both content-types browsers send for CSP reports.
export const dynamic = 'force-dynamic'
