/**
 * Is each published snapshot as fresh as it is supposed to be?
 *
 * Born from a 2026-08-02 finding: six adapters (pleno-agendas, consell-cv,
 * procesos-selectivos, asociaciones, obras, sindicatura) cannot be reached from
 * GitHub runners — ribarroja.es and regmeet blackhole their IP ranges. They are
 * marked best-effort so the nightly stays green, and nothing anywhere noticed
 * that they therefore had NO working refresh path at all. `participa` sat 79
 * days stale for the same reason, and its source had actually been
 * decommissioned in May.
 *
 * Staleness is not the same as failure, which is why this is its own check: a
 * scraper can exit 0 every night and still be publishing months-old data, and a
 * curated file can be old for perfectly good reasons. The distinction this
 * draws is between "old because nobody has needed to change it" and "old
 * because the machinery stopped and said nothing".
 *
 * NOT to be confused with `src/lib/data-freshness.js`, which is the UI-side
 * helper mapping one `generatedAt` onto a <Pill> tone for the reader. That one
 * answers "how old is this?"; this one answers "is this dataset behind ITS OWN
 * expected cadence, and is that because it has no refresh path left?".
 *
 * Pure — no fs, no clock. The CLI supplies both.
 */

export type FreshnessClass = 'nightly' | 'ci-blocked' | 'curated' | 'derived'

export interface DatasetExpectation {
  file: string
  cls: FreshnessClass
  /** Days after which this is worth a human's attention. */
  maxAgeDays: number
}

export interface SnapshotFacts {
  file: string
  /** null when the file has no generatedAt (or is unreadable). */
  ageDays: number | null
  /** `upstream.status` when the scraper recorded one. */
  upstreamStatus?: string | null
}

export type FreshnessStatus = 'ok' | 'stale' | 'retired' | 'unknown'

export interface FreshnessRow {
  file: string
  cls: FreshnessClass
  ageDays: number | null
  status: FreshnessStatus
  note: string
}

/**
 * Cadence expectations. Anything the nightly refreshes should be a day or two
 * old at most; the CI-blocked six depend on someone running
 * `scripts/scrape-ci-blocked.sh`, so they get a longer leash but are still
 * expected to move. Curated files are human-paced and only flagged when very
 * old, because "no new pleno votes this month" is a real answer.
 */
export const DEFAULT_EXPECTATIONS: DatasetExpectation[] = [
  ...[
    'officials.json',
    'budget.json',
    'tenders.json',
    'tenders-ted.json',
    'bdns.json',
    'boe.json',
    'bop.json',
    'padron.json',
    'paro.json',
    'plenos.json',
    'press.json',
    'empleo.json',
    'spain-ticker.json',
    'wikidata.json',
    'ctbg.json',
    'transparency-docs.json',
  ].map((file) => ({ file, cls: 'nightly' as const, maxAgeDays: 3 })),
  ...[
    'plenos-agendas.json',
    'consell-cv.json',
    'procesos-selectivos.json',
    'asociaciones.json',
    'obras.json',
    'sindicatura.json',
  ].map((file) => ({ file, cls: 'ci-blocked' as const, maxAgeDays: 8 })),
  ...['participa.json', 'elections.json', 'geo.json', 'civic-poi.json', 'streets.json'].map(
    (file) => ({ file, cls: 'derived' as const, maxAgeDays: 45 }),
  ),
  // `indicadores.json` se recompone en la nocturna desde tenders, la ejecución
  // presupuestaria, el presupuesto y el PMP, así que envejece como ellos. Se
  // añadió el 2026-08-12 junto con el paso que lo recompone: hasta entonces
  // sólo se regeneraba cuando alguien corría el comando a mano, y /eficiencia
  // publicaba porcentajes calculados sobre contratos de semanas atrás sin que
  // nada lo dijera.
  { file: 'indicadores.json', cls: 'derived' as const, maxAgeDays: 3 },
  // `dea.json` sale del mismo `coste-efectivo.json` y lo recompone la misma
  // nocturna, así que envejece igual. Va aparte de `coste-efectivo.json`
  // —excluido más abajo— porque lo que se vigila aquí no es el ritmo del
  // ministerio sino el de NUESTRO recálculo: si el volcado se revisa y nadie
  // rehace la frontera, la página publica una puntuación que ya no se
  // reproduce, y ése es justo el fallo que `check:dea` no puede ver solo (mide
  // que reproduce, no que sea reciente).
  { file: 'dea.json', cls: 'derived' as const, maxAgeDays: 3 },
  ...[
    'promises.json',
    'pleno-votes.json',
    'sindic.json',
    'dedicaciones.json',
    'plantilla.json',
    'eficiencia-findings.json',
  ].map((file) => ({ file, cls: 'curated' as const, maxAgeDays: 120 })),
  // DELIBERADAMENTE FUERA: `coste-efectivo.json` y `pmp.json`. Su ritmo lo
  // marca el ministerio —una entrega al año y un trimestre respectivamente— y
  // no hay clase con ese presupuesto. Meterlos con un plazo corto los dejaría
  // rojos de forma permanente, que es como se consigue que nadie lea el check.
]

export function classifyFreshness(
  facts: SnapshotFacts[],
  expectations: DatasetExpectation[] = DEFAULT_EXPECTATIONS,
): FreshnessRow[] {
  const byFile = new Map(expectations.map((e) => [e.file, e]))
  const out: FreshnessRow[] = []
  for (const f of facts) {
    const exp = byFile.get(f.file)
    if (!exp) continue
    // A retired upstream is a KNOWN end-of-life, not a silent stall. Reporting
    // it as "stale" every night would train everyone to ignore the check.
    if (f.upstreamStatus === 'retired') {
      out.push({
        file: f.file,
        cls: exp.cls,
        ageDays: f.ageDays,
        status: 'retired',
        note: 'upstream retired — frozen on purpose, surfaced in the UI',
      })
      continue
    }
    if (f.ageDays == null) {
      out.push({
        file: f.file,
        cls: exp.cls,
        ageDays: null,
        status: 'unknown',
        note: 'no generatedAt',
      })
      continue
    }
    if (f.ageDays > exp.maxAgeDays) {
      out.push({
        file: f.file,
        cls: exp.cls,
        ageDays: f.ageDays,
        status: 'stale',
        note:
          exp.cls === 'ci-blocked'
            ? `>${exp.maxAgeDays}d — CI cannot reach this source; run scripts/scrape-ci-blocked.sh`
            : `>${exp.maxAgeDays}d for a ${exp.cls} dataset`,
      })
      continue
    }
    out.push({ file: f.file, cls: exp.cls, ageDays: f.ageDays, status: 'ok', note: '' })
  }
  return out
}
