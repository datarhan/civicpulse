/**
 * ¿De qué transcripción procede cada literal publicado en /hallazgos?
 *
 * Estas pruebas se corren contra los ficheros PUBLICADOS —el snapshot de
 * hallazgos y el corpus de transcripciones reales—, no contra un fixture
 * inventado: la regla más cara de este repo es que seis pruebas recitaron una
 * forma en vez de importarla y siguieron verdes mientras producción no encajaba
 * con nada.
 *
 * Y todas afirman que la pasada EVALUÓ algo. Un cotejador que no coteja marcaría
 * las 177 citas y se leería como exhaustivo, así que el control positivo —una
 * cita que SÍ está en el texto vigente no se marca— es la mitad de la suite, no
 * un extra.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  buildQuoteProvenance,
  classifyQuoteProvenance,
  diffProvenance,
  MARKED_STATUS_IDS,
  provenanceSanityFailure,
  PROVENANCE_VERSION,
  QUOTE_PROVENANCE_STATUS_IDS,
  sessionIsComparable,
  UNDETERMINED_REASON_IDS,
  type QuoteProvenanceSnapshot,
  type SessionTexts,
} from '../src/scraper/quote-provenance'
import { quoteAppearsIn } from '../src/scraper/quote-match'
import { validateFindingsSnapshot } from '../src/scraper/pleno-finding'
import { loadSessionTexts } from '../scripts/lib/transcript-corpus'

const ROOT = join(__dirname, '..')
const FINDINGS = validateFindingsSnapshot(
  readFileSync(join(ROOT, 'public/data/pleno-findings.json'), 'utf8'),
)
const PUBLISHED = JSON.parse(
  readFileSync(join(ROOT, 'public/data/finding-quote-provenance.json'), 'utf8'),
) as QuoteProvenanceSnapshot

const SESSIONS = loadSessionTexts(
  FINDINGS.items.map((f) => f.plenoId),
  {
    transcriptsDir: join(ROOT, 'public/data/pleno-transcripts'),
    supersededDir: join(ROOT, 'public/data/pleno-transcripts/superseded'),
  },
)

const DERIVED = buildQuoteProvenance(FINDINGS.items, SESSIONS, {
  generatedAt: '2026-08-10T00:00:00.000Z',
  findingsGeneratedAt: FINDINGS.generatedAt,
})

/** Cada cita publicada, con su ficha y su índice. El denominador de todo. */
const ALL_QUOTES = FINDINGS.items.flatMap((f) =>
  (f.quotes ?? []).map((q, i) => ({ finding: f, quote: q, index: i })),
)

