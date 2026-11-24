/**
 * La marca de procedencia de una declaración (`MarcaDeProcedencia`): cada estado
 * del vocabulario tiene su forma, los que marcan se ven en los dos idiomas, y
 * uno que el mapa no conoce sale a la vista en vez de callarse.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import { MARCA_DE_PROCEDENCIA, MarcaDeProcedencia } from '../../src/components/MarcaDeProcedencia'
import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { MARKED_STATUS_IDS, QUOTE_PROVENANCE_STATUS_IDS } from '../../src/scraper/quote-provenance'

function pinta(procedencia, idioma = 'es') {
  localStorage.setItem('cp:lang', idioma)
  return render(
    <LocaleProvider>
      <MarcaDeProcedencia procedencia={procedencia} />
    </LocaleProvider>,
  )
}

afterEach(() => localStorage.clear())

describe('MarcaDeProcedencia', () => {
  it('el mapa cubre el vocabulario entero, ni más ni menos', () => {
    expect(Object.keys(MARCA_DE_PROCEDENCIA).sort()).toEqual(
      [...QUOTE_PROVENANCE_STATUS_IDS].sort(),
    )
    for (const id of QUOTE_PROVENANCE_STATUS_IDS) {
      // Marca quien el vocabulario dice que marca; el resto, nada.
      expect(MARCA_DE_PROCEDENCIA[id] !== null).toBe(MARKED_STATUS_IDS.includes(id))
    }
  })

  for (const idioma of ['es', 'ca']) {
    it(`pinta chip y nota de cada estado que marca (${idioma})`, () => {
      expect(MARKED_STATUS_IDS.length).toBeGreaterThan(0)
      for (const id of MARKED_STATUS_IDS) {
        const m = MARCA_DE_PROCEDENCIA[id]
        const { container, unmount } = pinta(id, idioma)
        const nodo = container.querySelector(`[data-procedencia="${id}"]`)
        expect(nodo).not.toBeNull()
        expect(nodo.textContent).toContain(CATALOGUE[idioma][m.chip])
        expect(nodo.textContent).toContain(CATALOGUE[idioma][m.nota])
        expect(nodo.querySelector('a[href="/metodologia#citas-transcripcion"]')).not.toBeNull()
        unmount()
      }
    })
  }

  it('no pinta nada en la vigente ni en un trozo sin marca', () => {
    for (const p of ['en-vigente', undefined, null]) {
      const { container, unmount } = pinta(p)
      expect(container.innerHTML).toBe('')
      unmount()
    }
  })

  it('un estado desconocido sale crudo y a la vista', () => {
    const { container } = pinta('estado-nuevo')
    expect(container.textContent).toContain('estado-nuevo')
  })
})
