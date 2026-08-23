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

/**
 * Piezas publicadas cuyas cifras NO se pueden anclar, y por qué no.
 *
 * La distinción que justifica esta tabla, calcada de `NOT_INJECTABLE` en
 * check-guards.ts: «nadie se ha ocupado» y «no se puede» son hechos distintos,
 * y juntarlos hace que el primero parezca excusable y el segundo, negligencia.
 * Una pieza que no esté aquí NI tenga cifras en `frozen` se sigue cantando como
 * el agujero que es.
 *
 * Esto NO es una exención de vigilancia como lo era el viejo `scope`: aquella
 * dejaba pasar una cifra COMPARADA, ésta dice en voz alta que no hay con qué
 * compararla. Lo primero se lee como un visto bueno; lo segundo, no.
 */
const SIN_ANCLA: Record<string, string> = {
  'inteligencia-turistica':
    'las filas de `cluster` no llevan id de contrato (ano/objeto/empresa/importe/…), ' +
    'así que no hay join determinista con tenders.json; sus titulares son sumas internas ' +
    'de esas filas (25.887 + 25.900 = 51.787; el cluster suma ≈1,56 M€) y «2,11 M€» es el ' +
    'importe del plan, que viene de fuera. Casar por empresa+importe sería casar por el ' +
    'propio valor que se quiere vigilar. Deja de estar exenta en cuanto las filas lleven id.',
}

function main() {
  const tenders = read('tenders.json')
  const geo = read('tender-geo.json')
  const budget = read('budget.json')

  /** Importe de un contrato por id, o NaN — que el comparador trata como «no comparada». */
  const importeContrato = (id: string): number =>
    (tenders?.contracts ?? []).find((c: { id?: string }) => c.id === id)?.finalAmountNoTaxes ?? NaN

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
    // El contrato de RSU adjudicado a Garbialdi (expte. 136/2025, lote 1). El
    // reportaje de basuras sostiene que el registro público SIGUE dándolo por
    // vivo pese a la resolución de 09-03-2026: si algún día se corrige, esta
    // ancla lo delata en vez de dejar la prosa afirmando algo que dejó de ser
    // cierto.
    rsuContrato: {
      label: 'tenders · contrato 4653394 (RSU) finalAmountNoTaxes',
      value: importeContrato('4653394'),
    },
    // La concesión del agua: 55,69 M€ de diecisiete años adjudicados de una vez
    // (expte. 46717). El ganador y el importe se leen SIEMPRE de `contracts`,
    // nunca de `tenders` — ver tests/tenders-colision-id.test.ts.
    concesionAgua: {
      label: 'tenders · contrato 46717 (concesión del agua) finalAmountNoTaxes',
      value: importeContrato('46717'),
    },
    // El total adjudicado MENOS esa concesión.
    //
    // Existe porque `reconstruccion-dana.totals.totalAwarded` mide justo eso, y
    // durante un tiempo se comparó contra el total CON concesión: salía ×1,8
    // eternamente, se le colgó una nota de «no es deriva» y la nota acabó
    // eximiéndola de toda vigilancia (ver FrozenFigure.anchor). La nota decía
    // una aritmética exacta —123,68 − 55,69 = 68,00— así que lo que procedía
    // era restarla aquí y no apagar el aviso. Cuadra al céntimo.
    //
    // Si el contrato desaparece del registro, esto es NaN y la cifra sale como
    // «no comparada» con su motivo, que es lo honrado: mejor eso que restar
    // cero en silencio y declarar una deriva de 55,69 M€ que no ha ocurrido.
    awardedTotalSinConcesion: {
      label: 'tenders.stats.awardedTotalEuros − contrato 46717',
      value: (tenders?.stats?.awardedTotalEuros ?? NaN) - importeContrato('46717'),
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
        anchor: 'awardedTotalSinConcesion',
      },
      {
        where: 'reconstruccion-dana.totals.situatedAmount',
        value: dana.totals.situatedAmount,
        anchor: 'situatedAmount',
      },
    )
  }

  const basuras = read('reportajes/basuras.json')
  if (basuras?.dinero) {
    frozen.push(
      {
        where: 'basuras.dinero.adjudicadoSinIva',
        value: basuras.dinero.adjudicadoSinIva,
        anchor: 'rsuContrato',
      },
      {
        where: 'basuras.censo.totalAdjudicadoMunicipio',
        value: basuras.censo.totalAdjudicadoMunicipio,
        anchor: 'awardedTotal',
      },
    )
  }

  // El reportaje del coste efectivo. Sus dos cifras de dinero salen de nuestro
  // propio registro de contratación y cuadran al céntimo, así que son anclables
  // de verdad: `concesion.importe` ES el contrato 46717, y `dinero.importeTotal`
  // ES el total adjudicado. La pieza se amplió el 23-08-2026 y llevaba desde el
  // 16-08 publicada sin una sola cifra vigilada.
  const costeEfectivo = read('reportajes/coste-efectivo.json')
  if (costeEfectivo?.concesion?.importe) {
    frozen.push({
      where: 'coste-efectivo.concesion.importe',
      value: costeEfectivo.concesion.importe,
      anchor: 'concesionAgua',
    })
  }
  if (costeEfectivo?.dinero?.importeTotal) {
    frozen.push({
      where: 'coste-efectivo.dinero.importeTotal',
      value: costeEfectivo.dinero.importeTotal,
      anchor: 'awardedTotal',
    })
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
  const sinAncla: string[] = []
  const uncovered: string[] = []
  for (const file of readdirSync(resolve(DATA, 'reportajes')).filter((f) => f.endsWith('.json'))) {
    const slug = basename(file, '.json')
    const piece = read(`reportajes/${file}`)
    if (piece?.meta?.estado !== 'publicado') continue
    if (tracked.has(slug)) continue
    ;(SIN_ANCLA[slug] ? sinAncla : uncovered).push(slug)
  }
  // Declarada ≠ olvidada. Se imprimen aparte y en voz baja: son un recordatorio
  // de que esas cifras NO están vigiladas, no un visto bueno.
  if (sinAncla.length > 0) {
    console.log(`  ⓘ ${sinAncla.length} pieza(s) declarada(s) NO anclable(s), con motivo:`)
    for (const slug of sinAncla) console.log(`      · ${slug} — ${SIN_ANCLA[slug]}`)
    console.log('')
  }
  if (uncovered.length > 0) {
    console.log(
      `  ⓘ ${uncovered.length} pieza(s) publicada(s) SIN ninguna cifra vigilada: ${uncovered.join(', ')}\n` +
        `      Sus cifras congeladas pueden divergir sin que nada lo note. Añádelas a\n` +
        `      \`frozen\` en scripts/check-prose-drift.ts, o a \`SIN_ANCLA\` con el motivo\n` +
        `      — pero no las des por buenas.\n`,
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
