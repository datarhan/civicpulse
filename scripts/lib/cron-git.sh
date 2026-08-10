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
# ── 4. …and that guard was a point-in-time check (TOCTOU) ─────────────────
# The guard was correctly wired into all five crons and it still failed. On
# 2026-08-10 press-lab started at 10:45 (so HEAD was `main`: the guard passed)
# and finished at 10:52; an agent branched off partway through that window, and
# commit 30277ab landed on `fix/citas-no-contrastadas`. The guard asserts once,
# at the top; the pull and the commit happen minutes — for hallazgos with
# transcription, tens of minutes — later, against whatever HEAD has become.
#
# So the guard no longer just asserts, it RECORDS what it approved, and every
# later git write re-checks it (`cron_git_assert_head`). Two things are
# recorded, and both must still hold:
#
#   · the fully-qualified ref HEAD pointed at ('refs/heads/main'). Catches the
#     incident, and catches a detach.
#   · how many times HEAD has been re-pointed at another ref, counted from its
#     reflog. The ref name ALONE is not identity: a branch can be checked out,
#     worked on and switched back, and the name matches again on the way out.
#     That round trip is not harmless — the two checkouts rewrite every
#     working-tree file that differs between the branches, so this run's
#     unstaged snapshots can be reverted under it, and the run would then
#     honestly report "nothing changed" over data it really did produce.
#
# NOT recorded: the commit HEAD resolved to. It is supposed to move — this
# script's own `git pull --rebase` moves it, and so does the per-minute quejas
# cron committing on main. Measured against git 2.53: a fast-forward pull adds
# no reflog entry matching 'checkout: moving from', a real (non-ff) rebase pull
# writes '(start): checkout …' / '(pick)' / '(finish)' which do not match
# either, and `reset --hard` does not match. `git checkout`, `git switch` and a
# detach each add exactly one. The counter therefore tracks branch switches and
# nothing else, which is exactly the hazard.
#
# On refusal NOTHING is discarded: no commit, no reset, no stash. The run's
# files stay in the working tree, the abort prints their `git status` lines, and
# it exits NON-ZERO — unlike `cron_require_main`, which exits 0 because a run
# that never started is not a failure. A run that did the work and cannot
# publish it is.
#
# bash 3.2 ONLY (macOS cron runs /bin/bash 3.2.57): no associative arrays, no
# ${var^^}, no mapfile, and "${arr[@]}" on an EMPTY array is an unbound-variable
# error under `set -u` — every expansion below is length-guarded.

# The pathspec `cron_git_stage_and_check` filtered and `cron_git_commit_pathspec`
# will commit. Initialised here so `set -u` cannot trip over it.
CRON_GIT_PATHSPEC=()

# The HEAD identity cron_require_main approved, re-checked at every later git
# write. Initialised so `set -u` cannot trip over them either.
CRON_GIT_APPROVED_REF=""       # 'refs/heads/main'; empty ⇒ approved detached
CRON_GIT_APPROVED_LABEL=""     # what to call it in the log
CRON_GIT_APPROVED_SWITCHES=""  # branch-switch count then ('sin-reflog' if none)
CRON_GIT_GUARD_ARMED=""        # 1 once an identity has been captured

# Log prefix: the calling script's own name (sourcing does not change $0), so
# renaming a pipeline renames its log lines and no second place has to be kept
# in step. A caller may set CRON_GIT_LOG_PREFIX before sourcing to override.
: "${CRON_GIT_LOG_PREFIX:=$(basename "${0%.sh}")}"

cron_git_log() {
  echo "[${CRON_GIT_LOG_PREFIX:-cron-git}] [$(date '+%F %T')] $*"
}

# ---------------------------------------------------------------------------
# HEAD identity — the two halves recorded at approval time. See note 4 above
# for why it is these two and not the commit SHA.
# ---------------------------------------------------------------------------

# The fully-qualified ref HEAD points at, or empty when HEAD is detached.
_cron_git_head_ref() {
  git symbolic-ref --quiet HEAD 2>/dev/null || true
}

# How that ref reads in a log line.
_cron_git_head_label() {
  local ref="$1" sha
  if [ -n "$ref" ]; then
    echo "${ref#refs/heads/}"
    return 0
  fi
  sha="$(git rev-parse --short HEAD 2>/dev/null)" || sha="¿?"
  echo "(HEAD desacoplado en $sha)"
}

