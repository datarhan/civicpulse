#!/usr/bin/env bash
# CivicPulse — /laboratorio press-lab full-refresh pipeline (LLM-gated).
#
#   git pull → scrape:factcheck → extract:press-claims (claude-code/Sonnet 5)
#   → verify → summarize:press → compute:press-analytics → auto-curate-press
#   → audit-press-links → commit + push
#
# WHY A LOCAL CRON (not GitHub Actions):
#   The lab's editorial stages need an LLM backend + a Google Fact Check key.
#   GitHub-hosted CI has NEITHER, so the nightly's lab chain silently wrote
#   empty snapshots every night (extract → items:[] → exit 0 → green ✅) and
#   /laboratorio showed a wall of claim-less cards. This pipeline runs the SAME
#   chain on the Mac where the `claude` CLI (Anthropic Max, $0) and the .env
#   keys exist — the pattern scripts/hallazgos-pipeline.sh established.
#
# BACKEND — claude-code / claude-sonnet-5 (Max subscription, $0, no API key):
#   Frontier-model accuracy for the libel-sensitive claim extraction. The
#   `claude -p` CLI only works headless with --strict-mcp-config + a
#   single-tool surface (see src/llm/client.ts::callClaudeCode) — without it
#   every call hangs on the user's global MCP servers. Sequential
#   (LLM_CONCURRENCY=1) to stay under the Max burst-rate limit; ~1 min/item.
#   Override e.g. CLAUDE_CODE_MODEL=haiku for lighter quota, or
#   LLM_BACKEND=ollama OLLAMA_MODEL=qwen2.5:14b-instruct for a fully-local $0
#   fallback.
#
#   Division of labour (so no two writers fight over one file):
#     · press.json .................. GitHub nightly (scrape:press, no LLM)
#     · press-claims-*, press-trust,
#       press-triangulation,
#       press-coverage-gaps,
#       press-summaries, factcheck,
#       press-findings, press-link-rot  THIS pipeline (git-pulls press.json first)
#
# Host-only: the `claude` CLI + Max login live on this Mac. Cron prereqs are the
# same TCC gauntlet as the quejas/promises/hallazgos crons (Full Disk Access on
# cron+node+git, SSH origin). See project memory `project_hallazgos_pipeline_cron.md`.
#
# Run manually:  bash scripts/press-lab-pipeline.sh
#                MAX_EXTRACT=20 MAX_SUMMARIZE=10 bash scripts/press-lab-pipeline.sh
# Install cron:  bash scripts/cron-install-press-lab.sh
set -euo pipefail

# Sonnet 5 over the Max CLI is ~1 min/item, so keep the daily batch modest
# (bounds runtime AND Max-quota use). Lower via env if the cron overlaps your
# interactive Claude Code sessions (they share the Max quota).
MAX_EXTRACT="${MAX_EXTRACT:-25}"
MAX_SUMMARIZE="${MAX_SUMMARIZE:-15}"
# Hard per-LLM-step wall-clock cap (seconds). A hung/stalled backend must never
# brick the cron by holding its lock forever — the step's whole process group is
# killed, logged ❌, and the pipeline moves on. macOS has no coreutils
# `timeout`, so we use perl (setsid → group kill, no orphaned children).
LLM_TIMEOUT="${LLM_TIMEOUT:-2400}"

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
# claude-code = the `claude` CLI on the Max plan ($0, no API key). LLM_CONCURRENCY=1
# is deliberate: parallel `claude -p` invocations trip the Max burst-rate limit.
# OLLAMA_MODEL is only consulted if you override LLM_BACKEND=ollama.
export LLM_BACKEND="${LLM_BACKEND:-claude-code}"
export CLAUDE_CODE_MODEL="${CLAUDE_CODE_MODEL:-claude-sonnet-5}"
export OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:14b-instruct}"
export LLM_CONCURRENCY="${LLM_CONCURRENCY:-1}"

# Fail fast + loud if the Max login lapsed — else every extract call returns
# "Not logged in" and the run silently produces nothing.
if [ "$LLM_BACKEND" = claude-code ] &&
   ! claude -p "ok" --strict-mcp-config --model "$CLAUDE_CODE_MODEL" >/dev/null 2>&1; then
  log "warn: 'claude -p' probe failed — Max login may have lapsed (run: claude, then /login). LLM steps will no-op this run."
fi

log "starting · llm=$LLM_BACKEND/${CLAUDE_CODE_MODEL} · extract≤$MAX_EXTRACT · summarize≤$MAX_SUMMARIZE · step-cap=${LLM_TIMEOUT}s"

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
# Run a command under the hard LLM_TIMEOUT wall-clock cap (perl: macOS lacks
# `timeout`). SIGALRM survives exec, so the tsx child is killed if it hangs.
bounded() {
  perl -e 'use POSIX qw(setsid);
    my $t = shift;
    my $pid = fork();
    if ($pid == 0) { setsid(); exec @ARGV; exit 127 }
    $SIG{ALRM} = sub { kill("-TERM", $pid); sleep 3; kill("-KILL", $pid); exit 124 };
    alarm $t;
    waitpid($pid, 0);
    exit($? >> 8);
  ' "$LLM_TIMEOUT" "$@"
}

# factcheck first so the verifier can cross-reference Newtral/Maldita/EFE.
step "scrape:factcheck"        npx tsx scripts/scrape-factcheck.ts
step "extract:press-claims"    bounded npx tsx scripts/extract-press-claims.ts --max "$MAX_EXTRACT"
step "verify:press-claims"     npx tsx scripts/verify-press-claims.ts
step "summarize:press"         bounded npx tsx scripts/summarize-press.ts --max "$MAX_SUMMARIZE"
step "compute:press-analytics" npx tsx scripts/compute-press-analytics.ts

# auto-curate-press must NEVER go metered (project policy: $0 backends only).
# Strip the metered keys + disable the gemini CLI so it can only reach the
# local $0 backend. A skipped promotion beats a metered one — deferred.
log "auto-curating press findings ($LLM_BACKEND only, metered fallback off)…"
if env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY GEMINI_BIN=/nonexistent-disabled \
    bounded npx tsx scripts/auto-curate-press.ts; then
  RESULTS="${RESULTS}  ✅ auto-curate-press\n"; log "✓ auto-curate-press"
else
  RESULTS="${RESULTS}  ❌ auto-curate-press (deferred)\n"
  log "warn: auto-curate-press non-zero ($LLM_BACKEND unavailable) — deferred"
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
scrape:factcheck → extract(${LLM_BACKEND}) → verify → summarize → analytics
→ auto-curate-press(${LLM_BACKEND}) → audit-press-links. Machine claims are
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
