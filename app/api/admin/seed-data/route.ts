import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').trim()
}

export async function POST(request: NextRequest) {
  const adminHeader = request.headers.get('x-admin-password')
  if (adminHeader !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const results: Record<string, any> = {}

  // --- Task 6: Insert Solcera ---
  const { data: existingSolcera } = await supabase
    .from('communities')
    .select('id, canonical_name')
    .ilike('canonical_name', '%Solcera%')

  if (existingSolcera && existingSolcera.length > 0) {
    results.solcera = { status: 'skipped', reason: 'already exists', id: existingSolcera[0].id }
  } else {
    const canonicalName = 'Solcera Homeowners Association'
    let slug = slugify(canonicalName)
    const { data: slugCheck } = await supabase.from('communities').select('id').eq('slug', slug)
    if (slugCheck && slugCheck.length > 0) slug = slug + '-2'

    const { data: inserted, error } = await supabase.from('communities').insert({
      canonical_name: canonicalName,
      slug,
      city: 'West Palm Beach',
      county: 'Palm Beach',
      state: 'FL',
      zip_code: '33415',
      street_address: 'Pointe of Woods Drive, West Palm Beach, FL 33415',
      property_type: 'Single Family',
      monthly_fee_min: 259,
      monthly_fee_max: 267,
      monthly_fee_median: 263,
      amenities: 'Pool, Clubhouse, Playground, Dog Park, Walking Trails, Gated',
      status: 'published',
      published: true,
      subdivision_aliases: ['Pointe of Woods', 'Pointe of Woods PUD', 'Solcera'],
    }).select('id')

    if (error) {
      results.solcera = { status: 'error', error: error.message }
    } else {
      results.solcera = { status: 'inserted', id: inserted?.[0]?.id, slug }
    }
  }

  // --- Task 7: Fix Victoria Woods address ---
  const { data: victoriaWoods } = await supabase
    .from('communities')
    .select('id, canonical_name, city, street_address')
    .ilike('canonical_name', '%Victoria Woods%')

  if (!victoriaWoods || victoriaWoods.length === 0) {
    results.victoria_woods = { status: 'not_found' }
  } else {
    const updates = []
    for (const community of victoriaWoods) {
      const { error } = await supabase
        .from('communities')
        .update({
          street_address: 'Summit Blvd, West Palm Beach, FL',
          city: 'West Palm Beach',
        })
        .eq('id', community.id)

      updates.push({
        id: community.id,
        name: community.canonical_name,
        status: error ? 'error' : 'updated',
        error: error?.message,
      })
    }
    results.victoria_woods = { status: 'processed', updates }
  }

  return NextResponse.json({ success: true, results })
}
