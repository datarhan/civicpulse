import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { TablaSesiones } from '../../src/components/plenos/TablaSesiones'
import { resumenPlenos } from '../../src/lib/pleno-summary'

/**
 * La tabla del índice de plenos, y las dos cosas que la hacen distinta de la
 * lista plana que sustituye.
 *
 * 1. UNA AUSENCIA NO ES UN CERO. La versión anterior devolvía 0 para una
 *    sesión sin procesar y `Count` no pintaba nada si `!n`, así que una sesión
 *    que no hemos leído y una sesión leída sin nada que contar eran el mismo
 *    píxel. En una página cuyo tema es cuánto del acta falta, ése es el error
 *    que no se puede permitir.
 *
 * 2. NINGUNA CIFRA DESCRIBE ALGO DISTINTO DE LO QUE HAY DEBAJO. El rediseño
 *    cometió este defecto por su cuenta y se vio en el navegador, no aquí: con
 *    un filtro puesto, la cabecera de año seguía diciendo «2026 · 11 sesiones»
 *    encima de cuatro filas, y el rótulo de la sección seguía diciendo 61.
 *    Es exactamente el fallo que la página existe para arreglar.
 */
const SNAPSHOTS = {
  plenos: {
    items: [
      { id: 'a', date: '2026-05-11', kind: 'ordinario' },
      { id: 'b', date: '2026-03-09', kind: 'urgente' },
      { id: 'c', date: '2025-12-01', kind: 'ordinario' },
    ],
    stats: { total: 3 },
  },
  // 'a' y 'c' tienen orden del día; 'b' no. Sólo 'a' tiene votaciones.
  agendas: {
    plenos: [
      { id: 'a', agendaCount: 15 },
      { id: 'c', agendaCount: 18 },
    ],
    stats: {},
  },
  manifest: { plenos: [{ plenoId: 'a', itemCount: 263 }], totals: {} },
  votes: { items: [{ plenoId: 'a', outcome: 'aprobado' }], stats: { byPleno: { a: 1 } } },
  findings: { items: [] },
}

function pinta() {
  const r = resumenPlenos(SNAPSHOTS)
  render(
    <MemoryRouter>
      <TablaSesiones filas={r.filas} filtros={r.filtros} porAnio={r.porAnio} loading={false} />
    </MemoryRouter>,
  )
  return r
}

function fila(id) {
  return document.querySelector(`a[href="/plenos/${id}"]`)
}

describe('TablaSesiones · la ausencia se dibuja aparte del cero', () => {
  it('una sesión sin orden del día lo dice, en vez de callar', () => {
    pinta()
    // 'b' no tiene nada procesado: puntos, declaraciones y hallazgos sin
    // extraer, y las votaciones con su propia palabra.
    expect(within(fila('b')).getAllByText('sin extraer').length).toBe(3)
    expect(within(fila('b')).getByText('sin transcribir')).toBeTruthy()
  })

  it('una sesión procesada sin hallazgos publicados pinta un 0, no una ausencia', () => {
    pinta()
    // 'a' tiene declaraciones extraídas y ningún hallazgo firmado: eso SÍ es un
    // cero, y la fila no puede decir «sin extraer» sobre él.
    const a = within(fila('a'))
    expect(a.getByText('0')).toBeTruthy()
    expect(a.queryByText('sin extraer')).toBeNull()
  })

  it('las votaciones nunca bajan a cero: o hay número, o falta por transcribir', () => {
    pinta()
    expect(within(fila('c')).getByText('sin transcribir')).toBeTruthy()
    expect(within(fila('a')).queryByText('sin transcribir')).toBeNull()
  })
})

describe('TablaSesiones · las cifras describen lo que se ve', () => {
  it('sin filtro, el rótulo y las cabeceras de año cuentan el total', () => {
    pinta()
    expect(screen.getByText(/Las sesiones · 3$/)).toBeTruthy()
    expect(screen.getByText('2 sesiones')).toBeTruthy() // 2026
    expect(screen.getByText('1 sesiones')).toBeTruthy() // 2025
  })

  it('con filtro, dicen cuántas se ven Y de cuántas', () => {
    pinta()
    fireEvent.click(screen.getByRole('button', { name: /Con votaciones/ }))

    expect(document.querySelectorAll('.cp-plenos-fila').length).toBe(1)
    expect(screen.getByText(/Las sesiones · 1 de 3/)).toBeTruthy()
    expect(screen.getByText('1 de 2 sesiones')).toBeTruthy()
    // Y el año que se queda sin filas no deja una cabecera huérfana detrás.
    expect(screen.queryByText(/de 1 sesiones/)).toBeNull()
  })

  it('cada chip promete exactamente las filas que deja', () => {
    const r = pinta()
    for (const f of r.filtros) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`${f.rotulo} · ${f.n}`) }))
      expect(document.querySelectorAll('.cp-plenos-fila').length, f.rotulo).toBe(f.n)
    }
  })
})
