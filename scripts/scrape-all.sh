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
  # SEPE blackholes GitHub runner IPs the same way ribarroja.es and regmeet do.
  # It was the last critical failure keeping the nightly red — and it works
  # first time from a residential IP, so it belongs with the other six in
  # scripts/scrape-ci-blocked.sh, not in the gate.
  scrape:paro
  # LLM step, and CI has no backend by design: no API keys, and ollama is out of
  # every fallback chain. It cannot pass on a runner, so gating the nightly on it
  # meant the run could only ever be red. It surfaced the moment scrape:paro was
  # demoted — one critical failure had been hiding the next.
  # The real vote extraction runs curator-side in hallazgos-pipeline.sh.
  extract:all-pleno-votes
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
# Steps deliberately not attempted here (e.g. LLM work with no backend). Kept
# apart from failures: "never attempted" and "tried and failed" are different
# facts, and folding them together is how a run reports work it never did.
skipped=()

# Steps that need an LLM. CI has no backend by design — no API keys, and ollama
# is out of every fallback chain — so these cannot do their work there. Running
# them anyway is not merely wasteful: they still WRITE their output file, so a
# runner that extracted nothing overwrites a snapshot a curator had regenerated
# locally. `pleno-votes-suggestions.json` collided that way twice in two days,
# once landing literal conflict markers in main. Skip rather than clobber.
LLM_STEPS=(extract:all-pleno-votes)
needs_llm() {
  local x
  for x in "${LLM_STEPS[@]}"; do [ "$x" = "$1" ] && return 0; done
  return 1
}
has_llm_backend() {
  [ -n "${OPENAI_API_KEY:-}" ] || [ -n "${ANTHROPIC_API_KEY:-}" ] || \
  [ -n "${GEMINI_API_KEY:-}" ] || command -v claude >/dev/null 2>&1 || \
  command -v agy >/dev/null 2>&1
}

for s in "${SCRAPERS[@]}"; do
  echo ""
  echo "================================================================"
  echo "[scrape-all] running: $s"
  echo "================================================================"
  if needs_llm "$s" && ! has_llm_backend; then
    echo "[scrape-all] SKIPPED: $s — needs an LLM backend and none is available here."
    echo "[scrape-all]   It runs curator-side (hallazgos-pipeline.sh). Skipping so this"
    echo "[scrape-all]   run does not overwrite the snapshot with an empty result."
    skipped+=("$s")
    continue
  fi
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

# ── Derivations, driven by the dependency graph ─────────────────────────
# These three used to run unconditionally, one hard-coded block each. That was
# safe but blind: it could not tell that press-trust.json had gone stale because
# press.json was rescraped this morning, and it recomputed the other two whether
# or not anything they read had moved.
#
# `npm run refresh` walks src/scraper/data-graph.ts, rebuilds the derived nodes
# whose inputs actually changed, and stamps each output with the hashes it was
# built from. It also NAMES the work this environment cannot do — the LLM tier
# lives on the laptop crons — so a green CI run cannot look complete when it is
# not. See docs/OPERATIONS.md.
echo ""
echo "================================================================"
echo "[scrape-all] running: refresh (dependency-driven derivations)"
echo "================================================================"
if ! npm run refresh; then
  echo "[scrape-all] FAILED: refresh"
  failures+=("refresh")
fi

# The graph declares what the deterministic tier cannot reach. Printed even on
# success, because "nothing to report" and "an LLM stage is overdue and this
# runner has no model" must not look the same in the nightly log.
#
# And a bare heading with nothing under it reads as "nothing owed", which is the
# very failure this block exists to prevent. So say which of the two it is:
# today the graph declares no `llm` nodes at all, so an empty list means the
# tier is UNMODELLED, not idle.
echo ""
LLM_BACKLOG=$(npm run --silent refresh -- --list llm 2>/dev/null || true)
if [ -n "$LLM_BACKLOG" ]; then
  echo "[scrape-all] LLM-tier backlog the laptop crons still owe:"
  echo "$LLM_BACKLOG" | sed 's/^/  · /'
