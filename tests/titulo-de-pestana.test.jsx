import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { render } from '@testing-library/react'
import {
  TITULO_SITIO,
  conSitio,
  useDocumentTitle,
  useTituloDeRuta,
} from '../src/hooks/useDocumentTitle'

/**
 * Las dos capas del título de la pestaña (src/hooks/useDocumentTitle.js).
 *
 * Lo que se prueba es el orden. React ejecuta los efectos del hijo ANTES que los
 * del padre, así que un armazón que escribiera `document.title` en su efecto
 * pisaría el de la ficha en cada navegación. Aquí el armazón es el padre y la
 * ficha el hijo, como en App.jsx.
 */
function Ruta({ ruta, pagina }) {
  useTituloDeRuta(ruta)
  return pagina === undefined ? null : <Pagina titulo={pagina} />
}
function Pagina({ titulo }) {
  useDocumentTitle(titulo)
  return null
}

describe('título de la pestaña', () => {
  it('el título del sitio es el del index.html, que es el que lee prerender-meta', () => {
    const html = readFileSync('index.html', 'utf8')
    expect(/<title>([\s\S]*?)<\/title>/.exec(html)?.[1]?.trim()).toBe(TITULO_SITIO)
  })

  it('la forma es la de prerender-meta: «<página> · <sitio>»', () => {
    expect(conSitio('Presupuesto')).toBe('Presupuesto · CivicPulse · Riba-roja de Túria')
    expect(conSitio(null)).toBe(TITULO_SITIO)
  })

  it('la ficha gana a la ruta aunque el efecto de la ruta corra después', () => {
    render(<Ruta ruta="Cargos" pagina="Teresa Pozuelo Martín" />)
    expect(document.title).toBe(conSitio('Teresa Pozuelo Martín'))
  })

  it('sin ficha, manda la ruta; y al navegar cambia', () => {
    const { rerender } = render(<Ruta ruta="Novedades" />)
    expect(document.title).toBe(conSitio('Novedades'))
    rerender(<Ruta ruta="Presupuesto" />)
    expect(document.title).toBe(conSitio('Presupuesto'))
  })

  it('al desmontarse la ficha vuelve el de la ruta, no el de antes', () => {
    const { rerender } = render(<Ruta ruta="Cargos" pagina="Teresa Pozuelo Martín" />)
    rerender(<Ruta ruta="Presupuesto" />)
    expect(document.title).toBe(conSitio('Presupuesto'))
  })

  it('una ficha sin dato todavía no tapa la ruta', () => {
    render(<Ruta ruta="Plenos" pagina={null} />)
    expect(document.title).toBe(conSitio('Plenos'))
  })

  it('la portada lleva el del sitio a secas', () => {
    render(<Ruta ruta={null} />)
    expect(document.title).toBe(TITULO_SITIO)
  })
})