# Times HEAD has been re-pointed at another ref, ever, from its own reflog.
# `checkout: moving from …` is written by checkout/switch/detach and by nothing
# else that matters here (see note 4). 'sin-reflog' when the repo keeps none —
# named, not silently folded into 0, so the caller can say the weaker check is
# all it has.
_cron_git_head_switches() {
  local f n
  f="$(git rev-parse --git-path logs/HEAD 2>/dev/null)" || f=""
  if [ -z "$f" ] || [ ! -r "$f" ]; then
    echo "sin-reflog"
    return 0
  fi
  n="$(grep -cF "$(printf '\tcheckout: moving from ')" "$f" 2>/dev/null)" || n=0
  echo "${n:-0}"
}

# Record the HEAD this run is allowed to write to. Whatever HEAD IS right now —
# not literally 'main': under CRON_GIT_ALLOW_BRANCH or the no-remote rehearsal
# the approved branch is the feature branch, and a mid-run switch away from THAT
# is refused just the same.
_cron_git_arm_head_identity() {
  CRON_GIT_APPROVED_REF="$(_cron_git_head_ref)"
  CRON_GIT_APPROVED_LABEL="$(_cron_git_head_label "$CRON_GIT_APPROVED_REF")"
  CRON_GIT_APPROVED_SWITCHES="$(_cron_git_head_switches)"
  CRON_GIT_GUARD_ARMED=1
  if [ "$CRON_GIT_APPROVED_SWITCHES" = "sin-reflog" ]; then
    cron_git_log "aviso: este repo no guarda reflog de HEAD — se vigila el NOMBRE de la rama en cada escritura, pero un 'salir y volver' a la misma rama NO se puede detectar aquí"
  fi
}

# ---------------------------------------------------------------------------
# cron_git_assert_head <contexto> [pathspec…]
#
# Re-checks the identity cron_require_main approved, immediately before a git
# write. Returns 0 when it still holds; otherwise logs the refusal and EXITS the
# calling script with status 1 — nothing is committed, and nothing is discarded.
#
#   <contexto>   the write about to happen, for the log ("git commit", "git
#                pull --rebase", …).
#   pathspec…    what this run produced, so the refusal can point the operator
#                at the files sitting unpublished in the working tree.
#
# `exit` here ends the SCRIPT, which is the point — so never call this from a
# subshell or a $(…), where it would only end the subshell.
# ---------------------------------------------------------------------------
cron_git_assert_head() {
  local ctx="${1:-una escritura en git}"
  shift || true

  if [ -z "$CRON_GIT_GUARD_ARMED" ]; then
    # No cron_require_main above us. Anchor here rather than refuse — but say
    # plainly that the window before this point went unwatched, instead of
    # reporting a check that covered nothing.
    cron_git_log "aviso: cron_git_assert_head ($ctx) sin cron_require_main previo — lo anterior a este punto NO estaba vigilado; se ancla la identidad de HEAD ahora"
    _cron_git_arm_head_identity
    return 0
  fi

  local ref label switches
  ref="$(_cron_git_head_ref)"
  label="$(_cron_git_head_label "$ref")"
  switches="$(_cron_git_head_switches)"

  if [ "$ref" = "$CRON_GIT_APPROVED_REF" ] && [ "$switches" = "$CRON_GIT_APPROVED_SWITCHES" ]; then
    return 0
  fi

  cron_git_log "ABORTADO antes de '$ctx': HEAD ha cambiado DURANTE el run."
  cron_git_log "  rama aprobada al empezar: '$CRON_GIT_APPROVED_LABEL'"
  cron_git_log "  rama ahora mismo:         '$label'"
  if [ "$ref" != "$CRON_GIT_APPROVED_REF" ]; then
    cron_git_log "  Alguien cambió de rama mientras este run trabajaba. Seguir aquí dejaría el commit en '$label' — que es justo lo que pasó el 2026-08-10 (30277ab quedó en fix/citas-no-contrastadas) — y el push de '${CRON_GIT_MAIN_BRANCH:-main}' publicaría otra cosa."
  else
    cron_git_log "  Mismo NOMBRE de rama, pero HEAD salió a otra y volvió (cambios de rama en el reflog: $CRON_GIT_APPROVED_SWITCHES → $switches). Esos dos checkouts reescriben los ficheros que difieran entre ramas, así que lo que este run generó puede haber sido revertido debajo."
  fi
  if [ "$#" -gt 0 ]; then
    cron_git_log "  NO se ha hecho commit y NO se ha descartado NADA: lo que este run generó sigue en el working tree, tal cual:"
    local line
    git status --porcelain -- "$@" 2>/dev/null | while IFS= read -r line; do
      [ -n "$line" ] && cron_git_log "    $line"
    done || true
  else
    cron_git_log "  NO se ha tocado git en este punto y NO se ha descartado NADA: lo que este run lleve hecho sigue donde estaba (working tree, o commit local sin push)."
  fi
  cron_git_log "  Para publicarlo: vuelve a '$CRON_GIT_APPROVED_LABEL' y haz commit de esas rutas a mano, o relanza el cron con la rama quieta. Salida 1 para que esto NO pase por un run silencioso."
  exit 1
}

