// Admiral-approved task: mark community B (6d15a37a) as status=duplicate, keep A (df5a2c3a) as canonical.
// Optional rename of A and property_type change is a SEPARATE decision — NOT executed here.

const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const A_ID = 'df5a2c3a';  // partial — we will pattern match
const B_ID = '6d15a37a';
const SNAP_DIR = '/Users/izzymartinez/Agents/hoa-agent/logs/snapshots';

(async () => {
  await status.start('mission-goal', 'Mark Timber Pines duplicate B (6d15a37a) per admiral approval', 1);

  // 1) Resolve full UUIDs + verify current state
  // UUID columns don't support ILIKE; fetch all 33404 rows and match by prefix in JS.
  const { data: zipRows, error: fetchErr } = await supabase
    .from('communities')
    .select('id, canonical_name, slug, status, zip_code, city, property_type, unit_count, created_at, master_hoa_id, is_sub_hoa, monthly_fee_min, monthly_fee_max, monthly_fee_median, management_company, website_url, entity_status, registered_agent, amenities, news_reputation_score, review_count, fee_observation_count, litigation_count')
    .eq('zip_code', '33404');
  const matches = (zipRows || []).filter(r => r.id.startsWith(A_ID) || r.id.startsWith(B_ID));

  if (fetchErr) {
    await status.error('mission-goal', `Pre-fetch failed: ${fetchErr.message}`);
    console.error(fetchErr);
    process.exit(1);
  }

  if (!matches || matches.length !== 2) {
    await status.error('mission-goal', `Expected 2 rows, got ${matches?.length || 0}`);
    console.error('Matches:', matches);
    process.exit(1);
  }

  const rowA = matches.find(r => r.id.startsWith(A_ID));
  const rowB = matches.find(r => r.id.startsWith(B_ID));

  if (!rowA || !rowB) {
    await status.error('mission-goal', 'Could not identify both rows by prefix');
    process.exit(1);
  }

  console.log('Pre-state A:', JSON.stringify(rowA, null, 2));
  console.log('Pre-state B:', JSON.stringify(rowB, null, 2));

  // 2) Safety checks: confirm both rows are bare (no enrichment) and in 33404
  const isBare = (r) => {
    return !r.monthly_fee_min && !r.monthly_fee_max && !r.monthly_fee_median
      && !r.management_company && !r.website_url
      && !r.entity_status && !r.registered_agent
      && (!r.fee_observation_count || r.fee_observation_count === 0)
      && (!r.review_count || r.review_count === 0)
      && (!r.litigation_count || r.litigation_count === 0);
  };

  if (rowB.zip_code !== '33404') {
    await status.error('mission-goal', `B not in 33404 (got ${rowB.zip_code}); aborting`);
    process.exit(1);
  }
  if (!isBare(rowB)) {
    await status.warn('mission-goal', 'B is not bare — admiral spec said both bare. Aborting to be safe.', { B: rowB });
    process.exit(1);
  }
  if (rowB.status === 'duplicate') {
    await status.complete('mission-goal', `B (${rowB.id}) was already status=duplicate; no change needed.`, { B_id: rowB.id });
    process.exit(0);
  }

  // 3) Check that no other row points to B as master_hoa_id (would imply B has subs)
  const { data: subsOfB, error: subErr } = await supabase
    .from('communities')
    .select('id, canonical_name')
    .eq('master_hoa_id', rowB.id);
  if (subErr) {
    await status.error('mission-goal', `Sub-check failed: ${subErr.message}`);
    process.exit(1);
  }
  if (subsOfB && subsOfB.length > 0) {
    await status.warn('mission-goal', `B has ${subsOfB.length} sub(s) pointing to it; aborting per rule #17`, { subs: subsOfB });
    process.exit(1);
  }

  // 4) Snapshot pre-state
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  if (!fs.existsSync(SNAP_DIR)) fs.mkdirSync(SNAP_DIR, { recursive: true });
  const prePath = path.join(SNAP_DIR, `timber-pines-dup-pre-${ts}.json`);
  fs.writeFileSync(prePath, JSON.stringify({ A: rowA, B: rowB, subsOfB }, null, 2));
  console.log('Pre-state snapshot:', prePath);

  // 5) UPDATE: mark B as duplicate
  const { data: updated, error: updErr } = await supabase
    .from('communities')
    .update({ status: 'duplicate' })
    .eq('id', rowB.id)
    .eq('status', rowB.status)  // optimistic concurrency: only flip from current status
    .select('id, canonical_name, status, zip_code, property_type, created_at')
    .single();

  if (updErr) {
    await status.error('mission-goal', `UPDATE failed: ${updErr.message}`);
    console.error(updErr);
    process.exit(1);
  }

  console.log('Post-state B:', JSON.stringify(updated, null, 2));

  // 6) Verify A is untouched
  const { data: verifyA, error: vAerr } = await supabase
    .from('communities')
    .select('id, canonical_name, status, zip_code, property_type, unit_count, created_at')
    .eq('id', rowA.id)
    .single();
  if (vAerr) {
    await status.error('mission-goal', `Verify A failed: ${vAerr.message}`);
    process.exit(1);
  }
  console.log('Verify A unchanged:', JSON.stringify(verifyA, null, 2));

  // 7) Snapshot post-state
  const postPath = path.join(SNAP_DIR, `timber-pines-dup-post-${ts}.json`);
  fs.writeFileSync(postPath, JSON.stringify({ A_unchanged: verifyA, B_after: updated }, null, 2));
  console.log('Post-state snapshot:', postPath);

  // 8) File follow-up review for the optional rename (NOT executed — separate decision)
  await status.flagReview(
    'mission-goal',
    'medium',
    `Timber Pines canonical row (${rowA.id.slice(0,8)}): optional rename + property_type alignment with PBC PAO`,
    `Community A (${rowA.id}) is canonical_name="${rowA.canonical_name}", property_type="${rowA.property_type}". PBC PAO ground truth for ZIP 33404 W 27th St is "TIMBER PINES WEST" — a TOWNHOUSE community built 1985 — which neither row's name matches verbatim. Admiral approved Option (a) (mark B duplicate, done in this task). Optional follow-up flagged for separate admiral decision: rename A canonical_name to "Timber Pines West" and set property_type=Townhouse to match PAO. Not executed automatically per rule #17 and per admiral instruction.`,
    {
      community_id: rowA.id,
      current_canonical_name: rowA.canonical_name,
      current_property_type: rowA.property_type,
      proposed_canonical_name: 'Timber Pines West',
      proposed_property_type: 'Townhouse',
      pao_evidence: 'TIMBER PINES WEST — W 27th St, Riviera Beach 33404, built 1985, TOWNHOUSE',
      duplicate_marked: rowB.id,
      duplicate_at: ts
    }
  );

  await status.complete(
    'mission-goal',
    `Marked Timber Pines duplicate B (${rowB.id}) status=duplicate per admiral Option (a); A (${rowA.id}) kept as canonical; flagged optional rename to "Timber Pines West"/property_type=Townhouse for separate admiral decision.`,
    {
      A_id: rowA.id,
      A_canonical_name: rowA.canonical_name,
      A_status: verifyA.status,
      B_id: rowB.id,
      B_canonical_name: rowB.canonical_name,
      B_status_before: rowB.status,
      B_status_after: updated.status,
      pre_snapshot: prePath,
      post_snapshot: postPath
    }
  );

  console.log('Done.');
  process.exit(0);
})().catch(async (e) => {
  console.error(e);
  await status.error('mission-goal', `Uncaught: ${e.message}`);
  process.exit(1);
});
