#!/usr/bin/env bash
# CivicPulse — /laboratorio press-lab full-refresh pipeline (LLM-gated).
#
#   git pull → scrape:factcheck → extract:press-claims (agy) → verify:press-claims
#   → summarize:press (agy) → compute:press-analytics → auto-curate-press (agy→ollama)
#   → audit-press-links → commit + push
#
# WHY A LOCAL CRON (not GitHub Actions):
#   The lab's editorial stages need an LLM backend + a Google Fact Check key.
#   GitHub-hosted CI has NEITHER, so the nightly's lab chain silently wrote
#   empty snapshots every night (extract → items:[] → exit 0 → green ✅) and
#   /laboratorio showed a wall of claim-less cards. This pipeline runs the SAME
#   chain on the Mac where `agy` (Google-subscription CLI, $0) and the .env keys
#   exist — exactly the pattern scripts/hallazgos-pipeline.sh already uses for
#   the /hallazgos findings.
#
#   Division of labour (so no two writers fight over one file):
#     · press.json .................. GitHub nightly (scrape:press, no LLM)
#     · press-claims-*, press-trust,
#       press-triangulation,
#       press-coverage-gaps,
#       press-summaries, factcheck,
#       press-findings, press-link-rot  THIS pipeline (git-pulls press.json first)
#
# Host-only: agy is an arm64 macOS CLI. Cron prereqs are the same TCC gauntlet
# as the quejas/promises/hallazgos crons (Full Disk Access on cron+node+git,
# SSH origin). See project memory `project_hallazgos_pipeline_cron.md`.
#
# Run manually:  bash scripts/press-lab-pipeline.sh
#                MAX_EXTRACT=20 MAX_SUMMARIZE=10 bash scripts/press-lab-pipeline.sh
# Install cron:  bash scripts/cron-install-press-lab.sh
set -euo pipefail

MAX_EXTRACT="${MAX_EXTRACT:-60}"
MAX_SUMMARIZE="${MAX_SUMMARIZE:-40}"

cd "$(dirname "$0")/.."
REPO_DIR="$(pwd -P)"
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"

log() { echo "[press-lab-pipeline] [$(date '+%F %T')] $*"; }

# ---- single-instance lock ---------------------------------------------
LOCK_DIR="$REPO_DIR/scripts/.press-lab-pipeline.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  if find "$LOCK_DIR" -maxdepth 0 -mmin +180 >/dev/null 2>&1; then
    log "stealing stale lock (>3h)"; rmdir "$LOCK_DIR" 2>/dev/null || true
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
export LLM_CONCURRENCY="${LLM_CONCURRENCY:-2}"

log "starting · llm=$LLM_BACKEND/$AGY_MODEL · extract≤$MAX_EXTRACT · summarize≤$MAX_SUMMARIZE"

# ---- always start from origin (press.json comes from the GH nightly) --
git pull --rebase --autostash origin main || { log "git pull failed — aborting before LLM work"; exit 1; }

# ---- resilient chain: one flaky stage must not abort the rest ---------
# (mirrors the old nightly's run_lab: log ✓/✗, keep going, commit what refreshed.)
RESULTS=""
step() {
  local label="$1"; shift
  if "$@"; then
    RESULTS="${RESULTS}  ✅ ${label}\n"; log "✓ ${label}"
  else
    local rc=$?
    RESULTS="${RESULTS}  ❌ ${label} (exit ${rc})\n"; log "✗ ${label} FAILED (exit ${rc})"
  fi
}

# factcheck first so the verifier can cross-reference Newtral/Maldita/EFE.
step "scrape:factcheck"        npx tsx scripts/scrape-factcheck.ts
step "extract:press-claims"    npx tsx scripts/extract-press-claims.ts --max "$MAX_EXTRACT"
step "verify:press-claims"     npx tsx scripts/verify-press-claims.ts
step "summarize:press"         npx tsx scripts/summarize-press.ts --max "$MAX_SUMMARIZE"
step "compute:press-analytics" npx tsx scripts/compute-press-analytics.ts

# auto-curate-press must NEVER go metered (project policy: agy→ollama only).
# Strip the metered keys + disable the gemini CLI so the fallback chain is
# $0-only. A skipped promotion beats a metered one — deferred to next run.
log "auto-curating press findings (agy→ollama only, metered fallback off)…"
if env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY GEMINI_BIN=/nonexistent-disabled \
    npx tsx scripts/auto-curate-press.ts; then
  RESULTS="${RESULTS}  ✅ auto-curate-press\n"; log "✓ auto-curate-press"
else
  RESULTS="${RESULTS}  ❌ auto-curate-press (deferred)\n"
  log "warn: auto-curate-press non-zero (agy throttled + no \$0 fallback) — deferred"
fi

# link-rot audit LAST so it sees every URL this run added.
step "audit-press-links"       npx tsx scripts/audit-press-links.ts

log "chain results:"; printf '%b' "$RESULTS"

# ---- commit + push ONLY the press-lab-owned snapshots -----------------
# Explicit paths so we never race press.json (GH nightly), pleno-* (hallazgos
# cron), quejas.json (quejas cron), or promises.json (promises cron).
git add -- \
  public/data/factcheck.json \
  public/data/press-claims-suggestions.json \
  public/data/press-claims-verified.json \
  public/data/press-summaries.json \
  public/data/press-trust.json \
  public/data/press-triangulation.json \
  public/data/press-coverage-gaps.json \
  public/data/press-findings.json \
  public/data/press-link-rot.json 2>/dev/null || true

if git diff --cached --quiet; then
  log "nothing changed — done (no commit)"; exit 0
fi

CLAIMS=$(node -e "try{console.log(require('./public/data/press-claims-verified.json').items.length)}catch{console.log(0)}")
git commit -m "$(cat <<EOF
data(laboratorio): press-lab refresh · ${CLAIMS} verified claim(s)

Automated by scripts/press-lab-pipeline.sh (local cron).
scrape:factcheck → extract(agy/${AGY_MODEL}) → verify → summarize → analytics
→ auto-curate-press(agy→ollama) → audit-press-links. Machine claims are
outlet-attributed and verified against municipal open data; editorial findings
stay curator-gated.
EOF
)"

# push with one pull-rebase retry (races the per-minute quejas cron).
if ! git push origin main; then
  log "push rejected — pull-rebase + retry"
  git pull --rebase --autostash origin main
  git push origin main
fi

log "done · ${CLAIMS} verified claim(s) pushed"
