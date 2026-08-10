/**
 * ¿Dice el snapshot lo que la puerta editorial dice, sobre TODAS las citas
 * publicadas, y sobre el veredicto que de verdad se publica?
 *
 * Dos trampas, y las dos se han caído ya:
 *
 * 1. Una pasada que no case con nada marcaría las 177 citas y parecería
 *    exhaustiva. Así que cada afirmación va emparejada con su control: hay
 *    citas marcadas Y hay citas sin marcar, y los tres estados de la puerta
 *    aparecen sobre datos reales.
 *
 * 2. Leer `pleno-claims-verified-base.json` a secas —la pasada determinista sin
 *    el overlay— también case con todo, también parece exhaustivo, y da la
 *    respuesta CONTRARIA: sobre la base sola la puerta mostraría 149 de las 177
 *    citas; con el overlay aplicado muestra 16. Es el error que produjo la
 *    primera medición de este problema. Aquí se fija con nombre y apellidos:
 *    una claim concreta que la base clasifica `shown` y el veredicto vigente
 *    `hidden`, y el snapshot publicado tiene que traer la segunda.
 *
 * Todo contra los ficheros REALES. Un fixture inventado respondería a la
 * pregunta con lo que esperaba quien lo escribió.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  classifyClaimVisibility,
  CLAIM_VISIBILITIES,
  type ClaimVisibility,
} from '../src/scraper/claim-public-gate'
import {
  buildQuoteContrast,
  contrastSanityFailure,
  MARKED_CONTRAST_IDS,
  QUOTE_CONTRAST_STATES,
  type QuoteContrastStats,
} from '../src/scraper/quote-contrast'
import { validateFindingsSnapshot } from '../src/scraper/pleno-finding'
import {
  snapshotSanityFailure,
  type QuoteProvenanceSnapshot,
} from '../src/scraper/quote-provenance'
import { loadVerifiedCorpus } from '../scripts/lib/verified-corpus'

const ROOT = join(__dirname, '..')
const FINDINGS = validateFindingsSnapshot(
  readFileSync(join(ROOT, 'public/data/pleno-findings.json'), 'utf8'),
)
const PUBLISHED = JSON.parse(
  readFileSync(join(ROOT, 'public/data/finding-quote-provenance.json'), 'utf8'),
) as QuoteProvenanceSnapshot

const CORPUS = loadVerifiedCorpus({
  basePath: join(ROOT, 'public/data/pleno-claims-verified-base.json'),
  overlayPath: join(ROOT, 'public/data/pleno-claims-overlay.json'),
})
const DERIVED = buildQuoteContrast(FINDINGS.items, CORPUS)

/** Cada cita publicada, con su ficha y su índice. El denominador de todo. */
const ALL_QUOTES = FINDINGS.items.flatMap((f) =>
  (f.quotes ?? []).map((q, i) => ({ finding: f, quote: q, index: i })),
)

