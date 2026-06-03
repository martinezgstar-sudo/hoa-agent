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
  const { id, action } = await req.json();
  if (!id || !['approve', 'reject'].includes(action))
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const status = action === 'approve' ? 'approved' : 'rejected';

  const { data: link, error: e1 } = await supabase
    .from('community_legal_cases').select('community_id').eq('id', id).single();
  if (e1 || !link) return NextResponse.json({ error: e1?.message ?? 'not found' }, { status: 404 });

  const { error: e2 } = await supabase
    .from('community_legal_cases').update({ status }).eq('id', id);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  const { count } = await supabase
    .from('community_legal_cases')
    .select('id', { count: 'exact', head: true })
    .eq('community_id', link.community_id).eq('status', 'approved');
  await supabase.from('communities')
    .update({ litigation_count: count ?? 0 }).eq('id', link.community_id);

  return NextResponse.json({ ok: true });
}
