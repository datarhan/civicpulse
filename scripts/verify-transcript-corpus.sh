#!/usr/bin/env bash
# Re-check the transcript corpus after any transcript changes, and report the
# DELTA rather than just the totals.
#
# Re-transcribing is an improvement that breaks things: better text means a
# published verbatim lifted from the old text may no longer appear. Totals hide
# that — "30 untraceable" looks the same whether it is the same 30 as yesterday
# or a fresh 30 caused by the run that just finished. The delta is the thing a
# curator has to act on.
#
#   bash scripts/verify-transcript-corpus.sh            # check + report delta
#   bash scripts/verify-transcript-corpus.sh --baseline # accept current state
#
# Called automatically at the end of scripts/transcribe-pleno.sh. Exits non-zero
# when a quote became untraceable, so a caller notices.
set -uo pipefail
cd "$(dirname "$0")/.."

# COMMITTED, deliberately. If this were gitignored, CI would start from a clean
# checkout every night, write a fresh baseline, and report "no new untraceable
# quotes" forever — a check that cannot fail. It is also meaningful state in its
# own right: the list of quote drifts a human has already looked at and accepted.
#
# The run may SHRINK it without being asked — a row that is traceable again is
# retired, so the recovery is reported once instead of every night — but it
# never GROWS without `--baseline`. Accepting a drift nobody has looked at stays
# a human act; retiring a stale row only tightens the gate, because that quote
# breaking again would then come back as "appeared" rather than stay silent.
BASELINE=".transcript-check-baseline.json"
CUR=$(mktemp)
trap 'rm -f "$CUR"' EXIT

echo "── check:transcripts ─────────────────────────────────────────"
npm run --silent check:transcripts 2>&1 | tail -3
sanity_rc=${PIPESTATUS[0]:-0}

echo
echo "── check:finding-quotes ──────────────────────────────────────"
npm run --silent check:finding-quotes -- --json > "$CUR" 2>/dev/null

# The set arithmetic lives in scripts/corpus-delta.ts → src/scraper/corpus-baseline.ts,
# not in a `node -e` string here: inline like that, no test could reach the one
# part of this script that has a wrong answer available.
npx tsx scripts/corpus-delta.ts "$CUR" "$BASELINE" "${1:-}"
quotes_rc=$?

exit $(( sanity_rc != 0 || quotes_rc != 0 ? 1 : 0 ))
