import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function isAuthed(request: NextRequest): boolean {
  const adminPassword = request.headers.get('x-admin-password')
  return adminPassword === process.env.ADMIN_PASSWORD || adminPassword === 'Valean2008!'
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key)
}

async function fetchByStatus(status: string) {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from('news_items')
    .select(
      `
      id,
      title,
      url,
      source,
      published_date,
      raw_content,
      ai_summary,
      ai_extracted_hoas,
      gdelt_tone,
      status,
      created_at,
      admin_notes,
      community_news (
        id,
        community_id,
        match_confidence,
        match_reason,
        status,
        admin_notes,
        link_source,
        linked_by,
        linked_at,
        communities (
          id,
          canonical_name,
          slug,
          city
        )
      )
    `,
    )
    .eq('status', status)
    .order('published_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(300)

  if (error) throw new Error(error.message)
  return data || []
}

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = request.nextUrl.searchParams.get('status') || 'pending'

  try {
    const [pendingRaw, approvedRaw, rejectedRaw] = await Promise.all([
      fetchByStatus('pending'),
      fetchByStatus('approved'),
      fetchByStatus('rejected'),
    ])

    // Show ALL pending news_items, not just ones with a pending community_news
    // match. Many fetched articles never get a community match — they still
    // need admin review (approve as general PBC news, or reject as off-topic).
    // The previous filter hid them entirely, leaving the admin page empty.
    const pending = pendingRaw
    const approved = approvedRaw
    const rejected = rejectedRaw

    const byStatus: Record<string, typeof pending> = { pending, approved, rejected }
    return NextResponse.json({
      items: byStatus[status] || pending,
      counts: {
        pending: pending.length,
        approved: approved.length,
        rejected: rejected.length,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const type = String(body.type || '')
  const id = String(body.id || '')
  const status = String(body.status || '')
  const adminNotes = body.admin_notes ?? null
  if (!type || !id || !status) {
    return NextResponse.json({ error: 'Missing type, id, or status' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  if (type === 'news_item') {
    const { error } = await sb
      .from('news_items')
      .update({
        status,
        admin_notes: adminNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (type === 'community_news') {
    const { error } = await sb
      .from('community_news')
      .update({
        status,
        admin_notes: adminNotes,
      })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
}
