import { describe, it, expect } from 'vitest'
import { TRINQUETE, etapasVivas } from '../src/scraper/trinquete'
import {
  CLAIM_VERDICTS,
  PASADAS_RETIRADAS,
  esPasadaRetirada,
  type ClaimVerdict,
} from '../src/scraper/claim-verdicts'
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
const escribir = (source: string, verification: Record<string, unknown>) =>
  applyOverlayEntries(
    vacio,
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

/**
 * Una verificación que llega al suelo de evidencia: con corpus y evidencia
 * cuando el veredicto afirma algo. Así, si la escritura cae, no es por el suelo.
 */
const conSuelo = (verdict: ClaimVerdict) =>
  verdict === 'sin-datos'
    ? { verdict, evidence: [], checkedAgainst: [] }
    : { verdict, evidence: ev, checkedAgainst: ['tenders'] }

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
      // Contra el MENSAJE del suelo: una etapa que no puede escribir `parcial`
      // por otra regla —la firma, la retirada— haría pasar esto sin medirlo.
      if (etapa.exigeCorpus)
        expect(intento, `${id} debería exigir corpus`).toThrow(/suelo de evidencia/)
      else expect(intento, `${id} NO debería exigir corpus`).not.toThrow()
    }
  })

  it('`exigeFirma` describe lo que el overlay acepta de verdad', () => {
    // Todo lo demás en regla —corpus, evidencia, razón, base—: lo único que
    // puede parar la escritura es la firma que le falta.
    for (const [id, etapa] of Object.entries(TRINQUETE)) {
      if (etapa.retirada) continue
      for (const verdict of etapa.puedeEmitir) {
        const intento = () => escribir(id, conSuelo(verdict))
        if (etapa.exigeFirma) expect(intento, `${id} · ${verdict}`).toThrow(/firma/)
        else expect(intento, `${id} · ${verdict}`).not.toThrow()
      }
    }
  })

  it('toda etapa viva que puede reforzar exige la firma de una persona', () => {
    // La regla 4 de docs/DATA_INTEGRITY.md, como dato: lo automático sólo baja.
    // Si algún día se retira la última etapa que sube, la primera línea cae y
    // hay que quitarla; hasta entonces impide que esto pase sin mirar nada.
    const suben = etapasVivas().filter((k) => TRINQUETE[k].direccion === 'sube')
    expect(suben.length, 'ninguna etapa viva sube: esto no mediría nada').toBeGreaterThan(0)
    for (const k of suben) expect(TRINQUETE[k].exigeFirma, k).toBe(true)
  })

  it('`puedeEmitir` describe lo que el overlay acepta de verdad', () => {
    for (const [id, etapa] of Object.entries(TRINQUETE)) {
      if (etapa.retirada || etapa.exigeFirma) continue
      for (const verdict of CLAIM_VERDICTS) {
        const intento = () => escribir(id, conSuelo(verdict))
        if (etapa.puedeEmitir.includes(verdict)) expect(intento, `${id} · ${verdict}`).not.toThrow()
        else expect(intento, `${id} · ${verdict}`).toThrow()
      }
    }
  })

  it('el motor no escribe un veredicto fuerte aunque traiga corpus y evidencia', () => {
    // Mientras el runner pisaba `checkedAgainst` con su marca, esto lo paraba el
    // suelo de rebote: sin corpus real, un `parcial` del motor no pasaba. Con
    // los corpus de su evidencia sí pasaría, así que lo para lo que la etapa
    // declara que puede emitir.
    expect(() => escribir('verdict-engine', conSuelo('parcial'))).toThrow(/puede emitir/)
  })

  it('una etapa retirada no escribe entradas nuevas', () => {
    for (const [id, etapa] of Object.entries(TRINQUETE)) {
      if (!etapa.retirada) continue
      for (const verdict of etapa.puedeEmitir) {
        expect(() => escribir(id, conSuelo(verdict)), `${id} · ${verdict}`).toThrow(/retirada/)
      }
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
