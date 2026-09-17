import { afterEach, describe, expect, it } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import LiveTicker from '../../src/components/LiveTicker'
import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { installFetchMock } from '../setup/mockFetch'

/**
 * La cinta de datos nacionales que flota sobre el mapa de la portada: su nombre
 * accesible, en el idioma de la interfaz.
 *
 * El contenedor se anunciaba «Datos nacionales en directo» también en valencià. El
 * resto de la cinta —el rótulo de directo, el de cada serie, «hace 3 h»— sigue sin
 * traducir y tiene su propia incidencia, porque no es un globo ni una leyenda del
 * mapa. Esta prueba vigila sólo el nombre, que es lo que este cambio arregla.
 */
const INSTANTANEAS = {
  // Una serie basta: sin ninguna la cinta no se pinta y no habría nombre que leer.
  '/data/spain-ticker.json': {
    generatedAt: '2026-09-15T06:00:00.000Z',
    sources: { luz: { ok: true, currentValue: 0.1234, deltaVsYesterdayPct: -2.5, history: [] } },
  },
  '/data/press.json': { items: [] },
  '/data/plenos-agendas.json': { plenos: [], stats: { plazosVencidosCount: 0 } },
  '/data/promises.json': { items: [] },
}

async function nombreEn(idioma) {
  localStorage.setItem('cp:lang', idioma)
  installFetchMock(INSTANTANEAS)
  const { container, unmount } = render(
    <MemoryRouter>
      <LocaleProvider>
        <LiveTicker />
      </LocaleProvider>
    </MemoryRouter>,
  )
  await waitFor(() =>
    expect(
      container.querySelector('[data-live-ticker]'),
      `${idioma}: la cinta no se pintó`,
    ).not.toBeNull(),
  )
  const nombre = container.querySelector('[data-live-ticker]').getAttribute('aria-label')
  unmount()
  return nombre
}

afterEach(() => localStorage.clear())

describe('la cinta de datos nacionales se nombra en el idioma de la interfaz', () => {
  it('EL CONTROL: con una serie, la cinta se pinta y tiene nombre', async () => {
    expect(await nombreEn('es')).toBeTruthy()
  })

  it('en valencià no se nombra en castellano', async () => {
    const es = await nombreEn('es')
    const ca = await nombreEn('ca')
    expect(ca, 'se nombra igual en castellano y en valencià').not.toBe(es)
    expect(es).toBe(CATALOGUE.es['liveTicker.aria'])
    expect(ca).toBe(CATALOGUE.ca['liveTicker.aria'])
  })
})
