#!/usr/bin/env bash
# Shared git safety for the unattended cron pipelines (sourced, never executed).
#
#   . "$REPO_DIR/scripts/lib/cron-git.sh"
#
# Two defects lived in four near-identical copies of the same eight lines. One
# copy each is how they survived; this file is the single copy.
#
# ── 1. `git commit` publishes whatever else is in the index ────────────────
# Every pipeline carefully limited its `git add` to a pathspec and then threw
# that care away: `git commit -m …` with no pathspec commits the ENTIRE index,
# not the paths you staged. On 2026-08-09 the press-lab cron twice swept a
# subagent's in-flight staged work into its own data commit (f182c61, 15 files
# including tests/encaje-credencial.test.jsx).
#
# `git commit -- <pathspec>…` commits only the WORKING-TREE content of the
# matching paths and leaves the rest of the index alone. Verified, not assumed:
#   · a file staged by someone else stays staged and out of the commit
#   · the preceding `git add` is still load-bearing — an UNTRACKED file is only
#     committed if it was added first (git will not commit a path it does not
#     already know), so `cron_git_stage_and_check` stages before it commits
#   · exclusion pathspecs (':(exclude)path') work here too, which is how
#     hallazgos keeps the other crons' files out without a `git reset`
#   · a pathspec naming nothing git knows about is a HARD error (exit 1), so
#     the list is filtered first
#
# ── 2. the "is there anything to commit?" guards had the same hole ─────────
# `git diff --cached --quiet` answers "yes, there is work to do" when a
# stranger has staged something, so the cron would go on to make a commit that
# contains none of its own work. The guard must be the same pathspec as the
# commit, and it must compare the working tree against HEAD — the same thing
# `git commit -- <pathspec>` will do — not against the index.
#
# ── 3. no branch guard ─────────────────────────────────────────────────────
# All four ran `git pull --rebase --autostash origin main` and later
# `git push origin main` from whatever branch was checked out. On a feature
# branch that rebases YOUR branch onto origin/main, commits to it, and then
# pushes the untouched local main — so the run's work is never published and
# your branch has been rewritten under you. `cron_require_main` refuses before
# any pull, any LLM call and any commit, and exits 0: a skipped cron run is not
# a failure.
#
# bash 3.2 ONLY (macOS cron runs /bin/bash 3.2.57): no associative arrays, no
# ${var^^}, no mapfile, and "${arr[@]}" on an EMPTY array is an unbound-variable
# error under `set -u` — every expansion below is length-guarded.

# The pathspec `cron_git_stage_and_check` filtered and `cron_git_commit_pathspec`
# will commit. Initialised here so `set -u` cannot trip over it.
CRON_GIT_PATHSPEC=()

# Log prefix: the calling script's own name (sourcing does not change $0), so
# renaming a pipeline renames its log lines and no second place has to be kept
# in step. A caller may set CRON_GIT_LOG_PREFIX before sourcing to override.
: "${CRON_GIT_LOG_PREFIX:=$(basename "${0%.sh}")}"

cron_git_log() {
  echo "[${CRON_GIT_LOG_PREFIX:-cron-git}] [$(date '+%F %T')] $*"
}

# ---------------------------------------------------------------------------
# cron_require_main <label> [no-remote]
#
# Exits the calling script (status 0) unless HEAD is on the publishable branch.
# Call it BEFORE the first pull, the first LLM call and the first commit —
# refusing after the expensive part has run still burns the quota.
#
#   <label>       what to call this run in the log.
#   no-remote     pass literally when this run provably never touches the
#                 remote (press-lab's PRESS_LAB_NO_REMOTE rehearsal). The guard
#                 exists to stop a run publishing to the wrong place; a run
#                 that publishes nowhere is safe on any branch.
#
# Env:
#   CRON_GIT_ALLOW_BRANCH=1   documented override for a deliberate off-main run.
#                             Everything still targets origin/main.
#   CRON_GIT_MAIN_BRANCH=…    the publishable branch (default: main).
# ---------------------------------------------------------------------------
cron_require_main() {
  local label="$1"
  local mode="${2:-remote}"
  local expected="${CRON_GIT_MAIN_BRANCH:-main}"
  local branch
  branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null)" || branch=""
  [ -n "$branch" ] || branch="(HEAD desacoplado)"

  if [ "$branch" = "$expected" ]; then
    return 0
  fi

  if [ "$mode" = "no-remote" ]; then
    cron_git_log "$label: HEAD está en '$branch', no en '$expected' — se continúa: este run no toca el remoto (no hace pull ni push)"
    return 0
  fi

  if [ -n "${CRON_GIT_ALLOW_BRANCH:-}" ]; then
    cron_git_log "$label: HEAD está en '$branch', no en '$expected' — CRON_GIT_ALLOW_BRANCH está activo, se continúa a propósito (pull/push siguen apuntando a origin/$expected)"
    return 0
  fi

  cron_git_log "$label: OMITIDO — HEAD está en '$branch', no en '$expected'."
  cron_git_log "  Ejecutarlo aquí rebasaría '$branch' sobre origin/$expected, dejaría el commit en '$branch' y haría push del '$expected' local sin tocar: el trabajo de este run no llegaría nunca al sitio publicado."
  cron_git_log "  No se ha hecho nada: ni pull, ni llamadas al modelo, ni commit."
  cron_git_log "  Vuelve a '$expected', o relanza con CRON_GIT_ALLOW_BRANCH=1 si de verdad quieres correrlo desde esta rama."
  exit 0
}

