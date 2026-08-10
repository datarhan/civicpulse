#!/usr/bin/env bash
# Refresh the adapters GitHub runners CANNOT reach.
#
# ribarroja.es (WAF), regmeet.com and SEPE blackhole GitHub's IP ranges, so these
# seven fail every night on CI. They are marked best-effort there, which keeps the
# nightly green — and that is the trap: the run goes green, nobody looks, and
# the data quietly ages with NO working refresh path anywhere. All six pass
# from a residential IP.
#
# Install (from Terminal.app — cron edits are TCC-blocked from other shells):
#   ( crontab -l 2>/dev/null; echo '45 6 * * * /bin/bash '"$PWD"'/scripts/scrape-ci-blocked.sh >> '"$PWD"'/scripts/logs/scrape-ci-blocked.log 2>&1' ) | crontab -
set -uo pipefail
# `|| exit`: this is the one of the four cron scripts without `set -e`, so a
# failed cd used to leave it committing from whatever directory cron started in.
cd "$(dirname "$0")/.." || exit 1
REPO_DIR="$(pwd -P)"
mkdir -p scripts/logs

# ---- branch guard + pathspec-limited commit (shared) ------------------
# shellcheck source=scripts/lib/cron-git.sh
. "$REPO_DIR/scripts/lib/cron-git.sh"
# Before the seven adapters hit the council's WAF: off main this run would
# rebase the checked-out branch onto origin/main, commit there and then push an
# untouched local main, so the refreshed snapshots would never reach the site.
cron_require_main "scrape-ci-blocked"

ADAPTERS=(
  scrape:paro
  scrape:pleno-agendas
  scrape:consell-cv
  scrape:procesos-selectivos
  scrape:asociaciones
  scrape:obras
  scrape:sindicatura
)

failed=()
for a in "${ADAPTERS[@]}"; do
  echo "[ci-blocked] $(date '+%F %T') running $a"
  if ! npm run "$a"; then failed+=("$a"); fi
done

if [ ${#failed[@]} -gt 0 ]; then
  echo "[ci-blocked] FAILED: ${failed[*]}"
fi

# Can a reader still FOLLOW the citations under published claims about named
# councillors? This is the half of check:citations that needs the network, and
# it belongs here for the same reason the adapters above do: the WAF and the
# blackholed ranges mean a GitHub runner would find every URL "unreachable",
# report nothing, and look healthy.
#
# It found the first one the day it was written: the council restructured its
# transparency portal and two acta PDFs backing 68 citations across 12 of 21
# biographies started returning 404, with nothing in this repo changing.
# Report-only — link rot is upstream's doing and must not fail a data refresh.
echo "[ci-blocked] $(date '+%F %T') running check:citations (network probe)"
npm run check:citations || echo "[ci-blocked] check:citations reported findings — see above"

# Commit only these snapshots — never `git add -A`, so an in-progress working
# tree is not swept into an unattended commit. The `git add` alone never
# achieved that: `git commit` with no pathspec takes the WHOLE index, so
# anything anyone else had staged went in too. Now the same pathspec stages,
# gates and commits.
if ! cron_git_stage_and_check \
       public/data/paro.json public/data/plenos-agendas.json public/data/consell-cv.json \
       public/data/procesos-selectivos.json public/data/asociaciones.json \
       public/data/obras.json public/data/sindicatura.json; then
  echo "[ci-blocked] no changes"
  exit ${#failed[@]}
fi

# The commit used to end in `|| true`. An adapter failing is upstream's doing
# and stays non-fatal; the commit failing is OURS — seven adapters' worth of
# fresh data that nothing will retry until tomorrow — and swallowing it let the
# script go on to print "pushed".
if ! cron_git_commit_pathspec "chore(data): refresh CI-unreachable adapters (ribarroja.es / regmeet)"; then
  echo "[ci-blocked] ERROR: los datos se refrescaron pero el commit FALLÓ — nada publicado, quedan en el working tree"
  exit 1
fi

# Was `git pull --rebase … && git push …` on one line: a failed pull skipped the
# push silently and the script still echoed "pushed" and exited on the ADAPTER
# count, so a repo that could not reach origin for days looked healthy. Each
# step now reports itself. Exit 1 on a publish failure (adapter-only failures
# keep exiting on their own count, as before).
# Through cron_git_pull_rebase: this one runs AFTER the commit, so by now the
# seven adapters and check:citations have had minutes to be interrupted by a
# branch switch — and on the wrong branch this pull rebases THAT branch onto
# origin/main. The commit is already local either way; the next run retries it.
if ! cron_git_pull_rebase "pull-rebase previo al push"; then
  echo "[ci-blocked] ERROR: git pull --rebase falló — el commit existe en local pero NO se ha hecho push; el próximo run reintenta"
  exit 1
fi
if ! git push origin main; then
  echo "[ci-blocked] ERROR: git push falló — el commit existe en local pero NO está publicado; el próximo run reintenta"
  exit 1
fi
echo "[ci-blocked] pushed"
exit ${#failed[@]}
