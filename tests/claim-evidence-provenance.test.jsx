import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { etiquetaVerificador } from '../src/lib/claim-provenance.js'

/**
 * Quién dice haber comprobado esto — y qué se rotula cuando no lo dice nadie.
 *
 * `/declaraciones` pone, bajo cada cita con evidencia, una línea del tipo
 * «1 EVIDENCIA · VERIFICADOR DETERMINISTA». Era un ternario de dos ramas:
 *
 *     v.checkedAgainst?.includes('llm-second-pass')
 *       ? 'verificador LLM'
 *       : 'verificador determinista'
 *
 * Un `checkedAgainst` VACÍO —«no consta qué comprobó esto»— cae por el `else` y
 * sale rotulado con la procedencia más fuerte que esta página sabe dar. Medido
 * contra el snapshot publicado el 2026-08-14: de las 24 citas que lucían el
 * sello «verificador determinista», **20 no tenían nada anotado** y sólo 4 lo
 * eran de verdad. El sello acertaba 4 veces de 24.
 *
 * Es la regla nº3 de docs/DATA_INTEGRITY.md —«un centinela no es un valor»— en
 * una superficie legalmente material: la misma avería que hacía que `Otro`
 * significara a la vez «un partido» y «no se puede saber», y que al publicarse
 * nombrara por eliminación al único concejal que había debajo.
 *
 * El barrido de superficies lo cazó de rebote el 2026-08-14: cuatro
 * señalamientos sobre `/declaraciones` decían, cada uno a su manera, que un
 * lector concluye del sello que hay una comprobación detrás. La tenía en un
 * caso de cada seis.
 */

const VERIFIED = resolve('public/data/pleno-claims-verified.json')

describe('el sello de procedencia tiene tres estados, no dos', () => {
  it('nombra al verificador determinista sólo cuando consta', () => {
    expect(etiquetaVerificador(['tenders', 'tenders-ted', 'bdns', 'budget'])).toBe(
      'verificador determinista',
    )
    expect(etiquetaVerificador(['curator-downgrade'])).toBe('verificador determinista')
  })

  it('nombra al verificador LLM cuando consta', () => {
    expect(etiquetaVerificador(['llm-second-pass'])).toBe('verificador LLM')
    expect(etiquetaVerificador(['tenders', 'llm-second-pass'])).toBe('verificador LLM')
  })

  it('NO llama determinista a lo que no tiene verificador anotado', () => {
    // Las tres formas de «no consta». Ninguna puede salir por el `else`.
    for (const vacio of [[], undefined, null]) {
      const etiqueta = etiquetaVerificador(vacio)
      expect(etiqueta, `checkedAgainst=${JSON.stringify(vacio)}`).not.toMatch(/determinista/)
      expect(etiqueta, `checkedAgainst=${JSON.stringify(vacio)}`).not.toMatch(/LLM/)
      // Y lo dice, en vez de callarse: una línea en blanco donde iba una
      // procedencia se lee como que no hacía falta ninguna.
      expect(etiqueta.length, `checkedAgainst=${JSON.stringify(vacio)}`).toBeGreaterThan(0)
    }
  })
})

describe('contra el snapshot publicado', () => {
  const items = JSON.parse(readFileSync(VERIFIED, 'utf8')).items ?? []
  const conEvidencia = items.filter((i) => (i.verification?.evidence ?? []).length > 0)

  it('el corpus tiene citas con evidencia que rotular', () => {
    // Prueba de trabajo: sin esto, lo de abajo pasaría midiendo cero filas.
    expect(conEvidencia.length).toBeGreaterThan(10)
  })

  it('ninguna cita publicada luce «determinista» sin que conste quién la comprobó', () => {
    const mentirosas = conEvidencia
      .filter((i) => {
        const ca = i.verification?.checkedAgainst
        return (!ca || ca.length === 0) && /determinista/.test(etiquetaVerificador(ca))
      })
      .map((i) => i.claim?.id)
    expect(mentirosas, 'citas con el sello determinista y nada que lo respalde').toEqual([])
  })
})
