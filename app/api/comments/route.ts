import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { community_id, comment_text, rating, commenter_name } = body

  if (!community_id || !comment_text) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (comment_text.length < 10) {
    return NextResponse.json({ error: 'Comment too short' }, { status: 400 })
  }

  if (comment_text.length > 2000) {
    return NextResponse.json({ error: 'Comment too long' }, { status: 400 })
  }

  const { error } = await supabase
    .from('community_comments')
    .insert({
      community_id,
      comment_text,
      rating: rating || null,
      commenter_name: commenter_name || 'Anonymous',
      status: 'pending'
    })

  if (error) {
    return NextResponse.json({ error: 'Failed to submit comment' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
