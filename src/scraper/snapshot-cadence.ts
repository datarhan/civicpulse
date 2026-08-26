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

export type FreshnessClass = 'nightly' | 'ci-blocked' | 'curated' | 'derived' | 'manual'

export interface DatasetExpectation {
  file: string
  cls: FreshnessClass
  /** Days after which this is worth a human's attention. */
  maxAgeDays: number
  /** Qué correr cuando caduque — para las clases donde no basta con «espera». */
  hint?: string
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
  // `quejas.json` NO sale de la nocturna: lo trae `pull-quejas.yml` cada día
  // desde el bot en Fly.io. Estaba fuera del registro, así que si ese workflow
  // se rompiera nadie lo diría — la misma forma exacta que los seis
  // adaptadores CI-blocked de arriba, que es de donde nace este fichero.
  { file: 'quejas.json', cls: 'nightly' as const, maxAgeDays: 3 },
  ...[
    'plenos-agendas.json',
    'consell-cv.json',
    'procesos-selectivos.json',
    'asociaciones.json',
    'obras.json',
    'sindicatura.json',
    // `sindic-expedientes.json` va aquí no porque se sepa que CI no llega
    // —está sin medir— sino porque entra en blando en la nocturna y su
    // refresco garantizado es el cron local. Si algún día se comprueba que el
    // runner alcanza elsindic.com, pasa a `nightly` con su plazo de 3 días.
    'sindic-expedientes.json',
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
  // Clase `manual`: fuentes cuyo ritmo lo marca el ministerio y cuyo refresco
  // no lo corre nadie más que una persona. Estuvieron DELIBERADAMENTE FUERA con
  // el argumento de que un plazo corto las dejaría rojas de forma permanente —
  // cierto, y la respuesta correcta es un presupuesto LARGO, no la ausencia:
  // fuera del check, que `scrape:pmp` dejara de correrse para siempre no lo
  // decía nada, y el PMP es trimestral y alimenta una ficha firmada.
  {
    file: 'pmp.json',
    cls: 'manual' as const,
    // Un trimestre (~91 días) + el margen con el que publica el ministerio.
    maxAgeDays: 130,
    hint: 'npm run scrape:pmp',
  },
  {
    file: 'coste-efectivo.json',
    cls: 'manual' as const,
    // Una entrega al año, publicada en otoño; 430 cubre el ciclo con margen.
    maxAgeDays: 430,
    hint: 'npm run fetch:cesel-ccaa && npm run scrape:coste-efectivo',
  },
  {
    file: 'coste-esperado.json',
    cls: 'manual' as const,
    // Sale de los libros CCAA-17 cacheados, que cambian con la entrega anual.
    // NO se recompone en el nocturno a propósito: recalcular sobre la misma
    // caché sólo cambiaría generatedAt y churnaría un fichero de 300 KB cada
    // noche. Si los libros se refrescan sin recomponer, check:coste-esperado
    // (crítica) lo dice esa misma noche — esto sólo vigila el olvido largo.
    maxAgeDays: 430,
    hint: 'npm run fetch:cesel-ccaa && npm run compute:coste-esperado',
  },
  {
    file: 'criminalidad.json',
    cls: 'manual' as const,
    // Balance T4 anual, publicado a comienzos del año siguiente.
    maxAgeDays: 420,
    hint: 'npm run scrape:criminalidad',
  },
  {
    file: 'reciclaje.json',
    cls: 'manual' as const,
    // Corte único (edición 2022; upstream congelado en un visor sin datos).
    // Presupuesto larguísimo a propósito: el aviso sólo debe llegar cuando
    // toque re-mirar si el ICV volvió a publicar descarga; si no lo hizo,
    // la respuesta de entonces será marcar upstream retired, no correr nada.
    maxAgeDays: 800,
    hint: 'npm run scrape:reciclaje -- --refetch',
  },
  {
    file: 'ipc.json',
    cls: 'manual' as const,
    // La media anual sólo cambia cuando el INE cierra un año; con 400 días el
    // aviso llega cuando de verdad falta la media del año anterior.
    maxAgeDays: 400,
    hint: 'npm run scrape:ipc',
  },
]

/**
 * La expectativa registrada para un fichero, o `null` si no hay ninguna.
 *
 * Existe para que el lado UI (`src/lib/data-freshness.js`) pueda juzgar un
 * `generatedAt` contra el MISMO plazo que esta puerta, en vez de contra un
 * umbral plano. Sin esto, `promises.json` a 51 días salía verde aquí y rojo
 * «likely broken» en /departamentos: un fichero, dos veredictos, y al lector
 * se le enseñaba el que asusta.
 *
 * Acepta el nombre suelto y también la ruta con la que lo piden los hooks del
 * SPA: se queda con el último segmento antes de buscar.
 */
export function expectationFor(
  file: string | null | undefined,
  expectations: DatasetExpectation[] = DEFAULT_EXPECTATIONS,
): DatasetExpectation | null {
  if (!file) return null
  const base = file.split('/').pop()
  return expectations.find((e) => e.file === base) ?? null
}

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
        note: exp.hint
          ? `>${exp.maxAgeDays}d — refresh path is manual; run ${exp.hint}`
          : exp.cls === 'ci-blocked'
            ? `>${exp.maxAgeDays}d — CI cannot reach this source; run scripts/scrape-ci-blocked.sh`
            : `>${exp.maxAgeDays}d for a ${exp.cls} dataset`,
      })
      continue
    }
    out.push({ file: f.file, cls: exp.cls, ageDays: f.ageDays, status: 'ok', note: '' })
  }
  return out
}
