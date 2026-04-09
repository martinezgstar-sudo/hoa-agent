import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const adminPassword = request.headers.get('x-admin-password')
  if (adminPassword !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const status = request.nextUrl.searchParams.get('status') || 'pending'
  const { data, error } = await supabase
    .from('community_comments')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ comments: data })
}

export async function PATCH(request: NextRequest) {
  const adminPassword = request.headers.get('x-admin-password')
  if (adminPassword !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, status } = await request.json()

  // Update comment status
  const { data: comment, error } = await supabase
    .from('community_comments')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('community_id, rating')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If approved, recalculate community review_count and review_avg
  if (status === 'approved' && comment?.community_id) {
    const { data: comments } = await supabase
      .from('community_comments')
      .select('rating')
      .eq('community_id', comment.community_id)
      .eq('status', 'approved')

    if (comments && comments.length > 0) {
      const ratings = comments.filter(c => c.rating).map(c => c.rating)
      const avg = ratings.length > 0
        ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
        : null

      await supabase
        .from('communities')
        .update({
          review_count: comments.length,
          review_avg: avg
        })
        .eq('id', comment.community_id)
    }
  }

  return NextResponse.json({ success: true })
}