describe('el snapshot cubre TODAS las citas publicadas', () => {
  it('no deja caer ni una: filas + no clasificadas = citas del snapshot', () => {
    // Que la comprobación mide algo: con el snapshot vacío esta prueba pasaría
    // comparando 0 con 0 sin haber examinado nada.
    expect(ALL_QUOTES.length).toBeGreaterThan(150)
    const rows = Object.values(DERIVED.quotes).reduce((n, r) => n + r.length, 0)
    expect(rows + DERIVED.unresolved.length).toBe(ALL_QUOTES.length)
    expect(DERIVED.stats.quotes).toBe(ALL_QUOTES.length)
  })

  it('trae una entrada por hallazgo, en el mismo orden que sus citas', () => {
    expect(Object.keys(DERIVED.quotes).sort()).toEqual(FINDINGS.items.map((f) => f.id).sort())
    for (const f of FINDINGS.items) {
      expect(DERIVED.quotes[f.id]).toHaveLength((f.quotes ?? []).length)
    }
  })

  it('el fichero publicado dice lo mismo que las transcripciones de hoy', () => {
    // La garantía de que la marca de /hallazgos no puede quedarse callada: si
    // alguien corrige una cita, re-transcribe una sesión o promueve un hallazgo
    // sin regenerar, esto se pone rojo (y con él `check:finding-quotes`).
    expect(PUBLISHED.version).toBe(PROVENANCE_VERSION)
    expect(diffProvenance(PUBLISHED, DERIVED)).toEqual([])
  })

  it('cada estado publicado es uno de los tres del enum, y ninguno inventado', () => {
    const seen = new Set<string>()
    for (const rows of Object.values(PUBLISHED.quotes)) {
      for (const r of rows) {
        expect(QUOTE_PROVENANCE_STATUS_IDS).toContain(r.status)
        if (r.reason) expect(UNDETERMINED_REASON_IDS).toContain(r.reason)
        seen.add(r.status)
      }
    }
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('los tres estados son alcanzables, y cada uno sobre datos reales', () => {
  it('«en la transcripción vigente» ocurre', () => {
    expect(DERIVED.stats.enVigente).toBeGreaterThan(0)
  })

  it('«sólo en la sustituida» ocurre', () => {
    expect(DERIVED.stats.soloEnSustituida).toBeGreaterThan(0)
  })

  it('«sin determinar» ocurre, y sale de una sesión cuyo texto nuevo es MÁS CORTO', () => {
    expect(DERIVED.stats.sinDeterminar).toBeGreaterThan(0)
    expect(DERIVED.stats.sinDeterminarPorTranscripcionMasCorta).toBe(DERIVED.stats.sinDeterminar)
    // Y esas filas viven en sesiones que el snapshot marca como no comparables:
    // el estado no puede aparecer en una sesión donde la pasada nueva dice más.
    for (const [id, rows] of Object.entries(DERIVED.quotes)) {
      const plenoId = FINDINGS.items.find((f) => f.id === id)!.plenoId
      if (rows.some((r) => r.status === 'sin-determinar')) {
        expect(DERIVED.sessions[plenoId].comparable).toBe(false)
        expect(DERIVED.sessions[plenoId].bytesVigente).toBeLessThan(
          DERIVED.sessions[plenoId].bytesSustituida,
        )
      }
    }
  })

  it('los tres suman exactamente las citas evaluadas', () => {
    const { enVigente, soloEnSustituida, sinDeterminar, sinClasificar, quotes } = DERIVED.stats
    expect(enVigente + soloEnSustituida + sinDeterminar + sinClasificar).toBe(quotes)
  })

  it('«sin determinar» NO se pliega sobre «sólo en la sustituida»', () => {
    // El sentinel nunca es un valor: las cuatro sesiones cuyo texto vigente es
    // más corto no pueden contarse como prueba contra el motor viejo.
    const shorter = Object.entries(DERIVED.sessions).filter(([, s]) => !s.comparable)
    expect(shorter.length).toBeGreaterThan(0)
    for (const [plenoId] of shorter) {
      const ids = FINDINGS.items.filter((f) => f.plenoId === plenoId).map((f) => f.id)
      for (const id of ids) {
        expect(DERIVED.quotes[id].every((r) => r.status !== 'solo-en-sustituida')).toBe(true)
      }
    }
  })
})

describe('control positivo — la regla no puede ser «marcarlo todo»', () => {
  it('una cita que SÍ está en la transcripción vigente no se marca', () => {
    let checked = 0
    for (const { finding, index } of ALL_QUOTES) {
      const entry = DERIVED.quotes[finding.id][index]
      if (entry?.status !== 'en-vigente') continue
      checked += 1
      const text = (finding.quotes![index].text ?? '').trim()
      expect(quoteAppearsIn(text, SESSIONS.get(finding.plenoId)!.current!)).toBe(true)
      expect(MARKED_STATUS_IDS).not.toContain(entry.status)
    }
    // Sin esto, «0 de 0 comprobadas» pasaría como verde.
    expect(checked).toBeGreaterThan(50)
  })

  it('una cita marcada NO está en la transcripción vigente', () => {
    let checked = 0
    for (const { finding, index } of ALL_QUOTES) {
      const entry = DERIVED.quotes[finding.id][index]
      if (!entry || !MARKED_STATUS_IDS.includes(entry.status)) continue
      checked += 1
      const text = (finding.quotes![index].text ?? '').trim()
      const current = SESSIONS.get(finding.plenoId)!.current
      expect(current === null || quoteAppearsIn(text, current)).toBe(false)
    }
    expect(checked).toBeGreaterThan(50)
  })

  it('la muestra real trae los dos lados: hay marcadas y hay sin marcar', () => {
    const marked = Object.values(DERIVED.quotes)
      .flat()
      .filter((r) => MARKED_STATUS_IDS.includes(r.status)).length
    expect(marked).toBeGreaterThan(0)
    expect(DERIVED.stats.enVigente).toBeGreaterThan(0)
    expect(marked).toBeLessThan(DERIVED.stats.quotes)
  })
})

describe('classifyQuoteProvenance — el árbol de decisión, rama a rama', () => {
  const words = (n: number, seed: string) =>
    Array.from({ length: n }, (_, i) => `${seed}${i}`).join(' ')
  const QUOTE = words(12, 'palabra')
  const withQuote = `ruido previo ${QUOTE} ruido posterior`

  const session = (o: Partial<SessionTexts>): SessionTexts => ({
    current: null,
    superseded: null,
    currentBytes: 0,
    supersededBytes: 0,
    ...o,
  })

  it('está en el texto vigente → en-vigente, aunque el vigente sea más corto', () => {
    const r = classifyQuoteProvenance(
      QUOTE,
      session({
        current: withQuote,
        currentBytes: 10,
        superseded: withQuote,
        supersededBytes: 999,
      }),
    )
    expect(r).toEqual({ kind: 'clasificada', status: 'en-vigente', reason: null })
  })

  it('sólo en el sustituido y el vigente es mayor → solo-en-sustituida', () => {
    const r = classifyQuoteProvenance(
      QUOTE,
      session({
        current: words(40, 'otra'),
        currentBytes: 900,
        superseded: withQuote,
        supersededBytes: 100,
      }),
    )
    expect(r).toEqual({ kind: 'clasificada', status: 'solo-en-sustituida', reason: null })
  })

  it('sólo en el sustituido y el vigente es MENOR → sin-determinar', () => {
    const r = classifyQuoteProvenance(
      QUOTE,
      session({
        current: words(40, 'otra'),
        currentBytes: 100,
        superseded: withQuote,
        supersededBytes: 900,
      }),
    )
    expect(r).toEqual({
      kind: 'clasificada',
      status: 'sin-determinar',
      reason: 'transcripcion-actual-mas-corta',
    })
  })

  it('sin transcripción vigente → sin-determinar, con su motivo propio', () => {
    // Cero en los datos de hoy, pero es un motivo distinto y se cuenta aparte:
    // así una causa nueva no se esconde dentro de un «sin determinar» que crece.
    const r = classifyQuoteProvenance(QUOTE, session({ superseded: withQuote, supersededBytes: 1 }))
    expect(r).toEqual({
      kind: 'clasificada',
      status: 'sin-determinar',
      reason: 'sin-transcripcion-vigente',
    })
  })

  it('en ninguna de las dos → no es un estado: sale como no-localizada', () => {
    const r = classifyQuoteProvenance(
      'el alcalde reconoció que había cobrado una comisión de la empresa adjudicataria',
      session({
        current: words(40, 'otra'),
        currentBytes: 900,
        superseded: words(40, 'vieja'),
        supersededBytes: 100,
      }),
    )
    expect(r.kind).toBe('no-localizada')
  })

  it('una cita vacía no se etiqueta con nada', () => {
    const r = classifyQuoteProvenance('   ', session({ current: withQuote, currentBytes: 1 }))
    expect(r.kind).toBe('no-localizada')
  })

  it('sessionIsComparable: empatar en bytes cuenta como comparable, no como duda', () => {
    expect(
      sessionIsComparable(
        session({ current: 'a', currentBytes: 5, superseded: 'b', supersededBytes: 5 }),
      ),
    ).toBe(true)
    expect(
      sessionIsComparable(
        session({ current: 'a', currentBytes: 4, superseded: 'b', supersededBytes: 5 }),
      ),
    ).toBe(false)
    expect(sessionIsComparable(session({ current: 'a', currentBytes: 4 }))).toBe(true)
    expect(sessionIsComparable(session({ superseded: 'b', supersededBytes: 5 }))).toBe(false)
  })
})

describe('una pasada tiene que demostrar que midió algo', () => {
  const base = DERIVED.stats

  it('la pasada real pasa su propia comprobación de cordura', () => {
    expect(provenanceSanityFailure(base)).toBeNull()
    expect(base.bytesLeidos).toBeGreaterThan(1_000_000)
  })

  it('un cotejador que no coteja se declara roto en vez de marcarlo todo', () => {
    const nothing = {
      ...base,
      enVigente: 0,
      soloEnSustituida: base.enVigente + base.soloEnSustituida,
    }
    expect(provenanceSanityFailure(nothing)).toMatch(/no coteja/)
  })

  it('un corpus que no está donde se busca se declara roto', () => {
    expect(provenanceSanityFailure({ ...base, bytesLeidos: 0 })).toMatch(/un solo byte/)
  })

  it('una fila perdida por el camino se declara rota', () => {
    expect(provenanceSanityFailure({ ...base, quotes: base.quotes + 1 })).toMatch(/se perdió/)
  })

  it('un «sin determinar» sin motivo nombrado se declara roto', () => {
    // Los totales cuadran (una cita más, una «sin determinar» más) y aun así
    // los motivos ya no suman: la causa nueva no tiene nombre.
    expect(
      provenanceSanityFailure({
        ...base,
        sinDeterminar: base.sinDeterminar + 1,
        quotes: base.quotes + 1,
      }),
    ).toMatch(/una causa sin nombre/)
  })

  it('sin citas que evaluar no se declara sano', () => {
    expect(provenanceSanityFailure({ ...base, quotes: 0 })).toMatch(/ninguna cita evaluada/)
  })
})

describe('diffProvenance — la marca publicada no puede quedarse callada', () => {
  it('no hay diferencia consigo mismo', () => {
    expect(diffProvenance(DERIVED, DERIVED)).toEqual([])
  })

  it('detecta un estado que cambió bajo los pies de la página', () => {
    // Un hallazgo cuya primera cita está marcada: reescribirla como sana es
    // exactamente la forma que tendría una marca que se quedó vieja.
    const id = Object.keys(DERIVED.quotes).find(
      (k) => DERIVED.quotes[k][0] && MARKED_STATUS_IDS.includes(DERIVED.quotes[k][0].status),
    )!
    expect(id).toBeTruthy()
    const stale = JSON.parse(JSON.stringify(DERIVED)) as QuoteProvenanceSnapshot
    stale.quotes[id][0] = { status: 'en-vigente' }
    const out = diffProvenance(stale, DERIVED)
    // Puede además desajustar los totales; lo que importa es que NOMBRE la fila.
    expect(out.some((m) => m.startsWith(`${id}[0]`))).toBe(true)
  })

  it('detecta un hallazgo nuevo sin fila publicada', () => {
    const stale = JSON.parse(JSON.stringify(DERIVED)) as QuoteProvenanceSnapshot
    const id = Object.keys(stale.quotes)[0]
    delete stale.quotes[id]
    expect(diffProvenance(stale, DERIVED)).toContain(`${id}: hallazgo sin fila publicada`)
  })

  it('no hay snapshot publicado ⇒ eso ES una diferencia, no un silencio', () => {
    expect(diffProvenance(null, DERIVED)).toHaveLength(1)
  })

  it('no confunde un `generatedAt` distinto con una divergencia', () => {
    const other = { ...DERIVED, generatedAt: '1999-01-01T00:00:00.000Z' }
    expect(diffProvenance(other, DERIVED)).toEqual([])
  })
})
