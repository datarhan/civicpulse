import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import Laboratorio from '../src/pages/LaboratorioPrensa'
import { installFetchMock } from './setup/mockFetch'

/**
 * La lista vacía de /laboratorio/prensa dice por qué está vacía.
 *
 * Respondía siempre «No hay artículos que coincidan con el filtro» y, debajo,
 * cuatro órdenes `npm run` «si acabas de instalar el laboratorio». Las órdenes se
 * fueron en el barrido de palabras, y su primera frase de recambio («Prueba con
 * otro medio o con otro veredicto») tenía el mismo defecto que el título: la
 * lectura independiente del barrido vio que la tarjeta sale también SIN ningún
 * filtro puesto, cuando la ventana de 30 días se queda sin titulares, y entonces
 * culpaba a un filtro que no existe.
 *
 * Dos casos con las filas reales del 28-09-2026: un veredicto que ninguna tiene
 * («Discrepa»: 0 contradichas ese día), y la misma página un año después, con la
 * ventana vacía.
 */
const ROOT = join(__dirname, '..')
const leer = (f) => JSON.parse(readFileSync(join(ROOT, 'tests/fixtures', f), 'utf8'))
const PRESS = leer('press_2026-09-28.json')
const VERIFICADAS = leer('press-claims-verified_2026-09-28.json')

function montarEl(fecha) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(fecha))
  installFetchMock({
    '/data/press.json': PRESS,
    '/data/press-claims-verified.json': VERIFICADAS,
  })
  render(
    <MemoryRouter>
      <Laboratorio />
    </MemoryRouter>,
  )
  return screen.findByText(/· ventana 30 días$/)
}

beforeEach(() => vi.useRealTimers())
afterEach(() => vi.useRealTimers())

describe('/laboratorio/prensa · la lista vacía', () => {
  it('mide algo: ese día ninguna afirmación salió contradicha', () => {
    expect(VERIFICADAS.items.some((r) => r.verification?.verdict === 'contradicho')).toBe(false)
  })

  it('con un filtro que no casa, culpa al filtro y propone otro', async () => {
    await montarEl('2026-09-29T09:00:00Z')
    fireEvent.change(screen.getByLabelText('Filtrar por veredicto'), {
      target: { value: 'contradicho' },
    })
    expect(await screen.findByText('No hay artículos que coincidan con el filtro')).toBeTruthy()
    expect(screen.getByText(/Prueba con otro medio o con otro veredicto/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/npm run/)
  })

  it('sin filtro y sin titulares en la ventana, dice eso y no habla del filtro', async () => {
    await montarEl('2027-09-29T09:00:00Z')
    expect(await screen.findByText('No hay artículos en los últimos 30 días')).toBeTruthy()
    expect(screen.queryByText('No hay artículos que coincidan con el filtro')).toBeNull()
    expect(document.body.textContent).not.toMatch(/Prueba con otro medio/)
  })
})
