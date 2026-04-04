import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''

  let dbQuery = supabase
    .from('communities')
    .select('*')
    .eq('status', 'published')
    .order('confidence_score', { ascending: false })
    .limit(50)

  if (q.length > 1) {
    dbQuery = dbQuery.or(`canonical_name.ilike.%${q}%,city.ilike.%${q}%,management_company.ilike.%${q}%`)
  }

  const { data: communities } = await dbQuery
  return NextResponse.json({ communities: communities || [] })
}
