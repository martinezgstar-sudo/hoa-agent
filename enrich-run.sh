#!/bin/bash
# enrich-run.sh — nightly propose-only deep enricher.
# Runs scripts/research-hoa-comprehensive.py, which stages every finding into
# pending_community_data / pending_fee_observations for admin approval and
# NEVER writes to the communities table.
#
# AI extraction goes through the `claude` CLI on the Claude subscription
# (CLAUDE_CODE_OAUTH_TOKEN), never the billed Anthropic API — so we source the
# subscription token and explicitly unset ANTHROPIC_API_KEY, exactly like
# run.sh does for the other jobs.
#
# Usage: enrich-run.sh [batch]   (default batch 15; spec asks for 10–20)
export PATH="/Users/izzymartinez/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export HOME="/Users/izzymartinez"
cd /Users/izzymartinez/Projects/hoa-agent || exit 1

# Supabase keys (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, …)
set -a; [ -f .env.local ] && . ./.env.local; set +a

# Claude subscription token for the `claude` CLI.
[ -f /Users/izzymartinez/macmini/.cc_token ] && . /Users/izzymartinez/macmini/.cc_token

# Never bill the API: force the CLI onto the subscription OAuth token.
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN

# AI extraction routes through the local LiteLLM proxy first, trying these
# free-tier models in order; the `claude` CLI above is the last-resort fallback.
# LITELLM_URL / LITELLM_KEY come from .env.local (script defaults cover both).
export FREE_POOL="${FREE_POOL:-cohere,mistral,nvidia,huggingface,openrouter}"
# POOL_ONLY now DEFAULTS TO 1: the claude CLI fallback is off for this nightly
# job. Owner rule (2026-08-03): local LLMs handle all enrichment, and Claude is
# reserved for one weekly review pass. This job runs daily at 02:00, so leaving
# the fallback armed meant a daily job could reach Claude — six days a week more
# than the policy allows. The weekly pass is admin-triage-run.sh, Sundays 08:00.
# Set POOL_ONLY=0 explicitly to re-arm the fallback for a one-off run.
export POOL_ONLY="${POOL_ONLY:-1}"

# ---- cross-job lock shared with macmini/run.sh and verify-run.sh ----
LOCKDIR="/Users/izzymartinez/macmini/.claude-jobs.lock"
waited=0
while ! mkdir "$LOCKDIR" 2>/dev/null; do
  pid="$(cat "$LOCKDIR/pid" 2>/dev/null || true)"
  if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then rm -rf "$LOCKDIR"; continue; fi
  if [ "$waited" -ge 5400 ]; then echo "[$(date '+%F %T')] SKIP enrich: lock held >90min by pid ${pid:-?}"; exit 75; fi
  sleep 60; waited=$((waited+60))
done
echo $$ > "$LOCKDIR/pid"
trap 'rm -rf "$LOCKDIR"' EXIT

BATCH="${1:-15}"

# ---- hard time cap: Supabase job, 55-min burst ----
python3 scripts/research-hoa-comprehensive.py --batch "$BATCH" --dry-run false &
PID=$!
( sleep "${MAX_SECS:-3300}"; kill -0 $PID 2>/dev/null && { echo "[$(date '+%F %T')] TIME CAP reached — stopping enricher"; kill -TERM $PID; sleep 30; kill -KILL $PID 2>/dev/null; } ) &
WD=$!
wait $PID; RC=$?
kill $WD 2>/dev/null
exit $RC
