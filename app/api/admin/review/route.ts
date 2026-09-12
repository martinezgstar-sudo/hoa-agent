// POST /api/admin/review — approve or reject a needs_review community.
//
// Approve: status='published', verification_status='verified',
//          last_verified=now(); change_log(action='approved',
//          field='status', old='needs_review', new='published',
//          source='admin').
//
// Reject:  status='removed'; change_log(action='rejected',
//          field='status', old='needs_review', new='removed',
//          source='admin', reason=<selected>). 'Other' MUST carry a
//          note; the reason is stored as 'Other: <note>'.
//
// Auth: signed hoa_admin cookie OR x-admin-password header
// (isAdminRequest). Middleware already gates /admin/* page loads.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminRequest } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const REJECT_REASONS = ['Not an HOA', 'Out of market', 'Inactive', 'Duplicate', 'Other']

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env')
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function POST(req: Request) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { community_id?: string; action?: string; reason?: string; note?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'invalid json body' }, { status: 400 }) }

  const id     = String(body.community_id ?? '')
  const action = String(body.action ?? '')
  if (!id)                              return NextResponse.json({ error: 'missing community_id' }, { status: 400 })
  if (action !== 'approve' && action !== 'reject') return NextResponse.json({ error: 'action must be approve|reject' }, { status: 400 })

  const sb = admin()

  const { data: current, error: readErr } = await sb
    .from('communities')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()
  if (readErr || !current)              return NextResponse.json({ error: readErr?.message ?? 'community not found' }, { status: 404 })
  if (current.status !== 'needs_review') return NextResponse.json({ error: `community status is ${current.status}, not needs_review` }, { status: 409 })

  const nowIso = new Date().toISOString()

  if (action === 'approve') {
    const { error: upErr } = await sb
      .from('communities')
      .update({ status: 'published', verification_status: 'verified', last_verified: nowIso })
      .eq('id', id)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    const { error: clErr } = await sb.from('change_log').insert({
      community_id: id,
      action:       'approved',
      field:        'status',
      old_value:    'needs_review',
      new_value:    'published',
      source:       'admin',
      reason:       null,
    })
    if (clErr) return NextResponse.json({ error: clErr.message }, { status: 500 })
    return NextResponse.json({ ok: true, community_id: id, new_status: 'published' })
  }

  // reject
  const rawReason = String(body.reason ?? '').trim()
  if (!REJECT_REASONS.includes(rawReason)) {
    return NextResponse.json({ error: `reason must be one of ${REJECT_REASONS.join(' | ')}` }, { status: 400 })
  }
  let storedReason = rawReason
  if (rawReason === 'Other') {
    const note = String(body.note ?? '').trim()
    if (!note) return NextResponse.json({ error: '"Other" requires a note' }, { status: 400 })
    storedReason = `Other: ${note}`
  }

  const { error: upErr } = await sb
    .from('communities')
    .update({ status: 'removed' })
    .eq('id', id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  const { error: clErr } = await sb.from('change_log').insert({
    community_id: id,
    action:       'rejected',
    field:        'status',
    old_value:    'needs_review',
    new_value:    'removed',
    source:       'admin',
    reason:       storedReason,
  })
  if (clErr) return NextResponse.json({ error: clErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, community_id: id, new_status: 'removed', reason: storedReason })
}
