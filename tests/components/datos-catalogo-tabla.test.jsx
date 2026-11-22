/**
 * /datos pinta su catálogo como tabla: una fila por fichero, con qué es una
 * fila, la licencia enlazada y el código que lo escribe, en castellano y en
 * valencià. Las reglas de cada columna se prueban en tests/catalogo-datos.test.js;
 * aquí, lo que lee quien abre la página. Los ficheros se sirven del disco, los
 * publicados: la tabla no puede depender de una forma inventada.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Datos from '../../src/pages/Datos'
import { CATALOGUE, LocaleProvider } from '../../src/i18n'
import { FICHAS, LICENCIAS } from '../../src/lib/catalogo-datos'
import { invalidateSnapshots } from '../../src/lib/snapshot-store'

vi.mock('react-leaflet', () => {
  const Pinta = ({ children }) => <div>{children}</div>
  return { MapContainer: Pinta, TileLayer: () => null, GeoJSON: () => null, useMap: () => ({}) }
})

function sirveDelDisco() {
  globalThis.fetch = vi.fn(async (input) => {
    const path = String(input)
      .replace(/^https?:\/\/[^/]+/, '')
      .split('?')[0]
    const f = resolve('public', `.${path}`)
    if (path.startsWith('/data/') && existsSync(f))
      return new Response(readFileSync(f), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    return new Response('not found', { status: 404 })
  })
}

function pinta(idioma) {
  localStorage.setItem('cp:lang', idioma)
  invalidateSnapshots()
  sirveDelDisco()
  return render(
    <MemoryRouter initialEntries={['/datos']}>
      <LocaleProvider>
        <Datos />
      </LocaleProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  localStorage.clear()
  invalidateSnapshots()
})

const COLUMNAS = [
  'datos.tabla.conjunto',
  'datos.tabla.fila',
  'datos.tabla.contenido',
  'datos.tabla.fuente',
  'datos.tabla.licencia',
  'datos.tabla.actualizado',
  'datos.tabla.descarga',
  'datos.tabla.codigo',
]

describe('el catálogo de /datos, como tabla', () => {
  for (const idioma of ['es', 'ca']) {
    it(`${idioma}: una fila por fichero, con sus columnas`, () => {
      const { container } = pinta(idioma)
      const tabla = screen.getByRole('table', { name: CATALOGUE[idioma]['datos.catalogo.titulo'] })
      const cabeceras = within(tabla)
        .getAllByRole('columnheader')
        .map((th) => th.textContent)
      expect(cabeceras).toEqual(COLUMNAS.map((k) => CATALOGUE[idioma][k]))

      const filas = [...container.querySelectorAll('tr[data-ficha-catalogo]')]
      expect(filas.map((tr) => tr.getAttribute('data-ficha-catalogo')).sort()).toEqual(
        Object.keys(FICHAS).sort(),
      )

      for (const tr of filas) {
        const ruta = tr.getAttribute('data-ficha-catalogo')
        const f = FICHAS[ruta]
        expect(tr.textContent, ruta).toContain(CATALOGUE[idioma][f.fila])
        const l = LICENCIAS[f.licencia]
        const etiqueta = l.clave ? CATALOGUE[idioma][l.clave] : l.nombre
        expect(tr.textContent, ruta).toContain(etiqueta)
        if (l.url)
          expect(
            tr.querySelector(`a[href="${l.url}"]`),
            `${ruta}: enlace a la licencia`,
          ).not.toBeNull()
        expect(
          tr.querySelector(
            `a[href="https://github.com/datarhan/civicpulse/blob/main/${f.codigo}"]`,
          ),
          `${ruta}: enlace al código`,
        ).not.toBeNull()
        expect(tr.querySelector(`a[href="${ruta}"]`), `${ruta}: descarga`).not.toBeNull()
        // El CSV sólo donde el fichero tiene una lista que lo sostenga.
        const csv = tr.querySelector(`a[href="${ruta.replace(/\.json$/, '.csv')}"]`)
        if (f.tabla) expect(csv, `${ruta}: CSV`).not.toBeNull()
        else expect(csv, `${ruta}: sin lista, sin CSV`).toBeNull()
      }
    })

    it(`${idioma}: bajo la tabla se dice cómo es el CSV`, () => {
      const { container } = pinta(idioma)
      const nota = container.querySelector('[data-nota-csv]')?.textContent ?? ''
      expect(nota).toBe(CATALOGUE[idioma]['datos.csv.nota'])
      expect(nota.length).toBeGreaterThan(40)
    })
  }

  it('la fila de las quejas dice que el texto de cada una es de quien la escribe', () => {
    const { container } = pinta('es')
    const tr = container.querySelector('tr[data-ficha-catalogo="/data/quejas.json"]')
    expect(tr.textContent).toContain(CATALOGUE.es[FICHAS['/data/quejas.json'].nota])
  })

  // La etiqueta de cada licencia es corta; lo que significa se dice una vez,
  // debajo. Cada licencia que la tabla usa tiene que estar explicada allí.
  for (const idioma of ['es', 'ca']) {
    it(`${idioma}: la leyenda explica cada licencia que la tabla usa`, () => {
      const { container } = pinta(idioma)
      const leyenda = container.querySelector('[data-leyenda-licencias]')?.textContent ?? ''
      const usadas = new Set(Object.values(FICHAS).map((f) => f.licencia))
      expect(usadas.size).toBeGreaterThan(4)
      for (const clave of usadas) {
        const l = LICENCIAS[clave]
        const etiqueta = l.clave ? CATALOGUE[idioma][l.clave] : l.nombre
        expect(leyenda, clave).toContain(etiqueta)
      }
    })
  }
})
