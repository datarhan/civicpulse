/**
 * El buscador rápido, cerrado, no descarga su índice; y al cerrarse devuelve el
 * foco a quien lo abrió.
 *
 * Las dos cosas están relacionadas con montarlo en la portada. `CmdK` llama a
 * cuatro hooks de datos en el cuerpo del componente, así que los cuatro fetch
 * salían aunque `open` fuera false y el componente devolviera null —
 * `pleno-findings.json` son 274 KB—. Montarlo en `/` habría puesto esa descarga
 * en la primera pantalla del sitio.
 *
 * Y el foco: el efecto que guarda «quién tenía el foco» corría DESPUÉS de que
 * el input con autoFocus se lo llevara, así que guardaba el propio input y al
 * cerrar lo devolvía a un nodo desmontado — es decir, al body. Quien abre con
 * Cmd+K y cierra con Escape se queda sin sitio en la página.
 */
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useState } from 'react'

import { CmdK } from '../../src/components/CmdK'
import { installFetchMock } from '../setup/mockFetch'

const DATOS = {
  '/data/officials.json': { generatedAt: 'x', officials: [], formerOfficials: [] },
  '/data/promises.json': { generatedAt: 'x', items: [] },
  '/data/quejas.json': {
    generatedAt: 'x',
    stats: { total: 0, byState: {}, byNeighborhood: {}, byCategory: {}, byConcejal: {} },
    items: [],
  },
  '/data/pleno-findings.json': {
    generatedAt: 'x',
    items: [
      {
        id: 'f-prueba',
        title: 'Hallazgo de prueba del banco de pruebas',
        plenoDate: '2026-03-12',
        quotes: [],
      },
    ],
  },
}

describe('CmdK cerrado no se trae su índice', () => {
  it('con el panel cerrado no pide ninguno de los cuatro snapshots', async () => {
    const fetchMock = installFetchMock(DATOS)
    render(
      <MemoryRouter>
        <CmdK open={false} onOpen={() => {}} onClose={() => {}} />
      </MemoryRouter>,
    )
    await new Promise((r) => setTimeout(r, 0))
    const pedidas = fetchMock.mock.calls.map(([u]) => String(u))
    for (const fichero of ['pleno-findings', 'officials', 'promises', 'quejas']) {
      expect(
        pedidas.some((u) => u.includes(fichero)),
        `pidió ${fichero} estando cerrado`,
      ).toBe(false)
    }
  })

  it('abierto sí busca en el índice (control)', async () => {
    // Sin este control, «no pide nada» lo cumpliría un buscador que no busca.
    installFetchMock(DATOS)
    render(
      <MemoryRouter>
        <CmdK open onOpen={() => {}} onClose={() => {}} />
      </MemoryRouter>,
    )
    const input = await screen.findByPlaceholderText('Saltar a…')
    fireEvent.change(input, { target: { value: 'Hallazgo de prueba' } })
    expect(await screen.findByText(/Hallazgo de prueba/)).toBeInTheDocument()
  })
})

/** Un arnés mínimo con el botón que abre, para poder comprobar a dónde vuelve
 *  el foco: es lo que hace un lector de pantalla al cerrar el diálogo. */
function Arnes() {
  const [abierto, setAbierto] = useState(false)
  return (
    <MemoryRouter>
      <button type="button" onClick={() => setAbierto(true)}>
        abrir buscador
      </button>
      <CmdK open={abierto} onOpen={() => setAbierto(true)} onClose={() => setAbierto(false)} />
    </MemoryRouter>
  )
}

describe('CmdK devuelve el foco a quien lo abrió', () => {
  it('al cerrar, el foco vuelve al botón y no al body', async () => {
    installFetchMock(DATOS)
    render(<Arnes />)
    const boton = screen.getByRole('button', { name: 'abrir buscador' })
    boton.focus()
    fireEvent.click(boton)
    await screen.findByPlaceholderText('Saltar a…')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Saltar a…')).toBeNull()
    expect(document.activeElement).toBe(boton)
  })
})
