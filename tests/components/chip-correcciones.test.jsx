import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import ChipCorrecciones from '../../src/components/reportajes/ChipCorrecciones'

/**
 * El recuento de correcciones de una pieza, en la portada y en /reportajes.
 *
 * En rojo y en mayúsculas («9 CORRECCIONES PUBLICADAS») un vecino lo leía como
 * «esta pieza se equivocó nueve veces» (auditoría «dos lecturas», 25-10-2026,
 * portada §6). Es un registro que llevamos, y unas arreglan errores y otras
 * añaden lo que faltaba: la etiqueta va en tono neutro, en minúscula de frase, y
 * la palabra «correcciones» abre su entrada del glosario.
 */

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function pinta(n, idioma = 'es') {
  localStorage.setItem('cp:lang', idioma)
  return render(
    <LocaleProvider>
      <ChipCorrecciones n={n} />
    </LocaleProvider>,
  )
}

describe('ChipCorrecciones', () => {
  it('dice el recuento como una frase, no como un rótulo', () => {
    const { container } = pinta(9)
    expect(container.textContent).toBe('Con 9 correcciones publicadas')
  })

  it('en singular cuando hay una', () => {
    const { container } = pinta(1)
    expect(container.textContent).toBe('Con 1 corrección publicada')
  })

  it('en valencià', () => {
    expect(pinta(9, 'ca').container.textContent).toBe('Amb 9 correccions publicades')
    cleanup()
    expect(pinta(1, 'ca').container.textContent).toBe('Amb 1 correcció publicada')
  })

  it('no pinta nada sin correcciones', () => {
    expect(pinta(0).container.innerHTML).toBe('')
    cleanup()
    expect(pinta(undefined).container.innerHTML).toBe('')
  })

  it('en tono neutro y sin mayúsculas: ni rojo, ni ámbar, ni versalitas', () => {
    const { container } = pinta(9)
    const chip = container.querySelector('[data-correcciones]')
    expect(chip).toBeTruthy()
    const estilo = chip.getAttribute('style') ?? ''
    expect(estilo).not.toMatch(/crit|warn|amber|180,\s*83,\s*9/)
    expect(getComputedStyle(chip).textTransform).not.toBe('uppercase')
  })

  it('«correcciones publicadas» abre su definición del glosario, sin «nombre oficial»', () => {
    pinta(9)
    // El botón abarca «publicadas»: suelta detrás de él, la palabra se leía igual
    // en castellano y en valencià, y la guarda de la portada en valencià la cazó.
    const termino = screen.getByRole('button', { name: 'correcciones publicadas' })
    expect(termino.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(termino)
    expect(termino.getAttribute('aria-expanded')).toBe('true')
    const panel = document.getElementById(termino.getAttribute('aria-controls'))
    expect(panel.textContent).toContain(CATALOGUE.es['glosario.correccion.def'])
    // Es una palabra nuestra, no una magnitud oficial: el «Nombre oficial: …»
    // de las demás entradas aquí no nombraría nada.
    expect(panel.textContent).not.toMatch(/Nombre oficial/)
    fireEvent.click(screen.getByRole('button', { name: CATALOGUE.es['glosario.cerrar'] }))
    expect(termino.getAttribute('aria-expanded')).toBe('false')
  })
})
