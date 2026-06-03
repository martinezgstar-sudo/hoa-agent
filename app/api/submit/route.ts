import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }); }
  const community_name = (body.community_name || '').trim();
  const submitter_email = (body.submitter_email || '').trim();
  if (!community_name || !submitter_email)
    return NextResponse.json({ error: 'Community name and email are required.' }, { status: 400 });
  const feeRaw = body.hoa_fee ? Number(String(body.hoa_fee).replace(/[^0-9.]/g, '')) : null;
  const hoa_fee = feeRaw && !isNaN(feeRaw) ? feeRaw : null;
  const { error } = await supabase.from('suggestions').insert({
    community_name, submitter_email,
    city: (body.city || '').trim() || null,
    address: (body.address || '').trim() || null,
    management_company: (body.management_company || '').trim() || null,
    property_type: (body.property_type || '').trim() || null,
    pet_restriction: (body.pet_restriction || '').trim() || null,
    str_restriction: (body.str_restriction || '').trim() || null,
    amenities: (body.amenities || '').trim() || null,
    hoa_fee,
    notes: (body.notes || '').trim() || null,
    status: 'pending',
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
