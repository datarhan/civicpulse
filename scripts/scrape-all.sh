#!/usr/bin/env bash
# Run every autonomous scraper independently.
#
# Why this exists (do not collapse back to a single `&&` chain):
# the previous one-liner short-circuited at the first failure and the
# trailing `|| true` masked it from CI. Result: scrape:officials hit
# ECONNRESET on the brittle http://www.ribarroja.es host, and every
# scraper after it (including scrape:press) silently stopped running
# for 8+ nights without CI going red.
#
# Each scraper here runs in isolation; a single failure no longer
# poisons the rest. The script exits non-zero if ANY scraper failed,
# so CI surfaces the breakage even when most adapters succeed.
set -uo pipefail

SCRAPERS=(
  scrape:officials
  scrape:budget
  scrape:tenders
  scrape:tenders-ted
  scrape:boe
  scrape:padron
  scrape:participa
  scrape:press
  scrape:geo
  scrape:metro-network
  scrape:fgv-gtfs
  scrape:bdns
  scrape:paro
  scrape:plenos
  scrape:pleno-agendas
  scrape:wikidata
  scrape:ctbg
  scrape:consell-cv
  scrape:spain-ticker
  scrape:promise-suggestions
  extract:all-pleno-votes
)

failures=()

for s in "${SCRAPERS[@]}"; do
  echo ""
  echo "================================================================"
  echo "[scrape-all] running: $s"
  echo "================================================================"
  if npm run "$s"; then
    echo "[scrape-all] ok: $s"
  else
    code=$?
    echo "[scrape-all] FAILED ($code): $s"
    failures+=("$s")
  fi
done

# compute:dept-stats runs unconditionally so the landing page's
# overdue counter stays fresh even when an upstream scraper choked.
echo ""
echo "================================================================"
echo "[scrape-all] running: compute:dept-stats"
echo "================================================================"
if ! npm run compute:dept-stats; then
  echo "[scrape-all] FAILED: compute:dept-stats"
  failures+=("compute:dept-stats")
fi

echo ""
echo "================================================================"
echo "[scrape-all] summary"
echo "================================================================"
if [ ${#failures[@]} -eq 0 ]; then
  echo "[scrape-all] all ${#SCRAPERS[@]} scrapers + compute:dept-stats succeeded"
  exit 0
else
  echo "[scrape-all] ${#failures[@]} failure(s):"
  for f in "${failures[@]}"; do
    echo "  - $f"
  done
  exit 1
fi
