#!/usr/bin/env bash
# CivicPulse — /hallazgos full-refresh pipeline (transcribe → extract →
# verify → auto-curate → commit → push). Keeps public/data/pleno-findings.json
# (rendered at /hallazgos) fresh end-to-end.
#
# Chain:
#   scrape:pleno-videos          refresh the YouTube video index (cheap)
#   → for each pleno that HAS a video but NO transcript (newest first,
#     capped at MAX_PLENOS per run):
#         transcribe             Whisper mlx · $0 · ~20 min/pleno · local
#         extract:pleno-claims   agy · gemini-3.5-flash · $0
#   → verify:pleno-claims        overlay-safe deterministic re-verify
#   → auto-curate                agy · gemini-3.5-flash · libel-safe gates
#   → commit + push              deploy-vercel.yml redeploys on push-to-main
#
# Safe to run unattended:
#   · No new pleno video → the transcribe/extract loop is a no-op; the
#     cheap auto-curate still runs to promote any pending verified claims.
#   · MAX_PLENOS (default 2) bounds each run's wall-clock; a backlog is
#     cleared a couple plenos per run (weekly cron chews through it).
#   · verify:pleno-claims is OVERLAY-SAFE — it writes the gitignored base
#     (pleno-claims-verified-base.json) then re-applies the committed
#     public/data/pleno-claims-overlay.json via rebuildVerified(), so it
#     can NOT wipe the LLM/NLI/curator verdicts. NEVER call
#     verify:pleno-claims:llm here — that legacy runner bypasses the overlay.
#   · LOREG electoral freeze → auto-curate exits 0 without writing.
#   · One pleno failing (yt-dlp hiccup, quota) is logged + skipped; the
#     batch continues. The extract checkpoint preserves completed plenos.
#
# Host-only: agy is an arm64 macOS CLI (can't containerize) and Whisper mlx
# uses the Apple Neural Engine. macOS TCC: cron needs Full Disk Access on
# /usr/sbin/cron + node + git, and origin must be SSH — same gauntlet as the
# quejas + promises crons (see project memory).
#
# Run manually:   bash scripts/hallazgos-pipeline.sh          # MAX_PLENOS=2
#                 MAX_PLENOS=1 bash scripts/hallazgos-pipeline.sh
# Install cron:   bash scripts/cron-install-hallazgos.sh
set -euo pipefail

MAX_PLENOS="${MAX_PLENOS:-2}"

cd "$(dirname "$0")/.."
REPO_DIR="$(pwd -P)"
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"

log() { echo "[hallazgos-pipeline] [$(date '+%F %T')] $*"; }

# ---- single-instance lock (a run can take hours) ----------------------
LOCK_DIR="$REPO_DIR/scripts/.hallazgos-pipeline.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  if find "$LOCK_DIR" -maxdepth 0 -mmin +360 >/dev/null 2>&1; then
    log "stealing stale lock (>6h)"; rmdir "$LOCK_DIR" 2>/dev/null || true
    mkdir "$LOCK_DIR" 2>/dev/null || { log "lock contended — exiting"; exit 0; }
  else
    log "another run holds the lock — exiting"; exit 0
  fi
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

# ---- env --------------------------------------------------------------
if [ -f "$REPO_DIR/.env" ]; then set -a; . "$REPO_DIR/.env"; set +a; fi
export LLM_BACKEND=agy
export AGY_MODEL="${AGY_MODEL:-gemini-3.5-flash}"
export WHISPER_ENGINE="${WHISPER_ENGINE:-mlx}"

log "starting · MAX_PLENOS=$MAX_PLENOS · llm=$LLM_BACKEND/$AGY_MODEL · whisper=$WHISPER_ENGINE"

# ---- always start from origin -----------------------------------------
git pull --rebase --autostash origin main || { log "git pull failed — aborting before LLM work"; exit 1; }

# ---- refresh the video index (cheap) ----------------------------------
npm run scrape:pleno-videos || log "warn: scrape:pleno-videos failed — continuing with existing index"

