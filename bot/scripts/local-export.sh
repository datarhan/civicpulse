#!/usr/bin/env bash
# Daily local export: SQLite → public/data/quejas.json → commit + push.
# Skips commit when ONLY generatedAt changed (semantic diff).
#
# Run manually:  bash bot/scripts/local-export.sh
# Run via launchd: see bot/scripts/launchd-install-export.sh

set -euo pipefail

cd "$(dirname "$0")/.."
BOT_DIR="$(pwd -P)"
REPO_DIR="$(cd .. && pwd -P)"
LOG_DIR="$BOT_DIR/data/logs"
SNAPSHOT="$REPO_DIR/public/data/quejas.json"

mkdir -p "$LOG_DIR"

cd "$BOT_DIR"

# 1. Dump SQLite → public/data/quejas.json
echo "[$(date '+%F %T')] running export"
./node_modules/.bin/tsx src/services/export.ts

# 2. Compute a content hash of everything EXCEPT generatedAt. If it
#    matches the committed version, the only change is the timestamp —
#    skip the commit entirely.
#
# The hash covers { items, stats, source } which is the full semantic
# payload. We use jq with -S (sort keys) for stable serialisation.
hash_semantic() {
  jq -Sc '{items, stats, source}' "$1" | shasum -a 256 | awk '{print $1}'
}

if [ ! -f "$SNAPSHOT" ]; then
  echo "[$(date '+%F %T')] snapshot did not exist, committing fresh copy"
else
  # Hash of committed version (what git HEAD has) vs working copy
  cd "$REPO_DIR"
  COMMITTED_JSON="$(git show HEAD:public/data/quejas.json 2>/dev/null || echo '')"
  if [ -n "$COMMITTED_JSON" ]; then
    COMMITTED_HASH="$(printf '%s' "$COMMITTED_JSON" | jq -Sc '{items, stats, source}' 2>/dev/null | shasum -a 256 | awk '{print $1}')"
  else
    COMMITTED_HASH="none"
  fi
  WORKING_HASH="$(hash_semantic "$SNAPSHOT")"

  if [ "$COMMITTED_HASH" = "$WORKING_HASH" ]; then
    # Items/stats identical. Roll back the timestamp-only diff so git stays clean.
    git checkout -- public/data/quejas.json 2>/dev/null || true
    echo "[$(date '+%F %T')] semantic diff empty, nothing to push"
    exit 0
  fi
fi

cd "$REPO_DIR"
git add public/data/quejas.json
git -c user.name="munigraph-local" -c user.email="bot@civicpulse.local" \
  commit -m "chore(quejas): daily snapshot from local bot"
git push origin main
echo "[$(date '+%F %T')] pushed update"
