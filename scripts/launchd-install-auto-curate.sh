#!/usr/bin/env bash
# Install the auto-curate weekly launchd agent.
# Mirrors bot/scripts/launchd-install-export.sh.
#
#   bash scripts/launchd-install-auto-curate.sh           # install + load
#   bash scripts/launchd-install-auto-curate.sh uninstall # unload + remove
set -euo pipefail

LABEL="com.civicpulse.auto-curate"
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
echo "          logs:   $(cd "$(dirname "$0")" && pwd)/logs/auto-curate.{out,err}.log"
echo
echo "Schedule: Mondays at 09:00 local time."
echo "Manual run anytime:  bash scripts/auto-curate-weekly.sh"
echo "Inspect status:      launchctl list | grep $LABEL"
echo "Uninstall:           bash scripts/launchd-install-auto-curate.sh uninstall"
