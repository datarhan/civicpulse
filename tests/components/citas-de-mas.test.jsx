/**
 * La tarjeta de /plenos/:id enseña tres citas; el sumario se escribe con todas.
 *
 * En /plenos/k4olcs (f-2026-04-20-cit-b9b013) el sumario decía «con PSOE
 * destacando adaptaciones a la Carta de Servicios», y la cita que lo sostiene
 * —la cuarta, atribuida a PSOE— no salía en la tarjeta: a la vista quedaba sólo
 * una cita «sin atribuir» del mismo asunto, y la revisión lectora concluyó que
 * la página atribuía a PSOE lo que no le atribuía. La ficha permanente
 * (/hallazgos/:id) las imprime todas; la tarjeta dice cuántas faltan y enlaza.
 *
 * Se mide contra la copia SERVIDA de los hallazgos publicados, y la prueba
 * afirma que hay hallazgos de los dos lados — con más de tres citas y con tres
 * o menos —, para que no pase en verde por no tener nada que mirar.
 */
import { describe, expect, it, beforeEach, afterAll } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { FindingCard, codigoDeFicha } from '../../src/components/PlenoFindings'
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

const enlacesAFicha = (container, f) =>
  [...container.querySelectorAll('a')].filter(
    (a) => a.getAttribute('href') === `/hallazgos/${f.id}`,
  )

describe('la tarjeta dice cuántas citas no enseña', () => {
  it('hay hallazgos publicados de los dos lados', () => {
    expect(CON_MAS.length).toBeGreaterThan(0)
    expect(SIN_MAS.length).toBeGreaterThan(0)
    expect(CON_MAS.map((f) => f.id)).toContain('f-2026-04-20-cit-b9b013')
  })

  it('con más de tres citas, enlaza a la ficha y dice cuántas faltan', async () => {
    for (const f of CON_MAS) {
      const { container, unmount } = await pinta(f)
      const enlaces = enlacesAFicha(container, f)
      const n = f.quotes.length - 3
      expect(enlaces, f.id).toHaveLength(1)
      expect(enlaces[0].textContent, f.id).toContain(n === 1 ? '1 cita más' : `${n} citas más`)
      expect(enlaces[0].textContent, f.id).toContain(codigoDeFicha(f.id))
      unmount()
    }
  })

  it('con tres o menos, no hay enlace', async () => {
    for (const f of SIN_MAS) {
      const { container, unmount } = await pinta(f)
      expect(enlacesAFicha(container, f), f.id).toHaveLength(0)
      unmount()
    }
  })
})
