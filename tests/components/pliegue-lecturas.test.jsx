/**
 * El pliegue de las dos lecturas: «Ver: lo esencial · todo» (decisión D1-B de
 * la auditoría de las dos lecturas, salvaguarda 4 del diseño de la lectura
 * vecinal).
 *
 * Lo que se fija aquí son los términos de esa salvaguarda que se pueden
 * comprobar sin navegador: por defecto no se pliega nada; plegar cambia lo que
 * se ve y nunca lo que hay; cada camino hacia el detalle abre la sección a la
 * que apunta; y el control es un botón de verdad, con `aria-expanded` y
 * `aria-controls`. Lo que necesita CSS —que lo plegado no se vea, que la
 * impresión lo despliegue— está en tests/e2e/pliegue-lecturas.spec.ts.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useState } from 'react'
import { fireEvent, render } from '@testing-library/react'
import { Link, MemoryRouter } from 'react-router-dom'

import DivisorLecturas from '../../src/components/DivisorLecturas'
import {
  ProveedorLecturas,
  SeccionExperta,
  normalizaLecturas,
  seccionesPlegadasHacia,
} from '../../src/components/Lecturas'
import { CATALOGUE, LocaleProvider } from '../../src/i18n'

afterEach(() => {
  localStorage.clear()
})

function Pagina() {
  return (
    <>
      <a href="#b" data-prueba="ancla-b">
        Ver el detalle ↓
      </a>
      <a href="#todos-los-datos" data-abre-todo="" data-prueba="saltar">
        Saltar a todos los datos ↓
      </a>
      <Link to="/otra" data-prueba="navegar">
        Otra página
      </Link>
      <DivisorLecturas />
      <div id="todos-los-datos" />
      <SeccionExperta id="a" titulo="Sección A">
        <p>Cuerpo A</p>
      </SeccionExperta>
      <SeccionExperta id="b" titulo="Sección B">
        <p id="dentro-b">Cuerpo B</p>
      </SeccionExperta>
    </>
  )
}

function Arnes({ inicial }) {
  const [lecturas, setLecturas] = useState(inicial)
  return (
    <ProveedorLecturas lecturas={lecturas} onCambiar={setLecturas}>
      <Pagina />
    </ProveedorLecturas>
  )
}

function monta(inicial = 'todo') {
  localStorage.setItem('cp:lang', 'es')
  return render(
    <MemoryRouter initialEntries={['/pagina']}>
      <LocaleProvider>
        <Arnes inicial={inicial} />
      </LocaleProvider>
    </MemoryRouter>,
  )
}

const plegadas = (c) =>
  [...c.querySelectorAll('[data-seccion-experta][data-plegada]')].map((s) => s.id)
const control = (c) => c.querySelector('[data-ver-lecturas]')
const pestanaDe = (c, id) => c.querySelector(`#${id} > .cp-experta-plegada button`)

describe('el pliegue de las dos lecturas', () => {
  it('sin elección, no se pliega nada y el control dice que todo está abierto', () => {
    const { container } = monta()
    expect(container.querySelectorAll('[data-seccion-experta]')).toHaveLength(2)
    expect(plegadas(container)).toEqual([])
    const boton = control(container)
    expect(boton.tagName).toBe('BUTTON')
    expect(boton.getAttribute('aria-expanded')).toBe('true')
    expect(boton.getAttribute('aria-controls')).toBe('a-cuerpo b-cuerpo')
    for (const id of ['a-cuerpo', 'b-cuerpo']) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }
  })

  it('el control pliega y despliega todas las secciones', () => {
    const { container } = monta()
    fireEvent.click(control(container))
    expect(plegadas(container)).toEqual(['a', 'b'])
    expect(control(container).getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(control(container))
    expect(plegadas(container)).toEqual([])
  })

  it('plegar cambia lo que se ve, nunca lo que hay', () => {
    const todo = monta('todo').container.textContent
    const esencial = monta('esencial').container.textContent
    expect(esencial).toBe(todo)
    // Y no es igual por estar vacío: los cuerpos plegados siguen en el DOM.
    expect(esencial).toContain('Cuerpo A')
    expect(esencial).toContain('Cuerpo B')
  })

  it('la pestaña de una sección plegada la abre a ella sola y lleva el foco a su cuerpo', () => {
    const { container } = monta('esencial')
    expect(pestanaDe(container, 'b').getAttribute('aria-expanded')).toBe('false')
    expect(pestanaDe(container, 'b').getAttribute('aria-controls')).toBe('b-cuerpo')
    fireEvent.click(pestanaDe(container, 'b'))
    expect(plegadas(container)).toEqual(['a'])
    expect(document.activeElement?.id).toBe('b-cuerpo')
    // La preferencia guardada no cambia: es «lo esencial» con una abierta.
    expect(control(container).getAttribute('aria-expanded')).toBe('false')
  })

  it('un enlace a una sección plegada la abre antes de saltar', () => {
    const { container } = monta('esencial')
    fireEvent.click(container.querySelector('[data-prueba="ancla-b"]'))
    expect(plegadas(container)).toEqual(['a'])
  })

  it('«Saltar a todos los datos» abre todas', () => {
    const { container } = monta('esencial')
    fireEvent.click(container.querySelector('[data-prueba="saltar"]'))
    expect(plegadas(container)).toEqual([])
  })

  it('volver a «lo esencial» pliega también las que se abrieron una a una', () => {
    const { container } = monta('esencial')
    fireEvent.click(pestanaDe(container, 'a'))
    expect(plegadas(container)).toEqual(['b'])
    fireEvent.click(control(container)) // a «todo»
    fireEvent.click(control(container)) // y de vuelta
    expect(plegadas(container)).toEqual(['a', 'b'])
  })

  it('lo abierto a mano no viaja a la página siguiente; la preferencia, sí', () => {
    const { container } = monta('esencial')
    fireEvent.click(pestanaDe(container, 'a'))
    expect(plegadas(container)).toEqual(['b'])
    fireEvent.click(container.querySelector('[data-prueba="navegar"]'))
    expect(plegadas(container)).toEqual(['a', 'b'])
  })

  it('las secciones que hay que abrir para llegar a un elemento: la que lo contiene y las que contiene', () => {
    const { container } = monta('esencial')
    expect(seccionesPlegadasHacia(container.querySelector('#dentro-b'))).toEqual(['b'])
    expect(seccionesPlegadasHacia(container)).toEqual(['a', 'b'])
    expect(seccionesPlegadasHacia(container.querySelector('#todos-los-datos'))).toEqual([])
    expect(seccionesPlegadasHacia(null)).toEqual([])
  })

  it('sin proveedor, las secciones se pintan abiertas y no hay control', () => {
    localStorage.setItem('cp:lang', 'es')
    const { container } = render(
      <MemoryRouter>
        <LocaleProvider>
          <Pagina />
        </LocaleProvider>
      </MemoryRouter>,
    )
    expect(plegadas(container)).toEqual([])
    expect(control(container)).toBeNull()
    expect(container.querySelector('[data-divisor-lecturas]')).not.toBeNull()
  })
})

describe('la preferencia guardada', () => {
  it('sólo «esencial» pliega; cualquier otro valor es «todo»', () => {
    expect(normalizaLecturas('esencial')).toBe('esencial')
    for (const v of ['todo', undefined, null, '', 'ESENCIAL', 'facil', 1, {}]) {
      expect(normalizaLecturas(v)).toBe('todo')
    }
  })
})

describe('los rótulos del pliegue', () => {
  it('existen en los dos idiomas', () => {
    const claves = Object.keys(CATALOGUE.es).filter((k) => k.startsWith('lecturas.'))
    expect(claves.length).toBeGreaterThan(3)
    for (const k of claves) {
      expect(CATALOGUE.ca[k], `${k} en valencià`).toBeTruthy()
    }
  })

  // Lo único que se ve de una sección plegada es su título. Con una cifra
  // dentro, el pliegue dejaría a la vista una cifra con su salvedad plegada.
  // Las claves se leen del código que pinta las secciones, no de una lista
  // copiada aquí; los títulos que no salen de una clave fija (las clases de
  // /cambios) los mira la e2e en la página pintada.
  it('los títulos de sección no llevan cifras', () => {
    const fuentes = readdirSync('src', { recursive: true })
      .filter((f) => /\.jsx$/.test(f))
      .map((f) => readFileSync(join('src', f), 'utf8'))
      .filter((s) => s.includes('<SeccionExperta'))
    const titulos = [
      ...new Set(
        fuentes.flatMap((s) => [...s.matchAll(/titulo=\{t\('([^']+)'\)\}/g)].map((m) => m[1])),
      ),
    ]
    expect(titulos.length).toBeGreaterThan(8)
    for (const k of titulos) {
      expect(CATALOGUE.es[k], `${k} existe`).toBeTruthy()
      expect(CATALOGUE.ca[k], `${k} en valencià`).toBeTruthy()
      expect(CATALOGUE.es[k], k).not.toMatch(/\d/)
      expect(CATALOGUE.ca[k], k).not.toMatch(/\d/)
    }
  })
})
