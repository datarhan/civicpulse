/**
 * WCAG 2.5.3, «etiqueta en el nombre»: el nombre accesible de un control contiene
 * el texto que el control pone a la vista. Quien maneja la página por voz dice lo
 * que lee: «pulsa Buscar quejas» no acierta si el botón se llama «Buscar» a secas.
 *
 * El recorrido de verdad lo hace axe en `tests/e2e/a11y.spec.ts`, ruta a ruta y en
 * castellano. Esto fija los dos idiomas. Y va por el nombre calculado, no por axe,
 * porque el buscador se llama por su texto y la regla no mira esos controles.
 *
 * Por qué el buscador no lleva `aria-label`: axe 4.14 compara palabra a palabra con
 * lo que hay pintado, `aria-hidden` incluido, así que el «⌘K» cuenta. Una etiqueta
 * que lo contuviera le leería el atajo a quien usa un móvil sin esa tecla.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { Topbar } from '../../src/components/Topbar'
import { ShareWA } from '../../src/components/Primitives'
import { Header } from '../../src/variants/direction-d/Topbar'
import { AbrirBuscador } from '../../src/lib/buscador'
import { CATALOGUE, LocaleProvider } from '../../src/i18n'

const IDIOMAS = ['es', 'ca']

function enIdioma(idioma, nodo) {
  localStorage.setItem('cp:lang', idioma)
  return render(
    <LocaleProvider>
      <MemoryRouter>{nodo}</MemoryRouter>
    </LocaleProvider>,
  )
}

const BUSCADORES = {
  'el de la cáscara': (abrir) => <Topbar crumb="Cargos" onOpenCmdK={abrir} />,
  'el de la portada': (abrir) => (
    <AbrirBuscador.Provider value={abrir}>
      <Header now={new Date('2026-09-13T10:00:00Z')} />
    </AbrirBuscador.Provider>
  ),
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe.each(Object.keys(BUSCADORES))('el buscador: %s', (cual) => {
  it.each(IDIOMAS)('en %s se llama lo que dice, y el atajo va aparte', (idioma) => {
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 }))
    const abrir = vi.fn()
    enIdioma(idioma, BUSCADORES[cual](abrir))
    const pista = CATALOGUE[idioma]['topbar.search']
    const b = screen.getByRole('button', { name: pista })

    expect(b).toHaveAccessibleName(pista)
    expect(b).not.toHaveAttribute('aria-label')
    // El «⌘K» sigue pintado y fuera del nombre. Lo que dice el atajo es el
    // atributo, y por eso lo llevan los dos buscadores.
    expect(b.querySelector('.cp-topbar-search-kbd')).toHaveTextContent('⌘K')
    expect(b.querySelector('.cp-topbar-search-kbd')).toHaveAttribute('aria-hidden', 'true')
    expect(b).toHaveAttribute('aria-keyshortcuts', 'Meta+K Control+K')

    fireEvent.click(b)
    expect(abrir).toHaveBeenCalledTimes(1)
  })
})

describe('la pastilla de compartir por WhatsApp', () => {
  it.each(IDIOMAS)('en %s, lo que se lee es una palabra del nombre', (idioma) => {
    enIdioma(idioma, <ShareWA text="Queja Q-1" url="https://civicpulse.es/quejas/q-1" />)
    const nombre = CATALOGUE[idioma]['common.compartirWhatsApp']
    const b = screen.getByRole('button', { name: nombre })
    // Palabra entera: «WA» no lo era, aunque compartiera letras con «WhatsApp».
    expect(nombre.split(' ')).toContain('WhatsApp')
    expect(b).toHaveTextContent(/WhatsApp$/)
  })
})