# ---- transcribable backlog: missing transcript AND has a video, newest first
TARGETS=$(node -e '
  const fs=require("fs");
  const plenos=(require("./public/data/plenos.json").items)||[];
  const videos=(require("./public/data/pleno-videos.json").items)||[];
  const vdates=new Set(videos.map(v=>v.plenoDate));
  const have=new Set(fs.readdirSync("public/data/pleno-transcripts").filter(f=>f.endsWith(".txt")).map(f=>f.replace(/\.txt$/,"")));
  const t=plenos.filter(p=>!have.has(p.id)&&vdates.has(p.date)).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  process.stdout.write(t.map(x=>x.id).join("\n"));
')

NEW=0
COUNT=0
if [ -n "$TARGETS" ]; then
  while IFS= read -r id; do
    [ -z "$id" ] && continue
    if [ "$COUNT" -ge "$MAX_PLENOS" ]; then
      log "reached MAX_PLENOS=$MAX_PLENOS — remaining backlog deferred to next run"; break
    fi
    COUNT=$((COUNT+1))
    log "[$COUNT/$MAX_PLENOS] transcribing $id (whisper=$WHISPER_ENGINE)…"
    # mlx can abort on a Metal GPU command-buffer timeout on very long
    # sessions (5h+, ~140MB+ audio) — a C++ abort we can't catch in-process.
    # Retry once at batch_size=1 (shortest Metal command buffers, safest
    # against the driver watchdog) before giving up on the pleno.
    ok=0
    if bash scripts/transcribe-pleno.sh "$id"; then
      ok=1
    elif [ "$WHISPER_ENGINE" = mlx ]; then
      log "transcription failed for $id — retry at batch_size=1 (Metal GPU timeout guard)…"
      if WHISPER_BATCH_SIZE=1 bash scripts/transcribe-pleno.sh "$id"; then ok=1; fi
    fi
    if [ "$ok" = 1 ]; then
      log "extracting claims from $id (agy/$AGY_MODEL)…"
      if npm run extract:pleno-claims -- "$id"; then
        NEW=$((NEW+1)); log "✓ $id transcribed + extracted"
      else
        log "warn: extract failed for $id — transcript kept, claims incomplete"
      fi
    else
      log "warn: transcription failed for $id (even at batch_size=1) — skipping"
    fi
  done <<< "$TARGETS"
else
  log "no transcribable backlog"
fi

# ---- re-verify only if new claims landed (overlay-safe) ---------------
if [ "$NEW" -gt 0 ]; then
  log "re-verifying claims ($NEW new pleno(s)) — overlay-safe…"
  npm run verify:pleno-claims
else
  log "no new extractions — skipping verify"
fi

# ---- promote (libel-safe gates; no-op under LOREG freeze) -------------
log "auto-curating findings (max 5)…"
npm run auto-curate -- --max 5

# ---- commit + push the regenerated data -------------------------------
# Stage everything the pipeline touches under public/data, but never race
# the two files owned by the OTHER crons (quejas per-minute · promises daily).
git add -- public/data
git reset -q -- public/data/quejas.json public/data/promises.json 2>/dev/null || true

if git diff --cached --quiet; then
  log "nothing changed — done (no commit)"; exit 0
fi

NEW_FINDINGS=$(git diff --cached -- public/data/pleno-findings.json | grep -cE '^\+ +"id": "f-' || true)
git commit -m "$(cat <<EOF
data: /hallazgos pipeline · ${NEW} pleno(s) transcribed · ${NEW_FINDINGS} new finding(s)

Automated by scripts/hallazgos-pipeline.sh (weekly cron).
transcribe(mlx) → extract(agy/${AGY_MODEL}) → verify(overlay-safe) → auto-curate.
All findings tagged \`curatorName: "auto-curation-v1"\`.
EOF
)"

# push with one pull-rebase retry (races the per-minute quejas cron)
if ! git push origin main; then
  log "push rejected — pull-rebase + retry"
  git pull --rebase --autostash origin main
  git push origin main
fi

log "done · ${NEW} transcribed · ${NEW_FINDINGS} new finding(s) pushed"
