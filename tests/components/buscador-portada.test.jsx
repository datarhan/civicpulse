/**
 * En la portada, «Buscar en el municipio… ⌘K» no hacía nada: el botón no tenía
 * `onClick` y `CmdK` no se montaba en la rama de `/`, así que ni el atajo ni el
 * botón abrían nada. Un buscador pintado y muerto es peor que ninguno — promete
 * una salida que no existe.
 *
 * Se abre por CONTEXTO y no por prop: `tests/route-graph-portada.test.ts` exige
 * que App.jsx pinte `<DirectionD />` sin atributos —de ahí saca el grafo cuál
 * es el módulo de la portada—, así que pasarle un `onOpenCmdK` rompería el
 * grafo de rutas, que es lo que alimenta la revisión lectora y el recordatorio
 * de prosa rancia.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { Header } from '../../src/variants/direction-d/Topbar'
import { AbrirBuscador } from '../../src/lib/buscador'
import { CATALOGUE } from '../../src/i18n'

function pinta(abrir) {
  globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 }))
  return render(
    <MemoryRouter>
      <AbrirBuscador.Provider value={abrir}>
        <Header now={new Date('2026-09-13T10:00:00Z')} />
      </AbrirBuscador.Provider>
    </MemoryRouter>,
  )
}

const boton = () => screen.getByRole('button', { name: CATALOGUE.es['topbar.search.aria'] })

describe('el buscador de la portada', () => {
  it('el botón pide abrir el buscador', () => {
    const abrir = vi.fn()
    pinta(abrir)
    fireEvent.click(boton())
    expect(abrir).toHaveBeenCalledTimes(1)
  })

  it('es un botón de verdad, con su texto y su atajo anunciado', () => {
    // `type=button` para que nunca envíe un formulario, y el atajo en
    // aria-keyshortcuts: el «⌘K» pintado no lo lee un lector de pantalla.
    pinta(vi.fn())
    const b = boton()
    expect(b).toHaveAttribute('type', 'button')
    expect(b).toHaveAttribute('aria-keyshortcuts')
    expect(b.textContent).toContain(CATALOGUE.es['topbar.search'])
  })

  it('sin contexto no reventaría la portada', () => {
    // La portada es la única pantalla sin shell: si el proveedor no estuviera,
    // el botón tiene que quedarse inerte en vez de tirar la página entera.
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 }))
    render(
      <MemoryRouter>
        <Header now={new Date('2026-09-13T10:00:00Z')} />
      </MemoryRouter>,
    )
    expect(() => fireEvent.click(boton())).not.toThrow()
  })
})
