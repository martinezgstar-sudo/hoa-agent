import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// SELECT only columns confirmed to exist in production. The legacy schema uses
// is_sub_hoa + master_hoa_id; the newer migration adds is_master + parent_id
// but it has not yet been applied. Including a non-existent column makes the
// entire query return null silently in supabase-js, which used to surface as
// "0 results for shoma" on /search.
const SELECT_COLUMNS = [
  'id', 'canonical_name', 'slug', 'city', 'city_verified', 'zip_code',
  'unit_count', 'property_type', 'monthly_fee_min', 'monthly_fee_max',
  'confidence_score', 'review_count', 'review_avg', 'assessment_signal_count',
  'management_company', 'pet_restriction', 'is_sub_hoa', 'master_hoa_id',
].join(', ')

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
  const sort = searchParams.get('sort') || 'units'

  let dbQuery = supabase
    .from('communities')
    .select(SELECT_COLUMNS)
    .eq('status', 'published')
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
  // hoa_type filter — uses legacy schema only (is_sub_hoa + master_hoa_id)
  // until the migration adding is_master/parent_id runs in production.
  if (hoaType === 'master') {
    // Master = communities that have other communities pointing to them via master_hoa_id.
    // We can't easily express "is referenced as master_hoa_id" in a single supabase-js
    // call, so approximate with: not a sub-HOA (no master_hoa_id and is_sub_hoa false).
    dbQuery = dbQuery.eq('is_sub_hoa', false).is('master_hoa_id', null)
  } else if (hoaType === 'sub') {
    dbQuery = dbQuery.or('is_sub_hoa.eq.true,master_hoa_id.not.is.null')
  } else if (hoaType === 'standalone') {
    dbQuery = dbQuery.eq('is_sub_hoa', false).is('master_hoa_id', null)
  }

  if (sort === 'az') {
    dbQuery = dbQuery.order('canonical_name', { ascending: true })
  } else {
    dbQuery = dbQuery.order('unit_count', { ascending: false, nullsFirst: false })
  }

  const { data: communities, error } = await dbQuery
  if (error) {
    console.error('[api/communities-search]', { q, error: error.message })
    return NextResponse.json({ communities: [], error: error.message }, { status: 200 })
  }
  return NextResponse.json({ communities: communities || [] })
}
