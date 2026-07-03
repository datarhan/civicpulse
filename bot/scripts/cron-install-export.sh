#!/usr/bin/env bash
# Idempotent installer for the per-minute quejas export cron.
#
#   bash bot/scripts/cron-install-export.sh            # install (default)
#   bash bot/scripts/cron-install-export.sh uninstall  # remove
#
# Adds a crontab line that runs bot/scripts/local-export.sh every minute:
# SQLite → public/data/quejas.json → (only when a queja changed) commit + push
# → deploy-vercel.yml fires on push-to-main → live in ~1 min. Idle ticks are
# git-silent (see local-export.sh), so per-minute cadence is cheap + safe.
#
# Mirrors the promise auto-curator cron. macOS requires Full Disk Access on
# /usr/sbin/cron (System Settings → Privacy & Security → Full Disk Access) to
# touch the repo under ~/Documents — ALREADY granted (the promise cron uses the
# same path), otherwise cron fails "Operation not permitted".
#
# launchd is NOT used: the com.civicpulse.munigraph.export agent exits 78
# (EX_CONFIG) under ~/Documents TCC, same as the bot agent. cron + FDA is the
# working path on this machine.
set -euo pipefail

cd "$(dirname "$0")/.."
BOT_DIR="$(pwd -P)"
SCRIPT="$BOT_DIR/scripts/local-export.sh"
LOG="$BOT_DIR/data/logs/cron-quejas-export.log"
MARKER="# CivicPulse — per-minute quejas export (SQLite -> quejas.json -> push -> deploy)"
LINE="* * * * * /bin/bash $SCRIPT >> $LOG 2>&1"

action="${1:-install}"
current="$(crontab -l 2>/dev/null || true)"
# Drop any prior copy of this job (marker line + the export line) so re-running
# is idempotent. Everything else in the crontab (PATH, promise cron) is kept.
filtered="$(printf '%s\n' "$current" | grep -vF "$MARKER" | grep -vF "$SCRIPT" || true)"

if [ "$action" = "uninstall" ]; then
  printf '%s\n' "$filtered" | crontab -
  echo "quejas export cron removed"
  crontab -l 2>/dev/null | grep -F "$SCRIPT" >/dev/null 2>&1 && echo "WARN: line still present" || true
  exit 0
fi

mkdir -p "$(dirname "$LOG")"
{
  printf '%s\n' "$filtered"
  printf '%s\n' "$MARKER"
  printf '%s\n' "$LINE"
} | grep -v '^$' | crontab -

echo "quejas export cron installed:"
echo "  $LINE"
echo ""
echo "Verify: crontab -l"
echo "Logs:   tail -f $LOG"
echo "Remove: bash bot/scripts/cron-install-export.sh uninstall"
