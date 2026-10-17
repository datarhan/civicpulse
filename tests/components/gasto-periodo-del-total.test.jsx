/**
 * El total de la tarjeta de lo adjudicado lleva el periodo del TOTAL.
 *
 * `totalAmount` suma todo el universo; `dateMin`/`dateMax` sólo ven las filas que
 * llegan al mapa y mueven el deslizador. La tarjeta rotulaba el total con el
 * segundo periodo. Coincidían por suerte hasta el 17-10-2026: al quitar los pines
 * de los títulos que nombran varios sitios, el contrato de 2017 que abría el mapa
 * se quedó sin punto y la página dijo «es de 2018–2026» encima de una línea que,
 * del mismo total, decía «2017–2026». Es el arreglo de #339 en MoneyCoverage y
 * CoverageMeter, que no llegó a esta tarjeta.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { LocaleProvider } from '../../src/i18n'

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

const universe = {
  totalContracts: 3,
  totalAmount: 100.3e6,
  locatedContracts: 1,
  locatedAmount: 2.2e6,
  situatedContracts: 1,
  situatedAmount: 4.9e6,
  danaContracts: 0,
  danaAmount: 0,
  danaAwardedContracts: 0,
  danaAwardedAmount: 0,
  dateMin: '2018-01-24',
  dateMax: '2026-05-27',
  totalDateMin: '2017-07-03',
  totalDateMax: '2026-10-08',
}
let tg
vi.mock('../../src/hooks/useTenderGeo', () => ({
  useTenderGeo: () => ({ loading: false, error: null, data: tg }),
}))
vi.mock('../../src/hooks/useTenders', () => ({
  useTenders: () => ({ loading: false, error: null, data: { contracts: [] } }),
}))
vi.mock('../../src/hooks/useCpvLabels', () => ({
  useCpvLabels: () => ({ loading: false, error: null, data: null }),
}))

const { default: GastoDashboard } = await import('../../src/components/Presupuesto/GastoDashboard')

afterEach(cleanup)

const zona = {
  slug: 'el-molinet',
  name: 'el Molinet',
  centroid: [39.55, -0.55],
  contractCount: 1,
  amount: 2.2e6,
  danaAmount: 0,
}

describe('GastoDashboard — el periodo del total', () => {
  it('rotula el total con totalDateMin/totalDateMax, no con el periodo del mapa', () => {
    tg = { universe, zones: [zona], places: [], assignments: [] }
    const texto = render(
      <LocaleProvider>
        <GastoDashboard />
      </LocaleProvider>,
    ).container.textContent
    expect(texto).toMatch(/2017.2026/)
    expect(texto).not.toMatch(/2018.2026/)
    // Diez ejercicios, 2017 a 2026 ambos incluidos.
    expect(texto).toMatch(/\b10\b/)
  })

  it('un snapshot viejo sin totalDate* cae en dateMin/dateMax', () => {
    const { totalDateMin, totalDateMax, ...viejo } = universe
    tg = { universe: viejo, zones: [zona], places: [], assignments: [] }
    const texto = render(
      <LocaleProvider>
        <GastoDashboard />
      </LocaleProvider>,
    ).container.textContent
    expect(texto).toMatch(/2018.2026/)
  })
})
