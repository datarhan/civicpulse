#!/usr/bin/env bash
# Every-two-days health digest → Telegram admin.
#
# Replaces the transcription-only alerter: one notification for one bad night,
# not one per subsystem. `check:transcription-health` stays as a standalone
# diagnostic you can run by hand; the CRON runs this.
#
# Covers: bot reachability, public site, stalled pipelines (transcription +
# extraction, with the cause diagnosed), sources that stopped publishing,
# nightly red streaks, and integrity failures.
#
# Install: bash scripts/cron-install-monitor-health.sh
# Manual:  npm run monitor:health -- --dry-run --explain
set -uo pipefail

cd "$(dirname "$0")/.."
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"

# OPENAI_API_KEY lets it tell "no credit" from "some other failure";
# BOT_TOKEN / ADMIN_USER_IDS (read from bot/.env) deliver the alert.
if [ -f .env ]; then set -a; . ./.env; set +a; fi

echo "[monitor-health-cron] $(date '+%F %T')"
npm run --silent monitor:health -- --explain
rc=$?
# Exit 1 means "alerts found and reported" — the monitor working, not the cron
# failing. Only a crash (2) deserves a non-zero exit.
[ "$rc" -le 1 ] && exit 0
exit "$rc"
