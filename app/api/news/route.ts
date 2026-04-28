import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const communityId = searchParams.get('community_id')
  const limit = parseInt(searchParams.get('limit') || '10')

  try {
    if (communityId) {
      const { data: matched, error: matchError } = await supabase
        .from('community_news')
        .select('news_item_id')
        .eq('community_id', communityId)
        .eq('status', 'approved')
        .gte('match_confidence', 0.8)

      if (!matchError && matched && matched.length > 0) {
        const ids = matched.map((m: any) => m.news_item_id)
        const { data, error } = await supabase
          .from('news_items')
          .select('id, title, url, source, published_date, ai_summary')
          .eq('status', 'approved')
          .in('id', ids)
          .order('published_date', { ascending: false })
          .limit(limit)

        if (!error && data && data.length > 0) {
          return NextResponse.json({ articles: data, matched: true })
        }
      }
    }

    const { data, error } = await supabase
      .from('news_items')
      .select('id, title, url, source, published_date, ai_summary')
      .eq('status', 'approved')
      .order('published_date', { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ articles: data || [], matched: false })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
