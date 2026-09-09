# PARKED.md

Systems and decisions the v3 rebuild has explicitly deferred. Everything
here is not being touched right now, but is written down so nothing
falls out of memory.

## Launchd plists — path switchback at Phase 9

Owner ruling 2026-09-09 (post Phase 4): the three v3 launchd plists
were repointed at the v3 worktree (`/Users/izzymartinez/Projects/hoa-agent-v3`)
so nothing runs off a stale copy in the main tree.

Affected plists (all in `~/Library/LaunchAgents/`):

| Label | Runs |
| ----- | ---- |
| `com.hoaagent.nightly` | `cd hoa-agent-v3 && source hoa-agent/.env.local && npx tsx scripts/nightly-enrich.ts` |
| `com.hoaagent.orchestrator` | `cd hoa-agent-v3 && source hoa-agent/.env.local && npx tsx scripts/orchestrator.ts --once` |
| `com.hoaagent.searxng` | `hoa-agent-v3/scripts/run-searxng.sh` |

Env vars still come from the main tree's `.env.local` — that's the
single source of truth for secrets and should not be mirrored.

**At Phase 9 merge (v3-nightly-loop → main)**: switch the three plist
paths back from `hoa-agent-v3` to `hoa-agent`, unload/reload, and
remove the `hoa-agent-v3` worktree. The Phase 9 checklist in the
work order does not name this task explicitly — do it before removing
the worktree.

## Command Center, Picard, Quark

Work-order phase 7 says: "Leave the Command Center, Picard, and Quark
untouched in this work order. List them in PARKED.md as candidates."

- **Command Center** — the operator dashboard (macmini/scripts/…).
  Consumed by the reporter and orchestrator's iMessage sender; no v3
  changes required. Candidate for a v3.1 unification pass once the
  nightly loop stabilizes.
- **Picard** — the recon/proposals engine
  (`scripts/_archived/legacy-exploration/picard-*.js` in v3). Retired
  by the v3 nightly loop but kept archived. Candidate for deletion
  after 60 days of clean v3 nights.
- **Quark** — no code footprint in the current tree; owner reference
  only. Candidate for scoping once v3 is stable.
