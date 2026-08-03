#!/usr/bin/env tsx
/**
 * Report published figures that no longer match the data they were derived from.
 *
 *   npm run check:drift
 *
 * Exits 1 when something drifted, so scrape-all notices. A drifted figure is a
 * QUESTION for a curator, not a defect: reportaje figures are frozen on purpose.
 * What it must never do is edit published prose — see the corrections flow.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { detectDrift, type FrozenFigure, type LiveAnchor } from '../src/scraper/prose-drift'

const DATA = resolve('public/data')
const read = (f: string) =>
  existsSync(`${DATA}/${f}`) ? JSON.parse(readFileSync(`${DATA}/${f}`, 'utf8')) : null

function main() {
  const tenders = read('tenders.json')
  const geo = read('tender-geo.json')
  const budget = read('budget.json')

  const anchors: Record<string, LiveAnchor> = {
    awardedTotal: {
      label: 'tenders.stats.awardedTotalEuros',
      value: tenders?.stats?.awardedTotalEuros ?? NaN,
    },
    awardedCount: {
      label: 'tenders.stats.awardedContracts',
      value: tenders?.stats?.awardedContracts ?? NaN,
    },
    situatedAmount: {
      label: 'tender-geo · suma de places[].amount',
      value: (geo?.places ?? []).reduce(
        (s: number, p: { amount?: number }) => s + (p.amount ?? 0),
        0,
      ),
    },
    budgetExpense: {
      label: 'budget.snapshot.totalExpense',
      value: budget?.snapshot?.totalExpense ?? NaN,
    },
  }

  // Frozen figures worth tracking. Deliberately an explicit list: scraping every
  // number out of every reportaje would produce noise, and a figure only drifts
  // meaningfully when we know which live value it was supposed to be.
  const frozen: FrozenFigure[] = []
  const dana = read('reportajes/reconstruccion-dana.json')
  if (dana?.totals) {
    frozen.push(
      {
        where: 'reconstruccion-dana.totals.totalAwarded',
        value: dana.totals.totalAwarded,
        anchor: 'awardedTotal',
      },
      {
        where: 'reconstruccion-dana.totals.situatedAmount',
        value: dana.totals.situatedAmount,
        anchor: 'situatedAmount',
      },
    )
  }

  const { rows, skipped } = detectDrift(frozen, anchors)
  const bad = rows.filter((r) => r.severity === 'drifted')
  console.log(
    `[drift] ${frozen.length} cifra(s) en la lista · ${rows.length} comparada(s) · ` +
      `${bad.length} divergente(s)` +
      (skipped.length > 0 ? ` · ${skipped.length} SIN comparar` : '') +
      '\n',
  )

  // A figure that fell out of the comparison is not a clean figure. Printed
  // before the drifts because it is the more dangerous of the two: a drift is
  // visible, a figure nobody compared looks exactly like a figure that matched.
  for (const s of skipped) {
    console.log(`  ⓘ ${s.where}`)
    console.log(`      no comparada: ${s.reason}`)
  }
  if (skipped.length > 0) console.log()

  // Report COVERAGE, not just findings.
  //
  // The frozen list above is deliberately explicit, which is right — but it
  // means a published piece nobody added to it is indistinguishable from one
  // with nothing to track. `inteligencia-turistica` was published on
  // 2026-07-15 with headline figures (51.787 €, ≈1,56 M€) derived from the
  // contract registry and NOTHING watching them; the check reported "2 tracked
  // figures · 0 drifted" and looked entirely healthy. A guard has to say what
  // it is not looking at, or its silence gets read as an all-clear.
  const tracked = new Set(frozen.map((f) => f.where.split('.')[0]))
  const uncovered: string[] = []
  for (const file of readdirSync(resolve(DATA, 'reportajes')).filter((f) => f.endsWith('.json'))) {
    const slug = basename(file, '.json')
    const piece = read(`reportajes/${file}`)
    if (piece?.meta?.estado !== 'publicado') continue
    if (!tracked.has(slug)) uncovered.push(slug)
  }
  if (uncovered.length > 0) {
    console.log(
      `  ⓘ ${uncovered.length} pieza(s) publicada(s) SIN ninguna cifra vigilada: ${uncovered.join(', ')}\n` +
        `      Sus cifras congeladas pueden divergir sin que nada lo note. Añádelas a\n` +
        `      \`frozen\` en scripts/check-prose-drift.ts, o deja constancia de por qué no\n` +
        `      son anclables (p. ej. proceden de una fuente externa, no de nuestros datos).\n`,
    )
  }
  for (const r of bad) {
    const pct = Math.round((r.live / r.frozen) * 10) / 10
    console.log(`  ⚠︎ ${r.where}`)
    console.log(
      `      publicado ${r.frozen.toLocaleString('es-ES')} · vivo ${Math.round(r.live).toLocaleString('es-ES')} (×${pct})`,
    )
    console.log(`      contra ${r.anchor}`)
  }
  if (bad.length > 0) {
    console.log(
      `\n  Congelar es intencionado: una pieza publicada no reescribe sus cifras.\n` +
        `  Esto no pide editarlas — pide decidir si hace falta una nota de corrección\n` +
        `  (meta.correcciones), que es como se resolvió el 02-08-2026.`,
    )
    process.exitCode = 1
  }
}

main()
