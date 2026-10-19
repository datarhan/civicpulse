import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import ServicioDetalle from '../../src/pages/ServicioDetalle'
import { SerieServicio } from '../../src/components/eficiencia/SerieServicio'
import { MAPA_URL } from '../../src/scraper/cesel-entregas'
import { procedenciaCesel } from '../../src/scraper/cesel-procedencia'
import { installFetchMock } from '../setup/mockFetch'

/**
 * La ficha enseña de qué documento y de qué celda sale cada cifra.
 *
 * Imprimía «celda CE2:a1621:Econ14» —la clave interna con la que el motor
 * busca la cifra en coste-efectivo.json, que tiene la forma del volcado de
 * 2021— junto a un enlace a ese volcado, para una cifra de 2024 que sale del
 * informe por comunidad. Quien seguía el enlace no encontraba la cifra.
 */
const publicado = JSON.parse(readFileSync(resolve('public/data/indicadores.json'), 'utf8'))
const RESIDUOS = 'a1621-coste-unitario'
const ENTE = '17-46-214-AA-000'
const ATRIBUTO = 'Producción anual residuos urbanos: toneladas'

function conProcedencia() {
  const snap = structuredClone(publicado)
  const i = snap.indicadores.find((x) => x.id === RESIDUOS)
  const ccaa = procedenciaCesel(
    2024,
    { documento: 'informe-ccaa', url: MAPA_URL, ccaa: 17 },
    { programa: 'a1621', atributo: ATRIBUTO, ente: ENTE },
  )
  const nacional = procedenciaCesel(
    2021,
    {
      documento: 'volcado-nacional',
      url: 'https://www.hacienda.gob.es/cdi/power%20bi/cesel-2021.xlsx',
    },
    { programa: 'a1621', atributo: ATRIBUTO, ente: ENTE },
  )
  i.citas = [{ entrega: 2024, ...ccaa }]
  i.procedencia = [
    { entregas: [2014, 2015, 2016, 2017, 2018, 2019, 2022, 2023, 2024], ...ccaa },
    { entregas: [2021], ...nacional },
  ]
  return snap
}

describe('ServicioDetalle — «Fuente y réplica»', () => {
  it('cita el informe y la celda de 2024, no la clave interna ni el volcado de 2021', async () => {
    installFetchMock({ '/data/indicadores.json': conProcedencia() })
    render(
      <MemoryRouter initialEntries={[`/eficiencia/${RESIDUOS}`]}>
        <Routes>
          <Route path="/eficiencia/:id" element={<ServicioDetalle />} />
        </Routes>
      </MemoryRouter>,
    )
    const rotulo = await screen.findByText('Fuente y réplica')
    const tarjeta = rotulo.parentElement
    const texto = tarjeta.textContent
    expect(texto).toContain('«CE1a y CE2a»')
    expect(texto).toContain('coste_efectivo')
    expect(texto).not.toContain('CE2:a1621:Econ14')
    const enlaces = [...tarjeta.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(enlaces).toContain(MAPA_URL)
    // El volcado se enlaza sólo para la entrega que sale de él, y lo dice.
    expect(texto).toMatch(/2021/)
    expect(texto).toContain('«2021 CE2»')
  })
})

describe('SerieServicio — el año de otro régimen', () => {
  it('nombra el modo en castellano, no con la clave interna', () => {
    const puntos = [
      { anio: 2014, valor: 78.9, estado: 'declarado', otroModo: 'concesion' },
      { anio: 2015, valor: 141.2, estado: 'declarado' },
      { anio: 2016, valor: 112.4, estado: 'declarado' },
    ]
    const { container } = render(
      <SerieServicio puntos={puntos} formatea={(v) => `${v} €/t`} unidad="€/t" />,
    )
    const titulos = [...container.querySelectorAll('[title]')].map((e) => e.getAttribute('title'))
    const delAnio = titulos.find((t) => t.startsWith('2014'))
    expect(delAnio).toBeDefined()
    expect(delAnio).toContain('concesión')
    expect(delAnio).not.toMatch(/\bconcesion\b/)
  })
})
