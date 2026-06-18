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
  scrape:bop
  scrape:padron
  scrape:participa
  scrape:press
  scrape:events
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

# Best-effort adapters: known-flaky or near-static upstreams whose failure
# must NOT red the nightly — and therefore must not block the commit of the
# adapters that DID refresh. They still run, still log, and still surface in
# the summary as a soft warning; they just don't count toward the exit code.
#   - scrape:metro-network — OSM Overpass routinely 429s; metro geometry is
#     near-static, so yesterday's snapshot is fine for another day.
#   - scrape:geo — same OSM Overpass upstream (boundary + neighborhoods +
#     railways), also near-static. Shares metro's mirror-retry now, but a
#     simultaneous outage of all Overpass mirrors still must not freeze the
#     whole site.
#   - scrape:participa — participa.ribarroja.es was decommissioned (the host
#     now serves the main portal's 404 behind a wrong-host TLS cert). Upstream
#     problem, not ours; we keep hitting it so it self-heals if the council
#     ever restores the Votiveu WordPress API.
BEST_EFFORT=(
  scrape:metro-network
  scrape:geo
  scrape:participa
  scrape:bop
)

is_best_effort() {
  local needle="$1" x
  for x in "${BEST_EFFORT[@]}"; do
    [ "$x" = "$needle" ] && return 0
  done
  return 1
}

failures=()
soft_failures=()

for s in "${SCRAPERS[@]}"; do
  echo ""
  echo "================================================================"
  echo "[scrape-all] running: $s"
  echo "================================================================"
  if npm run "$s"; then
    echo "[scrape-all] ok: $s"
  else
    code=$?
    if is_best_effort "$s"; then
      echo "[scrape-all] SOFT-FAILED ($code): $s — best-effort, not counted"
      soft_failures+=("$s")
    else
      echo "[scrape-all] FAILED ($code): $s"
      failures+=("$s")
    fi
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
if [ ${#soft_failures[@]} -gt 0 ]; then
  echo "[scrape-all] ${#soft_failures[@]} best-effort soft-failure(s) (not fatal):"
  for f in "${soft_failures[@]}"; do
    echo "  - $f"
  done
fi
if [ ${#failures[@]} -eq 0 ]; then
  echo "[scrape-all] all critical scrapers + compute:dept-stats succeeded"
  exit 0
else
  echo "[scrape-all] ${#failures[@]} critical failure(s):"
  for f in "${failures[@]}"; do
    echo "  - $f"
  done
  exit 1
fi
