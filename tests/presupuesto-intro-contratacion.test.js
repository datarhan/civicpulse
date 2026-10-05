/**
 * La entrada de «Contratación y subvenciones» en /presupuesto, en los dos idiomas.
 *
 * Decía que los cuatro recuentos «van medidos sobre los contratos adjudicados y
 * sin IVA». Sólo uno lo está: el de contratos menores. Los otros tres cuentan
 * fichas de obra municipales, anuncios de TED con su importe anunciado y
 * convocatorias de la BDNS — ninguno es un contrato adjudicado. Lo señaló la
 * revisión lectora del 06-10-2026 y se cotejó contra las cuatro tarjetas de
 * `Presupuesto.jsx`.
 *
 * Se fijan palabras, no cifras: la frase no lleva números vivos.
 */
import { describe, expect, it } from 'vitest'

import { CATALOGUE } from '../src/i18n'

const CLAVE = 'presupuesto.contra.intro'

/** Lo que la frase tiene que decir y lo que ya no puede decir, por idioma. */
const IDIOMAS = {
  es: {
    // La base «adjudicado y sin IVA» se ata a los contratos menores…
    acotada:
      /sólo la de contratos menores se mide \*\*sobre los contratos adjudicados y sin IVA\*\*/i,
    // …y las otras cuentan desde su fuente.
    fuente: /cada tarjeta cuenta desde su propia fuente/i,
    // La redacción vieja atribuía esa base a las cuatro.
    vieja: /Van \*\*medidos sobre los contratos adjudicados/,
  },
  ca: {
    acotada:
      /només la de contractes menors es mesura \*\*sobre els contractes adjudicats i sense IVA\*\*/i,
    fuente: /cada targeta compta des de la seua pròpia font/i,
    vieja: /Van \*\*mesurats sobre els contractes adjudicats/,
  },
}

describe('/presupuesto — la entrada de contratación no atribuye a las cuatro tarjetas la base de una', () => {
  for (const [locale, espera] of Object.entries(IDIOMAS)) {
    it(`${locale}: sólo los contratos menores van sobre lo adjudicado sin IVA`, () => {
      const frase = CATALOGUE[locale][CLAVE]
      // Midió algo: la clave existe en ese catálogo, no cae a la reserva.
      expect(typeof frase).toBe('string')
      expect(frase).toMatch(espera.acotada)
      expect(frase).toMatch(espera.fuente)
      expect(frase).not.toMatch(espera.vieja)
    })
  }

  it('sigue sin cifras vivas: la frase no lleva números', () => {
    for (const locale of Object.keys(IDIOMAS)) {
      expect(CATALOGUE[locale][CLAVE]).not.toMatch(/\d/)
    }
  })
})
