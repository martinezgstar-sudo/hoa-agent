import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
const ok = (req: Request) => req.headers.get('x-admin-password') === process.env.ADMIN_PASSWORD;

export async function POST(req: Request) {
  if (!ok(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { legalCaseId, communityId } = await req.json();
  if (!legalCaseId || !communityId)
    return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const { data: existing } = await supabase
    .from('community_legal_cases')
    .select('id')
    .eq('legal_case_id', legalCaseId)
    .eq('community_id', communityId)
    .maybeSingle();

  if (existing) {
    await supabase.from('community_legal_cases')
      .update({ status: 'approved', match_confidence: 1, match_reason: 'manual assignment' })
      .eq('id', existing.id);
  } else {
    const { error: eIns } = await supabase.from('community_legal_cases').insert({
      legal_case_id: legalCaseId, community_id: communityId,
      match_confidence: 1, match_reason: 'manual assignment', status: 'approved',
    });
    if (eIns) return NextResponse.json({ error: eIns.message }, { status: 500 });
  }

  await supabase.from('community_legal_cases')
    .update({ status: 'rejected' })
    .eq('legal_case_id', legalCaseId)
    .eq('status', 'pending');

  const { count } = await supabase
    .from('community_legal_cases')
    .select('id', { count: 'exact', head: true })
    .eq('community_id', communityId).eq('status', 'approved');
  await supabase.from('communities')
    .update({ litigation_count: count ?? 0 }).eq('id', communityId);

  return NextResponse.json({ ok: true });
}
