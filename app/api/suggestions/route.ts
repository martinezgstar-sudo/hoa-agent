import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * Public field-level correction submissions (ManagementModal).
 *
 * These used to land in `community_suggestions`, which no admin screen ever
 * read — 17 rows went in and the last one was reviewed 2026-05-08, so every
 * correction submitted after that was silently buried. They now go to
 * `pending_community_data`, which /admin/pending actually consumes.
 *
 * Always propose-only: a public submission is never auto-approvable, whatever
 * confidence it carries.
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { community_id, field, suggested_value, details } = body

    if (!community_id || !field || !suggested_value) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { error } = await supabase
      .from('pending_community_data')
      .insert({
        community_id,
        field_name: field,
        proposed_value: suggested_value,
        details: details || null,
        source_type: 'user_suggestion',
        source_url: 'user-submission:management-modal',
        confidence: 0.5,
        auto_approvable: false,
        status: 'pending',
      })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
