/**
 * /metodologia#citas-contraste tiene que describir la puerta que rige hoy.
 *
 * Hasta el 27-08-2026 /hallazgos marcaba el literal de una acusación retenida y
 * lo imprimía igual. Ese día pasó a obedecer la misma puerta que el registro de
 * declaraciones y a pintar en su lugar el hueco «Literal retenido». Esta
 * sección —el contrato editorial publicado— siguió un mes describiendo la
 * política vieja: «se dijo, lo publicamos, y no sabemos si es cierto», «Marcar
 * no retira», «una cita puede aparecer en /hallazgos aunque la puerta la
 * retenga». Y una prueba la sostenía: exigía «excepción que esa puerta
 * concede». Ninguna comprobación de datos podía verlo, porque el dato estaba
 * bien y la frase mal.
 *
 * Se lee el texto RENDERIZADO, no el JSX: los comentarios «Decía …» guardan a
 * propósito la redacción vieja, y una frase partida en dos líneas por Prettier
 * se le escaparía a una expresión regular sobre el fuente.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import Metodologia from '../src/pages/Metodologia'
import { ROTULO_CITA_RETENIDA, quoteMarks } from '../src/components/PlenoFindings'
import { invalidateSnapshots, peekSnapshot } from '../src/lib/snapshot-store'

const ROOT = join(__dirname, '..')
const PROVENANCE = readFileSync(join(ROOT, 'public/data/finding-quote-provenance.json'), 'utf8')
const FUENTE = readFileSync(join(ROOT, 'src/pages/Metodologia.jsx'), 'utf8')

const realFetch = globalThis.fetch
let texto = ''

beforeAll(async () => {
  globalThis.fetch = async (url) =>
    String(url).endsWith('/data/finding-quote-provenance.json')
      ? new Response(PROVENANCE, { status: 200, headers: { 'content-type': 'application/json' } })
      : new Response('not found', { status: 404 })
  invalidateSnapshots()
  const { container } = render(<Metodologia />)
  await waitFor(() => {
    expect(peekSnapshot('/data/finding-quote-provenance.json')?.status).toBe('ready')
  })
  // El párrafo de las cifras sólo se monta con el fichero leído, y es el único
  // de la sección que lo nombra: esperarlo garantiza que se mide la sección
  // entera y no sólo su mitad fija.
  await waitFor(() => {
    expect(container.querySelector('#citas-contraste')?.textContent).toContain(
      'finding-quote-provenance.json',
    )
  })
  texto = container.querySelector('#citas-contraste').textContent.replace(/\s+/g, ' ')
})

afterAll(() => {
  globalThis.fetch = realFetch
  invalidateSnapshots()
  cleanup()
})

describe('/metodologia#citas-contraste describe la puerta que rige hoy', () => {
  it('mide la sección entera (si no, las demás pasarían sin mirar nada)', () => {
    expect(texto.length).toBeGreaterThan(2000)
  })

  it.each([
    ['lo publicamos', /lo publicamos/i],
    ['Marcar no retira', /marcar no retira/i],
    ['aunque la puerta la retenga', /aunque la puerta la retenga/i],
    ['la excepción que esa puerta concede', /excepci[oó]n que esa puerta concede/i],
    ['puede estar publicada sin contrastar', /publicada sin contrastar/i],
  ])('no vuelve a decir «%s»', (_frase, re) => {
    expect(texto).not.toMatch(re)
  })

  it('no dice que lo retenido «no se publica»: dice que no se enseña', () => {
    // Desde el 28-09-2026 la copia servida de pleno-findings.json ya no lleva el
    // literal de una retenida, pero el repositorio, que es público, sí, y lo
    // dicho consta en la transcripción de la sesión. «No se publica», sin matiz,
    // seguiría prometiendo lo que no se cumple.
    expect(texto).not.toMatch(/no (?:la |lo |las |los |se )?publica/i)
  })

  it('dice qué no alcanza la retención, en vez de callarlo', () => {
    // Medido el 28-09-2026: la transcripción de cada sesión, que se publica
    // entera, lleva las palabras de casi todas las retenidas; 7 de las 37
    // comparten tramo con OTRA declaración del registro, y 3 de ésas se enseñan;
    // y el repositorio conserva el literal en el fichero y en su historia.
    expect(texto).toMatch(/Se retiene la cita, no lo que se dijo/)
    expect(texto).toMatch(/transcripción completa/i)
    expect(texto).toMatch(/otra declaración/i)
    expect(texto).toMatch(/repositorio/i)
    expect(texto).toMatch(/público desde el 8 de septiembre de 2026/i)
  })

  it('dice que ni la bitácora ni los datos que sirve el sitio llevan el literal', () => {
    expect(texto).toMatch(/bitácora/i)
    expect(texto).toMatch(/huella/i)
    expect(texto).toMatch(/copia de los datos/i)
  })

  it('nombra los dos resultados con los rótulos que pinta la ficha', () => {
    // Leídos del componente, no copiados aquí (docs/DATA_INTEGRITY.md regla 1):
    // si la ficha cambia un rótulo, esta página tiene que cambiar con ella.
    expect(ROTULO_CITA_RETENIDA).toBeTruthy()
    expect(texto).toContain(ROTULO_CITA_RETENIDA)
    for (const gate of ['toggle', 'hidden']) {
      const [marca] = quoteMarks({ gate })
      expect(marca?.chip, `la marca «${gate}» no tiene rótulo`).toBeTruthy()
      expect(texto).toContain(marca.chip)
    }
  })

  it('conserva la redacción anterior en comentarios «Decía …» del fuente', () => {
    const ini = FUENTE.indexOf('<Card id="citas-contraste"')
    expect(ini).toBeGreaterThan(-1)
    const seccion = FUENTE.slice(ini, FUENTE.indexOf('</Card>', ini))
    expect(seccion).toMatch(/Decía[\s\S]{0,600}lo publicamos/)
    expect(seccion).toMatch(/Decía «Marcar no retira/)
  })
})
