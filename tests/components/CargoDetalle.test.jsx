import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

import CargoDetalle from '../../src/pages/CargoDetalle'
import { installFetchMock } from '../setup/mockFetch'
import { CATALOGUE } from '../../src/i18n'

/**
 * Las cifras de quejas de la ficha de un cargo, en la rama que NUNCA se ha
 * ejecutado.
 *
 * Desde el arreglo por cargo, `/cargos/:slug` publica «—» y un motivo mientras
 * ninguna queja de ese cargo esté registrada: el plazo de la LPACAP corre desde
 * el REGISTRO, así que «0 silencios» junto a un nombre era un aprobado que nadie
 * se había ganado.
 *
 * El problema es cómo se comprueba. El e2e deriva lo que espera de la
 * instantánea PUBLICADA, y hoy esa instantánea tiene una sola queja, capturada y
 * sin registrar — o sea que el e2e sólo ejerce la rama de «no medible». La rama
 * que publica las tres cifras de verdad no la ha corrido nada:
 *
 *   las PRIMERAS cifras reales que esa página publique saldrán por un camino que
 *   ninguna prueba ha pisado.
 *
 * Y es una página legalmente material: las tres cifras van al lado del nombre de
 * una persona. Así que aquí se montan las dos ramas con instantáneas fabricadas,
 * y las cifras se comprueban contra `byConcejal`, que es de donde salen.
 *
 * Los cuatro valores del caso medible son DISTINTOS entre sí (1 · 2 · 3 · 4) a
 * propósito: con ceros y unos, una celda cambiada de sitio seguiría pasando.
 */

const SLUG = 'teresa-pozuelo-martin'
const REGISTRADA = '2026-03-05T10:00:00Z'

const OFICIALES = {
  generatedAt: '2026-04-20T00:00:00Z',
  source: 'ribarroja.es',
  count: 1,
  composition: { PSOE: 1 },
  officials: [
    {
      slug: SLUG,
      name: 'Teresa Pozuelo Martín',
      honorific: 'Sra.',
      role: 'concejal',
      party: 'PSOE',
      portfolios: ['Obra Pública'],
      email: 'tpozuelo@ribarroja.es',
      photoUrl: '',
    },
  ],
}

/** Diez quejas del cargo: 1 resuelta, 3 pendientes, 4 silencios (y 2 más sin clasificar aquí). */
const FILA = { total: 10, resueltas: 1, pendientes: 3, silencios: 4 }

const queja = (over = {}) => ({
  service_request_id: 'Q-1',
  status: 'registrada',
  service_code: 'via_publica',
  service_name: 'via_publica',
  description: 'Bache profundo en Av. Primera',
  requested_datetime: '2026-03-01T08:30:00Z',
  updated_datetime: '2026-03-05T10:00:00Z',
  lat: null,
  long: null,
  address_string: 'santa-rosa',
  apoyos: 3,
  concejalia_area: 'Obra Pública',
  concejal_slug: SLUG,
  registro_entry_number: '2026-RE-0847',
  registered_at: REGISTRADA,
  ...over,
})

/** La instantánea publicada: `stats.total` tiene que cuadrar con `items`. */
function instantanea(items) {
  return {
    generatedAt: '2026-04-20T12:00:00Z',
    source: {},
    stats: {
      total: items.length,
      byState: {},
      byNeighborhood: {},
      byCategory: {},
      byConcejal: { [SLUG]: FILA },
    },
    items,
  }
}

function monta(quejas) {
  installFetchMock({
    '/data/officials.json': OFICIALES,
    '/data/quejas.json': quejas,
  })
  return render(
    <MemoryRouter initialEntries={[`/cargos/${SLUG}`]}>
      <Routes>
        <Route path="/cargos/:slug" element={<CargoDetalle />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** La celda de un `MiniStat`, localizada por su rótulo. */
async function celda(rotulo) {
  const etiqueta = await screen.findByText(rotulo, { selector: 'div' })
  return etiqueta.parentElement
}

describe('/cargos/:slug · las cifras de quejas', () => {
  it('LA RAMA SIN PROBAR: con una queja registrada, las tres celdas traen las cifras de byConcejal', async () => {
    monta(instantanea([queja()]))

    // La ficha ha montado (y no la pantalla de «no encontrado»).
    await waitFor(() => {
      expect(screen.getByText(/Teresa Pozuelo Martín/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(CATALOGUE.es['cargos.detalle.notFound'])).toBeNull()

    // Las cuatro celdas, cada una con SU cifra de la fila publicada.
    expect(within(await celda('Total')).getByText(String(FILA.total))).toBeInTheDocument()
    expect(within(await celda('Resueltas')).getByText(String(FILA.resueltas))).toBeInTheDocument()
    expect(within(await celda('Pendientes')).getByText(String(FILA.pendientes))).toBeInTheDocument()
    expect(within(await celda('Silencios')).getByText(String(FILA.silencios))).toBeInTheDocument()

    // Y ninguna «—»: es la rama medible.
    for (const r of ['Resueltas', 'Pendientes', 'Silencios']) {
      expect(within(await celda(r)).queryByText('—')).toBeNull()
    }

    // Ni motivo: no hay nada que excusar cuando las cifras se publican.
    for (const m of ['sinRegistro', 'exportIncompleto', 'sinDatos']) {
      expect(screen.queryByText(CATALOGUE.es[`quejas.reloj.${m}`])).toBeNull()
    }
  })

  it('EL CONTROL: sin registro, las tres son «—» y el motivo se publica', async () => {
    // La misma fila de `byConcejal`; lo único que cambia es la fecha de registro.
    monta(instantanea([queja({ registered_at: null, status: 'capturada' })]))

    await waitFor(() => {
      expect(screen.getByText(/Teresa Pozuelo Martín/i)).toBeInTheDocument()
    })

    // El total sigue: cuántas quejas se asignaron a esa área es un hecho del canal.
    expect(within(await celda('Total')).getByText(String(FILA.total))).toBeInTheDocument()

    for (const r of ['Resueltas', 'Pendientes', 'Silencios']) {
      expect(within(await celda(r)).getByText('—')).toBeInTheDocument()
    }
    // Y las cifras de la fila NO aparecen en esas tres celdas.
    expect(within(await celda('Resueltas')).queryByText(String(FILA.resueltas))).toBeNull()
    expect(within(await celda('Silencios')).queryByText(String(FILA.silencios))).toBeNull()

    expect(screen.getByText(CATALOGUE.es['quejas.reloj.sinRegistro'])).toBeInTheDocument()
  })
})
