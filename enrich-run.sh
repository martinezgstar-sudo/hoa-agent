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
cd /Users/izzymartinez/Documents/hoa-agent || exit 1

# Supabase keys (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, …)
set -a; [ -f .env.local ] && . ./.env.local; set +a

# Claude subscription token for the `claude` CLI.
[ -f /Users/izzymartinez/macmini/.cc_token ] && . /Users/izzymartinez/macmini/.cc_token

# Never bill the API: force the CLI onto the subscription OAuth token.
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN

BATCH="${1:-15}"
exec python3 scripts/research-hoa-comprehensive.py --batch "$BATCH" --dry-run false
