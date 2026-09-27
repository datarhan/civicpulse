/**
 * Los mapas de quejas por barrio dicen cuántas sitúan: el de /quejas y la
 * leyenda de la capa de la portada.
 *
 * Pinta una burbuja por barrio con las quejas que traen barrio, y hasta el
 * 2026-09-27 no decía nada de las que no lo traen: se leía como el total. Desde
 * que el bot deja de atribuir el casco urbano a la urbanización más cercana
 * (`situarEn`, src/scraper/situar-barrio.ts), una queja del centro no tiene
 * barrio, y el centro es donde vive la mayor parte del pueblo. Una capa que
 * enseña una parte de su dominio tiene que decirlo (CLAUDE.md, «Charts & maps»).
 *
 * La fracción sale de la propia instantánea: lo que el mapa pinta de verdad —una
 * queja con un barrio que geo.json no tiene tampoco se pinta— sobre
 * `stats.total`. Con el listado truncado no se sabe si las que faltan tienen
 * barrio, así que entonces no se dice.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'

import QuejasHeatmap from '../../src/components/QuejasHeatmap'
import { QuejasLegend } from '../../src/components/LiveCity/controls/QuejasLegend'
import { LocaleProvider } from '../../src/i18n'
import { installFetchMock } from '../setup/mockFetch'

vi.mock('react-leaflet', () => {
  const Pinta = ({ children }) => <div>{children}</div>
  return {
    MapContainer: Pinta,
    Circle: Pinta,
    Tooltip: Pinta,
    TileLayer: () => null,
    AttributionControl: () => null,
    Polyline: () => null,
    useMap: () => ({ invalidateSize: () => {} }),
  }
})

const GEO = {
  boundary: {
    polygon: [
      [39.5, -0.6],
      [39.6, -0.6],
      [39.6, -0.5],
    ],
  },
  neighborhoods: [{ slug: 'el-molinet', name: 'El Molinet', centroid: [39.52, -0.55] }],
}

const queja = (id, barrio) => ({
  id,
  status: 'capturada',
  address_string: barrio,
  registered_at: null,
})

function pinta(instantanea, idioma = 'es', Componente = QuejasHeatmap) {
  localStorage.setItem('cp:lang', idioma)
  installFetchMock({ '/data/geo.json': GEO, '/data/quejas.json': instantanea })
  return render(
    <LocaleProvider>
      <Componente />
    </LocaleProvider>,
  )
}

// Lo que el mapa pinta: si no aparece el barrio, el mapa no se ha montado y la
// ausencia de la nota no probaría nada.
const pintado = (container) => waitFor(() => expect(container.textContent).toContain('El Molinet'))

describe('el mapa de quejas por barrio dice cuántas sitúa', () => {
  afterEach(() => localStorage.removeItem('cp:lang'))

  // Las que faltan llegaron todas sin barrio: el motivo es exacto.
  const SIN_BARRIO = {
    stats: { total: 4 },
    items: [
      queja('Q-A', 'el-molinet'),
      queja('Q-B', 'el-molinet'),
      queja('Q-C', null), // sin barrio: el casco, o sin ubicación
      queja('Q-E', null),
    ],
  }

  // Una de las que faltan trae un barrio que geo.json no tiene: no está «sin
  // barrio», y decirlo sería falso (revisión de #131).
  const PARCIAL = {
    stats: { total: 4 },
    items: [
      queja('Q-A', 'el-molinet'),
      queja('Q-B', 'el-molinet'),
      queja('Q-C', null),
      queja('Q-D', 'un-barrio-que-geo-no-tiene'), // tampoco se pinta
    ],
  }

  it('con quejas sin barrio, lo dice con la cifra de lo pintado', async () => {
    const { container } = pinta(SIN_BARRIO)
    await pintado(container)
    expect(container.textContent).toMatch(/2 de las 4 quejas/)
    expect(container.textContent).toMatch(/no tienen barrio/)
    expect(container.textContent).not.toMatch(/\{\w+\}/)
  })

  it('con un barrio que el mapa no tiene, no dice «no tienen barrio»: da las dos cifras', async () => {
    const { container } = pinta(PARCIAL)
    await pintado(container)
    expect(container.textContent).toMatch(/2 de las 4 quejas/)
    expect(container.textContent).not.toMatch(/no tienen barrio/)
    expect(container.textContent).toMatch(/sin barrio: 1/)
    expect(container.textContent).toMatch(/que el mapa no tiene: 1/)
    expect(container.textContent).not.toMatch(/\{\w+\}/)
  })

  it('y en valencià', async () => {
    const { container } = pinta(PARCIAL, 'ca')
    await pintado(container)
    expect(container.textContent).toMatch(/2 de les 4 queixes/)
    expect(container.textContent).not.toMatch(/\{\w+\}/)
  })

  it('con el listado truncado no afirma que las demás no tengan barrio', async () => {
    const { container } = pinta({
      stats: { total: 1200 },
      items: [queja('Q-A', 'el-molinet'), queja('Q-B', 'el-molinet')],
    })
    await pintado(container)
    expect(container.textContent).toMatch(/2 de las 1200 quejas/)
    expect(container.textContent).not.toMatch(/no tienen barrio/)
  })

  it('el control: si las pinta todas, no hay nota', async () => {
    const { container } = pinta({
      stats: { total: 2 },
      items: [queja('Q-A', 'el-molinet'), queja('Q-B', 'el-molinet')],
    })
    await pintado(container)
    expect(container.textContent).not.toMatch(/de las \d+ quejas/)
  })

  describe('la leyenda de la capa de la portada', () => {
    it('con quejas sin barrio, da la cifra de las publicadas', async () => {
      const { container } = pinta(SIN_BARRIO, 'es', QuejasLegend)
      await waitFor(() => expect(container.textContent).toMatch(/2 de 4 quejas/))
      expect(container.textContent).toMatch(/sin barrio/)
    })

    it('con un barrio que el mapa no tiene, la cifra sin el motivo', async () => {
      const { container } = pinta(PARCIAL, 'es', QuejasLegend)
      await waitFor(() => expect(container.textContent).toMatch(/2 de 4 quejas/))
      expect(container.textContent).not.toMatch(/sin barrio/)
    })

    // Las muestras de color de la escala: un círculo por nivel.
    const muestras = (container) => container.querySelectorAll('span[style*="border-radius: 50%"]')

    it('con el listado truncado, la cifra sin el motivo', async () => {
      const { container } = pinta(
        { stats: { total: 1200 }, items: [queja('Q-A', 'el-molinet')] },
        'es',
        QuejasLegend,
      )
      await waitFor(() => expect(container.textContent).toMatch(/1 de 1200 quejas/))
      expect(container.textContent).not.toMatch(/sin barrio/)
    })

    it('el control: si las sitúa todas, la de siempre', async () => {
      const { container } = pinta(
        { stats: { total: 2 }, items: [queja('Q-A', 'el-molinet'), queja('Q-B', 'el-molinet')] },
        'es',
        QuejasLegend,
      )
      await waitFor(() => expect(container.textContent).toMatch(/sobre 2 queja/))
      expect(container.textContent).not.toMatch(/\d+ de \d+ quejas/)
    })

    it('sin nada pintado no enseña ninguna muestra de la escala', async () => {
      const { container } = pinta(
        { stats: { total: 2 }, items: [queja('Q-C', null), queja('Q-E', null)] },
        'es',
        QuejasLegend,
      )
      await waitFor(() => expect(container.textContent).toMatch(/0 de 2 quejas/))
      expect(muestras(container)).toHaveLength(0)
    })

    it('el control de las muestras: con algo pintado, sí las hay', async () => {
      const { container } = pinta(SIN_BARRIO, 'es', QuejasLegend)
      await waitFor(() => expect(container.textContent).toMatch(/2 de 4 quejas/))
      expect(muestras(container).length).toBeGreaterThan(0)
    })

    // El control de éste es «con quejas sin barrio, da la cifra de las
    // publicadas»: el mismo fixture, con geo.json, da «2 de 4».
    it('mientras geo.json no se ha leído, no afirma nada', async () => {
      localStorage.setItem('cp:lang', 'es')
      const fetchMock = installFetchMock({ '/data/quejas.json': SIN_BARRIO })
      const { container } = render(
        <LocaleProvider>
          <QuejasLegend />
        </LocaleProvider>,
      )
      await waitFor(() => {
        const pedidos = fetchMock.mock.calls.map((c) => String(c[0]))
        expect(pedidos.some((u) => u.includes('/data/geo.json'))).toBe(true)
        expect(pedidos.some((u) => u.includes('/data/quejas.json'))).toBe(true)
      })
      await new Promise((r) => setTimeout(r, 30))
      expect(container.textContent).not.toMatch(/de 4 quejas/)
      expect(container.textContent).not.toMatch(/sin barrio/)
    })
  })
})
