// Tuvix (hoa-goal) Goal Architect refinement pass.
// For each pending hoa-dir proposal lacking `context.refined_at`:
//   - Normalize success_criteria to an array of measurable items
//   - Normalize effort_estimate to a structured object {minutes, risk, breakdown}
//   - Stamp refined_at, refined_by_agent_id='hoa-goal', refined_by_goal_architect=true
//   - Tighten title if >100 chars (light touch — preserve captain's intent)
// No new rows are written. Updates only.

const path = require('path');
const status = require('/Users/izzymartinez/Agents/command-center/lib/agent-status.js');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(process.env.HOME, 'Documents/hoa-agent/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGENT_ID = 'hoa-goal';
const NOW = new Date().toISOString();

function splitCriteriaString(s) {
  if (!s || typeof s !== 'string') return null;
  // Try numbered patterns first: "(1) ... (2) ... (3) ..."
  const numbered = s.split(/\s*\(\d+\)\s*/).map(t => t.trim()).filter(Boolean);
  if (numbered.length >= 2) return numbered.map(t => t.replace(/[.;]\s*$/, ''));
  // Try semicolons
  const semi = s.split(/;\s*/).map(t => t.trim()).filter(Boolean);
  if (semi.length >= 2) return semi.map(t => t.replace(/[.;]\s*$/, ''));
  // Try period-then-capital
  const sent = s.split(/\.\s+(?=[A-Z(])/).map(t => t.trim()).filter(Boolean);
  if (sent.length >= 2) return sent.map(t => t.replace(/[.;]\s*$/, ''));
  return [s];
}

function normalizeEffortEstimate(ee, estTime) {
  if (ee && typeof ee === 'object') return ee;
  if (typeof ee === 'string') {
    const minutesMatch = ee.match(/(\d{1,3})\s*min/i);
    const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : (estTime || null);
    const risk = /low risk/i.test(ee) ? 'low' :
                 /high risk/i.test(ee) ? 'high' :
                 /medium risk/i.test(ee) ? 'medium' : null;
    const out = { breakdown: ee };
    if (minutes) out.minutes = minutes;
    if (risk) out.risk = risk;
    return out;
  }
  return estTime ? { minutes: estTime } : null;
}

function tightenTitle(title) {
  if (!title || title.length <= 100) return title;
  // Light cleanup: remove redundant parenthetical disclaimers if present
  let t = title;
  t = t.replace(/\s*\(([^)]+)\)\s*$/, ''); // strip trailing parenthetical
  if (t.length > 100) {
    // Last resort: keep first chunk before em-dash
    const emDash = t.indexOf('—');
    if (emDash > 0 && emDash < 100) t = t.slice(0, emDash + 1).trim();
  }
  return t.length <= 100 ? t : title; // bail if we can't shorten cleanly
}

(async () => {
  await status.start(AGENT_ID, 'Refining pending hoa-dir proposals (QC normalization)', 0);

  const { data: proposals, error } = await supabase
    .from('agent_review_queue')
    .select('*')
    .eq('status', 'pending')
    .eq('agent_id', 'hoa-dir')
    .order('created_at', { ascending: false });

  if (error) {
    await status.error(AGENT_ID, `Query failed: ${error.message}`);
    process.exit(1);
  }

  const targets = proposals.filter(p => !p.context?.refined_at);
  console.log(`Total pending hoa-dir: ${proposals.length}`);
  console.log(`Needing refined_at stamp: ${targets.length}`);

  await status.progress(AGENT_ID, 0, `Refining ${targets.length} proposals`);

  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < targets.length; i++) {
    const p = targets[i];
    const oldCtx = p.context || {};

    const newCtx = { ...oldCtx };

    // Normalize success_criteria
    if (typeof newCtx.success_criteria === 'string') {
      const arr = splitCriteriaString(newCtx.success_criteria);
      if (arr && arr.length >= 2) newCtx.success_criteria = arr;
    }

    // Normalize effort_estimate
    newCtx.effort_estimate = normalizeEffortEstimate(newCtx.effort_estimate, newCtx.estimated_time);

    // Stamp refinement markers (preserve legacy qc_* markers as-is)
    newCtx.refined_at = NOW;
    newCtx.refined_by_agent_id = 'hoa-goal';
    newCtx.refined_by_goal_architect = true;
    if (!newCtx.refinement_notes && newCtx.qc_notes) {
      newCtx.refinement_notes = `QC pass (Tuvix 2026-05-24): normalized success_criteria to array, effort_estimate to object, stamped refined_at. Prior qc_* markers from ${oldCtx.qc_pass_at || 'earlier tour'} preserved.`;
    } else if (!newCtx.refinement_notes) {
      newCtx.refinement_notes = `QC pass (Tuvix 2026-05-24): normalized success_criteria to array, effort_estimate to object, stamped refined_at.`;
    }

    // Tighten title
    const newTitle = tightenTitle(p.title);

    const update = { context: newCtx };
    if (newTitle !== p.title) update.title = newTitle;

    const { error: upErr } = await supabase
      .from('agent_review_queue')
      .update(update)
      .eq('id', p.id);

    if (upErr) {
      console.error(`FAIL ${p.id.slice(0,8)}: ${upErr.message}`);
      skipped++;
    } else {
      updated++;
      console.log(`[${updated}/${targets.length}] ${p.id.slice(0,8)} | ${p.priority.padEnd(8)} | ${(update.title || p.title).slice(0, 75)}`);
    }

    if ((i + 1) % 5 === 0) {
      await status.progress(AGENT_ID, i + 1, `${updated} updated, ${skipped} skipped`);
    }
  }

  const summary = `Refined ${updated}/${targets.length} pending hoa-dir proposals (skipped ${skipped}). Normalized success_criteria to arrays + effort_estimate to objects + stamped refined_at.`;
  console.log('\n' + summary);
  await status.complete(AGENT_ID, summary);
})();
