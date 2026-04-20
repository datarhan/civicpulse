#!/usr/bin/env bash
# Install the MuniGraph bot as a macOS launchd user agent so it:
#   - starts automatically at login
#   - restarts on crash (KeepAlive)
#   - runs in long-polling mode (no public endpoint, no ingress)
#   - persists SQLite to bot/data/bot.db across restarts
#
# Usage:  bash bot/scripts/launchd-install.sh
# Uninstall: bash bot/scripts/launchd-install.sh uninstall
#
# The laptop must be awake for the bot to run; there's no getting around
# macOS sleep without a dedicated always-on machine.

set -euo pipefail

cd "$(dirname "$0")/.."
BOT_DIR="$(pwd -P)"
NODE_BIN="$(command -v node)"
TSX="$BOT_DIR/node_modules/.bin/tsx"
ENTRY="$BOT_DIR/src/index.ts"
LABEL="com.civicpulse.munigraph.bot"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$BOT_DIR/data/logs"

uninstall() {
  echo "[uninstall] unloading launchd agent"
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "[uninstall] done. SQLite data at $BOT_DIR/data/bot.db is kept."
}

if [ "${1:-}" = "uninstall" ]; then
  uninstall
  exit 0
fi

# --- sanity checks -----------------------------------------------------------
if [ ! -x "$TSX" ]; then
  echo "[error] tsx not found at $TSX — run 'npm install' first" >&2
  exit 1
fi
if [ ! -f "$BOT_DIR/.env" ]; then
  echo "[error] $BOT_DIR/.env missing — copy .env.example and fill in BOT_TOKEN" >&2
  exit 1
fi
if ! grep -q '^BOT_TOKEN=.\+' "$BOT_DIR/.env"; then
  echo "[error] BOT_TOKEN not set in $BOT_DIR/.env" >&2
  exit 1
fi

mkdir -p "$LOG_DIR"
mkdir -p "$HOME/Library/LaunchAgents"

# Unload any previous instance before installing a fresh copy.
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl unload "$PLIST" 2>/dev/null || true

# --- write the plist ---------------------------------------------------------
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>

  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$TSX</string>
    <string>$ENTRY</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$BOT_DIR</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
    <key>Crashed</key>
    <true/>
  </dict>

  <key>ThrottleInterval</key>
  <integer>10</integer>

  <key>StandardOutPath</key>
  <string>$LOG_DIR/bot.out.log</string>

  <key>StandardErrorPath</key>
  <string>$LOG_DIR/bot.err.log</string>

  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
EOF

echo "[install] plist → $PLIST"

# Clear any old Telegram webhook so long-polling is permitted.
TOKEN="$(grep '^BOT_TOKEN=' "$BOT_DIR/.env" | cut -d= -f2-)"
if [ -n "$TOKEN" ]; then
  curl -s "https://api.telegram.org/bot$TOKEN/deleteWebhook?drop_pending_updates=true" > /dev/null || true
  echo "[install] cleared any pre-existing webhook"
fi

# --- load it ---------------------------------------------------------------
launchctl load -w "$PLIST"
sleep 2

echo "[install] running. Check status with:"
echo "  launchctl list | grep $LABEL"
echo "  tail -f $LOG_DIR/bot.err.log"
echo ""
echo "[install] uninstall with:"
echo "  bash bot/scripts/launchd-install.sh uninstall"
