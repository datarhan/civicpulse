#!/usr/bin/env bash
# Daily promise auto-curator wrapper: runs
#   npm run auto-curate-promises -- --max 10 --no-auto-publish
# which refreshes the LOCAL-ONLY review queue (editorial/promise-review-
# queue.json, gitignored) and writes a digest to scripts/logs/. Because
# --no-auto-publish is the rollout-safe default, NOTHING is committed:
# publication happens only when a curator approves a draft in the
# dev-only /curator dashboard.
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

# Rollout-safe default: --no-auto-publish forces every candidate into the
# local review queue; nothing is published to promises.json.
echo "[$(date '+%F %T')] invoking npm run auto-curate-promises -- --max 10 --no-auto-publish --phase both"
npm run auto-curate-promises -- --max 10 --no-auto-publish --phase both

echo "[$(date '+%F %T')] auto-curate-promises-daily done · queue refreshed (nothing committed)"

# ─────────────────────────────────────────────────────────────────────
# TO ENABLE AUTO-PUBLISH (only after watching the queue for a few days
# and spot-checking grounding, and once the /metodologia + /aviso-legal
# disclosure + the public "revisión pendiente" badge are live):
#   1. remove `--no-auto-publish` from the npm invocation above, then
#   2. uncomment this block to commit + push the auto-published rows.
# Auto-published promises carry autoPublished.reviewState='pending-review'
# and render the public badge until a curator reviews them.
#
# if git diff --quiet -- public/data/promises.json; then
#   echo "[$(date '+%F %T')] no auto-published promises — nothing to commit"
#   exit 0
# fi
# git add public/data/promises.json
# git commit -m "data: daily promise auto-curate (auto-published · pending review)"
# git push origin main
# echo "[$(date '+%F %T')] pushed auto-published promises"
# ─────────────────────────────────────────────────────────────────────
