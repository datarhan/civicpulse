import { describe, it, expect } from 'vitest'
import { TRINQUETE, etapasVivas } from '../src/scraper/trinquete'
import { PASADAS_RETIRADAS, esPasadaRetirada } from '../src/scraper/claim-verdicts'
import { applyOverlayEntries, type Overlay } from '../src/scraper/verified-merge'

/**
 * Una tabla escrita a mano dentro de un control contra el estancamiento se
 * estanca ella sola — el chiste que este repositorio ya ha contado dos veces.
 *
 * Así que el trinquete declarado no vale por estar escrito: vale porque se
 * COTEJA con lo que el código impone de verdad. Si alguien cambia la política
 * en `applyOverlayEntries` y no toca la declaración, esto se pone rojo; y si
 * cambia la declaración sin tocar el código, también.
 */
const ev = [{ kind: 'tender', ref: 'r', snippet: 's' }]
const vacio: Overlay = { version: 1, generatedAt: 'x', entries: {} }

const RAZON = 'un motivo suficientemente largo para pasar el validador'

/**
 * Escribe UNA entrada aislando la regla que se quiere probar.
 *
 * Lleva siempre razón y mapa de base, porque si no el intento estalla por
 * `exigeRazon` o por «not found in base» y la prueba creería estar midiendo el
 * suelo de evidencia cuando mide otra cosa — el mismo error que esta prueba
 * existe para cazar, cometido dentro de la prueba.
 */
const escribir = (source: string, verification: Record<string, unknown>, sobre: Overlay = vacio) =>
  applyOverlayEntries(
    sobre,
    [
      {
        claimId: 'c',
        source,
        reason: RAZON,
        verification: { claimId: 'c', summary: 's', ...verification },
      },
    ] as never,
    'TS',
    new Map([['c', 'verificado']]) as never,
  )

describe('el trinquete declarado coincide con el que se aplica', () => {
  it('toda fuente del overlay declara su etapa', () => {
    // `Record<OverlaySource, Etapa>` ya lo obliga en compilación; esto lo fija
    // también en ejecución, para que un `as never` no se lo salte.
    expect(Object.keys(TRINQUETE).sort()).toEqual(
      ['curator-downgrade', 'llm', 'nli', 'verdict-engine'].sort(),
    )
  })

  it('lo que la declaración llama retirado es lo que el código llama retirado', () => {
    for (const [id, etapa] of Object.entries(TRINQUETE)) {
      expect(esPasadaRetirada(id), `${id} en PASADAS_RETIRADAS`).toBe(etapa.retirada)
    }
    expect([...PASADAS_RETIRADAS].some((p) => p === 'llm')).toBe(true)
    expect(etapasVivas()).not.toContain('llm')
  })

  it('`exigeCorpus` describe lo que el suelo hace de verdad', () => {
    for (const [id, etapa] of Object.entries(TRINQUETE)) {
      const intento = () => escribir(id, { verdict: 'parcial', evidence: ev, checkedAgainst: [] })
      if (etapa.exigeCorpus) expect(intento, `${id} debería exigir corpus`).toThrow()
      else expect(intento, `${id} NO debería exigir corpus`).not.toThrow()
    }
  })

  it('`exigeRazon` describe lo que el validador pide de verdad', () => {
    // Aquí se quita la razón a propósito, que es lo que se está probando.
    const sinRazon = (source: string) =>
      applyOverlayEntries(
        vacio,
        [
          {
            claimId: 'c',
            source,
            verification: {
              claimId: 'c',
              summary: 's',
              verdict: 'sin-datos',
              evidence: [],
              checkedAgainst: [],
            },
          },
        ] as never,
        'TS',
        new Map([['c', 'verificado']]) as never,
      )
    for (const [id, etapa] of Object.entries(TRINQUETE)) {
      if (!etapa.exigeRazon) continue
      expect(() => sinRazon(id), `${id} debería exigir una razón`).toThrow()
    }
  })

  it('el orden: una etapa que sube no pisa lo que dejó una que baja', () => {
    // Cada etapa empujaba en un solo sentido, pero el ORDEN entre ellas sólo
    // vivía en el orden de ejecución: una pasada que sube, lanzada después,
    // sustituía la entrada de una que había bajado. Se coteja cada par de
    // etapas contra `direccion`, con entradas que cumplen todo lo demás —si no,
    // la prueba mediría el suelo o el motivo creyendo medir el orden—.
    const valida = (source: string) =>
      TRINQUETE[source as keyof typeof TRINQUETE].direccion === 'sube'
        ? { verdict: 'verificado', evidence: ev, checkedAgainst: ['tenders'] }
        : { verdict: 'sin-datos', evidence: [], checkedAgainst: [] }
    const cruces = { vetados: 0, permitidos: 0 }
    for (const [previa, p] of Object.entries(TRINQUETE)) {
      for (const [entrante, n] of Object.entries(TRINQUETE)) {
        const antes = escribir(previa, valida(previa))
        const intento = () => escribir(entrante, valida(entrante), antes)
        if (p.direccion === 'baja' && n.direccion === 'sube') {
          expect(intento, `${entrante} sobre ${previa}`).toThrow(/trinquete/)
          cruces.vetados++
        } else {
          expect(intento, `${entrante} sobre ${previa}`).not.toThrow()
          if (p.direccion !== n.direccion) cruces.permitidos++
        }
      }
    }
    // Que haya juzgado algo en los dos sentidos: con una declaración sin
    // etapas que bajen, o sin etapas que suban, esto no mediría ningún orden.
    expect(cruces.vetados).toBeGreaterThan(0)
    expect(cruces.permitidos).toBeGreaterThan(0)
  })

  it('ninguna etapa se mueve en las dos direcciones', () => {
    // El trinquete deja de serlo en cuanto una etapa pueda subir y bajar.
    for (const etapa of Object.values(TRINQUETE)) {
      expect(['sube', 'baja']).toContain(etapa.direccion)
    }
  })

  it('la que sólo retracta no puede emitir un veredicto fuerte', () => {
    const motor = TRINQUETE['verdict-engine']
    expect(motor.direccion).toBe('baja')
    expect(motor.puedeEmitir).toEqual(['sin-datos'])
  })

  it('cada etapa dice dónde se midió su fiabilidad', () => {
    // «Confiamos en el motor» sin un sitio donde mirar es una opinión.
    for (const [id, etapa] of Object.entries(TRINQUETE)) {
      expect(etapa.medicion.length, `${id} sin medición declarada`).toBeGreaterThan(20)
    }
  })
})
