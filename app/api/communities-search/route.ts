import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''
  const city = searchParams.get('city') || ''
  const propertyType = searchParams.get('property_type') || ''
  const pets = searchParams.get('pets') || ''
  const str = searchParams.get('str') || ''
  const feeRange = searchParams.get('fee_range') || ''
  const hasReviews = searchParams.get('has_reviews') || ''
  const management = searchParams.get('management') || ''

  let dbQuery = supabase
    .from('communities')
    .select('*')
    .eq('status', 'published')
    .order('confidence_score', { ascending: false })
    .limit(50)

  if (q.length > 1) {
    dbQuery = dbQuery.or(`canonical_name.ilike.%${q}%,city.ilike.%${q}%,management_company.ilike.%${q}%`)
  }
  if (city) {
    dbQuery = dbQuery.ilike('city', `%${city}%`)
  }
  if (propertyType) {
    dbQuery = dbQuery.ilike('property_type', `%${propertyType}%`)
  }
  if (pets === 'yes') {
    dbQuery = dbQuery.ilike('pet_restriction', '%Yes%')
  } else if (pets === 'no') {
    dbQuery = dbQuery.ilike('pet_restriction', '%No%')
  }
  if (str === 'allowed') {
    dbQuery = dbQuery.ilike('str_restriction', '%Yes%')
  } else if (str === 'not_allowed') {
    dbQuery = dbQuery.ilike('str_restriction', '%No%')
  }
  if (feeRange === 'under200') {
    dbQuery = dbQuery.lte('monthly_fee_max', 200)
  } else if (feeRange === '200to400') {
    dbQuery = dbQuery.gte('monthly_fee_min', 200).lte('monthly_fee_max', 400)
  } else if (feeRange === '400to600') {
    dbQuery = dbQuery.gte('monthly_fee_min', 400).lte('monthly_fee_max', 600)
  } else if (feeRange === 'over600') {
    dbQuery = dbQuery.gte('monthly_fee_min', 600)
  }
  if (hasReviews === 'yes') {
    dbQuery = dbQuery.gt('review_count', 0)
  }
  if (management) {
    dbQuery = dbQuery.ilike('management_company', `%${management}%`)
  }

  const { data: communities } = await dbQuery
  return NextResponse.json({ communities: communities || [] })
}
