/**
 * La barra lateral, en los grupos de la barra de secciones de la portada
 * (auditoría de las dos lecturas, fase 5, punto 3). Era una lista plana de una
 * veintena de entradas; ahora tiene los mismos cinco nombres que la portada.
 *
 * Lo que se vigila: que no se pierda ni se repita ninguna entrada al agrupar,
 * que los grupos sean los de la portada y en su orden, y que cada grupo se
 * pinte con su nombre delante de sus enlaces.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { Sidebar, gruposDeLaBarra } from '../../src/components/Sidebar'
import { CATALOGUE } from '../../src/i18n'
import { NAV, NAV_GROUPS, entradasDeGrupo } from '../../src/nav'

describe('gruposDeLaBarra', () => {
  const { portada, grupos, sueltas } = gruposDeLaBarra()

  it('cada entrada de NAV sale una vez, y ninguna se queda sin grupo', () => {
    const todas = [...portada, ...grupos.flatMap((g) => g.entradas), ...sueltas]
    expect(todas.map((n) => n.to).sort()).toEqual(NAV.map((n) => n.to).sort())
    expect(sueltas).toEqual([])
    expect(portada.map((n) => n.to)).toEqual(['/'])
  })

  it('los grupos son los de la portada, en su orden, con las mismas secciones', () => {
    const ids = grupos.map((g) => g.id)
    expect(ids.slice(0, NAV_GROUPS.length)).toEqual(NAV_GROUPS.map((g) => g.id))
    for (const g of NAV_GROUPS) {
      const enLaBarra = grupos.find((x) => x.id === g.id).entradas.map((n) => n.to)
      expect(enLaBarra, g.id).toEqual(entradasDeGrupo(g.id).map((n) => n.to))
    }
  })

  it('una entrada sin grupo conocido no se pierde: va al final', () => {
    const rara = { to: '/rara', id: 'rara', labelKey: 'nav.cargos', group: 'inventado' }
    expect(gruposDeLaBarra([...NAV, rara]).sueltas).toEqual([rara])
  })
})

describe('Sidebar', () => {
  // La ficha del municipio de la barra pide wikidata.json; aquí no hay servidor
  // y la petición fallaba después de la prueba, con un ECONNREFUSED en la salida.
  beforeEach(() =>
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    ),
  )
  afterEach(() => vi.unstubAllGlobals())

  it('pinta cada grupo con su nombre y sus enlaces dentro', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    )
    const { grupos } = gruposDeLaBarra()
    for (const g of grupos) {
      const grupo = screen.getByRole('group', { name: CATALOGUE.es[g.labelKey] })
      expect(within(grupo).getAllByRole('link')).toHaveLength(g.entradas.length)
    }
    // Mira algo: hay grupos que pintar, y la barra enlaza a todas las entradas.
    expect(grupos.length).toBeGreaterThanOrEqual(NAV_GROUPS.length)
    const enNav = within(screen.getByRole('navigation')).getAllByRole('link')
    expect(enNav).toHaveLength(NAV.length)
  })
})
