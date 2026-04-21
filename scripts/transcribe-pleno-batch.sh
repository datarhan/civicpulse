#!/usr/bin/env bash
# Batch-transcribe pleno videos — walks public/data/pleno-videos.json and runs
# scripts/transcribe-pleno.sh on any session without a cached transcript yet.
#
# Usage:
#   npm run transcribe:batch                        # transcribe everything missing
#   npm run transcribe:batch -- --limit 3           # at most 3 sessions this run
#   npm run transcribe:batch -- --limit 3 --dry-run # show what would run, don't execute
#   npm run transcribe:batch -- --force             # re-transcribe even if cached
#
# Constraints (by design):
# - Runs serially (one Whisper job at a time). Parallelism risks swapping out
#   the 9GB large-v3 model between workers and thrashes CPU.
# - Skips live streams automatically (transcribe-pleno.sh's is_live guard).
# - DO NOT wire this into the nightly GH Actions scrape — transcription is
#   CPU-heavy (~1h wall-clock per 1h of audio on Apple Silicon) and must
#   stay local. The cron runners in Actions can't afford it.
#
# Exit codes:
#   0  — all requested sessions transcribed (or skipped for valid reasons)
#   1  — one or more Whisper runs failed; remaining sessions still attempted
#   2  — usage error

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VIDEOS_JSON="$REPO_ROOT/public/data/pleno-videos.json"
TRANSCRIPT_DIR="$REPO_ROOT/public/data/pleno-transcripts"
LOG_DIR="/tmp/cp-transcribe"
mkdir -p "$TRANSCRIPT_DIR" "$LOG_DIR"

LIMIT=0          # 0 = no limit
DRY_RUN=0
FORCE=0
SKIP=""          # comma-separated plenoIds to defer (e.g. long live-archived ones)
while [ $# -gt 0 ]; do
  case "$1" in
    --limit)   shift; LIMIT="${1:-0}" ;;
    --dry-run) DRY_RUN=1 ;;
    --force)   FORCE=1 ;;
    --skip)    shift; SKIP="${1:-}" ;;
    -h|--help)
      sed -n '1,/^# Exit codes/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      echo "unknown flag: $1" >&2
      exit 2 ;;
  esac
  shift
done

if [ ! -f "$VIDEOS_JSON" ]; then
  echo "[batch] $VIDEOS_JSON missing — run 'npm run scrape:pleno-videos' first" >&2
  exit 2
fi

# Build a list of plenoIds that need transcription via the sibling helper.
# The helper walks pleno-videos.json and plenos.json, cross-references cached
# transcripts, and emits one plenoId per line.
plenos_json="$REPO_ROOT/public/data/plenos.json"
targets=$(node "$REPO_ROOT/scripts/transcribe-pleno-batch-list.mjs" \
  "$VIDEOS_JSON" "$plenos_json" "$TRANSCRIPT_DIR" "$FORCE" "$SKIP")

if [ -z "$targets" ]; then
  echo "[batch] nothing to do — every pleno with a matched video already has a transcript"
  exit 0
fi

count=$(echo "$targets" | wc -l | tr -d ' ')
echo "[batch] $count session(s) queued for transcription"

if [ "$LIMIT" -gt 0 ]; then
  targets=$(echo "$targets" | head -n "$LIMIT")
  kept=$(echo "$targets" | wc -l | tr -d ' ')
  echo "[batch] --limit $LIMIT applied → processing $kept this run (deferring the rest)"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[batch] dry-run mode. Would transcribe:"
  echo "$targets" | sed 's/^/  - /'
  exit 0
fi

exit_code=0
i=0
total=$(echo "$targets" | wc -l | tr -d ' ')
for id in $targets; do
  i=$((i+1))
  echo "---"
  echo "[batch] ($i/$total) transcribing $id …"
  log_file="$LOG_DIR/$id.log"
  if bash "$REPO_ROOT/scripts/transcribe-pleno.sh" "$id" > "$log_file" 2>&1; then
    # Verify the transcript landed + has real content (>1KB).
    txt="$TRANSCRIPT_DIR/$id.txt"
    if [ -s "$txt" ] && [ "$(wc -c < "$txt")" -gt 1024 ]; then
      echo "[batch] ($i/$total) $id OK · $(wc -c < "$txt") bytes"
    else
      echo "[batch] ($i/$total) $id produced an empty/tiny transcript — see $log_file" >&2
      exit_code=1
    fi
  else
    echo "[batch] ($i/$total) $id FAILED — see $log_file" >&2
    exit_code=1
    # Continue with the rest — don't let one broken session (e.g. live stream) block the batch.
  fi
done

echo "---"
if [ "$exit_code" -eq 0 ]; then
  echo "[batch] all $total session(s) transcribed successfully"
else
  echo "[batch] finished with one or more failures — check logs under $LOG_DIR"
fi
exit "$exit_code"
