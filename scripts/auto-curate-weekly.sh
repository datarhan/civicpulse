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

# Branch guard + pathspec-limited commit, shared by all five cron pipelines.
# shellcheck source=scripts/lib/cron-git.sh
. "$REPO_DIR/scripts/lib/cron-git.sh"

# Before the pull and before the LLM call: off main this run would rebase the
# checked-out branch onto origin/main, commit there, and then push an untouched
# local main — a batch of findings about named councillors written, committed
# somewhere nobody publishes from, and never seen on the site.
cron_require_main "auto-curate-weekly"

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
#
# Through cron_git_pull_rebase: sourcing .env sits between the branch guard and
# this line, and on a branch that appeared in that window the pull would rebase
# THAT branch onto origin/main instead of just refusing.
cron_git_pull_rebase "git pull inicial"

# SUPERSEDED: this promote-only wrapper is replaced by the full-chain
# scripts/hallazgos-pipeline.sh (daily cron: transcribe→extract→verify→
# auto-curate→push). It stays only as a manual promote-only fallback.
#
# Default backend: claude-code · sonnet ($0, Max plan) — operator decision
# 2026-08-02, aligning with hallazgos-pipeline and press-lab-pipeline.
#
# The previous comment here justified agy on two grounds that are both stale:
#   · "claude-code STALLS headlessly under cron" — it did, but the cause was
#     global MCP init, fixed in client.ts with --strict-mcp-config (5f687f5).
#     press-lab-pipeline has run claude-code under cron since.
#   · "sonnet violates the opus-or-fable model policy" — that policy governs
#     SUBAGENTS, not the LLM backend for data work.
# Meanwhile agy exits **0** with "Individual quota reached" on stdout when its
# daily Google quota is spent, so callers cannot detect exhaustion by return
# code. Observed spent 2026-08-02, 62-hour reset.
export LLM_BACKEND="${LLM_BACKEND:-claude-code}"
export CLAUDE_CODE_MODEL="${CLAUDE_CODE_MODEL:-claude-sonnet-5}"
export AGY_MODEL="${AGY_MODEL:-gemini-3.8-flash-medium}"  # only read if LLM_BACKEND=agy
# The gemini CLI is no longer a fallback target and its env (GEMINI_MODEL,
# GOOGLE_GENAI_USE_GCA) is gone from here. agy replaced it, and the install
# that remains cannot authenticate without a browser — it hangs for the full
# watchdog instead of failing. gemini-2.5-pro, the value this used to export,
# is also no longer a model agy recognises; it went on working only because
# AGY_MODEL above happens to be set explicitly.

# Run the curator with a 5-finding cap (matches the on-demand default).
echo "[$(date '+%F %T')] invoking npm run auto-curate -- --max 5"
npm run auto-curate -- --max 5

# Was anything actually written? Staged, gated and committed through ONE
# pathspec — the findings file. The queue file is gitignored and verified.json
# may be moving under a concurrent verify pass; neither is ours to commit.
#
# The old gate asked `git diff --quiet -- <file>`: working tree against the
# INDEX, not against HEAD. A pleno-findings.json something else had already
# staged read as "no new findings" and this run's batch was silently dropped.
# Worse, the `git commit` under it carried no pathspec at all, so it took the
# WHOLE index — that is how f182c61 published a subagent's in-flight work.
if ! cron_git_stage_and_check public/data/pleno-findings.json; then
  echo "[$(date '+%F %T')] no new findings — nothing to commit"
  exit 0
fi

# HEAD, not --cached: `git commit -- <pathspec>` publishes the WORKING-TREE
# content of those paths, so that is what the count has to describe.
NEW_COUNT=$(git diff HEAD -- public/data/pleno-findings.json \
  | grep -cE '^\+ +"id": "f-' || true)

cron_git_commit_pathspec "$(cat <<EOF
data: weekly auto-curate batch · ${NEW_COUNT} new finding(s)

Automated by scripts/auto-curate-weekly.sh (launchd Mondays 09:00).
All findings tagged \`curatorName: "auto-curation-v1"\`.
EOF
)"

git push origin main

echo "[$(date '+%F %T')] auto-curate-weekly done · pushed ${NEW_COUNT} new finding(s)"
