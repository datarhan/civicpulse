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
#   Override e.g. CLAUDE_CODE_MODEL=haiku for lighter quota. (Local ollama is
#   deliberately not wired here — user directive 2026-07-07: no local models
#   in the cron pipelines.)
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

# ---- branch guard + pathspec-limited commit (shared) ------------------
# shellcheck source=scripts/lib/cron-git.sh
. "$REPO_DIR/scripts/lib/cron-git.sh"
# Before the lock and before any LLM step. PRESS_LAB_NO_REMOTE composes rather
# than fights: the guard is there to stop a run publishing from a branch whose
# commits would never reach origin/main, and a rehearsal that skips BOTH the
# pull and the push publishes nowhere at all — so it stays legal on any branch,
# which is the whole point of the switch.
if [ -n "${PRESS_LAB_NO_REMOTE:-}" ]; then
  cron_require_main "press-lab-pipeline" no-remote
else
  cron_require_main "press-lab-pipeline"
fi

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
export LLM_BACKEND="${LLM_BACKEND:-claude-code}"
export CLAUDE_CODE_MODEL="${CLAUDE_CODE_MODEL:-claude-sonnet-5}"
export LLM_CONCURRENCY="${LLM_CONCURRENCY:-1}"

# Fail fast + loud if the Max login lapsed — else every extract call returns
# "Not logged in" and the run silently produces nothing. Probe the SAME binary
# src/llm/client.ts will spawn (CLAUDE_CODE_BIN, default `claude`) — probing a
# bare `claude` while the client used an override meant the probe could pass
# for a backend that was never going to be used, and vice versa.
if [ "$LLM_BACKEND" = claude-code ] &&
   ! "${CLAUDE_CODE_BIN:-claude}" -p "ok" --strict-mcp-config --model "$CLAUDE_CODE_MODEL" >/dev/null 2>&1; then
  log "warn: 'claude -p' probe failed — Max login may have lapsed (run: claude, then /login). LLM steps will no-op this run."
fi

log "starting · llm=$LLM_BACKEND/${CLAUDE_CODE_MODEL} · extract≤$MAX_EXTRACT · summarize≤$MAX_SUMMARIZE · step-cap=${LLM_TIMEOUT}s"

# ---- always start from origin (press.json comes from the GH nightly) --
# PRESS_LAB_NO_REMOTE=1 is the local-rehearsal switch: it skips BOTH git
# touchpoints (this pull and the push at the end) so the chain, the gating and
# the commit message can be exercised on a branch without moving anything
# remote. Never set in cron.
if [ -n "${PRESS_LAB_NO_REMOTE:-}" ]; then
  log "PRESS_LAB_NO_REMOTE — ensayo local: se omite el git pull inicial"
else
  # cron_git_pull_rebase, not a bare pull: the lock, the .env and the `claude -p`
  # probe above are seconds of window since the branch guard, and on the wrong
  # branch this pull would rebase THAT branch onto origin/main.
  cron_git_pull_rebase "git pull inicial" || { log "git pull failed — aborting before LLM work"; exit 1; }
fi

