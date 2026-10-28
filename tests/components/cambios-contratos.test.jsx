/**
 * Los contratos de /cambios (auditoría de las dos lecturas, §2): la etiqueta
 * llana arriba, el título oficial debajo si dice más, y «Adjudicado a … · 14.984 €
 * sin IVA» en vez de «Ayuntamiento de Riba-roja de Túria · €14.984,46 · …».
 *
 * La fila es la del contrato publicado el 20-10-2026, tal cual, y una copia sin
 * importe para la rama de «importe no publicado».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Cambios from '../../src/pages/Cambios'
import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { euros, rellena } from '../../src/lib/formatters'
import { etiquetaDeContrato } from '../../src/scraper/etiqueta-de-contrato'
import { importeAdjudicado } from '../../src/lib/contract-status'
import { installFetchMock } from '../setup/mockFetch'

const lee = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const TENDERS = lee('tenders.json')
/** El contrato publicado con fecha de adjudicación del 20-10-2026 y su importe. */
const CONTRATO = TENDERS.contracts.find(
  (c) => c.awardDate === '2026-10-20' && importeAdjudicado(c) != null && c.assignee,
)
/**
 * La misma fila, con la adjudicación dentro de la ventana de 7 días que acaba el
 * 28-10: la de verdad, del 20, cae un día antes del primero.
 */
const EN_LA_VENTANA = { ...CONTRATO, awardDate: '2026-10-24' }
const SIN_IMPORTE = {
  ...CONTRATO,
  id: `${CONTRATO.id}-sin-importe`,
  awardDate: '2026-10-25',
  finalAmountNoTaxes: 0,
  finalAmount: null,
}
const HOY = Date.parse('2026-10-28T12:00:00Z')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(HOY)
})
afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

async function pinta(idioma) {
  localStorage.setItem('cp:lang', idioma)
  installFetchMock({
    '/data/tenders.json': { ...TENDERS, contracts: [EN_LA_VENTANA, SIN_IMPORTE] },
    '/data/quejas.json': lee('quejas.json'),
    '/data/plenos.json': lee('plenos.json'),
    '/data/press.json': { ...lee('press.json'), items: [] },
    '/data/bdns.json': lee('bdns.json'),
    '/data/participa.json': lee('participa.json'),
    '/data/geo.json': lee('geo.json'),
  })
  const { container, unmount } = render(
    <MemoryRouter>
      <LocaleProvider>
        <Cambios />
      </LocaleProvider>
    </MemoryRouter>,
  )
  await waitFor(() => expect(container.querySelectorAll('[data-titulo-oficial]').length).toBe(2), {
    timeout: 15000,
  })
  return { container, unmount }
}

describe('/cambios · los contratos', () => {
  it('mide algo: la fila publicada existe y su título es largo', () => {
    expect(CONTRATO, 'no está el contrato del 20-10-2026').toBeDefined()
    expect(CONTRATO.title.length).toBeGreaterThan(200)
  })

  it('la etiqueta arriba, el título oficial entero debajo', async () => {
    const { container } = await pinta('es')
    const { etiqueta } = etiquetaDeContrato(CONTRATO.title)
    expect(container.textContent).toContain(etiqueta)
    const oficial = container.querySelector('[data-titulo-oficial]').textContent
    expect(oficial).toBe(
      rellena(CATALOGUE.es['cambios.contrato.tituloOficial'], { titulo: CONTRATO.title }),
    )
  }, 60000)

  it('a quién y por cuánto, como el resto del sitio; y sin importe, lo dice', async () => {
    const { container } = await pinta('es')
    const importe = euros(importeAdjudicado(CONTRATO))
    expect(container.textContent).toContain(
      `${rellena(CATALOGUE.es['cambios.contrato.adjudicataria'], { nombre: CONTRATO.assignee })} · ${importe} sin IVA`,
    )
    expect(container.textContent).toContain(CATALOGUE.es['importe.noPublicado'])
    // Ni el formato de antes ni el órgano, que es el mismo en todos.
    expect(container.textContent).not.toMatch(/€\d/)
    expect(container.textContent).not.toContain('Ayuntamiento de Riba-roja de Túria ·')
  }, 60000)

  it('en valencià, las palabras de la línea también', async () => {
    const { container } = await pinta('ca')
    expect(container.textContent).toContain(
      rellena(CATALOGUE.ca['cambios.contrato.adjudicataria'], { nombre: CONTRATO.assignee }),
    )
    expect(container.textContent).toContain('€ sense IVA')
    expect(container.textContent).toContain(CATALOGUE.ca['importe.noPublicado'])
    expect(container.querySelector('[data-titulo-oficial]').textContent).toMatch(/^Títol oficial: /)
  }, 60000)
})
