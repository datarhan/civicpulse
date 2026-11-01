import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { LocaleProvider } from '../../src/i18n'
import { invalidateSnapshots } from '../../src/lib/snapshot-store'
import { installFetchMock } from '../setup/mockFetch'

vi.mock('../../src/reportajes', () => ({ REPORTAJE_SLUGS: ['uno'] }))
// La figura no es lo que se mide aquí, y cada emblema pide su propio dato.
vi.mock('../../src/components/reportajes/Emblema', () => ({ default: () => null }))

const { default: Reportajes } = await import('../../src/pages/Reportajes')

/**
 * El índice de /reportajes dice las correcciones de cada pieza con la misma
 * etiqueta que la portada (`ChipCorrecciones`): antes era una `Pill` en tono
 * `crit`, roja y en mayúsculas.
 */

afterEach(() => {
  cleanup()
  localStorage.clear()
  invalidateSnapshots()
})

function monta(correcciones) {
  localStorage.setItem('cp:lang', 'es')
  installFetchMock({
    '/data/reportajes/uno.json': {
      meta: {
        slug: 'uno',
        estado: 'publicado',
        seccion: 'Reportaje · Dinero público',
        titulo: 'Dos millones para el destino inteligente',
        subtitulo: 'Un resumen breve.',
        publicadoEl: '2026-07-15',
        correcciones,
      },
    },
  })
  return render(
    <LocaleProvider>
      <MemoryRouter>
        <Reportajes />
      </MemoryRouter>
    </LocaleProvider>,
  )
}

describe('/reportajes — las correcciones de cada ficha', () => {
  it('las dice en una frase neutra, con el término del glosario', async () => {
    const { container } = monta([{ fecha: '2026-08-02', texto: 'a' }, { texto: 'b' }])
    await screen.findByText('Dos millones para el destino inteligente')
    expect(container.textContent).toContain('Con 2 correcciones publicadas')
    expect(container.querySelector('[data-correcciones]')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'correcciones publicadas' })).toBeTruthy()
  })

  it('no dice nada cuando no hay', async () => {
    const { container } = monta([])
    await screen.findByText('Dos millones para el destino inteligente')
    expect(container.textContent).not.toMatch(/correc/i)
  })
})
