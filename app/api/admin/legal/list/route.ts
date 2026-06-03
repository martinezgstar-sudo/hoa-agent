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
  const { data, error } = await supabase
    .from('community_legal_cases')
    .select(`id, match_confidence, match_reason, created_at,
      legal_cases ( case_name, court, date_filed, absolute_url, snippet, docket_number ),
      communities ( canonical_name, slug, city )`)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ links: data ?? [] });
}
