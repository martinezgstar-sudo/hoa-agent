#!/usr/bin/env bash
# Rebuilds the HOA Agent verification pipeline on this machine.
# Run from the repo root:  bash setup-verification-pipeline.sh
set -euo pipefail

echo "Creating folders..."
mkdir -p scripts/lib .claude/agents .tmp/hoa-verify logs

# ---------------------------------------------------------------------------
# scripts/verify-watcher.ts
# ---------------------------------------------------------------------------
cat > scripts/verify-watcher.ts <<'TS_EOF'
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
const TMP_DIR = './.tmp/hoa-verify';
mkdirSync(TMP_DIR, { recursive: true });

// Bounded batch + circuit breaker. No endless loop. Cron schedules this.
const BATCH = Number(process.env.VERIFY_BATCH || 40);
const BREAKER = Number(process.env.VERIFY_BREAKER || 3);

// claude -p uses your OAuth session (claude /login), not an API key.
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
  execSync(`claude -p ${JSON.stringify(prompt)} --agent orchestrator --output-format text --permission-mode bypassPermissions`, {
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

async function run() {
  console.log(`[${WORKER_ID}] verify run start, batch=${BATCH}`);
  let processed = 0, verified = 0, failures = 0, streak = 0;

  for (let i = 0; i < BATCH; i++) {
    const community = await claimNext();
    if (!community) { console.log('queue empty, nothing fresh to verify'); break; }

    console.log(`verifying: ${community.canonical_name} (${normalizeName(community.canonical_name)})`);
    try {
      const result = runOrchestrator(community);
      const status = await complete(community.id, result);
      await logResearch(community.id, result, `pass: ${status} score=${result?.overall_score}`);
      console.log(`done: ${community.canonical_name} -> ${status} (${result?.overall_score})`);
      processed++; verified++; streak = 0;
    } catch (err: any) {
      const msg = String(err?.message || err).slice(0, 300);
      console.error('cycle error:', msg);
      failures++; streak++;

      if ((community.verification_attempts ?? 0) >= 3) {
        await complete(community.id, { final_status: 'failed', overall_score: 0, error: msg });
        await logResearch(community.id, null, `error: ${msg}`);
        console.log(`retired after repeated attempts: ${community.canonical_name}`);
      } else {
        await resetToPending(community.id);
      }

      if (streak >= BREAKER) {
        console.error(`stopping: ${streak} failures in a row, budget likely spent`);
        break;
      }
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }

  console.log(`[${WORKER_ID}] verify run done. processed=${processed} verified=${verified} failures=${failures}`);
  process.exit(0);
}

run();
TS_EOF
echo "  wrote scripts/verify-watcher.ts"

# ---------------------------------------------------------------------------
# scripts/lib/pbc-match.ts
# ---------------------------------------------------------------------------
cat > scripts/lib/pbc-match.ts <<'TS_EOF'
// Palm Beach County matching helpers.

export const PBC_CITIES = new Set([
  'west palm beach', 'palm beach gardens', 'jupiter', 'juno beach', 'boca raton',
  'delray beach', 'boynton beach', 'lake worth', 'lake worth beach', 'wellington',
  'royal palm beach', 'riviera beach', 'palm beach', 'north palm beach',
  'lantana', 'greenacres', 'palm springs', 'tequesta', 'loxahatchee',
  'the acreage', 'jupiter farms', 'hobe sound', 'manalapan', 'gulf stream',
  'highland beach', 'ocean ridge', 'south palm beach', 'atlantis', 'haverhill',
  'pahokee', 'belle glade', 'south bay', 'westlake', 'palm beach shores',
]);

// Approximate Palm Beach County bounding box.
const PBC_BBOX = { minLat: 26.30, maxLat: 26.98, minLng: -80.92, maxLng: -80.03 };

export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/\b(hoa|homeowners?|home owners?|association|assn|condo(minium)?|coa|poa|inc|llc|ltd|corp)\b/g, '')
    .replace(/\bphase\s+\w+\b/g, '')
    .replace(/\bprcl\b/g, 'parcel')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isInPalmBeachCounty(lat?: number | null, lng?: number | null): boolean {
  if (lat == null || lng == null) return false;
  return lat >= PBC_BBOX.minLat && lat <= PBC_BBOX.maxLat &&
         lng >= PBC_BBOX.minLng && lng <= PBC_BBOX.maxLng;
}

export function isPbcCity(city: string | null | undefined): boolean {
  if (!city) return false;
  return PBC_CITIES.has(city.toLowerCase().trim());
}

// Token overlap similarity, 0..1.
export function scoreNameSimilarity(a: string, b: string): number {
  const at = new Set(normalizeName(a).split(' ').filter(Boolean));
  const bt = new Set(normalizeName(b).split(' ').filter(Boolean));
  if (at.size === 0 || bt.size === 0) return 0;
  let shared = 0;
  for (const t of at) if (bt.has(t)) shared++;
  return shared / Math.max(at.size, bt.size);
}
TS_EOF
echo "  wrote scripts/lib/pbc-match.ts"

# ---------------------------------------------------------------------------
# .claude/agents/orchestrator.md
# ---------------------------------------------------------------------------
cat > .claude/agents/orchestrator.md <<'MD_EOF'
---
name: orchestrator
description: Coordinates verification of one HOA community by dispatching four specialist agents, scoring the results, and writing the final JSON verdict.
tools: Task, Read, Write
---

You verify ONE Palm Beach County HOA community.

Steps:
1. Read the community JSON from the input file path given in your instructions. Key fields: id, canonical_name, legal_name, state_entity_number, entity_status, city, management_company.
2. Dispatch these four specialists with the Task tool, passing the community fields each needs. Run them and collect each one's JSON reply:
   - identity-verifier
   - address-verifier
   - mgmt-company-verifier
   - governance-verifier
   Each returns an object with a numeric "score" (0-100) plus findings.
3. Compute the weighted overall score (round to a whole number):
   overall = 0.35*identity + 0.20*address + 0.25*mgmt + 0.20*governance
4. Map to final_status:
   - overall >= 85  -> "verified"
   - overall 60..84 -> "flagged"
   - overall < 60   -> "failed"
   If a specialist failed to return, treat its score as 0 and note it.
5. Call the reporter agent with the four findings and the status to get a 2-4 sentence summary string.
6. Assemble the final JSON object exactly in this shape:
{
  "community_id": "<id>",
  "canonical_name": "<name>",
  "final_status": "verified|flagged|failed",
  "overall_score": <int>,
  "scores": { "identity": <int>, "address": <int>, "mgmt": <int>, "governance": <int> },
  "fields_updated": [<strings>],
  "sources_checked": ["sunbiz","geocode","dbpr","courtlistener"],
  "findings": { "identity": {...}, "address": {...}, "mgmt": {...}, "governance": {...} },
  "summary": "<reporter text>",
  "researched_at": "<ISO timestamp>"
}
7. Use the Write tool to write ONLY that JSON to the output file path given in your instructions. Do not print anything else to the output file.

Be decisive. Do not ask questions. If data is missing, score conservatively and explain in findings.
MD_EOF
echo "  wrote .claude/agents/orchestrator.md"

# ---------------------------------------------------------------------------
# .claude/agents/identity-verifier.md
# ---------------------------------------------------------------------------
cat > .claude/agents/identity-verifier.md <<'MD_EOF'
---
name: identity-verifier
description: Confirms the HOA exists as a Florida corporate entity using Sunbiz.
tools: WebSearch, WebFetch
---

You confirm whether an HOA is a real registered Florida entity.

Inputs you receive: canonical_name, legal_name, state_entity_number, city.

Do:
1. Search Florida Sunbiz (search.sunbiz.org) for the legal_name, then canonical_name.
2. If found, capture: entity status (active / inactive / dissolved), document number, registered agent, principal address.
3. Match the entity to the community name and city. A nonprofit or HOA-type corporation in or near the given city is a strong match.

Score rubric (0-100):
- Active entity, clear name/city match: 90-100
- Found but inactive or administratively dissolved: 50-70
- Ambiguous or partial match: 30-50
- Not found: 0-30

Return ONLY JSON:
{ "score": <int>, "entity_found": <bool>, "entity_status": "<text>", "document_number": "<text|null>", "registered_agent": "<text|null>", "notes": "<short>" }
MD_EOF
echo "  wrote .claude/agents/identity-verifier.md"

# ---------------------------------------------------------------------------
# .claude/agents/address-verifier.md
# ---------------------------------------------------------------------------
cat > .claude/agents/address-verifier.md <<'MD_EOF'
---
name: address-verifier
description: Confirms the community is located in Palm Beach County, Florida.
tools: WebSearch, WebFetch
---

You confirm the community sits in Palm Beach County (PBC), Florida.

Inputs you receive: canonical_name, city.

PBC cities include: West Palm Beach, Palm Beach Gardens, Jupiter, Juno Beach, Boca Raton, Delray Beach, Boynton Beach, Lake Worth, Wellington, Royal Palm Beach, Riviera Beach, Palm Beach, North Palm Beach, Lantana, Greenacres, Palm Springs, Tequesta, Loxahatchee, The Acreage, Jupiter Farms, Westlake, and the western Glades cities (Belle Glade, Pahokee, South Bay).

Do:
1. Confirm the stated city is a PBC city.
2. Search to confirm the named community exists in or near that city. Capture approximate lat/lng if you find it.
3. PBC roughly spans latitude 26.30 to 26.98 and longitude -80.92 to -80.03.

Score rubric (0-100):
- City is in PBC and community location confirmed: 90-100
- City in PBC, community plausible but unconfirmed: 55-75
- City unclear: 30-50
- Located outside PBC: 0-20

Return ONLY JSON:
{ "score": <int>, "city": "<text>", "in_pbc": <bool>, "lat": <number|null>, "lng": <number|null>, "notes": "<short>" }
MD_EOF
echo "  wrote .claude/agents/address-verifier.md"

# ---------------------------------------------------------------------------
# .claude/agents/mgmt-company-verifier.md
# ---------------------------------------------------------------------------
cat > .claude/agents/mgmt-company-verifier.md <<'MD_EOF'
---
name: mgmt-company-verifier
description: Identifies or confirms the community's management company and CAM licensing.
tools: WebSearch, WebFetch
---

You identify or confirm the HOA's management company.

Inputs you receive: canonical_name, city, management_company (may be empty).

Do:
1. If a management company is given, confirm it manages this community via web search.
2. If none given, try to find who manages it.
3. If a community association manager (CAM) or firm is named, you may check Florida DBPR for an active CAM license.

Scoring note: many small HOAs are self-managed. Absence of a management company is NOT a failure.

Score rubric (0-100):
- Management company confirmed (or clearly self-managed and stated): 80-100
- Plausible but unconfirmed: 50-70
- Unknown: 30-50

Return ONLY JSON:
{ "score": <int>, "management_company": "<text|null>", "self_managed": <bool>, "cam_license_found": <bool>, "notes": "<short>" }
MD_EOF
echo "  wrote .claude/agents/mgmt-company-verifier.md"

# ---------------------------------------------------------------------------
# .claude/agents/governance-verifier.md
# ---------------------------------------------------------------------------
cat > .claude/agents/governance-verifier.md <<'MD_EOF'
---
name: governance-verifier
description: Checks public legal records for litigation involving the HOA.
tools: WebSearch, WebFetch
---

You assess the community's legal and governance footprint.

Inputs you receive: canonical_name, legal_name, city.

Do:
1. Search CourtListener (courtlistener.com) and the open web for Florida cases naming this association.
2. Count distinct relevant cases and capture case names and dates where available.
3. Having litigation is NOT automatically bad. Your score reflects how confidently you could assess the record, not a penalty for lawsuits.

Score rubric (0-100):
- Clear, confident assessment (clean record or well-documented cases): 80-100
- Partial signal: 50-70
- Could not assess: 30-50

Return ONLY JSON:
{ "score": <int>, "litigation_count": <int>, "cases": [ { "name": "<text>", "date": "<text|null>" } ], "notes": "<short>" }
MD_EOF
echo "  wrote .claude/agents/governance-verifier.md"

# ---------------------------------------------------------------------------
# .claude/agents/reporter.md
# ---------------------------------------------------------------------------
cat > .claude/agents/reporter.md <<'MD_EOF'
---
name: reporter
description: Writes a short plain-language summary of a community verification result.
tools:
---

You receive the four specialist findings, the per-area scores, the overall score, and the final status.

Write 2 to 4 plain sentences summarizing what was confirmed, what was uncertain, and why the status landed where it did. No markdown, no bullet points, no preamble.

Return ONLY the summary text.
MD_EOF
echo "  wrote .claude/agents/reporter.md"

# ---------------------------------------------------------------------------
# .gitignore guards (ignore runtime junk, keep the pipeline tracked)
# ---------------------------------------------------------------------------
touch .gitignore
grep -qxF '.tmp/' .gitignore || echo '.tmp/' >> .gitignore
grep -qxF 'logs/' .gitignore || echo 'logs/' >> .gitignore
echo "  updated .gitignore (.tmp/ and logs/ ignored)"

echo ""
echo "Done. Files created."
echo ""
echo "NEXT STEPS:"
echo "  1. Commit the pipeline (force-add .claude so it is not skipped by gitignore):"
echo "       git add -f .claude/agents scripts/verify-watcher.ts scripts/lib/pbc-match.ts .gitignore"
echo "       git commit -m \"rebuild verification pipeline wired to fixed RPCs\""
echo "       git push origin main"
echo ""
echo "  2. Confirm Claude Code is logged in (separate terminal):"
echo "       claude /login"
echo ""
echo "  3. Make sure .env.local has SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL"
echo "     (or NEXT_PUBLIC_SUPABASE_URL)."
echo ""
echo "  4. Run one batch (cron-friendly; exits when done):"
echo "       npx --yes tsx scripts/verify-watcher.ts >> logs/verify-watcher.log 2>&1"
echo ""
echo "  5. Optional launchd/cron every 30-60 min (adjust VERIFY_BATCH / VERIFY_BREAKER):"
echo "       */45 * * * * cd $(pwd) && npx --yes tsx scripts/verify-watcher.ts >> logs/verify-watcher.log 2>&1"