# ---------------------------------------------------------------------------
# cron_git_pull_rebase [contexto]
#
# `git pull --rebase --autostash origin <main>` with the same identity check in
# front of it. The pull races too, and worse than the commit does: on the wrong
# branch it REWRITES that branch onto origin/main. Its window is real — every
# pipeline does its lock, its .env and (two of them) a multi-second `claude -p`
# probe between the guard and the pull.
#
# Returns the pull's own exit code, so each caller keeps its own handling. The
# identity check is not part of that: it exits the script outright.
# ---------------------------------------------------------------------------
cron_git_pull_rebase() {
  local ctx="${1:-git pull --rebase}"
  cron_git_assert_head "$ctx"
  local rc=0
  git pull --rebase --autostash origin "${CRON_GIT_MAIN_BRANCH:-main}" || rc=$?
  # Our own pull is a legitimate HEAD movement, so re-baseline the counter after
  # it. Only the counter — the approved REF stays pinned, so a pull that leaves
  # a conflicted rebase (HEAD detached) is still caught at commit time.
  CRON_GIT_APPROVED_SWITCHES="$(_cron_git_head_switches)"
  return "$rc"
}

# ---------------------------------------------------------------------------
# cron_require_main <label> [no-remote]
#
# Exits the calling script (status 0) unless HEAD is on the publishable branch,
# and records the HEAD it approved so every later git write can re-check it.
# Call it BEFORE the first pull, the first LLM call and the first commit —
# refusing after the expensive part has run still burns the quota.
#
#   <label>       what to call this run in the log.
#   no-remote     pass literally when this run provably never touches the
#                 remote (press-lab's PRESS_LAB_NO_REMOTE rehearsal). The guard
#                 exists to stop a run publishing to the wrong place; a run
#                 that publishes nowhere is safe on any branch. It still gets
#                 the identity check: committing onto a branch that appeared
#                 under it is wrong whether or not anything is pushed.
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
  local ref branch
  ref="$(_cron_git_head_ref)"
  branch="$(_cron_git_head_label "$ref")"

  if [ "$branch" = "$expected" ]; then
    _cron_git_arm_head_identity
    return 0
  fi

  if [ "$mode" = "no-remote" ]; then
    cron_git_log "$label: HEAD está en '$branch', no en '$expected' — se continúa: este run no toca el remoto (no hace pull ni push)"
    _cron_git_arm_head_identity
    return 0
  fi

  if [ -n "${CRON_GIT_ALLOW_BRANCH:-}" ]; then
    cron_git_log "$label: HEAD está en '$branch', no en '$expected' — CRON_GIT_ALLOW_BRANCH está activo, se continúa a propósito (pull/push siguen apuntando a origin/$expected)"
    _cron_git_arm_head_identity
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
  # Before the `git add`, not just before the commit: staging into a branch
  # that appeared under us is already a write to someone else's index, and it
  # is the last point where this run's output is still exactly where the run
  # left it.
  cron_git_assert_head "git add" "$@"
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
  # Again here, not only in cron_git_stage_and_check: press-lab does its whole
  # commit-message build (a `node -e` over the published corpus) between the
  # two, and that is window enough.
  cron_git_assert_head "git commit" "${CRON_GIT_PATHSPEC[@]}"
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
