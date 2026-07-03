#!/usr/bin/env bash
# Quejas export: SQLite (bot/data/bot.db) → public/data/quejas.json → commit + push.
#
# Safe to run FREQUENTLY and UNATTENDED — installed as a per-minute cron by
# bot/scripts/cron-install-export.sh so each new/changed queja reaches the live
# site within ~1 minute. Design notes:
#
#   • Idle runs are GIT-SILENT. Export + semantic-diff only; when the snapshot
#     is unchanged (ignoring the generatedAt timestamp) the working copy is
#     rolled back and the script exits WITHOUT any git network op — so a
#     per-minute cron never touches your working tree unless a queja changed.
#   • Change runs COMMIT-then-REBASE-then-PUSH so a per-minute committer stays
#     fast-forward with the nightly scrape / promise cron that also push to main
#     (retries once on a push race).
#   • A mkdir lock (portable; macOS has no flock) prevents overlapping runs — a
#     slow push can't collide with the next minute's tick.
#
# Run manually:  bash bot/scripts/local-export.sh
# Install cron:  bash bot/scripts/cron-install-export.sh
# Tail logs:     tail -f bot/data/logs/cron-quejas-export.log

set -euo pipefail

cd "$(dirname "$0")/.."
BOT_DIR="$(pwd -P)"
REPO_DIR="$(cd .. && pwd -P)"
LOG_DIR="$BOT_DIR/data/logs"
SNAPSHOT="$REPO_DIR/public/data/quejas.json"
LOCK_DIR="$BOT_DIR/data/.export.lock"

mkdir -p "$LOG_DIR"

# ── Lock. Steal a stale lock left by a crashed run (>10 min old). ──────────
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  if [ -n "$(find "$LOCK_DIR" -maxdepth 0 -mmin +10 2>/dev/null)" ]; then
    echo "[$(date '+%F %T')] stealing stale lock"
    rmdir "$LOCK_DIR" 2>/dev/null || true
    mkdir "$LOCK_DIR" 2>/dev/null || { echo "[$(date '+%F %T')] lock busy, exiting"; exit 0; }
  else
    echo "[$(date '+%F %T')] another export is running, exiting"
    exit 0
  fi
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

# ── 1. Dump SQLite → quejas.json ───────────────────────────────────────────
cd "$BOT_DIR"
echo "[$(date '+%F %T')] running export"
./node_modules/.bin/tsx src/services/export.ts

# ── 2. Semantic diff (ignore generatedAt). Idle path exits git-silent. ─────
# The hash covers { items, stats, source } — the full semantic payload — via
# jq -S (sorted keys) so serialisation is stable.
hash_semantic() {
  jq -Sc '{items, stats, source}' "$1" | shasum -a 256 | awk '{print $1}'
}

if [ -f "$SNAPSHOT" ]; then
  cd "$REPO_DIR"
  COMMITTED_JSON="$(git show HEAD:public/data/quejas.json 2>/dev/null || echo '')"
  if [ -n "$COMMITTED_JSON" ]; then
    COMMITTED_HASH="$(printf '%s' "$COMMITTED_JSON" | jq -Sc '{items, stats, source}' 2>/dev/null | shasum -a 256 | awk '{print $1}')"
  else
    COMMITTED_HASH="none"
  fi
  WORKING_HASH="$(hash_semantic "$SNAPSHOT")"

  if [ "$COMMITTED_HASH" = "$WORKING_HASH" ]; then
    # Items/stats identical. Roll back the timestamp-only diff so git stays
    # clean and this idle tick leaves no trace.
    git checkout -- public/data/quejas.json 2>/dev/null || true
    echo "[$(date '+%F %T')] semantic diff empty, nothing to push"
    exit 0
  fi
fi

# ── 3. Change path: commit → rebase → push (retry once on a race). ─────────
cd "$REPO_DIR"
git add public/data/quejas.json
if git diff --cached --quiet -- public/data/quejas.json; then
  echo "[$(date '+%F %T')] nothing staged, exiting"
  exit 0
fi
git -c user.name="munigraph-local" -c user.email="bot@civicpulse.local" \
  commit -m "chore(quejas): snapshot from local bot"

push_once() { git pull --rebase --autostash origin main && git push origin main; }
if push_once; then
  echo "[$(date '+%F %T')] pushed update"
else
  echo "[$(date '+%F %T')] push race — retrying once"
  sleep 3
  push_once
  echo "[$(date '+%F %T')] pushed update (retry)"
fi
