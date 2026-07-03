#!/usr/bin/env bash
# Install (or uninstall) the daily /hallazgos pipeline cron line.
#
# ⚠ macOS TCC: the setuid `crontab` WRITE is blocked from non-interactive
# shells (Claude Code, launchd) — it HANGS indefinitely. Run this FROM
# Terminal.app, where you can answer the one-time TCC prompt. (Same as the
# quejas + promises cron installs.)
#
#   bash scripts/cron-install-hallazgos.sh            # install / update
#   bash scripts/cron-install-hallazgos.sh uninstall  # remove
#
# Prereqs already satisfied on this machine by the quejas/promises crons:
#   · Full Disk Access granted to /usr/sbin/cron + node + git
#   · origin switched to SSH (passphrase-less key)
# See project memory `project_bot_runtime_docker.md` for the full recipe.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd -P)"
SCRIPT="$REPO_DIR/scripts/hallazgos-pipeline.sh"
LOG="$REPO_DIR/scripts/logs/hallazgos-pipeline.log"
SCHEDULE="30 9 * * *"   # daily 09:30 local — clears the backlog fast, then idle-cheap
MARKER="# CivicPulse — /hallazgos pipeline"
LINE="$SCHEDULE /bin/bash $SCRIPT >> $LOG 2>&1"

mkdir -p "$REPO_DIR/scripts/logs"

current="$(crontab -l 2>/dev/null || true)"
# Drop any prior marker comment + our line (idempotent re-install / uninstall).
# Everything else (PATH, promises, quejas lines + their comments) is preserved verbatim.
stripped="$(printf '%s\n' "$current" | grep -vF "$SCRIPT" | grep -vF "$MARKER" || true)"

if [ "${1:-}" = "uninstall" ]; then
  printf '%s\n' "$stripped" | crontab -
  echo "removed /hallazgos pipeline cron line."
  if crontab -l 2>/dev/null | grep -qF "$SCRIPT"; then echo "WARN: still present"; else echo "confirmed absent."; fi
  exit 0
fi

{
  printf '%s\n' "$stripped"
  echo "$MARKER (daily 09:30 · transcribe→extract→verify→auto-curate→push · MAX_PLENOS=2/run)."
  echo "$LINE"
} | crontab -

echo "installed. /hallazgos cron line now:"
crontab -l 2>/dev/null | grep -F "$SCRIPT" || echo "(WARN: not found — was the TCC prompt denied?)"
