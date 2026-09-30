/**
 * /metodologia sólo pone «a un solo clic» lo que el motor de verdad propone.
 *
 * `STATUS_TIER` da a `no-ejecutada` el escalón 'fast-track' —reservado en el
 * diseño del 2 de julio para un detector de incumplimiento que se aplazó—, pero
 * ningún motor lo propone: el minero de cambios de estado sólo avanza una promesa
 * (`PROGRESS_STATUSES`), su esquema y el validador de la cola rechazan cualquier
 * otro estado, y el descubrimiento sólo emite `documentada`. La página derivaba
 * sus frases del escalón y de nada más, y publicaba en cuatro sitios que ese
 * veredicto quedaba «como propuesta lista para publicar con un solo clic
 * humano», mientras la tabla de estados decía —con razón— que el algoritmo no
 * puede asignarlo. Lo cazó la revisión de superficies el 30-09-2026.
 *
 * Se lee el texto RENDERIZADO, frase a frase, como en
 * metodologia-citas-contraste.test.jsx: lo que una frase dice ANTES de «clic»
 * no puede nombrar un veredicto fuerte que ningún motor propone.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { render, cleanup } from '@testing-library/react'

import Metodologia from '../src/pages/Metodologia'
import { STATUS_TIER } from '../src/scraper/promise-auto-curate'
import { PROGRESS_STATUSES } from '../src/scraper/promises'
import { invalidateSnapshots } from '../src/lib/snapshot-store'

/** Los veredictos fuertes —los que nunca se auto-publican— que ningún motor propone. */
const NO_PROPUESTOS = Object.entries(STATUS_TIER)
  .filter(([estado, escalon]) => escalon !== 'auto' && !PROGRESS_STATUSES.includes(estado))
  .map(([estado]) => estado)

/** La prosa escribe «no-ejecutada» y también «no ejecutada». */
const nombra = (texto, estado) => new RegExp(estado.replace('-', '[-\\s]'), 'i').test(texto)

const CLIC = /\bclic\b/i

const realFetch = globalThis.fetch
let frases = []

beforeAll(() => {
  // Estas secciones no leen ningún snapshot; los demás, que fallen.
  globalThis.fetch = async () => new Response('not found', { status: 404 })
  invalidateSnapshots()
  const { container } = render(<Metodologia />)
  // Sólo bloques hoja: el textContent de uno que contiene otros pega sus frases
  // sin espacio, y una frase ajena acabaría delante de un «clic».
  frases = [...container.querySelectorAll('li, p, td')]
    .filter((el) => !el.querySelector('li, p, td'))
    .flatMap((el) => el.textContent.replace(/\s+/g, ' ').split(/(?<=[.;])\s+/))
})

afterAll(() => {
  globalThis.fetch = realFetch
  invalidateSnapshots()
  cleanup()
})

describe('/metodologia sólo pone a un clic lo que el motor propone', () => {
  it('parte de la premisa medida: hay veredictos fuertes que ningún motor propone', () => {
    // El día que un detector proponga `no-ejecutada` esta línea cae. Relee
    // entonces la tabla de estados y las secciones de auto-curación y de plazos
    // vencidos: describen un motor que hoy no lo propone.
    expect(NO_PROPUESTOS).toContain('no-ejecutada')
  })

  it('lee frases que hablan de un clic (si no, las siguientes pasarían sin mirar nada)', () => {
    expect(frases.filter((f) => CLIC.test(f)).length).toBeGreaterThan(0)
  })

  it.each(NO_PROPUESTOS)('ninguna frase pone «%s» a un clic', (estado) => {
    const aUnClic = frases.filter((f) => CLIC.test(f) && nombra(f.slice(0, f.search(CLIC)), estado))
    expect(aUnClic).toEqual([])
  })

  it.each(NO_PROPUESTOS)('dice que el motor no propone «%s»', (estado) => {
    const NO_PROPONE = /\b(no|nunca|ni siquiera) (lo |los )?propone\b/i
    expect(frases.some((f) => NO_PROPONE.test(f) && nombra(f, estado))).toBe(true)
  })
})
