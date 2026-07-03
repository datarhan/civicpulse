#!/usr/bin/env bash
# Daily promise auto-curator wrapper: runs
#   npm run auto-curate-promises -- --max 10 --phase both
# AUTO-PUBLISH IS ENABLED — grounded, high-confidence (≥0.70) en-progreso
# status changes + documentada new promises publish to promises.json (stamped
# autoPublished.reviewState='pending-review' + a public "revisión pendiente"
# badge) and are committed + pushed below. Everything else (parcial/cumplida/
# no-ejecutada, plus anything ungrounded or below threshold) stays in the
# LOCAL-ONLY review queue (editorial/promise-review-queue.json, gitignored)
# for one-click curator approval in the dev-only /curator dashboard. An
# auto-published row is reversible: `npm run apply-promise-draft -- --retract
# <id>` deletes an auto-created promise or REVERTS an auto-published status
# change (status → priorStatus, appended evidence dropped).
#
# Run manually:        bash scripts/auto-curate-promises-daily.sh
# Install via launchd: bash scripts/launchd-install-auto-curate-promises.sh
#
# The Mac must be awake at the scheduled time. macOS launchd
# StartCalendarInterval coalesces into the next wake if asleep, so a
# missed run catches up automatically.
#
# LLM backend: agy (Google's agy CLI — the current replacement for the
# gemini CLI). The old `gemini` CLI stalls when invoked headlessly on
# this machine; agy runs cleanly and is verified working. It is opt-in
# (LLM_BACKEND=agy) and never in the auto-fallback chain, so a metered
# API is never silently reached. Override with LLM_BACKEND=… if needed.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO_DIR="$(pwd -P)"
LOG_DIR="$REPO_DIR/scripts/logs"
mkdir -p "$LOG_DIR"

# Source .env so AGY_BIN / AGY_MODEL / any keys are available. Don't fail
# if absent.
if [ -f "$REPO_DIR/.env" ]; then
  # shellcheck disable=SC1091
  set -a; . "$REPO_DIR/.env"; set +a
fi

echo "[$(date '+%F %T')] auto-curate-promises-daily starting"

# Pull-rebase first so a later publish push (if auto-publish is enabled
# below) isn't stale. If pull fails (network/rebase conflict), bail
# before the LLM run so we don't waste a call.
git pull --rebase --autostash origin main

export LLM_BACKEND="${LLM_BACKEND:-agy}"
export AGY_MODEL="${AGY_MODEL:-gemini-2.5-pro}"

# AUTO-PUBLISH ENABLED: grounded, high-confidence en-progreso status changes +
# documentada new promises publish to promises.json; parcial/cumplida/
# no-ejecutada stay one-click in the review queue; inviable is human-only.
echo "[$(date '+%F %T')] invoking npm run auto-curate-promises -- --max 10 --phase both"
npm run auto-curate-promises -- --max 10 --phase both

echo "[$(date '+%F %T')] auto-curate-promises-daily done · queue refreshed"

# ─────────────────────────────────────────────────────────────────────
# Commit + push any auto-published rows. They carry
# autoPublished.reviewState='pending-review' + the public badge until a
# curator reviews (or retracts) them. No-op when nothing was auto-published.
# ─────────────────────────────────────────────────────────────────────
if git diff --quiet -- public/data/promises.json; then
  echo "[$(date '+%F %T')] no auto-published promises — nothing to commit"
  exit 0
fi
git add public/data/promises.json
git commit -m "data: daily promise auto-curate (auto-published · pending review)"
git push origin main
echo "[$(date '+%F %T')] pushed auto-published promises"
