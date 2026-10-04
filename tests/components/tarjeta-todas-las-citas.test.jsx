/**
 * La tarjeta de /plenos/:id enseña TODAS las citas, como /hallazgos/:id.
 *
 * El sumario se escribe con todas. Con tres a la vista, en /plenos/k4olcs
 * (f-2026-04-20-cit-b9b013) «con PSOE destacando adaptaciones a la Carta de
 * Servicios» se apoyaba en la cuarta cita, atribuida a PSOE, que la tarjeta
 * no enseñaba: a la vista quedaba sólo una cita «sin atribuir» del mismo
 * asunto, y la revisión lectora concluyó que la página atribuía a PSOE lo que
 * no le atribuía. Un enlace «y 1 cita más en la ficha» no bastó: la relectura
 * siguió sin ver la cita que sostiene la frase.
 *
 * Se mide contra la copia SERVIDA de los hallazgos publicados, por el rótulo
 * numerado de cada cita (una retenida imprime su hueco, no su texto, pero
 * conserva el rótulo), y la prueba afirma que hay hallazgos con más de tres,
 * para que no pase en verde por no tener nada que mirar.
 */
import { describe, expect, it, beforeEach, afterAll } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { FindingCard } from '../../src/components/PlenoFindings'
import { invalidateSnapshots, peekSnapshot } from '../../src/lib/snapshot-store'
import { retenerLiterales } from '../../src/scraper/literales-retenidos'

const ROOT = join(__dirname, '..', '..')
const FUENTE = JSON.parse(readFileSync(join(ROOT, 'public/data/pleno-findings.json'), 'utf8'))
const PROV = JSON.parse(
  readFileSync(join(ROOT, 'public/data/finding-quote-provenance.json'), 'utf8'),
)
const SERVIDA = retenerLiterales(FUENTE, PROV).snapshot
const ITEMS = SERVIDA.items ?? []
const CON_MAS = ITEMS.filter((f) => (f.quotes?.length ?? 0) > 3)
const SIN_MAS = ITEMS.filter((f) => (f.quotes?.length ?? 0) > 0 && f.quotes.length <= 3)

const realFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/data/finding-quote-provenance.json')) {
      return new Response(JSON.stringify(PROV), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('not found', { status: 404 })
  }
  invalidateSnapshots()
})

afterAll(() => {
  globalThis.fetch = realFetch
  invalidateSnapshots()
  cleanup()
})

async function pinta(f) {
  const utils = render(<FindingCard f={f} />)
  await waitFor(() => {
    expect(peekSnapshot('/data/finding-quote-provenance.json')?.status).toBe('ready')
  })
  return utils
}

/** Los números de cita que la tarjeta imprime en su rótulo, en orden. */
const numerosImpresos = (container) =>
  [...container.textContent.matchAll(/Cita (\d+)(?! de la ficha)/g)].map((m) => Number(m[1]))

describe('la tarjeta enseña todas las citas', () => {
  it('hay hallazgos publicados con más de tres citas', () => {
    expect(CON_MAS.length).toBeGreaterThan(0)
    expect(CON_MAS.map((f) => f.id)).toContain('f-2026-04-20-cit-b9b013')
  })

  it('cada cita sale con su número, también la cuarta y siguientes', async () => {
    for (const f of [...CON_MAS, ...SIN_MAS]) {
      const { container, unmount } = await pinta(f)
      const vistos = new Set(numerosImpresos(container))
      for (let n = 1; n <= f.quotes.length; n++)
        expect(vistos.has(n), `${f.id} cita ${n}`).toBe(true)
      unmount()
    }
  })
})
