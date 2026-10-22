import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { CATALOGUE, LocaleProvider } from '../src/i18n'
import EnBreveMetodologia from '../src/components/metodologia/EnBreveMetodologia'
import { detectorDeCastellano, loQueSeLee } from './setup/castellano'

/**
 * «En breve» de /metodologia: cinco reglas de la página, dichas en corto.
 *
 * La página es el contrato editorial publicado, así que lo que más importa es
 * que cada respuesta lleve a la regla que la sostiene: un ancla que no existe
 * deja al lector arriba sin decirle nada, y una respuesta sin su regla es una
 * promesa que la página no hace.
 */
function pinta(idioma) {
  localStorage.setItem('cp:lang', idioma)
  return render(
    <MemoryRouter>
      <LocaleProvider>
        <EnBreveMetodologia />
      </LocaleProvider>
    </MemoryRouter>,
  )
}

afterEach(() => localStorage.clear())

describe('/metodologia · En breve', () => {
  it('cinco preguntas y el recorrido de cinco pasos', () => {
    const { container } = pinta('es')
    expect(container.querySelectorAll('[data-en-breve]')).toHaveLength(5)
    expect(screen.getByRole('list', { name: 'El recorrido de un dato' }).children).toHaveLength(5)
  })

  it('cada ancla de esta página existe en Metodologia.jsx', () => {
    const { container } = pinta('es')
    const pagina = readFileSync('src/pages/Metodologia.jsx', 'utf8')
    const anclas = [...container.querySelectorAll('a[href^="#"]')].map((a) =>
      a.getAttribute('href').slice(1),
    )
    // Mide algo: el «saltar» y cuatro tarjetas.
    expect(anclas.length).toBeGreaterThanOrEqual(5)
    for (const id of new Set(anclas))
      expect(pagina, `#${id} no está en /metodologia`).toMatch(new RegExp(`id="${id}"`))
  })

  it('la que sale de la página lleva a /datos', () => {
    pinta('es')
    expect(screen.getByRole('link', { name: 'Ver todas las fuentes →' })).toHaveAttribute(
      'href',
      '/datos',
    )
  })

  it('ninguna respuesta copia un plazo o una cifra de su regla', () => {
    // Las cifras de una regla viven en la regla; una copia aquí envejece sola.
    for (const loc of ['es', 'ca'])
      for (const [k, v] of Object.entries(CATALOGUE[loc]))
        if (k.startsWith('metodologia.enBreve.') && !k.includes('.paso.'))
          expect(v, `${loc} ${k}`).not.toMatch(/\d/)
  })

  it('en valencià no queda nada en castellano, ni ningún hueco', () => {
    const { castellanoEn } = detectorDeCastellano(['BOE', 'GitHub'])
    const { container } = pinta('ca')
    expect(screen.getByRole('heading', { name: 'En resum' })).toBeInTheDocument()
    const texto = loQueSeLee(container).join(' · ')
    expect(texto.length).toBeGreaterThan(300)
    expect(texto).not.toMatch(/\{\w+\}|\[\[/)
    expect(castellanoEn(texto)).toEqual([])
  })
})
