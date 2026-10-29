import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import Laboratorio from '../src/pages/LaboratorioPrensa'
import { installFetchMock } from './setup/mockFetch'

/**
 * La tarjeta «Triangulación» de /laboratorio decía «0 · historias en ≥3 medios»
 * (revisión lectora, 25-10-2026). El 21-10-2026 la Ofrena al Túria salió en
 * Periòdic (en valencià), Valenciabonita y Levante-EMV, tres medios
 * independientes, y el agrupado por título no la reconoció como una sola
 * historia: el 0 era lo que ese agrupado ve, no lo que publicaron los medios.
 * Ahora la tarjeta lo dice, y sin el fichero pinta «—» en vez de un 0.
 */
const ROOT = join(__dirname, '..')
const leer = (f) => JSON.parse(readFileSync(join(ROOT, 'tests/fixtures', f), 'utf8'))
const PRESS = leer('press_2026-09-28.json')
const VERIFICADAS = leer('press-claims-verified_2026-09-28.json')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-29T09:00:00Z'))
})
afterEach(() => vi.useRealTimers())

async function tarjeta(triangulacion) {
  installFetchMock({
    '/data/press.json': PRESS,
    '/data/press-claims-verified.json': VERIFICADAS,
    ...(triangulacion ? { '/data/press-triangulation.json': triangulacion } : {}),
  })
  render(
    <MemoryRouter>
      <Laboratorio />
    </MemoryRouter>,
  )
  const rotulo = await screen.findByText('Triangulación')
  return { valor: rotulo.nextElementSibling.textContent, caja: rotulo.parentElement.textContent }
}

describe('la triangulación de /laboratorio dice qué cuenta', () => {
  it('con el recuento medido, pinta su cifra y el límite del agrupado', async () => {
    const { valor, caja } = await tarjeta({
      generatedAt: '2026-09-29T06:00:00.000Z',
      stats: { totalClusters: 1, triangulated3Plus: 0 },
      clusters: [],
    })
    expect(valor).toBe('0')
    expect(caja).toContain('agrupadas por título')
    expect(caja).toContain('otra lengua')
  })

  it('sin el fichero de triangulación, «—» y no un cero', async () => {
    const { valor } = await tarjeta(null)
    expect(valor).toBe('—')
  })
})
