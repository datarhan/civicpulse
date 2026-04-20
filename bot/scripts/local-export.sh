#!/usr/bin/env bash
# Daily local export: SQLite → public/data/quejas.json → commit + push.
# Run manually:  bash bot/scripts/local-export.sh
# Run via launchd: see bot/scripts/launchd-install-export.sh

set -euo pipefail

cd "$(dirname "$0")/.."
BOT_DIR="$(pwd -P)"
REPO_DIR="$(cd .. && pwd -P)"
LOG_DIR="$BOT_DIR/data/logs"
mkdir -p "$LOG_DIR"

cd "$BOT_DIR"

# 1. Dump SQLite → public/data/quejas.json
echo "[$(date '+%F %T')] running export"
./node_modules/.bin/tsx src/services/export.ts

# 2. Commit + push only if changed.
cd "$REPO_DIR"
if git diff --quiet public/data/quejas.json; then
  echo "[$(date '+%F %T')] no diff, nothing to commit"
  exit 0
fi

git add public/data/quejas.json
git -c user.name="munigraph-local" -c user.email="bot@civicpulse.local" \
  commit -m "chore(quejas): daily snapshot from local bot"
git push origin main
echo "[$(date '+%F %T')] pushed update"
