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

  // El titular decía «Lo que se ha adjudicado, cada cifra con su periodo»: ni
  // un anuncio de TED, ni una convocatoria de la BDNS, ni una ficha de obra son
  // algo adjudicado, y las obras no llevan periodo — la mitad de sus fichas
  // (las del FEDER) no traen `fechaEjecucion`. Ahora nombra lo que cuenta.
  const TITULAR = {
    es: { nombra: /^Contratos, obras, anuncios y convocatorias$/, viejo: /adjudicado/i },
    ca: { nombra: /^Contractes, obres, anuncis i convocatòries$/, viejo: /adjudicat/i },
  }
  for (const [locale, espera] of Object.entries(TITULAR)) {
    it(`${locale}: el titular nombra las cuatro cosas y no las llama adjudicadas`, () => {
      const titular = CATALOGUE[locale]['presupuesto.contra.title']
      expect(typeof titular).toBe('string')
      expect(titular).toMatch(espera.nombra)
      expect(titular).not.toMatch(espera.viejo)
      expect(titular).not.toMatch(/periodo|període/i)
    })
  }

  it('la entrada exceptúa a las obras al decir que cada recuento lleva su periodo', () => {
    expect(CATALOGUE.es[CLAVE]).toMatch(/periodo que abarca, salvo las obras/)
    expect(CATALOGUE.ca[CLAVE]).toMatch(/període que abasta, llevat de les obres/)
  })

  it('sigue sin cifras vivas: la frase no lleva números', () => {
    for (const locale of Object.keys(IDIOMAS)) {
      expect(CATALOGUE[locale][CLAVE]).not.toMatch(/\d/)
    }
  })
})
