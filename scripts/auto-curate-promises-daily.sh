#!/usr/bin/env bash
# Daily promise auto-curator wrapper: runs
#   npm run auto-curate-promises -- --max 10 --phase both
# AUTO-PUBLISH IS ENABLED — grounded, high-confidence (≥0.70) en-progreso
# status changes + documentada new promises publish to promises.json (stamped
# autoPublished.reviewState='pending-review' + a public "revisión pendiente"
# badge) and are committed + pushed below. Everything else (parcial/cumplida/
# no-ejecutada, plus anything ungrounded or below threshold) stays in the
# LOCAL-ONLY review queue (editorial/promise-review-queue.json, gitignored)
# for one-click curator approval in the dev-only /curator dashboard. An
# auto-published row is reversible: `npm run apply-promise-draft -- --retract
# <id>` deletes an auto-created promise or REVERTS an auto-published status
# change (status → priorStatus, appended evidence dropped).
#
# Run manually:        bash scripts/auto-curate-promises-daily.sh
# Install via launchd: bash scripts/launchd-install-auto-curate-promises.sh
#
# The Mac must be awake at the scheduled time. macOS launchd
# StartCalendarInterval coalesces into the next wake if asleep, so a
# missed run catches up automatically.
#
# LLM backend: claude-code (Anthropic Max · $0), with a HARD metered guard on
# the run below. Rationale: agy (Google's CLI) has a daily quota that, once
# hit, makes `agy -p` exit 0 with EMPTY stdout — the client reads that as a
# dead backend and, for an UNGUARDED run, silently falls through to METERED
# openai (observed 2026-07-06), violating the $0-only auto-curator policy.
# claude-code is a SEPARATE quota, healthy, sanctioned for the auto-curator,
# and the promise workload is ~10 calls/day so it won't dent the shared Max
# window. The `env -u …` guard strips the openai/anthropic keys + disables the
# gemini CLI, so the run can only reach claude-code (ollama is no longer
# auto-chained anywhere — user directive 2026-07-07); if it's down the run
# DEFERS rather than auto-publishing on a metered API. Override with
# LLM_BACKEND=… if needed.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO_DIR="$(pwd -P)"
LOG_DIR="$REPO_DIR/scripts/logs"
mkdir -p "$LOG_DIR"

# Branch guard + pathspec-limited commit, shared by all four cron pipelines.
# shellcheck source=scripts/lib/cron-git.sh
. "$REPO_DIR/scripts/lib/cron-git.sh"

# Before the pull and before the LLM call: off main this run would rebase the
# checked-out branch onto origin/main, commit there, and then push an untouched
# local main — ten model calls spent on something that can never be published.
cron_require_main "auto-curate-promises-daily"

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
#
# Through cron_git_pull_rebase: sourcing .env sits between the branch guard and
# this line, and on a branch that appeared in that window the pull would rebase
# THAT branch onto origin/main instead of just refusing.
cron_git_pull_rebase "git pull inicial"

# Mirror the env the press-lab wrapper uses — it is the one cron job on
# claude-code that has kept working. This one set neither the model nor the
# concurrency cap and produced 25 straight days of empty digests.
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"
export LLM_BACKEND="${LLM_BACKEND:-claude-code}"
export CLAUDE_CODE_MODEL="${CLAUDE_CODE_MODEL:-claude-sonnet-5}"
export LLM_CONCURRENCY="${LLM_CONCURRENCY:-1}"   # Max plan is burst-rate limited
export AGY_MODEL="${AGY_MODEL:-gemini-2.5-pro}"  # only read when LLM_BACKEND=agy

# AUTO-PUBLISH ENABLED: grounded, high-confidence en-progreso status changes +
# documentada new promises publish to promises.json; parcial/cumplida/
# no-ejecutada stay one-click in the review queue; inviable is human-only.
echo "[$(date '+%F %T')] invoking auto-curate-promises (--max 10 --phase both · $LLM_BACKEND · \$0-guarded)"
# HARD $0 guard: strip metered keys + disable the gemini CLI so the client
# can only reach claude-code (no ollama auto-chain). A non-zero exit (the $0
# backend down) is non-fatal — we defer to the next run rather than commit
# a metered auto-publish. A skipped promotion beats a metered one.
if ! env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY GEMINI_BIN=/nonexistent-disabled \
     npm run auto-curate-promises -- --max 10 --phase both; then
  # LOUD: this used to be a one-line warning inside a 196 KB log while the
  # digest reported a clean 0/0/0. A failed run must look different from a
  # quiet one.
  echo "[$(date '+%F %T')] ERROR: auto-curate-promises FAILED (no \$0 backend reachable, or the model did not answer) — candidates were retrieved and dropped"
fi

echo "[$(date '+%F %T')] auto-curate-promises-daily done · queue refreshed"

# ─────────────────────────────────────────────────────────────────────
# Commit + push any auto-published rows. They carry
# autoPublished.reviewState='pending-review' + the public badge until a
# curator reviews (or retracts) them. No-op when nothing was auto-published.
# ─────────────────────────────────────────────────────────────────────
#
# Staged, guarded and committed through ONE pathspec. The old guard compared
# the working tree against the INDEX, so a promises.json someone else had
# already staged read as "nothing to commit" and this run's auto-published rows
# were silently dropped; the old `git commit` then took the whole index anyway.
if ! cron_git_stage_and_check public/data/promises.json; then
  echo "[$(date '+%F %T')] no auto-published promises — nothing to commit"
  exit 0
fi
cron_git_commit_pathspec "data: daily promise auto-curate (auto-published · pending review)"
git push origin main
echo "[$(date '+%F %T')] pushed auto-published promises"
