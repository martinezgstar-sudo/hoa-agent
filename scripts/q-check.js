const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // any existing ms-adv (Q) proposals?
  const { data: q, error } = await supabase
    .from('agent_review_queue')
    .select('id, priority, title, status, created_at')
    .eq('agent_id', 'ms-adv')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('=== EXISTING Q (ms-adv) PROPOSALS ===');
  if (error) console.error(error);
  else q.forEach(r => console.log(`[${r.created_at?.slice(0,10)}] ${r.priority} ${r.status} :: ${r.title}`));

  // social-marketing activity (Neelix/Kes/Wesley)
  const { data: social } = await supabase
    .from('agent_activity')
    .select('agent_id, event_type, message, created_at')
    .or('agent_id.eq.hoa-social,agent_id.eq.hoa-comments,agent_id.eq.ms-marketing')
    .order('created_at', { ascending: false })
    .limit(15);
  console.log('\n=== RECENT SOCIAL/MARKETING ACTIVITY ===');
  social.forEach(r => console.log(`[${r.created_at?.slice(0,16)}] ${r.agent_id} ${r.event_type} :: ${r.message?.slice(0,120)}`));

  // proposals related to social outreach
  const { data: sp } = await supabase
    .from('agent_review_queue')
    .select('agent_id, priority, title, status, created_at')
    .or('title.ilike.%facebook%,title.ilike.%instagram%,title.ilike.%linkedin%,title.ilike.%social%,title.ilike.%post%')
    .order('created_at', { ascending: false })
    .limit(15);
  console.log('\n=== SOCIAL-RELATED PROPOSALS (recent) ===');
  sp.forEach(r => console.log(`[${r.created_at?.slice(0,10)}] ${r.agent_id} ${r.priority} ${r.status} :: ${r.title}`));
})();