describe('la puerta se aplica a TODAS las citas publicadas', () => {
  it('no deja caer ni una: una fila con veredicto por cita', () => {
    // Que la comprobación mide algo: con el snapshot vacío pasaría comparando
    // 0 con 0 sin haber preguntado nada a la puerta.
    expect(ALL_QUOTES.length).toBeGreaterThan(150)
    expect(DERIVED.stats.citasConClaim).toBe(ALL_QUOTES.length)
    expect(DERIVED.stats.citasSinClaim).toBe(0)
    const filas = Object.values(DERIVED.rows).reduce((n, r) => n + r.length, 0)
    expect(filas).toBe(ALL_QUOTES.length)
  })

  it('los contadores cuadran con una pasada directa de classifyClaimVisibility', () => {
    // El control cruzado: se vuelve a clasificar aquí, sin pasar por el
    // constructor, y tiene que salir lo mismo. Si el constructor se saltara
    // filas en silencio, los dos números divergirían.
    const directo = Object.fromEntries(CLAIM_VISIBILITIES.map((v) => [v, 0])) as Record<
      ClaimVisibility,
      number
    >
    for (const { quote } of ALL_QUOTES) {
      const item = CORPUS.merged.get(quote.sourceClaimId ?? '')
      expect(item).toBeTruthy()
      directo[classifyClaimVisibility(item!)] += 1
    }
    expect(DERIVED.stats.porContraste).toEqual(directo)
    expect(directo.shown + directo.toggle + directo.hidden).toBe(ALL_QUOTES.length)
  })

  it('el fichero publicado trae el mismo veredicto que se deriva hoy', () => {
    for (const f of FINDINGS.items) {
      const pub = PUBLISHED.quotes[f.id] ?? []
      const der = DERIVED.rows[f.id] ?? []
      expect(pub).toHaveLength(der.length)
      der.forEach((row, i) => expect(pub[i]?.gate).toBe(row?.gate ?? null))
    }
  })

  it('cada veredicto publicado es uno del enum de la puerta, ninguno inventado', () => {
    const seen = new Set<string>()
    for (const rows of Object.values(PUBLISHED.quotes)) {
      for (const r of rows) {
        expect(CLAIM_VISIBILITIES).toContain(r.gate)
        seen.add(String(r.gate))
      }
    }
    // Más de uno: un fichero entero de `hidden` sería indistinguible de un
    // clasificador atascado en su valor por defecto.
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('EL OVERLAY ESTÁ APLICADO — y sin él la respuesta es la contraria', () => {
  /**
   * La claim de referencia: 1237hbp-041-acu-3157f8. La pasada determinista la
   * dejó en `parcial` (la puerta la mostraría); el motor de veredictos la bajó
   * a `sin-datos`, y como es una `acusacion_publica` la puerta la retiene. Base
   * y merge no discrepan en un matiz: discrepan en si se publica o no.
   */
  const CLAIM = '1237hbp-041-acu-3157f8'

  it('la claim de referencia existe en las DOS mitades del corpus', () => {
    // Sin esto, un id que dejara de existir convertiría las dos pruebas de
    // abajo en comparaciones de undefined con undefined.
    expect(CORPUS.base.get(CLAIM)).toBeTruthy()
    expect(CORPUS.merged.get(CLAIM)).toBeTruthy()
  })

  it('la base sola y el veredicto vigente NO coinciden en esa claim', () => {
    const base = classifyClaimVisibility(CORPUS.base.get(CLAIM)!)
    const merged = classifyClaimVisibility(CORPUS.merged.get(CLAIM)!)
    expect(base).toBe('shown')
    expect(merged).toBe('hidden')
  })

  it('el snapshot publicado trae el veredicto FUSIONADO, no el de la base', () => {
    const rows = Object.entries(PUBLISHED.quotes)
    const found = rows.flatMap(([findingId, entries]) => {
      const f = FINDINGS.items.find((x) => x.id === findingId)
      return (f?.quotes ?? []).flatMap((q, i) =>
        q.sourceClaimId === CLAIM ? [{ findingId, gate: entries[i]?.gate }] : [],
      )
    })
    expect(found.length).toBeGreaterThan(0)
    for (const hit of found) expect(hit.gate).toBe('hidden')
  })

  it('no es un caso aislado: la base sola reclasificaría a la mayoría', () => {
    // La medida que hace imposible enviar el error: si alguien cambiara el
    // constructor para leer la base, este número caería a 0 y la pasada se
    // negaría a escribir.
    expect(DERIVED.stats.citasReclasificadasPorElOverlay).toBeGreaterThan(100)
    expect(DERIVED.stats.citasConVeredictoDeOverlay).toBeGreaterThan(100)
    expect(DERIVED.stats.entradasDeOverlay).toBeGreaterThan(0)
  })

  it('clasificar la base como si fuera el veredicto vigente da otro sitio', () => {
    // El control positivo de la prueba anterior: se hace a propósito el error,
    // y se comprueba que produce un resultado DISTINTO. Sin esto,
    // «reclasificadas > 100» podría estar midiendo cualquier cosa.
    const soloBase = buildQuoteContrast(FINDINGS.items, {
      merged: CORPUS.base,
      base: CORPUS.base,
      overlayEntries: CORPUS.overlayEntries,
    })
    expect(soloBase.stats.porContraste.shown).toBeGreaterThan(DERIVED.stats.porContraste.shown * 5)
    expect(soloBase.stats.porContraste.hidden).toBeLessThan(DERIVED.stats.porContraste.hidden)
    expect(soloBase.stats.hallazgosSinCitaMostrable).toBeLessThan(
      DERIVED.stats.hallazgosSinCitaMostrable,
    )
  })

  it('y la pasada se NIEGA a escribirlo: el overlay tenía entradas y no llegó ninguna', () => {
    const soloBase = buildQuoteContrast(FINDINGS.items, {
      merged: CORPUS.base,
      base: CORPUS.base,
      overlayEntries: CORPUS.overlayEntries,
    })
    expect(contrastSanityFailure(soloBase.stats)).toMatch(/sin fusionar/)
    // Y la buena pasa.
    expect(contrastSanityFailure(DERIVED.stats)).toBeNull()
  })
})

describe('«retenida» y «sin contraste» son dos hechos distintos', () => {
  it('los dos ocurren sobre datos reales, y también el tercero', () => {
    expect(DERIVED.stats.porContraste.hidden).toBeGreaterThan(0)
    expect(DERIVED.stats.porContraste.toggle).toBeGreaterThan(0)
    expect(DERIVED.stats.porContraste.shown).toBeGreaterThan(0)
  })

  it('el snapshot los guarda por separado, con el vocabulario de la puerta', () => {
    const gates = new Set<string>()
    for (const rows of Object.values(PUBLISHED.quotes))
      for (const r of rows) gates.add(String(r.gate))
    expect(gates.has('hidden')).toBe(true)
    expect(gates.has('toggle')).toBe(true)
    expect(gates.has('shown')).toBe(true)
  })

  it('sólo dos de los tres marcan al lector, y `shown` no es uno de ellos', () => {
    expect([...MARKED_CONTRAST_IDS].sort()).toEqual(['hidden', 'toggle'])
    expect(MARKED_CONTRAST_IDS).not.toContain('shown')
  })

  it('cada estado del enum tiene su definición, y ninguna se repite', () => {
    expect(QUOTE_CONTRAST_STATES.map((s) => s.id)).toEqual([...CLAIM_VISIBILITIES])
    const meanings = new Set(QUOTE_CONTRAST_STATES.map((s) => s.meaning))
    expect(meanings.size).toBe(QUOTE_CONTRAST_STATES.length)
  })

  it('toda cita retenida es una acusación — es lo que dice la marca al lector', () => {
    // La redacción publicada para `hidden` dice «acusación». Si la puerta
    // empezara a retener otra cosa (un `contradicho` de máquina sobre una
    // afirmación ordinaria), esa frase pasaría a ser falsa, y este control es
    // el que lo caza.
    let retenidas = 0
    for (const { quote } of ALL_QUOTES) {
      const item = CORPUS.merged.get(quote.sourceClaimId ?? '')!
      if (classifyClaimVisibility(item) !== 'hidden') continue
      retenidas += 1
      expect((item.claim as { type?: string })?.type).toBe('acusacion_publica')
    }
    expect(retenidas).toBe(DERIVED.stats.porContraste.hidden)
    expect(retenidas).toBeGreaterThan(0)
  })
})

describe('los hallazgos sin ninguna cita mostrable, contados', () => {
  it('coinciden con un recuento directo sobre las mismas fichas', () => {
    const sinMostrable = FINDINGS.items.filter((f) => {
      const quotes = f.quotes ?? []
      if (quotes.length === 0) return false
      return !quotes.some(
        (q) => classifyClaimVisibility(CORPUS.merged.get(q.sourceClaimId ?? '')!) === 'shown',
      )
    })
    expect(DERIVED.stats.hallazgosSinCitaMostrable).toBe(sinMostrable.length)
    expect(sinMostrable.length).toBeGreaterThan(0)
    // Y el control: NO son todos. Un contador que marcara las 52 estaría
    // midiendo la existencia de fichas, no la de citas sin contraste.
    expect(sinMostrable.length).toBeLessThan(FINDINGS.items.length)
  })

  it('las hechas por entero de citas retenidas son un subconjunto propio', () => {
    expect(DERIVED.stats.hallazgosSoloConCitasOcultas).toBeGreaterThan(0)
    expect(DERIVED.stats.hallazgosSoloConCitasOcultas).toBeLessThan(
      DERIVED.stats.hallazgosSinCitaMostrable,
    )
  })
})

describe('el control positivo: una cita contrastada no lleva marca', () => {
  it('hay citas que la puerta publicaría, y sus filas dicen `shown`', () => {
    const mostrables = ALL_QUOTES.filter(
      ({ quote }) =>
        classifyClaimVisibility(CORPUS.merged.get(quote.sourceClaimId ?? '')!) === 'shown',
    )
    expect(mostrables.length).toBeGreaterThan(0)
    for (const { finding, index } of mostrables) {
      expect(PUBLISHED.quotes[finding.id]?.[index]?.gate).toBe('shown')
    }
  })

  it('y `shown` no está entre los estados que marcan', () => {
    const state = QUOTE_CONTRAST_STATES.find((s) => s.id === 'shown')!
    expect(state.marks).toBe(false)
  })
})

describe('la pasada afirma que evaluó algo antes de afirmar lo que encontró', () => {
  const base: QuoteContrastStats = DERIVED.stats

  it('la pasada real se declara sana', () => {
    expect(contrastSanityFailure(base)).toBeNull()
    expect(snapshotSanityFailure(PUBLISHED)).toBeNull()
  })

  it('un corpus vacío se declara roto en vez de no marcar nada', () => {
    expect(contrastSanityFailure({ ...base, claimsEnCorpus: 0 })).toMatch(/corpus del verificador/)
  })

  it('una cita sin claim se declara rota: saldría sin marca, o sea contrastada', () => {
    expect(contrastSanityFailure({ ...base, citasSinClaim: 3 })).toMatch(/sin marca/)
  })

  it('un estado sin contar se declara roto', () => {
    expect(contrastSanityFailure({ ...base, citasConClaim: base.citasConClaim + 1 })).toMatch(
      /un estado sin contar/,
    )
  })

  it('sin citas que evaluar no se declara sano', () => {
    expect(
      contrastSanityFailure({
        ...base,
        citasConClaim: 0,
        citasSinClaim: 0,
        porContraste: { shown: 0, toggle: 0, hidden: 0 },
      }),
    ).toMatch(/ninguna cita evaluada/)
  })
})
