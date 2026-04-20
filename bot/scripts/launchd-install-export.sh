#!/usr/bin/env bash
# Install a launchd user agent that runs the bot export + git push
# once per day at 04:00 local time.
#
# Usage:   bash bot/scripts/launchd-install-export.sh
# Uninstall: bash bot/scripts/launchd-install-export.sh uninstall

set -euo pipefail

cd "$(dirname "$0")/.."
BOT_DIR="$(pwd -P)"
SCRIPT="$BOT_DIR/scripts/local-export.sh"
LABEL="com.civicpulse.munigraph.export"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$BOT_DIR/data/logs"

uninstall() {
  echo "[uninstall] unloading $LABEL"
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
}

if [ "${1:-}" = "uninstall" ]; then
  uninstall
  exit 0
fi

[ -x "$SCRIPT" ] || chmod +x "$SCRIPT"
mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl unload "$PLIST" 2>/dev/null || true

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SCRIPT</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$BOT_DIR</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
  </dict>

  <!-- Daily at 04:00 local time. macOS coalesces into the next wake
       if the Mac is asleep at that hour — runs as soon as it's awake. -->
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>4</integer>
    <key>Minute</key><integer>0</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>$LOG_DIR/export.out.log</string>

  <key>StandardErrorPath</key>
  <string>$LOG_DIR/export.err.log</string>

  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
EOF

launchctl load -w "$PLIST"
echo "[install] scheduled $LABEL at 04:00 daily"
echo "[install] check:  tail -f $LOG_DIR/export.out.log"
echo "[install] manual: bash bot/scripts/local-export.sh"
echo "[install] uninstall: bash bot/scripts/launchd-install-export.sh uninstall"
