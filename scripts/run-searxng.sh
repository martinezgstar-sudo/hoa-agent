#!/bin/bash
# run-searxng.sh — foreground wrapper around ~/searxng/docker-compose.yml.
# Executed by com.hoaagent.searxng.plist with KeepAlive=true so launchd
# restarts us whenever the container exits (Docker Desktop crash, host
# reboot, etc).
#
# Contract: bring the container up (idempotent) then block on
# `docker wait` so launchd sees us as running while SearXNG is running.
# If the container stops for any reason we exit; KeepAlive relaunches
# us, which brings the container back.
set -uo pipefail

COMPOSE_DIR="$HOME/searxng"
CONTAINER="searxng"
LOG_DIR="$HOME/Library/Logs/hoaagent"
mkdir -p "$LOG_DIR"

if [ ! -f "$COMPOSE_DIR/docker-compose.yml" ]; then
  echo "[run-searxng] ERROR: $COMPOSE_DIR/docker-compose.yml not found" >&2
  exit 1
fi

# Ensure Docker CLI is reachable — Docker Desktop puts it in /usr/local/bin.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# Wait up to 60s for the docker daemon to come up after a login/reboot.
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if docker info >/dev/null 2>&1; then break; fi
  sleep 5
done
if ! docker info >/dev/null 2>&1; then
  echo "[run-searxng] ERROR: docker daemon not reachable after 60s" >&2
  exit 1
fi

# Bring the container up (no-op if already running).
cd "$COMPOSE_DIR"
docker compose up -d >>"$LOG_DIR/searxng.compose.log" 2>&1

# `docker wait` blocks until the container exits, then prints its exit
# code. Both cases cause this script to exit and launchd's KeepAlive
# will re-run it, which re-invokes `docker compose up -d` and blocks
# on wait again.
docker wait "$CONTAINER"
