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
 * Measured on the 2026-08-11 corpus: 9 hidden quotes reproduced across 7
 * findings.
 *
 * Uses `quoteAppearsIn` — the matcher the published-quote audit already uses —
 * so "the summary contains this quote" means the same thing here as everywhere
 * else. A paraphrase is deliberately NOT caught: judging whether prose conveys
 * a withheld accusation is editorial work, and a checker that guessed at it
 * would produce exactly the false positives that get a check switched off.
 *
 * ## The bigger class, found by fixing the first one
 *
 * Repairing those 9 surfaced what the leak rule could only ever see a corner
 * of. A summary conveys a withheld accusation perfectly well WITHOUT
 * reproducing its words, and the corpus held 11 findings whose every quote the
 * gate withheld — only 3 of which leaked a verbatim. The other 8 read as
 * ordinary findings and cited nothing the page was allowed to show.
 *
 * So there are three passes now, and they are deliberately unequal:
 *
 *   findGateLeaks       BLOCKS. Verbatim reproduction, 8-word window.
 *   findHollowFindings  BLOCKS. Every quote withheld — retract, don't rewrite.
 *   findNearMisses      ADVISES. 6-word runs; 1 in 4 was real when measured.
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

/**
 * Word window for the ADVISORY pass. `quoteAppearsIn` defaults to 8, which is
 * the blocking rule; 6 is where the corpus starts returning stock Spanish
 * rather than reproduced accusations.
 *
 * Measured on the 2026-08-11 corpus: at 6 words the pass returns 4 rows, of
 * which 1 is a genuine reproduction («de manera verbal y por emergencia»,
 * echoing a withheld admission) and 3 are phrasing a summary cannot avoid —
 * «las necesidades del departamento de tesorería», «se ha puesto en contacto
 * con», «a favor de pagar a los proveedores». One in four is exactly the hit
 * rate this file's header warns gets a check switched off, so these advise and
 * never block.
 */
const NEAR_MISS_WORDS = 6

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

/**
 * Shorter shared runs — a curator reads these, nothing blocks on them.
 *
 * Excludes anything `findGateLeaks` already reports, so the two lists never
 * name the same row.
 */
export function findNearMisses(
  findings: Array<{ id: string; summary: string; quotes?: Array<{ text: string }> }>,
  gateOf: (findingId: string, quoteIndex: number) => string | null,
): Leak[] {
  const blocking = new Set(
    findGateLeaks(findings, gateOf).map((l) => `${l.findingId}#${l.quoteIndex}`),
  )
  const out: Leak[] = []
  for (const f of findings) {
    for (const [i, q] of (f.quotes ?? []).entries()) {
      const gate = gateOf(f.id, i)
      if (gate !== 'hidden') continue
      if (blocking.has(`${f.id}#${i}`)) continue
      if (quoteAppearsIn(q.text, f.summary, NEAR_MISS_WORDS)) {
        out.push({ findingId: f.id, quoteIndex: i, gate, text: q.text })
      }
    }
  }
  return out
}

/**
 * Findings the gate has hollowed out: every quote withheld, so whatever the
 * summary says about a named political group rests on nothing the page is
 * allowed to show.
 *
 * This is the class the leak check kept finding one corner of. On 2026-08-11
 * the corpus held 11 of them — 8 invisible to the leak rule, because a summary
 * can convey a withheld accusation perfectly well without reproducing its
 * words. All 11 were withdrawn; the check exists so the auto-curator cannot
 * quietly republish the shape.
 *
 * A finding with no quotes at all is a different thing (a documentary finding)
 * and is not reported here.
 */
export function findHollowFindings(
  findings: Array<{ id: string; quotes?: Array<{ text: string }> }>,
  gateOf: (findingId: string, quoteIndex: number) => string | null,
): string[] {
  const out: string[] = []
  for (const f of findings) {
    const quotes = f.quotes ?? []
    if (quotes.length === 0) continue
    const publishable = quotes.filter((_q, i) => {
      const g = gateOf(f.id, i)
      return g === 'shown' || g === 'toggle'
    })
    if (publishable.length === 0) out.push(f.id)
  }
  return out
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
  const nearMisses = findNearMisses(snap.items, gateAt)
  const hollow = findHollowFindings(snap.items, gateAt)

  if (asJson) {
    process.stdout.write(
      JSON.stringify({ evaluated, hidden, leaks, nearMisses, hollow }, null, 2) + '\n',
    )
  } else {
    for (const l of leaks) {
      process.stdout.write(
        `  ✗ ${l.findingId} quote.${l.quoteIndex} — el sumario reproduce una cita que la puerta oculta\n` +
          `      «${l.text.replace(/\s+/g, ' ').slice(0, 120)}»\n`,
      )
    }
    for (const id of hollow) {
      process.stdout.write(
        `  ✗ ${id} — la puerta retiene TODAS sus citas: el sumario habla de grupos con nombre\n` +
          `      sin una sola intervención que la ficha pueda mostrar\n`,
      )
    }
    for (const l of nearMisses) {
      process.stdout.write(
        `  · ${l.findingId} quote.${l.quoteIndex} — coincidencia parcial (${NEAR_MISS_WORDS}+ palabras), a criterio del curador\n`,
      )
    }
    process.stdout.write(
      `\n[check-summary-gate] ${snap.items.length} hallazgo(s) · ${evaluated} cita(s) · ` +
        `${hidden} ocultas por la puerta\n` +
        `[check-summary-gate] ${leaks.length} reproducida(s) en su sumario · ` +
        `${hollow.length} hallazgo(s) sin ninguna cita publicable · ` +
        `${nearMisses.length} coincidencia(s) parcial(es), sin bloquear\n`,
    )
    if (leaks.length > 0) {
      process.stdout.write(
        `[check-summary-gate] Las reproducciones se corrigen con \`npm run correct-pleno-finding -- <id>\n` +
          `                    --redact summary\`, NO con --field: una corrección normal deja el\n` +
          `                    original tachado en /hallazgos, que volvería a publicar lo que se retira.\n`,
      )
    }
    if (hollow.length > 0) {
      process.stdout.write(
        `[check-summary-gate] Un hallazgo sin citas publicables no se reescribe, se retira:\n` +
          `                    \`npm run retract-finding -- <id> --reason "…" --editor "…"\`.\n`,
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
  // Near-misses never reach here: one in four was real when measured, and a
  // check that is wrong three times out of four is one everybody switches off.
  if (leaks.length > 0 || hollow.length > 0) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) main()
