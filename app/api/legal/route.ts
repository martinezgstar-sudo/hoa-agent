import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const communityId = searchParams.get('community_id')
  const limit = parseInt(searchParams.get('limit') || '5')

  try {
    if (communityId) {
      const { data: matched } = await supabase
        .from('community_legal_cases')
        .select('legal_case_id')
        .eq('community_id', communityId)
        .eq('status', 'approved')
        .gte('match_confidence', 0.8)

      if (matched && matched.length > 0) {
        const ids = matched.map((m: any) => m.legal_case_id)
        const { data } = await supabase
          .from('legal_cases')
          .select('id, case_name, court, docket_number, date_filed, absolute_url, ai_summary, tags')
          .eq('status', 'published')
          .in('id', ids)
          .order('date_filed', { ascending: false })
          .limit(limit)

        if (data && data.length > 0) {
          return NextResponse.json({ cases: data, matched: true })
        }
      }
    }

    const { data } = await supabase
      .from('legal_cases')
      .select('id, case_name, court, docket_number, date_filed, absolute_url, ai_summary, tags')
      .eq('status', 'published')
      .order('date_filed', { ascending: false })
      .limit(limit)

    return NextResponse.json({ cases: data || [], matched: false })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
