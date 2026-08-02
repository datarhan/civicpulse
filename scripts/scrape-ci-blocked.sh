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
cd "$(dirname "$0")/.."
mkdir -p scripts/logs

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

# Commit only these snapshots — never `git add -A`, so an in-progress working
# tree is not swept into an unattended commit.
git add public/data/paro.json public/data/plenos-agendas.json public/data/consell-cv.json \
        public/data/procesos-selectivos.json public/data/asociaciones.json \
        public/data/obras.json public/data/sindicatura.json 2>/dev/null || true
if git diff --cached --quiet; then
  echo "[ci-blocked] no changes"
  exit ${#failed[@]}
fi
git commit -q -m "chore(data): refresh CI-unreachable adapters (ribarroja.es / regmeet)" || true
git pull --rebase --autostash origin main && git push origin main
echo "[ci-blocked] pushed"
exit ${#failed[@]}
