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
BASELINE=".transcript-check-baseline.json"
CUR=$(mktemp)
trap 'rm -f "$CUR"' EXIT

echo "── check:transcripts ─────────────────────────────────────────"
npm run --silent check:transcripts 2>&1 | tail -3
sanity_rc=${PIPESTATUS[0]:-0}

echo
echo "── check:finding-quotes ──────────────────────────────────────"
npm run --silent check:finding-quotes -- --json > "$CUR" 2>/dev/null

node -e '
  const fs = require("fs")
  const cur = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
  const basePath = process.argv[2]
  const accept = process.argv[3] === "--baseline"

  const ids = (r) => new Set((r.drifted ?? []).map((d) => `${d.findingId}|${d.quote.slice(0, 60)}`))
  const now = ids(cur)

  console.log(
    `  traceable ${cur.ok} · superseded-only ${cur.supersededOnlyCount ?? 0} · ` +
      `NOT found ${cur.driftedCount}`,
  )

  if (accept || !fs.existsSync(basePath)) {
    fs.writeFileSync(basePath, JSON.stringify({ drifted: cur.drifted ?? [] }, null, 2))
    console.log(accept ? "  baseline accepted." : "  baseline created (first run).")
    process.exit(0)
  }

  const before = ids(JSON.parse(fs.readFileSync(basePath, "utf8")))
  const appeared = [...now].filter((k) => !before.has(k))
  const healed = [...before].filter((k) => !now.has(k))

  if (healed.length) console.log(`  ✓ ${healed.length} quote(s) became traceable again`)
  if (!appeared.length) {
    console.log("  ✓ no quote became untraceable in this run")
    process.exit(0)
  }
  console.log(`\n  ⚠︎ ${appeared.length} quote(s) BECAME untraceable after this re-transcription:`)
  for (const k of appeared.slice(0, 10)) {
    const [id, q] = k.split("|")
    console.log(`      ${id}  “${q}…”`)
  }
  console.log(
    "\n  These cite a transcript that has since been replaced. The old text is kept\n" +
      "  under pleno-transcripts/superseded/, so the citation is still checkable —\n" +
      "  but the finding should be refreshed against the better text, or corrected\n" +
      "  via `npm run correct-pleno-finding`.\n" +
      "  Accept the new state with: bash scripts/verify-transcript-corpus.sh --baseline",
  )
  process.exit(1)
' "$CUR" "$BASELINE" "${1:-}"
quotes_rc=$?

exit $(( sanity_rc != 0 || quotes_rc != 0 ? 1 : 0 ))
