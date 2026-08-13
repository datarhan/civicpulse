#!/usr/bin/env bash
# Install (or uninstall) the daily barrido de lectura de superficies cron line.
#
# ⚠ macOS TCC: the setuid `crontab` WRITE is blocked from non-interactive
# shells (Claude Code, launchd) — it HANGS indefinitely. Run this FROM
# Terminal.app, where you can answer the one-time TCC prompt. (Same as the
# quejas + promises + hallazgos cron installs.)
#
#   bash scripts/cron-install-review-sweep.sh            # install / update
#   bash scripts/cron-install-review-sweep.sh uninstall  # remove
#
# Prereqs already satisfied on this machine by the quejas/promises/hallazgos
# crons:
#   · Full Disk Access granted to /usr/sbin/cron + node + git
#   · origin switched to SSH (passphrase-less key)
# See project memory `project_hallazgos_pipeline_cron.md` for the full recipe.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd -P)"
SCRIPT="$REPO_DIR/scripts/review-sweep.sh"
LOG="$REPO_DIR/scripts/logs/review-sweep.log"
# Diario 07:30 local, y el orden importa: el nightly de GitHub (04:30 UTC ≈
# 06:30 local) commitea los datos frescos y scrape-ci-blocked (06:45) refresca
# lo que los runners no alcanzan. A las 07:30 el sitio ya es el del día, que es
# lo que hay que leer. Va antes que el cron de /hallazgos (09:30) y no compite
# con él: éste usa claude-code y aquél agy.
SCHEDULE="30 7 * * *"
MARKER="# CivicPulse — barrido de lectura de superficies"
LINE="$SCHEDULE /bin/bash $SCRIPT >> $LOG 2>&1"

mkdir -p "$REPO_DIR/scripts/logs"

current="$(crontab -l 2>/dev/null || true)"
# Drop any prior marker comment + our line (idempotent re-install / uninstall).
# Everything else (PATH, promises, quejas, hallazgos lines) is preserved verbatim.
stripped="$(printf '%s\n' "$current" | grep -vF "$SCRIPT" | grep -vF "$MARKER" || true)"

if [ "${1:-}" = "uninstall" ]; then
  printf '%s\n' "$stripped" | crontab -
  echo "removed review-sweep cron line."
  if crontab -l 2>/dev/null | grep -qF "$SCRIPT"; then echo "WARN: still present"; else echo "confirmed absent."; fi
  exit 0
fi

{
  printf '%s\n' "$stripped"
  echo "$MARKER (diario 07:30 · lee las 27 rutas públicas como un lector · report-only, no commitea)."
  echo "$LINE"
} | crontab -

echo "installed. review-sweep cron line now:"
crontab -l 2>/dev/null | grep -F "$SCRIPT" || echo "(WARN: not found — was the TCC prompt denied?)"