# ---- resilient chain, WITH honest dependency gating -------------------
# One flaky INDEPENDENT stage must not abort the rest — that resilience is
# deliberate and stays. What it must never do is run a stage across a real data
# dependency after that dependency's producer failed. On 2026-08-09
# `extract:press-claims` exited 1 against a dead backend and the chain ran
# `verify:press-claims` anyway; verify derived press-claims-verified.json from
# the emptied suggestions file, published `stats.total: 0` over a live claim,
# committed it (c6a6e23) and signed off "done · 0 verified claim(s) pushed" —
# a deletion reported as a measurement.
#
# So a step has THREE outcomes, not two:
#   ✅ ran and succeeded
#   ❌ ran and failed
#   ⏭ never attempted, because a producer did not succeed
# Mirrors check:relations' ok/empty/broken/skipped vocabulary, for the same
# reason: a stage that measured nothing must not be able to read as success,
# and "never attempted" must never fold into "unchanged".
#
# DEPENDENCY MAP — verified by reading each script's actual reads, not assumed:
#   scrape:factcheck        → factcheck.json          ← (nothing in this chain)
#   extract:press-claims    → press-claims-suggestions ← press.json
#   verify:press-claims     → press-claims-verified    ← suggestions, factcheck, open data
#   compute:press-analytics → press-trust, -triangulation, -coverage-gaps
#                                                      ← press.json, verified
#   auto-curate-press       → press-findings           ← verified, promises
#   summarize:press         → press-summaries          ← press.json, suggestions*
#   audit-press-links       → press-link-rot           ← press.json, promises, suggestions*
#
# GATED is the hard chain, where the consumer's output IS a derivation of the
# producer's: extract → verify → {compute:press-analytics, auto-curate-press}.
#
# (*) summarize:press and audit-press-links DO read press-claims-suggestions.json
# — as an article allow-list and as a URL seed respectively — but neither output
# is a derivation of it: both are whole-corpus over press.json/promises.json and
# degrade honestly onto the previous, still-valid suggestions file, whose content
# the extract-side guard now protects. They stay UNGATED on purpose. Do not
# "discover" that read later and gate them without first re-checking that their
# output is still whole-corpus.
#
# Re-checked when summarize:press got the same write guard as extract: still an
# allow-list, still whole-corpus over press.json, so it stays ungated. What it
# no longer needs is someone else's gate — it now refuses to shrink its own
# snapshot on an incomplete run and exits non-zero when the backend was
# unreachable, so a failed summarise withholds press-summaries.json through the
# CHAIN_OK staging below rather than through a dependency it does not have.
RESULTS=""
CHAIN_OK=""       # labels that ran and exited 0
CHAIN_FAILED=""   # labels that ran and exited non-zero
CHAIN_SKIPPED=""  # labels never attempted (a producer did not succeed)

# macOS cron invokes this with /bin/bash — 3.2, no associative arrays. State is
# space-delimited label lists; step labels contain no spaces.
_ran_ok() { case " $CHAIN_OK " in *" $1 "*) return 0 ;; esac; return 1 ; }
_was_skipped() { case " $CHAIN_SKIPPED " in *" $1 "*) return 0 ;; esac; return 1 ; }
# Why a dep is unusable, in the words the summary prints.
_dep_state() { if _was_skipped "$1"; then echo "omitido"; else echo "falló"; fi ; }
# First unsatisfied dependency in "$1" (space-separated), or empty.
_blocking_dep() {
  local d
  for d in ${1:-}; do
    if ! _ran_ok "$d"; then echo "$d"; return 0; fi
  done
  echo ""
}
_record_ok() {
  CHAIN_OK="$CHAIN_OK $1"
  RESULTS="${RESULTS}  ✅ $1\n"; log "✓ $1"
}
_record_failed() {
  CHAIN_FAILED="$CHAIN_FAILED $1"
  RESULTS="${RESULTS}  ❌ $1 (exit $2)\n"; log "✗ $1 FALLÓ (exit $2)${3:-}"
}
_record_skipped() {
  CHAIN_SKIPPED="$CHAIN_SKIPPED $1"
  local why; why="$2 $(_dep_state "$2")"
  RESULTS="${RESULTS}  ⏭ $1 — omitido: ${why}\n"
  log "⏭ $1 — omitido: ${why} (no se ejecuta: su salida se derivaría de datos que este run no pudo refrescar)"
}

