#!/usr/bin/env bash
# Weekly auto-curation wrapper: runs `npm run auto-curate -- --max 5`,
# commits + pushes the diff if any new findings landed, and logs to
# scripts/logs/auto-curate.{out,err}.log.
#
# Run manually:        bash scripts/auto-curate-weekly.sh
# Install via launchd: bash scripts/launchd-install-auto-curate.sh
#                      (mirrors bot/scripts/launchd-install-export.sh)
#
# The Mac must be awake at the scheduled time. macOS launchd
# StartCalendarInterval coalesces into the next wake if asleep, so
# missed runs catch up automatically.
#
# Failure modes:
#   · Gemini quota out → CLI auto-falls-back to ollama (always free).
#   · Schema validator rejects the LLM output → CLI exits non-zero
#     without writing pleno-findings.json. We surface the error in
#     the err log; the wrapper exits non-zero so launchd marks the
#     run as failed (visible via Console.app).
#   · No new bundles eligible → CLI exits 0 with no diff. Wrapper
#     skips the commit step (nothing to commit).
#   · LOREG electoral freeze active → CLI exits 0 without writing.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO_DIR="$(pwd -P)"
LOG_DIR="$REPO_DIR/scripts/logs"
mkdir -p "$LOG_DIR"

# Source .env so OPENAI_API_KEY (the metered fallback) is available
# if gemini auth has expired and we need it. Don't fail if absent.
if [ -f "$REPO_DIR/.env" ]; then
  # shellcheck disable=SC1091
  set -a; . "$REPO_DIR/.env"; set +a
fi

echo "[$(date '+%F %T')] auto-curate-weekly starting"

# Always pull-rebase first so we don't push stale state. If pull fails
# (network down, rebase conflict), bail before the LLM run so we
# don't waste quota.
git pull --rebase --autostash origin main

# SUPERSEDED: this promote-only wrapper is replaced by the full-chain
# scripts/hallazgos-pipeline.sh (daily cron: transcribe→extract→verify→
# auto-curate→push). It stays only as a manual promote-only fallback.
#
# Default backend: agy · gemini-3.5-flash ($0, Google subscription) —
# the same headless backend the promises cron uses. Switched OFF
# claude-code/sonnet: claude-code STALLS headlessly under cron/launchd
# (no interactive session to attach to) and burns the shared Max quota;
# sonnet also violates the opus-or-fable model policy. agy runs headless.
export LLM_BACKEND="${LLM_BACKEND:-agy}"
export AGY_MODEL="${AGY_MODEL:-gemini-3.5-flash}"
# Gemini stays as a fallback target. GOOGLE_GENAI_USE_GCA=true so the
# chain can switch to Pro plan auth if claude-code hits a quota wall.
# gemini-2.5-pro is the highest tier the gemini CLI Pro subscription
# accepts on this account (3.x isn't reachable, 2.0/lite are
# downgrades). Verified by probing `gemini -m <model> -p ...` against
# the live CLI. Re-test if Google ships 3.x to this tier.
export GOOGLE_GENAI_USE_GCA="${GOOGLE_GENAI_USE_GCA:-true}"
export GEMINI_MODEL="${GEMINI_MODEL:-gemini-2.5-pro}"

# Run the curator with a 5-finding cap (matches the on-demand default).
echo "[$(date '+%F %T')] invoking npm run auto-curate -- --max 5"
npm run auto-curate -- --max 5

# Was anything actually written?
if git diff --quiet -- public/data/pleno-findings.json; then
  echo "[$(date '+%F %T')] no new findings — nothing to commit"
  exit 0
fi

# Commit only the findings file. The queue file is gitignored, no need
# to add it. The verified.json could change if a verify pass also ran
# concurrently — only stage what we own.
git add public/data/pleno-findings.json

NEW_COUNT=$(git diff --cached -- public/data/pleno-findings.json \
  | grep -cE '^\+ +"id": "f-' || true)

git commit -m "$(cat <<EOF
data: weekly auto-curate batch · ${NEW_COUNT} new finding(s)

Automated by scripts/auto-curate-weekly.sh (launchd Mondays 09:00).
All findings tagged \`curatorName: "auto-curation-v1"\`.
EOF
)"

git push origin main

echo "[$(date '+%F %T')] auto-curate-weekly done · pushed ${NEW_COUNT} new finding(s)"
