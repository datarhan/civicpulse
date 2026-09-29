import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import Laboratorio from '../src/pages/Laboratorio'
import { installFetchMock } from './setup/mockFetch'

/**
 * El contador de la lista de /laboratorio decía «46 de 45 · ventana 30 días»
 * (revisión lectora, 28-09-2026): más tarjetas que su propio total.
 *
 * El numerador salía de la lista que se pinta —los titulares del feed MÁS las
 * tarjetas FUERA DEL FEED, reconstruidas desde las afirmaciones que guardamos— y
 * el denominador, de `pressLabSummary`, que sólo contaba el feed, con otro
 * predicado de fecha y otro reloj. Filas reales del 28-09-2026: 45 titulares del
 * feed en la ventana y uno, `t335v0` (Actualidad Valencia, 25-09), que ya no está
 * en el feed y sí en las afirmaciones.
 */
const ROOT = join(__dirname, '..')
const leer = (f) => JSON.parse(readFileSync(join(ROOT, 'tests/fixtures', f), 'utf8'))
const PRESS = leer('press_2026-09-28.json')
const VERIFICADAS = leer('press-claims-verified_2026-09-28.json')
const AHORA = new Date('2026-09-29T09:00:00Z')
const DIA = 86_400_000

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  installFetchMock({
    '/data/press.json': PRESS,
    '/data/press-claims-verified.json': VERIFICADAS,
  })
})
afterEach(() => vi.useRealTimers())

async function montar() {
  render(
    <MemoryRouter>
      <Laboratorio />
    </MemoryRouter>,
  )
  return screen.findByText(/· ventana 30 días$/)
}
const contador = (el) => {
  const m = el.textContent.match(/^(\d+) de (\d+) · ventana 30 días$/)
  expect(m, el.textContent).not.toBeNull()
  return { x: Number(m[1]), y: Number(m[2]) }
}
const tarjetas = () => screen.queryAllByText('Solicitar derecho de réplica →').length

describe('el contador de /laboratorio no cuenta más de lo que tiene', () => {
  it('la premisa, medida: el feed solo no cuadra con la lista', () => {
    const corte = AHORA.getTime() - 30 * DIA
    expect(PRESS.items.filter((p) => Date.parse(p.date) >= corte)).toHaveLength(45)
    expect(PRESS.items.some((p) => p.id === 't335v0')).toBe(false)
    const fuera = VERIFICADAS.items.find((r) => r.claim.articleId === 't335v0')
    expect(fuera).toBeDefined()
    expect(Date.parse(fuera.claim.articleDate)).toBeGreaterThanOrEqual(corte)
  })

  it('sin filtros, el total es lo que la lista pinta: 45 del feed + 1 fuera del feed', async () => {
    const el = await montar()
    // Mide algo: la tarjeta que destapó el defecto está pintada.
    expect(screen.getByText('FUERA DEL FEED')).toBeInTheDocument()
    expect(tarjetas()).toBe(46)
    expect(contador(el)).toEqual({ x: 46, y: 46 })
  })

  it('el KPI de titulares cuenta el mismo universo y dice cuántos están fuera del feed', async () => {
    await montar()
    const rotulo = screen.getByText('Titulares monitorizados')
    expect(rotulo.nextElementSibling.textContent).toBe('46')
    expect(rotulo.parentElement.textContent).toContain('1 fuera del feed')
  })

  it('con cualquier filtro, el numerador es lo que se pinta y nunca pasa del total', async () => {
    const el = await montar()
    const medio = () => screen.getByLabelText('Filtrar por medio')
    const veredicto = () => screen.getByLabelText('Filtrar por veredicto')
    const medios = [...medio().options].map((o) => o.value)
    const veredictos = [...veredicto().options].map((o) => o.value)
    let comprobados = 0
    for (const m of medios) {
      for (const v of veredictos) {
        fireEvent.change(medio(), { target: { value: m } })
        fireEvent.change(veredicto(), { target: { value: v } })
        const { x, y } = contador(el)
        expect(y, `${m} × ${v}`).toBe(46)
        expect(x, `${m} × ${v}`).toBe(tarjetas())
        comprobados += 1
      }
    }
    expect(comprobados).toBeGreaterThan(20)
    // Uno a mano: los dos de Actualidad Valencia, el del feed y el que ya no está.
    fireEvent.change(medio(), { target: { value: 'Actualidad Valencia' } })
    fireEvent.change(veredicto(), { target: { value: 'all' } })
    expect(contador(el)).toEqual({ x: 2, y: 46 })
  })
})
