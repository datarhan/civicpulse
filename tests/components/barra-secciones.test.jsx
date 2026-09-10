/**
 * La barra de secciones de la portada (lámina 1b de «Portada · Revisión»).
 *
 * Sustituye al carril de glifos cuyo único rótulo vivía en un `title`, que no
 * existe en táctil y sólo aparece tras un segundo de ratón quieto. La lámina
 * dejó el precio por escrito: «un menú desplegable que hay que hacer accesible
 * por teclado». Estas pruebas son ese precio, pagado. El patrón es el de
 * navegación con desplegables de la APG —botón con aria-expanded que controla
 * una lista de enlaces—, no un role="menu", que es para acciones de una
 * aplicación y no para ir a otra página.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { BarraSecciones } from '../../src/variants/direction-d/BarraSecciones'
import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { NAV, NAV_SECONDARY } from '../../src/nav'

function pinta() {
  return render(
    <MemoryRouter>
      <BarraSecciones />
      <button type="button">fuera</button>
    </MemoryRouter>,
  )
}

const panelDe = (boton) => document.getElementById(boton.getAttribute('aria-controls'))
const boton = (nombre) => screen.getByRole('button', { name: nombre })

describe('BarraSecciones', () => {
  it('pinta los cinco grupos con nombre, todos cerrados', () => {
    pinta()
    for (const nombre of ['Gobierno', 'Dinero', 'Vigilancia', 'Ciudadanía', 'Laboratorio']) {
      const b = boton(nombre)
      expect(b).toHaveAttribute('aria-expanded', 'false')
      // Cada botón controla un panel que EXISTE: un aria-controls colgante es
      // un botón que no dice qué abre.
      expect(panelDe(b), `el panel de ${nombre}`).not.toBeNull()
      expect(panelDe(b)).not.toBeVisible()
    }
  })

  it('abrir un grupo enseña sus secciones, cada una con su frase', () => {
    pinta()
    const gobierno = boton('Gobierno')
    fireEvent.click(gobierno)
    expect(gobierno).toHaveAttribute('aria-expanded', 'true')
    const panel = panelDe(gobierno)
    expect(panel).toBeVisible()
    expect(within(panel).getByText(/quién decide/)).toBeInTheDocument()

    const cargos = within(panel).getByRole('link', { name: /^Cargos/ })
    expect(cargos).toHaveAttribute('href', '/cargos')
    // La frase se lee del catálogo: lo que se prueba es que la fila pinta la
    // SUYA, no una redacción concreta que cualquier corrección cambiaría.
    expect(cargos).toHaveTextContent(CATALOGUE.es['nav.desc.cargos'])

    // Sólo las de su grupo: el presupuesto es de «Dinero».
    expect(within(panel).queryByRole('link', { name: /^Presupuesto/ })).toBeNull()
  })

  it('abrir otro grupo cierra el primero', () => {
    pinta()
    const gobierno = boton('Gobierno')
    const dinero = boton('Dinero')
    fireEvent.click(gobierno)
    fireEvent.click(dinero)
    expect(gobierno).toHaveAttribute('aria-expanded', 'false')
    expect(panelDe(gobierno)).not.toBeVisible()
    expect(dinero).toHaveAttribute('aria-expanded', 'true')
    expect(panelDe(dinero)).toBeVisible()
  })

  it('volver a pulsar un grupo abierto lo cierra', () => {
    pinta()
    const gobierno = boton('Gobierno')
    fireEvent.click(gobierno)
    fireEvent.click(gobierno)
    expect(gobierno).toHaveAttribute('aria-expanded', 'false')
    expect(panelDe(gobierno)).not.toBeVisible()
  })

  it('Escape cierra el panel y devuelve el foco a su botón', () => {
    pinta()
    const gobierno = boton('Gobierno')
    fireEvent.click(gobierno)
    const cargos = within(panelDe(gobierno)).getByRole('link', { name: /^Cargos/ })
    cargos.focus()
    fireEvent.keyDown(cargos, { key: 'Escape' })
    expect(gobierno).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(gobierno)
  })

  it('Escape con el foco fuera de la barra cierra sin llevarse el foco', () => {
    // Quien abrió con el ratón y siguió en otra parte de la página no debe ver
    // saltar su foco a la barra por pulsar Escape.
    pinta()
    const gobierno = boton('Gobierno')
    fireEvent.click(gobierno)
    const fuera = boton('fuera')
    fuera.focus()
    fireEvent.keyDown(fuera, { key: 'Escape' })
    expect(gobierno).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(fuera)
  })

  it('flecha abajo abre el grupo y lleva al primer enlace, y las flechas lo recorren', () => {
    pinta()
    const gobierno = boton('Gobierno')
    gobierno.focus()
    fireEvent.keyDown(gobierno, { key: 'ArrowDown' })
    expect(gobierno).toHaveAttribute('aria-expanded', 'true')

    const enlaces = within(panelDe(gobierno)).getAllByRole('link')
    expect(enlaces.length).toBeGreaterThan(2)
    expect(document.activeElement).toBe(enlaces[0])

    fireEvent.keyDown(enlaces[0], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(enlaces[1])
    fireEvent.keyDown(enlaces[1], { key: 'ArrowUp' })
    expect(document.activeElement).toBe(enlaces[0])
    fireEvent.keyDown(enlaces[0], { key: 'End' })
    expect(document.activeElement).toBe(enlaces.at(-1))
    fireEvent.keyDown(enlaces.at(-1), { key: 'Home' })
    expect(document.activeElement).toBe(enlaces[0])
  })

  it('flecha arriba abre el grupo por su último enlace', () => {
    pinta()
    const dinero = boton('Dinero')
    dinero.focus()
    fireEvent.keyDown(dinero, { key: 'ArrowUp' })
    const enlaces = within(panelDe(dinero)).getAllByRole('link')
    expect(document.activeElement).toBe(enlaces.at(-1))
  })

  it('las flechas laterales pasan de un grupo al de al lado', () => {
    pinta()
    const gobierno = boton('Gobierno')
    const dinero = boton('Dinero')
    gobierno.focus()
    fireEvent.keyDown(gobierno, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(dinero)
    fireEvent.keyDown(dinero, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(gobierno)
  })

  it('y dan la vuelta: del índice se pasa al primer grupo, y al revés', () => {
    pinta()
    const indice = boton('Índice')
    const gobierno = boton('Gobierno')
    indice.focus()
    fireEvent.keyDown(indice, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(gobierno)
    fireEvent.keyDown(gobierno, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(indice)
  })

  it('pulsar fuera de la barra cierra el panel', () => {
    pinta()
    const gobierno = boton('Gobierno')
    fireEvent.click(gobierno)
    fireEvent.pointerDown(boton('fuera'))
    expect(gobierno).toHaveAttribute('aria-expanded', 'false')
  })

  it('pulsar DENTRO del panel, en un hueco, no lo cierra', () => {
    // Un clic en el fondo del panel dispara pointerdown dentro de la barra y
    // deja el foco en el body: focusout con relatedTarget nulo. Ninguna de las
    // dos cosas es «irse», y cerrar ahí le quitaría el panel a quien lo lee.
    pinta()
    const gobierno = boton('Gobierno')
    fireEvent.click(gobierno)
    const panel = panelDe(gobierno)
    fireEvent.pointerDown(panel)
    fireEvent.focusOut(gobierno, { relatedTarget: null })
    expect(gobierno).toHaveAttribute('aria-expanded', 'true')
    expect(panel).toBeVisible()
  })

  it('sacar el foco de la barra con el tabulador cierra el panel', () => {
    pinta()
    const gobierno = boton('Gobierno')
    fireEvent.click(gobierno)
    fireEvent.focusOut(gobierno, { relatedTarget: boton('fuera') })
    expect(gobierno).toHaveAttribute('aria-expanded', 'false')
  })

  it('el índice lleva a TODAS las secciones de la navegación, las del proyecto incluidas', () => {
    pinta()
    const indice = boton('Índice')
    fireEvent.click(indice)
    const panel = panelDe(indice)
    expect(panel).toBeVisible()

    const hrefs = within(panel)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
    // El índice es la única vía de la portada a Quiénes somos, Metodología y
    // Aviso legal: el carril los llevaba al pie y la barra no los tiene.
    const esperadas = [...NAV, ...NAV_SECONDARY].map((n) => n.to).filter((to) => to !== '/')
    expect(esperadas.length).toBeGreaterThan(15)
    for (const to of esperadas) expect(hrefs, `el índice no lleva a ${to}`).toContain(to)
  })

  it('la acción principal abre el bot de quejas', () => {
    pinta()
    const accion = screen.getByRole('link', { name: /Poner una queja/ })
    expect(accion.getAttribute('href')).toMatch(/^https:\/\/t\.me\/munigraph_bot/)
  })

  describe('en valencià', () => {
    afterEach(() => localStorage.removeItem('cp:lang'))

    it('los grupos se rotulan en valencià', () => {
      localStorage.setItem('cp:lang', 'ca')
      render(
        <LocaleProvider>
          <MemoryRouter>
            <BarraSecciones />
          </MemoryRouter>
        </LocaleProvider>,
      )
      expect(boton('Govern')).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByRole('button', { name: 'Gobierno' })).toBeNull()
    })
  })
})