elif npx tsx -e 'import{DATA_GRAPH}from"./src/scraper/data-graph.ts";process.exit(DATA_GRAPH.some(n=>n.tier==="llm")?0:1)' 2>/dev/null; then
  echo "[scrape-all] LLM tier: every declared node is fresh."
else
  echo "[scrape-all] LLM tier: NOT MODELLED in data-graph.ts yet — this says nothing"
  echo "[scrape-all]   about whether transcription, speaker maps or extraction are overdue."
  echo "[scrape-all]   Those still run from the laptop crons on their own backlogs."
fi

echo ""
echo "================================================================"
echo "[scrape-all] queja-contract-relations: now owned by the graph"
echo "================================================================"
# It reads tender-geo.json, tenders.json, quejas.json and promises.json and
# fetches nothing, so it is a `derived` node like any other and `refresh`
# above already rebuilt it — in topological order, AFTER tender-geo, which it
# depends on and which the explicit call here used to merely assume.
echo "[scrape-all] (see the refresh report above)"

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

# The most basic invariant, and nothing was checking it: is every published
# snapshot actually a JSON document? `pleno-votes-suggestions.json` sat in main
# for a day with literal `<<<<<<< Updated upstream` markers from an unresolved
# stash pop. Every semantic check in this file validates MEANING — do the ids
# resolve, do the quotes trace — and not one asked whether the bytes parse.
# Milliseconds, no network, no keys.
if ! npm run check:json; then
  echo "[scrape-all] SOFT-FAILED: check:json — unparseable snapshot or conflict markers"
  soft_failures+=("check:json")
fi

# Which transcript each published verbatim comes from, and what the editorial
# gate would do with the claim behind it. Derived from the findings snapshot,
# the transcript corpus and the verifier corpus (base ⊕ overlay), and it must
# run BEFORE check:corpus below: that gate re-derives the same classification
# and fails when the committed file disagrees, which is exactly what a night
# that re-transcribed a session — or re-judged a claim — would produce. Reads
# four snapshots, writes a fifth, never touches pleno-findings.json.
if ! npm run compute:finding-quote-provenance; then
  echo "[scrape-all] SOFT-FAILED: compute:finding-quote-provenance — /hallazgos puede quedar con marcas viejas"
  soft_failures+=("compute:finding-quote-provenance")
fi

echo ""
echo "================================================================"
echo "[scrape-all] running: check:transcripts + check:finding-quotes (report-only)"
echo "================================================================"
# Both of these existed for months with NO caller anywhere — not in a
# workflow, not in a pipeline script — while finding real problems: 25 of 180
# published finding quotes no longer appear in the transcript they cite, and
# the transcript sanity gate is the only thing standing between a degenerate
# Whisper run and a published "verbatim". A check nobody runs is a check that
# does not exist.
#
# Report-only for the same reason as check:relations: a partial scrape night
# must not block the commit. They are loud in the log and in the summary.
# One call, because the two are the same question: does the published text still
# support the published quotes? It reports the DELTA against the last accepted
# state, so a steady 30 untraceable quotes does not cry wolf every night while a
# NEW one does.
if ! npm run check:corpus; then
  echo "[scrape-all] SOFT-FAILED: check:corpus — quarantined transcript(s) or newly untraceable quote(s)"
  soft_failures+=("check:corpus")
fi

# Published figures that no longer match the data they came from. Pure
# arithmetic — a frozen reportaje total against its live counterpart — so it
# cannot invent a drift. Report-only: freezing is intentional, and the answer to
# a drift is a curator deciding whether it needs a correction note, never an
# automatic edit of published prose.
if ! npm run check:drift; then
  echo "[scrape-all] SOFT-FAILED: check:drift — published figure(s) diverged from live data"
  soft_failures+=("check:drift")
fi

# Has an upstream changed the words it uses? A field where a large share of rows
# falls back to `unknown` means the parser is misreading the source — that is
# how `formalized` cost €53.5M for months. New values only warn: a source adding
# a word is normal, not noticing is not.
if ! npm run check:vocabulary; then
  echo "[scrape-all] SOFT-FAILED: check:vocabulary — upstream vocabulary drifted"
  soft_failures+=("check:vocabulary")
