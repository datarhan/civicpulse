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

# Default backend: gemini (Pro plan, $0). Falls back through the
# chain (anthropic → ollama) automatically if the quota is out.
export GOOGLE_GENAI_USE_GCA="${GOOGLE_GENAI_USE_GCA:-true}"
export LLM_BACKEND="${LLM_BACKEND:-gemini}"
export GEMINI_MODEL="${GEMINI_MODEL:-gemini-2.5-flash}"

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
