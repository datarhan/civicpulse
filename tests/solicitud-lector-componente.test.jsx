/**
 * El bloque «Estas preguntas puedes hacerlas tú» pintado como lo pinta cada
 * pieza (components/reportajes/SolicitudLector.jsx).
 *
 * La línea que dice cuántas preguntas lleva el escrito explica por qué faltan
 * las demás, y esa explicación se DERIVA de las clases de motivo que hay de
 * verdad en la lista editorial de la pieza: decir «o ya están pedidas en otro
 * reportaje» en basuras, donde ninguna lo está, era una frase falsa con todas
 * las cifras bien. Y una pieza sin fecha de publicación válida no pinta nada,
 * en vez de tumbar la página entera con la excepción del escrito.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'

import SolicitudLector from '../src/components/reportajes/SolicitudLector'
import { CATALOGUE } from '../src/i18n'
import { clasesApartadas, preguntasDe, solicitables } from '../src/lib/solicitud-apartadas'

const es = CATALOGUE.es
const leer = (slug) =>
  JSON.parse(readFileSync(join(__dirname, '..', 'public/data/reportajes', `${slug}.json`), 'utf8'))

/** Como lo hacen las dos páginas. */
function pintar(slug, metaExtra = {}) {
  const d = leer(slug)
  const todas = preguntasDe(d)
  const preguntas = solicitables(slug, todas)
  return {
    n: preguntas.length,
    total: todas.length,
    ...render(
      <SolicitudLector
        meta={{ ...d.meta, ...metaExtra }}
        ruta={`/reportajes/${slug}`}
        preguntas={preguntas}
        total={todas.length}
        clases={clasesApartadas(slug, todas)}
      />,
    ),
  }
}

const parcialDe = (container) => container.querySelector('[data-solicitud-parcial]')?.textContent

describe('la línea de las que no van', () => {
  it('inteligencia turística: las no informativas y las ya pedidas', () => {
    const { container, n, total } = pintar('inteligencia-turistica')
    expect(parcialDe(container)).toBe(
      [
        es['reportajes.solicitud.parcial']
          .replace('{n}', String(n))
          .replace('{total}', String(total)),
        es['reportajes.solicitud.parcial.noInformativa'],
        es['reportajes.solicitud.parcial.yaPedida'],
      ].join(' '),
    )
  })
  it('basuras: sólo las no informativas, sin decir que hay otras ya pedidas', () => {
    const { container, n, total } = pintar('basuras')
    const linea = parcialDe(container)
    expect(linea).toBe(
      [
        es['reportajes.solicitud.parcial']
          .replace('{n}', String(n))
          .replace('{total}', String(total)),
        es['reportajes.solicitud.parcial.noInformativa'],
      ].join(' '),
    )
    expect(linea).not.toContain('otro reportaje')
  })
})

describe('sin fecha de publicación válida', () => {
  it('no pinta nada y no lanza', () => {
    for (const publicadoEl of [undefined, '', '16 de agosto de 2026']) {
      const { container } = pintar('basuras', { publicadoEl })
      expect(container.innerHTML, String(publicadoEl)).toBe('')
    }
  })
  it('y con ella sí pinta: el cero de arriba no es una página en blanco por otra cosa', () => {
    const { container } = pintar('basuras')
    expect(container.querySelector('[data-solicitud-lector]')).not.toBeNull()
  })
})
