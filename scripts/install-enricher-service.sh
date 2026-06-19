#!/bin/bash
# Install/redeploy the HOA enricher as a launchd LaunchAgent that runs the
# continuous loop OUTSIDE ~/Documents (so it never needs the terminal app's
# Documents-folder TCC grant). Run this from a terminal that CAN read the repo
# (i.e. normally). Re-run it any time to redeploy the latest code/env.
#
#   bash scripts/install-enricher-service.sh
#
# launchd cannot read ~/Documents or external volumes (/Volumes/LaCie) without
# Full Disk Access, so we COPY the app code + the env it needs into
# ~/Library/Application Support/hoa-agent and run from there. Local Sunbiz
# (cordata on /Volumes/LaCie) additionally requires Full Disk Access on
# /usr/bin/python3 — without it the service still runs and Sunbiz-local no-ops.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SVC_HOME="$HOME/Library/Application Support/hoa-agent"
LOGDIR="$HOME/Library/Logs/hoa-agent"
LABEL="com.hoaagent.enricher"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PYBIN="/usr/bin/python3"
CLAUDE_BIN_PATH="$HOME/.npm-global/bin/claude"

echo "Repo:     $REPO"
echo "Service:  $SVC_HOME"
mkdir -p "$SVC_HOME/app/lib" "$SVC_HOME/state" "$LOGDIR" "$HOME/Library/LaunchAgents"

# 1) Copy the app code out of ~/Documents (snapshot — re-run to update).
cp "$REPO/scripts/research-hoa-comprehensive.py" "$SVC_HOME/app/"
cp "$REPO/scripts/lib/"*.py "$SVC_HOME/app/lib/"

# 2) Build enrich.env from .env.local + service settings (chmod 600).
ENVF="$SVC_HOME/enrich.env"
: > "$ENVF"
for k in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY \
         SUPABASE_SERVICE_ROLE_KEY CRAWL4AI_URL CRAWL4AI_API_TOKEN; do
  line=$(grep -E "^$k=" "$REPO/.env.local" || true)
  [ -n "$line" ] && echo "$line" >> "$ENVF"
done
# Quote values — SVC_HOME contains a space ("Application Support"), which would
# otherwise break `source`-ing this file.
cat >> "$ENVF" <<EOF
SEARXNG_URL="${SEARXNG_URL:-http://localhost:8888}"
AI_MODEL="haiku"
CLAUDE_BIN="$CLAUDE_BIN_PATH"
ENRICH_STATE_DIR="$SVC_HOME/state"
SUNBIZ_LOCAL="1"
LOOP_SLEEP_SECS="${LOOP_SLEEP_SECS:-8}"
LOOP_IDLE_SECS="${LOOP_IDLE_SECS:-600}"
LOOP_BATCH="${LOOP_BATCH:-25}"
LOOP_DEFER_BACKOFF_SECS="${LOOP_DEFER_BACKOFF_SECS:-21600}"
EOF
chmod 600 "$ENVF"

# 3) Wrapper the LaunchAgent runs (lives outside ~/Documents).
RUNNER="$SVC_HOME/run-loop.sh"
cat > "$RUNNER" <<EOF
#!/bin/bash
export HOME="$HOME"
SVC_HOME="$SVC_HOME"
set -a; . "\$SVC_HOME/enrich.env"; set +a
export PATH="$HOME/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
exec "$PYBIN" "\$SVC_HOME/app/research-hoa-comprehensive.py" \\
  --loop --dry-run false --status published --skip-researched-days 30
EOF
chmod +x "$RUNNER"

# 4) The LaunchAgent: start at login, KeepAlive restart on crash, logs to file.
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
    <array><string>/bin/bash</string><string>$RUNNER</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>ProcessType</key><string>Background</string>
  <key>LowPriorityIO</key><true/>
  <key>Nice</key><integer>10</integer>
  <key>WorkingDirectory</key><string>$SVC_HOME</string>
  <key>StandardOutPath</key><string>$LOGDIR/enricher.out.log</string>
  <key>StandardErrorPath</key><string>$LOGDIR/enricher.err.log</string>
</dict></plist>
EOF

# 5) (Re)load it.
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Loaded $LABEL"
echo "Log: $LOGDIR/enricher.out.log"
