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
  monolithPath: join(ROOT, 'public/data/pleno-claims-verified.json'),
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
    expect(ALL_QUOTES.length).toBeGreaterThan(120)
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

/**
 * Estado transitorio de base sembrada: `migrate:verified-split` (o su gesto, un
 * `cp` del monolito publicado) deja una base que YA ABSORBE los veredictos del
 * overlay, así que la discrepancia base-vs-merge que este bloque atestigua no
 * existe por construcción — no porque el merge no corra (la reclasificación
 * viva lo prueba: sólo un merge ejecutado puede moverla). Saltar con el motivo
 * impreso, no fallar: en el checkout con base determinista el bloque corre
 * entero, y un fallo aquí seguiría delatando una base real leída sin fusionar.
 */
const BASE_SEMBRADA =
  DERIVED.stats.entradasDeOverlay > 0 &&
  DERIVED.stats.citasConVeredictoDeOverlay === 0 &&
  DERIVED.stats.citasReclasificadasPorElOverlay > 0
const SIN_BASE = !DERIVED.stats.baseDisponible
if (BASE_SEMBRADA || SIN_BASE) {
  console.warn(
    '[quote-contrast.test] ' +
      (SIN_BASE
        ? 'base determinista ausente (CI / clon fresco)'
        : 'base sembrada desde el monolito publicado') +
      ' — el bloque «EL OVERLAY ESTÁ APLICADO» se salta con motivo: la discrepancia ' +
      'base-vs-fusionado que atestigua no existe en este estado por construcción.',
  )
}