# step <label> <deps> <cmd...>   — deps is a space-separated list, "" for none.
step() {
  local label="$1" deps="$2"; shift 2
  local blocker; blocker="$(_blocking_dep "$deps")"
  if [ -n "$blocker" ]; then _record_skipped "$label" "$blocker"; return 0; fi
  local rc=0
  "$@" || rc=$?
  if [ "$rc" -eq 0 ]; then _record_ok "$label"; else _record_failed "$label" "$rc"; fi
}
# Same $0 policy as auto-curate-press, applied to EVERY LLM step.
#
# Until now only auto-curate-press was guarded, so when the claude-code probe
# failed the client's fallback chain walked claude-code → openai → gemini and
# reached metered OpenAI unsupervised. On 2026-08-01 that leak was invisible
# purely because the account was out of credits ("You have no credits
# remaining" in the log); the moment credits were topped up the next run would
# have billed press extraction against them silently.
#
# gemini stays reachable (free tier is $0 and is an approved backend); only the
# metered keys are stripped. A deferred step beats a metered one. Runs in a
# SUBSHELL because `step`/`bounded` are shell functions that `env` cannot exec,
# and so the unset stays scoped to this step.
free_step() {
  local label="$1" deps="$2"; shift 2
  local blocker; blocker="$(_blocking_dep "$deps")"
  if [ -n "$blocker" ]; then _record_skipped "$label" "$blocker"; return 0; fi
  local rc=0
  ( unset OPENAI_API_KEY ANTHROPIC_API_KEY; "$@" ) || rc=$?
  if [ "$rc" -eq 0 ]; then
    _record_ok "$label"
  else
    _record_failed "$label" "$rc" " — backends \$0 no disponibles, NO se cae a metered"
  fi
}
# free_step + the gemini CLI disabled: auto-curate-press promotes editorial
# findings, so project policy is that it may only ever reach a $0 backend.
curate_step() {
  local label="$1" deps="$2"; shift 2
  local blocker; blocker="$(_blocking_dep "$deps")"
  if [ -n "$blocker" ]; then _record_skipped "$label" "$blocker"; return 0; fi
  local rc=0
  # A SUBSHELL, not `env`: `bounded` is a shell function, invisible to `env`
  # (which can only exec real binaries — `env … bounded …` failed
  # "env: bounded: No such file or directory" and the step was silently
  # deferred every run). A `( … )` subshell inherits the function AND scopes
  # the unset/export so they don't leak to the parent.
  ( unset OPENAI_API_KEY ANTHROPIC_API_KEY; export GEMINI_BIN=/nonexistent-disabled; "$@" ) || rc=$?
  if [ "$rc" -eq 0 ]; then
    _record_ok "$label"
  else
    _record_failed "$label" "$rc" " — deferido: $LLM_BACKEND no disponible (una promoción omitida gana a una metered)"
  fi
}
# Which published snapshot each step OWNS. Only a step that actually succeeded
# may stage its outputs (see the commit block) — the second, independent layer
# under the extract-side guard and the dependency gate.
outputs_of() {
  case "$1" in
    "scrape:factcheck")        echo "public/data/factcheck.json" ;;
    "extract:press-claims")    echo "public/data/press-claims-suggestions.json" ;;
    "verify:press-claims")     echo "public/data/press-claims-verified.json" ;;
    "summarize:press")         echo "public/data/press-summaries.json" ;;
    "compute:press-analytics")
      echo "public/data/press-trust.json public/data/press-triangulation.json public/data/press-coverage-gaps.json" ;;
    "auto-curate-press")       echo "public/data/press-findings.json" ;;
    "audit-press-links")       echo "public/data/press-link-rot.json" ;;
    *)                         echo "" ;;
  esac
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

#         label                     depends on                cmd…
# factcheck first so the verifier can cross-reference Newtral/Maldita/EFE.
step      "scrape:factcheck"        ""                        npx tsx scripts/scrape-factcheck.ts
free_step "extract:press-claims"    ""                        bounded npx tsx scripts/extract-press-claims.ts --max "$MAX_EXTRACT"
step      "verify:press-claims"     "extract:press-claims"    npx tsx scripts/verify-press-claims.ts
free_step "summarize:press"         ""                        bounded npx tsx scripts/summarize-press.ts --max "$MAX_SUMMARIZE"
step      "compute:press-analytics" "verify:press-claims"     npx tsx scripts/compute-press-analytics.ts

# auto-curate-press must NEVER go metered (project policy: $0 backends only).
log "auto-curating press findings ($LLM_BACKEND only, metered fallback off)…"
curate_step "auto-curate-press"     "verify:press-claims"     bounded npx tsx scripts/auto-curate-press.ts

