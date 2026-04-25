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
  const hoaType = searchParams.get('hoa_type') || ''

  let dbQuery = supabase
    .from('communities')
    .select(
      'id, canonical_name, slug, city, city_verified, zip_code, unit_count, property_type, monthly_fee_min, monthly_fee_max, confidence_score, review_count, review_avg, assessment_signal_count, management_company, pet_restriction, is_sub_hoa'
    )
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
  if (hoaType === 'master') {
    dbQuery = dbQuery.eq('is_sub_hoa', false).not('id', 'in', '(select master_hoa_id from communities where master_hoa_id is not null)')
  } else if (hoaType === 'sub') {
    dbQuery = dbQuery.eq('is_sub_hoa', true)
  } else if (hoaType === 'standalone') {
    dbQuery = dbQuery.eq('is_sub_hoa', false)
  }

  const { data: communities } = await dbQuery
  return NextResponse.json({ communities: communities || [] })
}
