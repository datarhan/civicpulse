#!/usr/bin/env tsx
/**
 * check:summary-gate — does a published summary reproduce a quote the
 * editorial gate withholds?
 *
 *   npm run check:summary-gate
 *   npm run check:summary-gate -- --json
 *
 * `claim-public-gate.ts` opens by promising that a `hidden` verbatim "never
 * enters a deployed file". `public/data/pleno-findings.json` is a deployed
 * file. The gate is applied to the QUOTE LIST, and nothing was checking the
 * SUMMARY beside it — so a summary could, and does, print in guillemets the
 * exact sentence the gate refused to show.
 *
 * `hidden` is reserved for accusations that are opinativa or that the verifier
 * could not ground in any record. Publishing one inside the summary is the
 * same publication the gate exists to prevent, with the same words, about the
 * same group, minus only the visual framing of a quote.
 *
 * Measured when this was written: 8 hidden quotes across 6 findings.
 *
 * Uses `quoteAppearsIn` — the matcher the published-quote audit already uses —
 * so "the summary contains this quote" means the same thing here as everywhere
 * else. A paraphrase is deliberately NOT caught: judging whether prose conveys
 * a withheld accusation is editorial work, and a checker that guessed at it
 * would produce exactly the false positives that get a check switched off.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { quoteAppearsIn, quoteCoverage } from '../src/scraper/quote-match'

const FINDINGS = 'public/data/pleno-findings.json'
/**
 * The gate verdict per published quote, already computed and shipped.
 *
 * Read rather than recomputed: `triage-finding-exception.ts` reads the same
 * `quotes` block, and two classifiers is how a page and its review queue start
 * disagreeing about what is hidden.
 */
const PROVENANCE = 'public/data/finding-quote-provenance.json'

/** Coverage at which a summary is judged to contain the quote's substance. */
const NEAR_VERBATIM = 0.8

interface Leak {
  findingId: string
  quoteIndex: number
  gate: string
  text: string
}

export function findGateLeaks(
  findings: Array<{ id: string; summary: string; quotes?: Array<{ text: string }> }>,
  gateOf: (findingId: string, quoteIndex: number) => string | null,
): Leak[] {
  const leaks: Leak[] = []
  for (const f of findings) {
    for (const [i, q] of (f.quotes ?? []).entries()) {
      const gate = gateOf(f.id, i)
      if (gate !== 'hidden') continue
      if (quoteAppearsIn(q.text, f.summary) || quoteCoverage(q.text, f.summary) >= NEAR_VERBATIM) {
        leaks.push({ findingId: f.id, quoteIndex: i, gate, text: q.text })
      }
    }
  }
  return leaks
}

function main() {
  const asJson = process.argv.includes('--json')
  const snap = JSON.parse(readFileSync(resolve(FINDINGS), 'utf8')) as {
    items: Array<{
      id: string
      summary: string
      quotes?: Array<{ text: string; sourceClaimId?: string }>
    }>
  }

  if (!existsSync(resolve(PROVENANCE))) {
    process.stderr.write(
      `[check-summary-gate] falta ${PROVENANCE} — ejecuta \`npm run compute:finding-quote-provenance\`\n`,
    )
    process.exit(1)
  }
  const prov = JSON.parse(readFileSync(resolve(PROVENANCE), 'utf8')) as {
    quotes?: Record<string, Array<{ gate?: string | null } | null>>
  }
  const gates = prov.quotes ?? {}
  const gateAt = (findingId: string, i: number): string | null =>
    gates[findingId]?.[i]?.gate ?? null

  const evaluated = snap.items.reduce((n, f) => n + (f.quotes ?? []).length, 0)
  const hidden = snap.items.reduce(
    (n, f) => n + (f.quotes ?? []).filter((_q, i) => gateAt(f.id, i) === 'hidden').length,
    0,
  )
  const leaks = findGateLeaks(snap.items, gateAt)

  if (asJson) {
    process.stdout.write(JSON.stringify({ evaluated, hidden, leaks }, null, 2) + '\n')
  } else {
    for (const l of leaks) {
      process.stdout.write(
        `  ✗ ${l.findingId} quote.${l.quoteIndex} — el sumario reproduce una cita que la puerta oculta\n` +
          `      «${l.text.replace(/\s+/g, ' ').slice(0, 120)}»\n`,
      )
    }
    process.stdout.write(
      `\n[check-summary-gate] ${snap.items.length} hallazgo(s) · ${evaluated} cita(s) · ` +
        `${hidden} ocultas por la puerta · ${leaks.length} reproducida(s) en su sumario\n`,
    )
    if (leaks.length > 0) {
      process.stdout.write(
        `[check-summary-gate] Se corrigen con \`npm run correct-pleno-finding -- <id> --redact summary\`,\n` +
          `                    NO con --field: una corrección normal deja el original tachado en\n` +
          `                    /hallazgos, que volvería a publicar exactamente lo que se retira.\n`,
      )
    }
  }

  // A run that found no hidden quotes has not shown the summaries are clean —
  // it has shown the gate lookup produced nothing, which is a broken check.
  if (hidden === 0 && evaluated > 0) {
    process.stderr.write(
      '[check-summary-gate] FATAL: ninguna cita salió `hidden`. Con 0 ocultas este check no\n' +
        '                    puede encontrar nada, así que «0 fugas» no significa nada.\n' +
        '                    Regenera pleno-claims-verified.json antes de creerte el verde.\n',
    )
    process.exitCode = 1
    return
  }
  if (leaks.length > 0) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) main()
