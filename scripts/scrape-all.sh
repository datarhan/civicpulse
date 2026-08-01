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
  scrape:transparency
  scrape:ispa
  scrape:budget
  scrape:budget-execution
  scrape:tenders
  scrape:tenders-ted
  scrape:boe
  scrape:bop
  scrape:padron
  scrape:participa
  scrape:press
  scrape:events
  scrape:geo
  scrape:civic-poi
  scrape:streets
  scrape:metro-network
  scrape:fgv-gtfs
  scrape:bdns
  scrape:paro
  scrape:plenos
  scrape:pleno-agendas
  scrape:empleo
  scrape:procesos-selectivos
  scrape:asociaciones
  scrape:obras
  scrape:wikidata
  scrape:ctbg
  scrape:sindicatura
  scrape:consell-cv
  scrape:spain-ticker
  scrape:promise-suggestions
  extract:all-pleno-votes
  scrape:elections
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
#   - scrape:empleo — external portalemp SaaS behind an OWASP-CSRFProtector
#     handshake + ~73 sequential detail fetches. Brittle by construction (token
#     rotation, session cookies), and an employment-portal outage must never
#     block the whole site's deploy; the prior snapshot stays live meanwhile.
#   - scrape:budget-execution — single-source SICALWIN PDFs on ribarroja.es;
#     a PDF-layout change (or the WAF) breaking the parser must not red the
#     whole run, and the prior quarter's snapshot stays valid meanwhile.
#   - scrape:procesos-selectivos — single-source server-rendered HTML list on
#     ribarroja.es; a markup change breaking the parser must not red the whole
#     run, and the prior snapshot of hiring processes stays valid meanwhile.
#   - scrape:asociaciones — single-source dated register PDF on ribarroja.es;
#     a PDF-layout change breaking the parser must not red the whole run, and
#     the prior register snapshot stays valid meanwhile.
#   - scrape:obras — two ficha listings (PDF) on ribarroja.es (transparency
#     FEDER 2019-20 + urbanismo Plan RENOVE 2023-24); depends on the
#     geo/streets/civic-poi gazetteer for pin placement. A ficha layout change,
#     a missing gazetteer, or either listing 404ing must not red the whole run;
#     the prior obras snapshot stays valid meanwhile.
#   - scrape:pleno-agendas — regmeet.com (the council's session platform)
#     blackholes GitHub-runner IPs: every convocatoria fetch dies with a
#     bare `fetch failed` from CI while the same URLs answer fine from a
#     laptop. That red every single night from 2026-07-21 onward, and since
#     the deploy hook only fires on a green run it quietly disabled the
#     nightly deploy path. The adapter's own circuit breaker already refuses
#     to publish a truncated agenda set, so a soft failure costs nothing but
#     freshness — the prior agendas snapshot stays valid meanwhile.
#   - scrape:consell-cv — two near-static yearly GVA tables. The adapter now
#     refuses to write a partial snapshot when a year is unreachable (that
#     would delete the missing year's resoluciones), so an upstream blip
#     should hold yesterday's file rather than red the run.
BEST_EFFORT=(
  scrape:pleno-agendas
  scrape:consell-cv
  scrape:elections
  scrape:metro-network
  scrape:empleo
  scrape:budget-execution
  scrape:procesos-selectivos
  scrape:asociaciones
  scrape:obras
  scrape:geo
  scrape:civic-poi
  scrape:streets
  scrape:participa
  scrape:bop
  scrape:transparency
  scrape:ispa
  scrape:sindicatura
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
echo "[scrape-all] running: compute:tender-geo"
echo "================================================================"
if ! npm run compute:tender-geo; then
  echo "[scrape-all] FAILED: compute:tender-geo"
  failures+=("compute:tender-geo")
fi

echo ""
echo "================================================================"
echo "[scrape-all] running: compute:entities"
echo "================================================================"
# Canonical company/people registry (name-variant merge + curated
# aliases). Deterministic, no network — inputs are tenders.json +
# officials.json + entity-overrides.json already on disk.
if ! npm run compute:entities; then
  echo "[scrape-all] FAILED: compute:entities"
  failures+=("compute:entities")
fi

echo ""
echo "================================================================"
echo "[scrape-all] running: scrape:queja-contract-relations (best-effort)"
echo "================================================================"
# Depends on tender-geo.json (situated places) + the bot's quejas.json. Pure +
# deterministic (no LLM/network); soft-fail so a flake never blocks the commit.
if ! npm run scrape:queja-contract-relations; then
  echo "[scrape-all] SOFT-FAILED: scrape:queja-contract-relations — best-effort, not counted"
  soft_failures+=("scrape:queja-contract-relations")
fi

echo ""
echo "================================================================"
echo "[scrape-all] running: check:relations (report-only)"
echo "================================================================"
# Cross-snapshot referential-integrity audit (findings→claims, manifest→
# chunks, relations→quejas/tenders, …). --soft: report, never fail the
# nightly — a partial scrape night must not red the commit-then-gate
# design. Strict mode (exit 1 on error-level breakage) is the default
# for manual runs: `npm run check:relations`.
if ! npm run check:relations -- --soft; then
  echo "[scrape-all] SOFT-FAILED: check:relations — best-effort, not counted"
  soft_failures+=("check:relations")
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
