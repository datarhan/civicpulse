import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

import Departamentos from '../../src/pages/Departamentos'
import DepartamentoDetalle from '../../src/pages/DepartamentoDetalle'
import { installFetchMock } from '../setup/mockFetch'
import { CATALOGUE } from '../../src/i18n'

/**
 * /departamentos · las quejas, con la regla del registro.
 *
 * La tarjeta de cada concejalía decía «Quejas abiertas 1» por la única queja
 * publicada, capturada y SIN registrar. El plazo de la LPACAP corre desde el
 * registro, así que eso apuntaba una deuda que el ayuntamiento no tenía, al lado
 * del nombre de quien dirige el área. Es el defecto que se arregló por cargo y
 * por barrio, vivo aquí porque /departamentos agrega por otro camino.
 *
 * Y la lista de la ficha no enseñaba NADA: filtraba por `category` y `state`,
 * enlazaba por `id` y titulaba con `title`, y la instantánea publicada es
 * Open311 (`service_code`, `status`, `service_request_id`, `description`).
 * Salía vacía con el contador de encima diciendo que había quejas.
 *
 * Se montan las dos ramas con instantáneas fabricadas: la que publica cifras
 * (quejas del área registradas) y su control (las mismas, sin registrar). El e2e
 * no puede: deriva de la instantánea PUBLICADA, que hoy sólo ejerce la rama sin
 * registro. Tres abiertas y un silencio, distintos a propósito.
 */

const REGISTRADA = '2026-03-05T10:00:00Z'

const queja = (over = {}) => ({
  service_request_id: 'Q-01KURBANISMO01',
  status: 'en_tramite',
  service_code: 'urbanismo',
  service_name: 'urbanismo',
  description: 'Solar abandonado junto al colegio',
  requested_datetime: '2026-03-01T08:30:00Z',
  updated_datetime: '2026-03-05T10:00:00Z',
  lat: null,
  long: null,
  address_string: 'santa-rosa',
  apoyos: 11,
  concejalia_area: 'Urbanismo',
  concejal_slug: null,
  registro_entry_number: '2026-RE-0847',
  registered_at: REGISTRADA,
  ...over,
})

/** Tres abiertas del área —una de ellas en silencio— y dos de ellas registradas. */
const CON_REGISTRO = [
  queja(),
  queja({
    service_request_id: 'Q-01KURBANISMO02',
    status: 'silencio_negativo',
    description: 'Acera levantada en la calle Mayor',
  }),
  queja({
    service_request_id: 'Q-01KURBANISMO03',
    status: 'capturada',
    description: 'Farola apagada desde el verano',
    registro_entry_number: null,
    registered_at: null,
  }),
]

/** Las mismas tres, ninguna registrada todavía. */
const SIN_REGISTRO = CON_REGISTRO.map((q) => ({
  ...q,
  status: 'capturada',
  registro_entry_number: null,
  registered_at: null,
}))

/** La instantánea publicada: `stats.total` tiene que cuadrar con `items`. */
const instantanea = (items) => ({
  generatedAt: '2026-04-20T12:00:00Z',
  source: {},
  stats: { total: items.length, byState: {}, byNeighborhood: {}, byCategory: {}, byConcejal: {} },
  items,
})

function monta(ruta, items) {
  installFetchMock({
    '/data/officials.json': { officials: [] },
    '/data/promises.json': { items: [] },
    '/data/plenos-agendas.json': { plenos: [] },
    '/data/pleno-votes.json': { items: [] },
    '/data/quejas.json': instantanea(items),
  })
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/departamentos" element={<Departamentos />} />
        <Route path="/departamentos/:slug" element={<DepartamentoDetalle />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** La celda «Quejas abiertas» de la tarjeta de Urbanismo en el índice. */
async function celdaDeLaTarjeta() {
  await waitFor(() =>
    expect(document.querySelector('a[href="/departamentos/urbanismo"]')).not.toBeNull(),
  )
  const tarjeta = document.querySelector('a[href="/departamentos/urbanismo"]')
  return within(tarjeta).getByText(CATALOGUE.es['departamentos.card.quejas']).parentElement
}

/** La celda «Quejas abiertas» de la tira de la ficha. */
async function celdaDeLaFicha() {
  const rotulo = await screen.findByText(CATALOGUE.es['departamentos.card.quejas'], {
    selector: 'div',
  })
  return rotulo.parentElement
}

describe('/departamentos · la tarjeta de la concejalía', () => {
  it('con quejas del área registradas, publica las abiertas', async () => {
    monta('/departamentos', CON_REGISTRO)
    const celda = await celdaDeLaTarjeta()
    expect(within(celda).getByText('3')).toBeInTheDocument()
    expect(within(celda).queryByText('—')).toBeNull()
    expect(within(celda).queryByText(CATALOGUE.es['quejas.reloj.sinRegistro.corto'])).toBeNull()
  })

  it('EL CONTROL: sin registro, «—» y el motivo, y la cifra no aparece', async () => {
    monta('/departamentos', SIN_REGISTRO)
    const celda = await celdaDeLaTarjeta()
    expect(within(celda).getByText('—')).toBeInTheDocument()
    expect(
      within(celda).getByText(CATALOGUE.es['quejas.reloj.sinRegistro.corto']),
    ).toBeInTheDocument()
    expect(within(celda).queryByText('3'), 'la deuda que el ayuntamiento no tiene').toBeNull()
  })
})

describe('/departamentos/:slug · la ficha de la concejalía', () => {
  it('con registro: la cifra, sin motivo, y la lista enlaza cada queja activa', async () => {
    monta('/departamentos/urbanismo', CON_REGISTRO)
    const celda = await celdaDeLaFicha()
    expect(within(celda).getByText('3')).toBeInTheDocument()
    expect(screen.queryByText(CATALOGUE.es['quejas.reloj.sinRegistro'])).toBeNull()
    for (const q of CON_REGISTRO) {
      const texto = await screen.findByText(q.description)
      expect(texto.closest('a'), q.service_request_id).toHaveAttribute(
        'href',
        `/quejas/${q.service_request_id.toLowerCase()}`,
      )
    }
  })

  it('EL CONTROL: sin registro, «—» y el motivo entero, y la lista sigue ahí', async () => {
    monta('/departamentos/urbanismo', SIN_REGISTRO)
    const celda = await celdaDeLaFicha()
    expect(within(celda).getByText('—')).toBeInTheDocument()
    expect(await screen.findByText(CATALOGUE.es['quejas.reloj.sinRegistro'])).toBeInTheDocument()
    // Que la queja exista es un hecho del canal: la lista no se esconde.
    for (const q of SIN_REGISTRO) {
      expect(await screen.findByText(q.description)).toBeInTheDocument()
    }
  })
})