# ---------------------------------------------------------------------------
# _cron_git_filter_pathspec <pathspec>…
#
# Drops pathspec elements naming nothing git knows about and nothing on disk —
# `git commit -- <unknown>` is a hard error that would abort the publish step
# and lose the whole run's data. Magic pathspecs (':(exclude)…') pass through:
# they are not required to match. Result in CRON_GIT_PATHSPEC.
# ---------------------------------------------------------------------------
_cron_git_filter_pathspec() {
  CRON_GIT_PATHSPEC=()
  local p positives=0
  for p in "$@"; do
    [ -n "$p" ] || continue
    case "$p" in
      :*)
        CRON_GIT_PATHSPEC+=("$p")
        continue
        ;;
    esac
    if [ -e "$p" ] || [ -n "$(git ls-files -- "$p" 2>/dev/null)" ]; then
      CRON_GIT_PATHSPEC+=("$p")
      positives=$((positives + 1))
    else
      cron_git_log "aviso: '$p' no existe ni está en el índice — queda fuera del pathspec de este commit"
    fi
  done
  # An exclude-only pathspec matches nothing and makes git fatal out.
  if [ "$positives" -eq 0 ]; then
    CRON_GIT_PATHSPEC=()
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# cron_git_stage_and_check <pathspec>…
#
#   rc 0 — those paths have something to commit; the filtered pathspec is in
#          CRON_GIT_PATHSPEC, ready for cron_git_commit_pathspec.
#   rc 1 — nothing to commit within them. Deliberately says nothing about the
#          rest of the index: a stranger's staged file is not this cron's work
#          and must not make it think it has any.
#
# Stages first, because `git commit -- <pathspec>` will not pick up a file git
# does not already know about (a brand-new snapshot).
# ---------------------------------------------------------------------------
cron_git_stage_and_check() {
  if ! _cron_git_filter_pathspec "$@"; then
    cron_git_log "pathspec vacío tras filtrar — no hay nada que publicar"
    return 1
  fi
  # Tolerated, as before: a path can vanish between the filter and the add.
  git add -- "${CRON_GIT_PATHSPEC[@]}" 2>/dev/null || true
  # HEAD, not the index: this is exactly what `git commit -- <pathspec>` commits.
  if git diff --quiet HEAD -- "${CRON_GIT_PATHSPEC[@]}"; then
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# cron_git_commit_pathspec <message>
#
# Commits ONLY the pathspec cron_git_stage_and_check filtered, whatever else is
# sitting in the index.
#   rc 0 — committed.   rc 2 — the commit itself failed (logged loudly).
# ---------------------------------------------------------------------------
cron_git_commit_pathspec() {
  local message="$1"
  if [ "${#CRON_GIT_PATHSPEC[@]}" -eq 0 ]; then
    cron_git_log "ERROR: cron_git_commit_pathspec sin pathspec — llama antes a cron_git_stage_and_check"
    return 2
  fi
  local rc=0
  git commit -m "$message" -- "${CRON_GIT_PATHSPEC[@]}" || rc=$?
  if [ "$rc" -ne 0 ]; then
    cron_git_log "ERROR: el commit falló (rc=$rc) sobre: ${CRON_GIT_PATHSPEC[*]}"
    return 2
  fi
  return 0
}

# ---------------------------------------------------------------------------
# cron_git_commit_paths <message> <pathspec>…
#
# stage_and_check + commit_pathspec, for the callers that need nothing in
# between.  rc 0 committed · rc 1 nothing to commit · rc 2 the commit failed.
# ---------------------------------------------------------------------------
cron_git_commit_paths() {
  local message="$1"
  shift
  cron_git_stage_and_check "$@" || return 1
  cron_git_commit_pathspec "$message"
}