fi

# Which snapshots have quietly stopped refreshing. Distinct from a scraper
# FAILING: six adapters are unreachable from GitHub runners and marked
# best-effort, so the nightly goes green while their data ages with no working
# refresh path. That is what this catches.
if ! npm run check:cadence; then
  echo "[scrape-all] SOFT-FAILED: check:cadence — dataset(s) past their expected cadence"
  soft_failures+=("check:cadence")
fi

# Did the LLM passes that ran overnight actually do work? A run that judged
# nothing, or whose every call failed having consumed zero tokens, reports
# success today. See src/scraper/run-manifest.ts for the three incidents.
if ! npm run check:runs; then
  echo "[scrape-all] SOFT-FAILED: check:runs — a run reported success without doing work"
  soft_failures+=("check:runs")
fi

# Structural half of the citation check: does every claim cite a source that
# exists, is every quote card verbatim in the excerpt it points at, can every
# citation still be re-verified. Free, no network.
#
# --offline is not a cost saving, it is the only honest setting HERE. The URL
# probe needs a residential IP: ribarroja.es fronts a WAF and regmeet.com
# blackholes GitHub's ranges, so a runner would mark most of the corpus
# `unverifiable`, find nothing, and report a clean bill of health — a check
# that cannot fail. The probing half runs in scrape-ci-blocked.sh, which is
# where everything needing a residential IP already lives.
if ! npm run check:citations -- --offline; then
  echo "[scrape-all] SOFT-FAILED: check:citations — a published claim's citation does not hold"
  soft_failures+=("check:citations")
fi

# Is every guard above actually invoked by something? `check:automation` was
# hooked to nothing at all for weeks — a correct check nobody runs. This is the
# wiring half only (free, reads files); the fault-injection half mutates
# snapshots and stays manual: `npm run check:guards -- --inject`.
if ! npm run check:guards; then
  echo "[scrape-all] SOFT-FAILED: check:guards — a guard is not invoked anywhere"
  soft_failures+=("check:guards")
fi

# Can the embedding corpora still be searched? --offline keeps this free and
# CI-safe (structural + sidecar checks only, no API calls); the self-retrieval
# probe runs curator-side where a key is present. A corpus queried at the wrong
# width scores 0 on every row and reports it as "no candidates" — the failure
# that left 653 claims unjudged.
if ! npm run check:retrieval -- --offline; then
  echo "[scrape-all] SOFT-FAILED: check:retrieval — corpus unsearchable or mis-shaped"
  soft_failures+=("check:retrieval")
fi

# Companies named in published finding prose that appear in none of our data.
# Catches a spoken allegation written up as documentary fact — a finding once
# told readers "según el registro municipal ... la empresa FCC" when FCC
# appeared in zero of 1,231 contract rows. Baseline-compared, so it reports only
# names nobody has reviewed yet.
if ! npm run check:finding-entities; then
  echo "[scrape-all] SOFT-FAILED: check:finding-entities — unreviewed company name in a published finding"
  soft_failures+=("check:finding-entities")
fi

# What still runs unattended, and what quietly stopped. A measurement ageing out
# past MEASUREMENT_MAX_AGE_DAYS demotes its class back to curator-only WITHOUT
# any other signal: the pipeline keeps running, drafts keep being written, and
# publication just stops. Nothing else would report that.
if ! npm run check:automation; then
  echo "[scrape-all] SOFT-FAILED: check:automation — a measurement expired; a class reverted to curator-only"
  soft_failures+=("check:automation")
fi

echo ""
echo "================================================================"
echo "[scrape-all] summary"
echo "================================================================"
if [ ${#skipped[@]} -gt 0 ]; then
  echo "[scrape-all] ${#skipped[@]} paso(s) NO intentado(s) (sin backend disponible aquí):"
  for f in "${skipped[@]}"; do
    echo "  - $f"
  done
fi
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
