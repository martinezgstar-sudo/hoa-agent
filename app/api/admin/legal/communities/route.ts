import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
const ok = (req: Request) => req.headers.get('x-admin-password') === process.env.ADMIN_PASSWORD;

export async function GET(req: Request) {
  if (!ok(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  if (q.length < 3) return NextResponse.json({ communities: [] });
  const { data, error } = await supabase
    .from('communities')
    .select('id, canonical_name, city, slug')
    .ilike('canonical_name', `%${q}%`)
    .order('canonical_name')
    .limit(10);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ communities: data ?? [] });
}
