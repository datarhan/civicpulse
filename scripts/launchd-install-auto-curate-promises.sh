#!/usr/bin/env bash
# Install the daily promise auto-curator launchd agent.
# Mirrors scripts/launchd-install-auto-curate.sh.
#
#   bash scripts/launchd-install-auto-curate-promises.sh           # install + load
#   bash scripts/launchd-install-auto-curate-promises.sh uninstall # unload + remove
set -euo pipefail

LABEL="com.civicpulse.auto-curate-promises"
SRC="$(cd "$(dirname "$0")" && pwd)/${LABEL}.plist"
DEST="$HOME/Library/LaunchAgents/${LABEL}.plist"

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$(cd "$(dirname "$0")" && pwd)/logs"

if [ "${1:-install}" = "uninstall" ]; then
  if [ -f "$DEST" ]; then
    launchctl unload "$DEST" 2>/dev/null || true
    rm -f "$DEST"
    echo "[launchd] uninstalled $LABEL"
  else
    echo "[launchd] $LABEL not installed — nothing to do"
  fi
  exit 0
fi

# Replace any prior version (re-installs are routine after editing the plist).
if [ -f "$DEST" ]; then
  launchctl unload "$DEST" 2>/dev/null || true
  rm -f "$DEST"
fi

cp "$SRC" "$DEST"
launchctl load "$DEST"

echo "[launchd] installed $LABEL"
echo "          plist:  $DEST"
echo "          logs:   $(cd "$(dirname "$0")" && pwd)/logs/auto-curate-promises.{out,err}.log"
echo
echo "Schedule: daily at 08:30 local time."
echo "Backend:  LLM_BACKEND=claude-code/sonnet · rollout-safe --no-auto-publish default (nothing published)."
echo "Manual run anytime:  bash scripts/auto-curate-promises-daily.sh"
echo "Inspect status:      launchctl list | grep $LABEL"
echo "Uninstall:           bash scripts/launchd-install-auto-curate-promises.sh uninstall"
