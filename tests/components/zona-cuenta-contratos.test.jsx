/**
 * El detalle de una zona y la tooltip del mapa de /presupuesto cuentan contratos.
 *
 * Decían «obras». El mapa sitúa todo contrato cuyo título nombra una zona, sea obra,
 * servicio o suministro, y la propia tarjeta lo explica dos párrafos más arriba
 * («servicios, suministros y obras sin lugar citado»). Medido el 17-09-2026: 22 de
 * los 47 contratos situados eran servicios o suministros, en 8 de las 12 zonas, y
 * una zona con cinco servicios y una obra decía «6 obras».
 *
 * Aquí la zona sólo tiene un servicio y un suministro: ninguna obra. Si el recuento
 * vuelve a llamarse «obras», lo dice de una zona que no tiene ninguna.
 */
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import GastoMap from '../../src/components/Presupuesto/GastoMap'
import ZoneDrilldown from '../../src/components/Presupuesto/ZoneDrilldown'
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

const ZONA = {
  slug: 'el-molinet',
  name: 'El Molinet',
  amount: 30000,
  danaAmount: 0,
  centroid: [39.52, -0.55],
}
const ASIGNACIONES = [
  {
    id: 'c1',
    zones: ['el-molinet'],
    amount: 20000,
    date: '2024-05-01',
    contractType: 'services',
    dana: false,
  },
  {
    id: 'c2',
    zones: ['el-molinet'],
    amount: 10000,
    date: '2024-06-01',
    contractType: 'supplies',
    dana: false,
  },
]
const SNAPSHOT = { zones: [ZONA], assignments: ASIGNACIONES }
const CONTRATOS = new Map(
  ASIGNACIONES.map((a) => [
    a.id,
    {
      id: a.id,
      title: `Contrato ${a.id}`,
      permalink: `https://contrataciondelestado.es/${a.id}`,
      contractType: a.contractType,
      status: 'awarded',
    },
  ]),
)

describe('lo situado en una zona se cuenta en contratos', () => {
  it('el detalle de la zona', () => {
    installFetchMock({})
    const { container } = render(
      <MemoryRouter>
        <ZoneDrilldown
          snapshot={SNAPSHOT}
          zoneSlug="el-molinet"
          contractsById={CONTRATOS}
          danaOnly={false}
          onClear={() => {}}
        />
      </MemoryRouter>,
    )
    expect(container.textContent).toContain('2 contratos')
    expect(container.textContent).not.toMatch(/\bobras?\b/i)
  })

  it('la tooltip del mapa', () => {
    installFetchMock({})
    const { container } = render(
      <GastoMap
        snapshot={SNAPSHOT}
        sliderTime={Date.now()}
        danaOnly={false}
        selectedZone={null}
        onSelectZone={() => {}}
      />,
    )
    expect(container.textContent).toContain('2 contratos')
    expect(container.textContent).not.toMatch(/\bobras?\b/i)
  })
})
