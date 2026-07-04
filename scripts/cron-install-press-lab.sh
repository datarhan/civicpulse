#!/usr/bin/env bash
# Install (or uninstall) the daily /laboratorio press-lab pipeline cron line.
#
# ⚠ macOS TCC: the setuid `crontab` WRITE is blocked from non-interactive
# shells (Claude Code, launchd) — it HANGS indefinitely. Run this FROM
# Terminal.app, where you can answer the one-time TCC prompt. (Same as the
# quejas + promises + hallazgos cron installs.)
#
#   bash scripts/cron-install-press-lab.sh            # install / update
#   bash scripts/cron-install-press-lab.sh uninstall  # remove
#
# Prereqs already satisfied on this machine by the quejas/promises/hallazgos
# crons:
#   · Full Disk Access granted to /usr/sbin/cron + node + git
#   · origin switched to SSH (passphrase-less key)
# See project memory `project_hallazgos_pipeline_cron.md` for the full recipe.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd -P)"
SCRIPT="$REPO_DIR/scripts/press-lab-pipeline.sh"
LOG="$REPO_DIR/scripts/logs/press-lab-pipeline.log"
# Daily 10:15 local — after the GitHub nightly (04:30 UTC ≈ 06:30 local) has
# committed fresh press.json, and offset from the 09:30 /hallazgos cron so the
# two LLM pipelines never contend for agy at once.
SCHEDULE="15 10 * * *"
MARKER="# CivicPulse — /laboratorio press-lab pipeline"
LINE="$SCHEDULE /bin/bash $SCRIPT >> $LOG 2>&1"

mkdir -p "$REPO_DIR/scripts/logs"

current="$(crontab -l 2>/dev/null || true)"
# Drop any prior marker comment + our line (idempotent re-install / uninstall).
# Everything else (PATH, promises, quejas, hallazgos lines) is preserved verbatim.
stripped="$(printf '%s\n' "$current" | grep -vF "$SCRIPT" | grep -vF "$MARKER" || true)"

if [ "${1:-}" = "uninstall" ]; then
  printf '%s\n' "$stripped" | crontab -
  echo "removed /laboratorio press-lab cron line."
  if crontab -l 2>/dev/null | grep -qF "$SCRIPT"; then echo "WARN: still present"; else echo "confirmed absent."; fi
  exit 0
fi

{
  printf '%s\n' "$stripped"
  echo "$MARKER (daily 10:15 · factcheck→extract→verify→summarize→analytics→auto-curate→push)."
  echo "$LINE"
} | crontab -

echo "installed. /laboratorio press-lab cron line now:"
crontab -l 2>/dev/null | grep -F "$SCRIPT" || echo "(WARN: not found — was the TCC prompt denied?)"