# link-rot audit LAST so it sees every URL this run added.
step      "audit-press-links"       ""                        npx tsx scripts/audit-press-links.ts

log "chain results:"; printf '%b' "$RESULTS"
# Attempted / done / never attempted, reported separately — folding the third
# into the first two is how "0 verified claim(s)" got published as a finding.
log "resumen: $(echo "$CHAIN_OK" | wc -w | tr -d ' ') ok · $(echo "$CHAIN_FAILED" | wc -w | tr -d ' ') fallidos · $(echo "$CHAIN_SKIPPED" | wc -w | tr -d ' ') omitidos"
if [ -n "$CHAIN_FAILED" ];  then log "  fallidos:$CHAIN_FAILED"; fi
if [ -n "$CHAIN_SKIPPED" ]; then log "  omitidos (nunca intentados):$CHAIN_SKIPPED"; fi
RUN_INCOMPLETE=0
if [ -n "$CHAIN_FAILED" ] || [ -n "$CHAIN_SKIPPED" ]; then RUN_INCOMPLETE=1; fi

# ---- rederivar lo que esta tubería acaba de mover ---------------------
# `compute:press-analytics` ESCRIBE la salida de un nodo derivado
# (`press-trust.json`, y con él press-triangulation y press-coverage-gaps), y
# ese fichero lo escriben dos pasos: el cómputo y `refresh`, que le pone el
# `builtFrom`. Computar sin rederivar lo dejaba pelado, y este cron lo
# comiteaba así. Medido sobre el historial el 2026-09-03: TODOS los commits de
# press-lab —516a8985, 2be4ab02— publican press-trust sin `builtFrom`,
# mientras que los de cualquier otra procedencia lo llevan.
#
# Nadie lo veía porque nadie miraba: `e2e.yml` ignora `public/data/**`, así que
# un commit de datos no dispara CI, y `npm test` sólo corre en la nocturna,
# donde `scrape-all.sh` ejecuta `refresh` antes de los tests y barría esto. El
# rojo le salía a quien trabajaba en local, o a quien abría un PR de código
# sobre un main envenenado; y como la puerta de salud bloquea el despliegue si
# `npm test` falla, era un bloqueo latente que tapaba otro guión.
#
# Va aquí, después de TODO el trabajo de datos y antes de decidir qué se
# publica, para que las derivaciones describan el estado final y no uno
# intermedio — igual que en hallazgos-pipeline.sh y scrape-ci-blocked.sh.
# `refresh` es dependency-driven: reconstruye lo que sus entradas hayan movido
# y nada más, así que no hay lista que mantener aquí.
#
# No es fatal: perder los datos de una pasada buena por un fallo al resellar
# sería cambiar un defecto pequeño por uno grande. Lo caza
# tests/data-graph-frescura.test.ts, y que esta llamada exista lo fija
# tests/refresco-antes-de-comitear.test.ts.
npm run refresh \
  || log "warn: refresh falló — puede comitearse un derivado sin rederivar (lo caza tests/data-graph-frescura.test.ts)"

# ---- commit + push ONLY snapshots owned by steps that SUCCEEDED -------
# Explicit paths so we never race press.json (GH nightly), pleno-* (hallazgos
# cron), quejas.json (quejas cron), or promises.json (promises cron).
#
# The list is built from CHAIN_OK, not hard-coded: the old unconditional
# nine-path `git add` is what actually carried the 2026-08-09 deletion to
# production, because it staged verify's output after verify had derived it
# from a failed extract. Deriving the list from the outcomes means a
# misbehaving script cannot publish through this pipeline even if the
# extract-side guard and the dependency gate were both bypassed — CLAUDE.md's
# two-independent-layers pattern, this being the second.
STAGE_PATHS=""
for _s in $CHAIN_OK; do STAGE_PATHS="$STAGE_PATHS $(outputs_of "$_s")"; done
WITHHELD_PATHS=""
for _s in $CHAIN_FAILED $CHAIN_SKIPPED; do WITHHELD_PATHS="$WITHHELD_PATHS $(outputs_of "$_s")"; done
if [ -n "$WITHHELD_PATHS" ]; then
  # Left in the working tree on purpose — never discarded. Discarding data is
  # the failure mode being fixed, not the remedy for it.
  log "NO se publica (paso fallido u omitido):$WITHHELD_PATHS"
