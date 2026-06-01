import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { hostname } from 'node:os';
import { normalizeName } from './lib/pbc-match';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment (.env.local).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const WORKER_ID = `${hostname()}-${process.pid}`;
const POLL_INTERVAL = 15_000;
const TMP_DIR = './.tmp/hoa-verify';
mkdirSync(TMP_DIR, { recursive: true });

// claude -p must authenticate with your OAuth session (claude /login),
// NOT an API key. Strip these so the CLI falls back to session auth.
const childEnv = { ...process.env };
delete childEnv.ANTHROPIC_API_KEY;
delete childEnv.ANTHROPIC_AUTH_TOKEN;

async function claimNext(): Promise<any | null> {
  const { data, error } = await supabase.rpc('claim_next_community', { p_worker_id: WORKER_ID });
  if (error) { console.error('claim error:', error.message); return null; }
  return Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
}

function runOrchestrator(community: any): any {
  const inputPath = `${TMP_DIR}/${community.id}-input.json`;
  const outputPath = `${TMP_DIR}/${community.id}-output.json`;
  writeFileSync(inputPath, JSON.stringify(community, null, 2));
  const prompt = `Verify the HOA community described in ${inputPath}. Use the orchestrator agent. Write ONLY the final JSON result to ${outputPath}.`;
  execSync(`claude -p ${JSON.stringify(prompt)} --agent orchestrator --output-format text`, {
    stdio: 'inherit',
    timeout: 5 * 60_000,
    env: childEnv,
  });
  return JSON.parse(readFileSync(outputPath, 'utf-8'));
}

async function logResearch(communityId: string, result: any, note: string) {
  const { error } = await supabase.from('community_research_log').insert({
    community_id: communityId,
    researched_at: new Date().toISOString(),
    fields_updated: result?.fields_updated ?? [],
    sources_checked: result?.sources_checked ?? ['identity', 'address', 'mgmt', 'governance'],
    notes: note,
  });
  if (error) console.error(`research log failed for ${communityId}:`, error.message);
}

async function complete(communityId: string, result: any): Promise<string> {
  const status = ['verified', 'flagged', 'failed'].includes(result?.final_status) ? result.final_status : 'failed';
  const score = Number.isFinite(result?.overall_score) ? result.overall_score : 0;
  const { error } = await supabase.rpc('complete_community', {
    p_id: communityId, p_status: status, p_score: score, p_notes: result ?? {},
  });
  if (error) console.error(`complete_community failed for ${communityId}:`, error.message);
  return status;
}

async function resetToPending(communityId: string) {
  await supabase.from('communities')
    .update({ verification_status: 'pending', locked_at: null, locked_by: null })
    .eq('id', communityId);
}

async function loop() {
  console.log(`[${WORKER_ID}] watcher started`);
  while (true) {
    let community: any = null;
    try {
      community = await claimNext();
      if (!community) {
        console.log('queue empty, sleeping');
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        continue;
      }
      console.log(`verifying: ${community.canonical_name} (${normalizeName(community.canonical_name)})`);
      const result = runOrchestrator(community);
      const status = await complete(community.id, result);
      // Always log research AFTER completing. This activates the 7-day re-claim guard.
      await logResearch(community.id, result, `pass: ${status} score=${result?.overall_score}`);
      console.log(`done: ${community.canonical_name} -> ${status} (${result?.overall_score})`);
    } catch (err: any) {
      const msg = String(err?.message || err).slice(0, 300);
      console.error('cycle error:', msg);
      if (community) {
        // Log the attempt so the 7-day guard stops a poison row from looping the queue.
        await logResearch(community.id, null, `error: ${msg}`);
        if ((community.verification_attempts ?? 0) >= 3) {
          // Repeated failures: mark failed so it leaves the queue for good.
          await complete(community.id, { final_status: 'failed', overall_score: 0, error: msg });
          console.log(`marked failed after repeated attempts: ${community.canonical_name}`);
        } else {
          // Transient: release it. The 7-day guard delays the retry so the queue keeps moving.
          await resetToPending(community.id);
        }
      }
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
}

loop();
