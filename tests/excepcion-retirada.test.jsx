/**
 * La excepción que la puerta ya no concede, descrita todavía en dos sitios.
 *
 * Hasta el 27-08-2026, promover una declaración a hallazgo la sacaba de la
 * puerta editorial: /hallazgos imprimía el literal de una acusación que
 * /plenos retenía —desde el 10-08, con una marca al lado—, y la razón escrita
 * era que «delante hay una persona». Ese día, por decisión del operador
 * (`citaRetenida`, hoy en src/lib/cita-retenida.js), las dos páginas pasaron a obedecer la
 * misma puerta: una cita `hidden` se pinta como el hueco «Literal retenido»,
 * la haya promovido quien la haya promovido. /metodologia#citas-contraste se
 * reescribió el 28-09-2026 (#155). Quedaban:
 *
 * 1. `CONTRAST_MEANING.hidden`, en quote-contrast.ts. No es un comentario: se
 *    copia a `contraste.states` de finding-quote-provenance.json, que el sitio
 *    sirve. Decía «en un hallazgo se publica porque alguien la promovió», falso
 *    dos veces: el literal ya no se imprime en la ficha, y «alguien» es una
 *    persona cuando casi todas las fichas las firma `auto-curation-v1` (la
 *    historia está en `notaAcusacionSinContrastar`).
 * 2. La entrada de la cola de excepción en /curator: «Promover una declaración
 *    a hallazgo es la excepción que esa puerta concede, y la concede porque
 *    delante hay una persona».
 *
 * Ninguna comprobación de datos podía verlo: el dato estaba bien y la frase
 * mal. La redacción se lee de los módulos, no se copia aquí
 * (docs/DATA_INTEGRITY.md regla 1).
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { render, waitFor } from '@testing-library/react'

import { QUOTE_CONTRAST_STATES } from '../src/scraper/quote-contrast'
import { ROTULO_CITA_RETENIDA } from '../src/components/PlenoFindings'
import Curator from '../src/pages/Curator'

/** «No se publica», en cualquiera de sus formas — la misma guarda que #155. */
const NO_SE_PUBLICA = /no (?:la |lo |las |los |se )?publica/i

describe('el significado publicado de `hidden` describe la puerta que rige desde el 27-08', () => {
  const hidden = QUOTE_CONTRAST_STATES.find((s) => s.id === 'hidden')?.meaning ?? ''

  it('mide una definición de verdad (si no, las demás pasarían sin mirar nada)', () => {
    expect(hidden.length).toBeGreaterThan(80)
  })

  it('no dice que un hallazgo publique el literal que la puerta retiene', () => {
    expect(hidden).not.toMatch(/en un hallazgo se publica/i)
    expect(hidden).not.toMatch(/se publica porque/i)
  })

  it('no insinúa una persona detrás de la promoción', () => {
    // La misma guarda que `notaAcusacionSinContrastar`: la palabra, ni siquiera
    // negada — una expresión regular no lee negaciones.
    expect(hidden).not.toMatch(/\balguien\b/i)
  })

  it('dice que promoverla a hallazgo no la saca de la puerta', () => {
    expect(hidden).toMatch(/promover\w* a hallazgo no/i)
  })

  it('dice que el literal no se imprime, ni en /plenos ni en /hallazgos', () => {
    expect(hidden).toMatch(/no se imprime/i)
    expect(hidden).toContain('/plenos')
    expect(hidden).toContain('/hallazgos')
  })

  it('no dice «no se publica» sin matiz: el texto sigue en el repositorio y en la transcripción', () => {
    // Desde el 28-09-2026 la copia servida de pleno-findings.json ya no lleva el
    // literal de una retenida (src/scraper/literales-retenidos.ts). «No se
    // publica» seguiría prometiendo de más: el fichero del repositorio, que es
    // público, lo conserva, y lo dicho consta en la transcripción de la sesión.
    expect(hidden).not.toMatch(NO_SE_PUBLICA)
  })

  it('dice que la copia servida no lo lleva, y que lo dicho sigue en la transcripción', () => {
    expect(hidden).toMatch(/pleno-findings\.json/)
    expect(hidden).toMatch(/literalRetenido/)
    expect(hidden).toMatch(/transcripción completa/i)
  })
})

describe('/curator: la entrada de la cola de excepción describe la puerta de hoy', () => {
  const realFetch = globalThis.fetch
  let texto = ''

  beforeAll(async () => {
    // El panel entero, no un trozo montado aparte: un texto que pasa suelto
    // pasaría también aunque la página siguiera pintando el viejo. Sin colas
    // (todo 404), lo único que queda de la sección es su entrada.
    globalThis.fetch = async () => new Response('not found', { status: 404 })
    const { container } = render(<Curator />)
    await waitFor(() => {
      expect(container.textContent).toContain('triage:finding-exception')
    })
    texto = container.textContent.replace(/\s+/g, ' ')
  })

  afterAll(() => {
    globalThis.fetch = realFetch
  })

  it('mide el panel entero', () => {
    expect(texto.length).toBeGreaterThan(2000)
    expect(texto).toContain('claim-public-gate.ts')
  })

  it.each([
    ['la excepción que esa puerta concede', /excepci[oó]n que esa puerta concede/i],
    ['la concede porque delante hay una persona', /delante hay una persona/i],
    ['quién tomó la excepción', /tom[oó] la excepci[oó]n/i],
  ])('no vuelve a decir «%s»', (_frase, re) => {
    expect(texto).not.toMatch(re)
  })

  it('dice que la ficha retiene el literal, con el rótulo que pinta', () => {
    expect(ROTULO_CITA_RETENIDA, 'el rótulo del hueco no se exporta').toBeTruthy()
    expect(texto).toContain(`«${ROTULO_CITA_RETENIDA}»`)
  })
})