describe.skipIf(BASE_SEMBRADA || SIN_BASE)(
  'EL OVERLAY ESTÁ APLICADO — y sin él la respuesta es la contraria',
  () => {
    /**
     * El testigo se BUSCA, no se escribe a mano.
     *
     * Era un id fijo, `1237hbp-041-acu-3157f8`, elegido porque la pasada
     * determinista lo dejaba en `parcial` (la puerta lo mostraría) y el motor de
     * veredictos lo bajaba a `sin-datos` (la puerta lo retiene, por ser
     * acusación). El 2026-08-15 dejó de servir: con la puerta pidiendo un
     * verificador anotado, la base también lo retiene, así que base y merge
     * coinciden y el testigo dejó de atestiguar nada.
     *
     * Un control contra el desfase que se desfasa él mismo es el chiste que este
     * repositorio ya ha contado dos veces (la tabla escrita a mano dentro del
     * control de prosa rancia). Así que se busca un testigo vivo entre las 299
     * citas donde base y merge discrepan, y si no hubiera ninguno el test lo dice
     * en vez de pasar en verde.
     */
    const testigos = [...CORPUS.base.keys()].flatMap((id) => {
      const b = CORPUS.base.get(id)
      const m = CORPUS.merged.get(id)
      if (!b || !m) return []
      const vb = classifyClaimVisibility(b)
      const vm = classifyClaimVisibility(m)
      return vb === 'shown' && vm !== 'shown' ? [{ id, vb, vm }] : []
    })

    it('hay citas cuya publicabilidad depende del overlay', () => {
      // Prueba de trabajo: sin testigos, las dos de abajo no comparan nada.
      expect(
        testigos.length,
        'ninguna cita cambia de publicable a retenida al aplicar el overlay',
      ).toBeGreaterThan(0)
    })

    it('en un testigo, base y veredicto vigente discrepan en SI SE PUBLICA', () => {
      const t = testigos[0]
      expect(classifyClaimVisibility(CORPUS.base.get(t.id)!)).toBe('shown')
      expect(classifyClaimVisibility(CORPUS.merged.get(t.id)!)).not.toBe('shown')
    })

    it('el snapshot publicado trae el veredicto FUSIONADO, no el de la base', () => {
      // Sobre los testigos que además estén citados por un hallazgo: el fichero
      // publicado tiene que coincidir con el merge, nunca con la base.
      const ids = new Set(testigos.map((t) => t.id))
      const found = Object.entries(PUBLISHED.quotes).flatMap(([findingId, entries]) => {
        const f = FINDINGS.items.find((x) => x.id === findingId)
        return (f?.quotes ?? []).flatMap((q, i) =>
          ids.has(q.sourceClaimId) ? [{ id: q.sourceClaimId, gate: entries[i]?.gate }] : [],
        )
      })
      expect(found.length, 'ningún testigo aparece citado en un hallazgo').toBeGreaterThan(0)
      for (const hit of found) {
        expect(hit.gate, `${hit.id} publicado con el veredicto de la base`).not.toBe('shown')
      }
    })

    it('no es un caso aislado: el overlay decide el veredicto de la mayoría', () => {
      // La medida directa: el overlay ALCANZA citas de hallazgo. Los suelos
      // numéricos que vivían aquí (>100, luego >10) eran constantes calibradas
      // a un estado de la base que caducó dos veces — la puerta exigiendo
      // verificador anotado y después la re-derivación completa del corpus —
      // exactamente el «control que se desfasa él mismo» del docblock de este
      // bloque. El hecho estable es la EXISTENCIA: el overlay decide veredictos
      // de citas publicadas (los testigos de arriba ya prueban que lo decide
      // con consecuencias); cuántas exactamente lo dice el stat publicado, no
      // este test.
      expect(DERIVED.stats.citasConVeredictoDeOverlay).toBeGreaterThan(0)
      expect(DERIVED.stats.entradasDeOverlay).toBeGreaterThan(0)
      expect(DERIVED.stats.citasReclasificadasPorElOverlay).toBeGreaterThan(0)
    })

    it('clasificar la base como si fuera el veredicto vigente da otro sitio', () => {
      // El control positivo: se comete el error a propósito y se comprueba que
      // produce un resultado DISTINTO.
      //
      // Antes comparaba direcciones —«sin overlay se mostrarían cinco veces más»—
      // y esa premisa se invirtió el 2026-08-15: las filas del overlay llevan
      // `llm-second-pass` o `curator-downgrade`, o sea un verificador anotado, y
      // las de la base con coincidencia léxica no llevan ninguno. Sin overlay hoy
      // se muestran MENOS (8 frente a 14), no más. Una aserción que da por
      // supuesto el sentido de la diferencia vuelve a romperse a la próxima, así
      // que se comprueba la FIRMA del error, que es exacta y no tiene sentido.
      const soloBase = buildQuoteContrast(FINDINGS.items, {
        merged: CORPUS.base,
        base: CORPUS.base,
        baseDisponible: true,
        overlayEntries: CORPUS.overlayEntries,
      })
      expect(soloBase.stats.citasConVeredictoDeOverlay).toBe(0)
      expect(soloBase.stats.citasReclasificadasPorElOverlay).toBe(0)
      // Y el reparto cambia: leer la base no es una diferencia cosmética.
      expect(soloBase.stats.porContraste).not.toEqual(DERIVED.stats.porContraste)
    })

    it('sin base (CI, clon fresco) las marcas salen idénticas y la pasada es sana', () => {
      // La cláusula que se negaba a escribir cuando «ninguna señal de fusión
      // llegó a una cita» se retiró con la verdad-monolito: el estado que
      // cazaba (clasificar la base como veredicto vigente) ya no tiene camino
      // fuera de un test — merged viene del fichero que sólo escribe
      // rebuildVerified — y el estado que teñía de rojo (base ausente en CI,
      // tres noches) es SANO: las marcas no dependen del contraste.
      const sinBase = buildQuoteContrast(FINDINGS.items, {
        merged: CORPUS.merged,
        base: new Map(),
        baseDisponible: false,
        overlayEntries: CORPUS.overlayEntries,
      })
      expect(sinBase.stats.baseDisponible).toBe(false)
      expect(sinBase.stats.citasConVeredictoDeOverlay).toBe(0)
      expect(sinBase.stats.citasReclasificadasPorElOverlay).toBe(0)
      // El invariante que compra el cambio entero: con o sin base, las MARCAS
      // publicadas son las mismas.
      expect(sinBase.stats.porContraste).toEqual(DERIVED.stats.porContraste)
      expect(sinBase.rows).toEqual(DERIVED.rows)
      expect(contrastSanityFailure(sinBase.stats)).toBeNull()
      // Y la pasada con base también pasa.
      expect(contrastSanityFailure(DERIVED.stats)).toBeNull()
    })
  },
)

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

  /**
   * Cero desde el 2026-08-11: las once fichas que estaban hechas por entero de
   * citas retenidas se retiraron ese día, y `check:summary-gate` bloquea ahora
   * la forma. Exigir `> 0` sería exigir que el defecto vuelva.
   *
   * Lo que queda por probar es que el contador no está muerto — sigue siendo
   * un subconjunto de las que no tienen cita mostrable, y esa cifra sí es > 0.
   */
  /**
   * Cerrada la fase 6 el 2026-08-27, vuelve a cero.
   *
   * La excepción duró unas horas: se retiró la pasada `llm` —87 entradas de
   * overlay— tras comprobar que el anclaje NLI, con el corpus semántico
   * cargado, no podía fundamentar ninguna. Sin ellas aflora el `sin-datos` de
   * la pasada determinista, y `f-2026-01-19-acu-b1a13f` se retiró porque la
   * puerta retenía sus tres citas: un resumen sin fuente por construcción.
   *
   * Exigir `> 0` sería exigir que el defecto vuelva.
   */
  it('las hechas por entero de citas retenidas ya no existen, y el contador vive', () => {
    expect(DERIVED.stats.hallazgosSoloConCitasOcultas).toBe(0)
    expect(DERIVED.stats.hallazgosSinCitaMostrable).toBeGreaterThan(0)
    expect(DERIVED.stats.hallazgosSoloConCitasOcultas).toBeLessThanOrEqual(
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

  it('cero señales de fusión ya no es motivo de negarse — con o sin base', () => {
    // La cláusula «overlay con entradas y ninguna señal ⇒ lectura sin
    // fusionar» se retiró con la verdad-monolito (ver el bloque «sin base…»
    // más abajo, que pina el porqué con datos reales): el estado que cazaba no
    // tiene camino fuera de un test, y el que teñía de rojo era sano.
    expect(
      contrastSanityFailure({
        ...base,
        baseDisponible: false,
        entradasDeOverlay: 5,
        citasConVeredictoDeOverlay: 0,
        citasReclasificadasPorElOverlay: 0,
      }),
    ).toBeNull()
    expect(
      contrastSanityFailure({
        ...base,
        baseDisponible: true,
        entradasDeOverlay: 5,
        citasConVeredictoDeOverlay: 0,
        citasReclasificadasPorElOverlay: 1,
      }),
    ).toBeNull()
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
