#!/bin/bash
export PATH="/Users/izzymartinez/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export HOME="/Users/izzymartinez"
cd /Users/izzymartinez/Documents/hoa-agent || exit 1
set -a; [ -f .env.local ] && . ./.env.local; set +a
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN
VERIFY_BATCH="${1:-40}" npx --yes tsx scripts/verify-watcher.ts
