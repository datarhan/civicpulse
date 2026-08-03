#!/usr/bin/env bash
# Every-two-days check: is the transcription backlog still moving? If not, why?
# Alerts the Telegram admin naming the actual cause.
#
# Exists because transcription is OpenAI-only and fails invisibly: when the
# account runs out of credit, new plenos still appear on /plenos, their
# Declaraciones and Hallazgos tabs just stay empty. Nothing surfaces it.
#
# Install:  bash scripts/cron-install-transcription-health.sh
# Manual:   npm run check:transcription-health -- --dry-run
set -uo pipefail

cd "$(dirname "$0")/.."
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"

# The check needs OPENAI_API_KEY to tell "no credit" from "some other failure",
# and BOT_TOKEN/ADMIN_USER_IDS (read from bot/.env) to deliver the alert.
if [ -f .env ]; then set -a; . ./.env; set +a; fi

echo "[transcription-health-cron] $(date '+%F %T')"
npm run --silent check:transcription-health
rc=$?
# Exit 1 just means "stalled and reported" — that is the check working, not the
# cron failing. Only a crash is worth a non-zero exit here.
[ "$rc" -le 1 ] && exit 0
exit "$rc"