fi

if [ -z "$STAGE_PATHS" ]; then
  log "ningún paso terminó bien — no hay nada que publicar (sin commit)"; exit 1
fi
# A THIRD layer, under the extract-side guard and the dependency gate: the
# staging, the "did anything change?" gate and the commit are now the same
# pathspec, so a step whose output is not in STAGE_PATHS cannot reach a commit
# no matter what is sitting in the index. The old `git diff --cached --quiet`
# asked about the WHOLE index, so a file staged by an unrelated process read as
# "there is work to do", and the old pathspec-less `git commit` then took it:
# twice on 2026-08-09 this cron swept a subagent's in-flight staged work into
# its data commit (f182c61, 15 files including tests/encaje-credencial.test.jsx).
# shellcheck disable=SC2086  # deliberate word-split: STAGE_PATHS is a path list
if ! cron_git_stage_and_check $STAGE_PATHS; then
  log "nothing changed — done (no commit)"; exit 0
fi

# `CLAIMS` is a MEASUREMENT of the published corpus. Stating it as this run's
# result when a step failed or was skipped is precisely the lie c6a6e23 told:
# verify never produced that number, and on that run the number described a
# deletion. When the run is incomplete the subject says so and cites no count.
# String(): console.log of a bare number goes through util.inspect, which
# colourises it whenever colour is enabled (FORCE_COLOR is set in most
# interactive shells) — so a manual run wrote ANSI escapes straight into the
# commit subject. Cron's clean env hid it.
CLAIMS=$(node -e "try{console.log(String(require('./public/data/press-claims-verified.json').items.length))}catch{console.log('0')}")
if [ "$RUN_INCOMPLETE" -eq 1 ]; then
  SUBJECT="data(laboratorio): press-lab · ejecución INCOMPLETA, refresco parcial"
  OUTCOME_BODY="Ejecución INCOMPLETA — no se publica un recuento de claims verificadas:
este run no lo midió.
  ok:       ${CHAIN_OK:-(ninguno)}
  fallidos: ${CHAIN_FAILED:-(ninguno)}
  omitidos: ${CHAIN_SKIPPED:-(ninguno)}  ← nunca intentados: su productor no terminó bien
Solo se publican las salidas de los pasos en ok."
else
  SUBJECT="data(laboratorio): press-lab refresh · ${CLAIMS} verified claim(s)"
  OUTCOME_BODY="Cadena completa: ${CHAIN_OK}"
fi
cron_git_commit_pathspec "$(cat <<EOF
${SUBJECT}

Automated by scripts/press-lab-pipeline.sh (local cron).
scrape:factcheck → extract(${LLM_BACKEND}) → verify → summarize → analytics
→ auto-curate-press(${LLM_BACKEND}) → audit-press-links. Machine claims are
outlet-attributed and verified against municipal open data; editorial findings
stay curator-gated.

${OUTCOME_BODY}
EOF
)"

if [ -n "${PRESS_LAB_NO_REMOTE:-}" ]; then
  log "PRESS_LAB_NO_REMOTE — ensayo local: no se hace push"
else
  # push with one pull-rebase retry (races the per-minute quejas cron).
  if ! git push origin main; then
    log "push rejected — pull-rebase + retry"
    cron_git_pull_rebase "pull-rebase de reintento tras push rechazado"
    git push origin main
  fi
fi

if [ "$RUN_INCOMPLETE" -eq 1 ]; then
  log "done · ejecución INCOMPLETA · fallidos:${CHAIN_FAILED:- ninguno} · omitidos:${CHAIN_SKIPPED:- ninguno} · sin recuento de claims (este run no lo midió)"
  exit 1
fi
log "done · ${CLAIMS} verified claim(s) pushed"
