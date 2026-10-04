/**
 * La ficha firmada de /eficiencia pintaba su `cuerpo`, y las dos versiones de
 * cada fila de su bitácora, tal cual vienen del JSON. Ese cuerpo se escribe en
 * un .md (`promote-indicador --cuerpo-file`) y trae `**negrita**` y párrafos: el
 * 04-10-2026, en una build con la bandera puesta, la ficha de los denominadores
 * enseñaba «**No es una rareza local, y tampoco es lo normal.**» con sus
 * asteriscos, en el cuerpo y en las cuatro filas que lo corrigieron, y sus seis
 * párrafos pegados en uno. Es el defecto que PR #104 quitó de los relatos del
 * agente, y después de la bitácora de su informe (src/lib/texto-negrita.js).
 *
 * Sobre el fichero publicado, no sobre filas de ejemplo: lo que se mide es lo
 * que lee quien abre la página. Y sobre `textContent`, que también trae la
 * bitácora con el `<details>` cerrado.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { HallazgosEficiencia } from '../../src/components/eficiencia/HallazgosEficiencia'

const EF = JSON.parse(readFileSync(resolve('public/data/eficiencia-findings.json'), 'utf8'))

afterEach(() => cleanup())

const norm = (s) => String(s).replace(/\s+/g, ' ').trim()
const NEGRITA = /\*\*([^*]+)\*\*/g
/** Las tiradas en negrita de un texto, sin sus asteriscos. */
const negritas = (texto) => [...String(texto).matchAll(NEGRITA)].map((m) => norm(m[1]))
/** El texto como lo lee quien ve la página: la negrita sin sus marcas. */
const comoSeLee = (texto) => norm(String(texto).replace(NEGRITA, '$1'))
const parrafosDe = (texto) => String(texto).split(/\n\n+/)

const pinta = (f) => render(<HallazgosEficiencia data={{ ...EF, items: [f] }} />).container
const textos = (nodos) => nodos.map((n) => norm(n.textContent))
/** Lo que la ficha pinta fuera de su bitácora. */
const fueraDeLaBitacora = (container, selector) =>
  [...container.querySelectorAll(selector)].filter((n) => !n.closest('details'))
/** Las filas de la bitácora, una por corrección y en su orden. */
const filas = (container, f) =>
  [...container.querySelectorAll('details p')].filter((p) =>
    f.corrections.some((c) => norm(p.textContent).includes(norm(c.reason))),
  )

const conNegritaEnElCuerpo = EF.items.filter((f) => negritas(f.cuerpo).length > 0)
const conVariosParrafos = EF.items.filter((f) => parrafosDe(f.cuerpo).length > 1)
const filasConNegrita = EF.items.flatMap((f) =>
  (f.corrections ?? []).flatMap((c, i) =>
    negritas(c.original).length + negritas(c.corrected).length > 0 ? [{ f, c, i }] : [],
  ),
)

describe('/eficiencia: la ficha firmada se lee como se escribió', () => {
  it('el fichero publicado trae negrita y párrafos (si no, esto no mide nada)', () => {
    expect(conNegritaEnElCuerpo.length).toBeGreaterThan(0)
    expect(conVariosParrafos.length).toBeGreaterThan(0)
    expect(filasConNegrita.length).toBeGreaterThan(0)
  })

  it('ninguna ficha enseña un asterisco de negrita, ni en el cuerpo ni en la bitácora', () => {
    for (const f of EF.items) {
      expect(pinta(f).textContent, f.id).not.toContain('**')
      cleanup()
    }
  })

  it('cada tirada en negrita del cuerpo es un <strong>', () => {
    for (const f of conNegritaEnElCuerpo) {
      const strongs = textos(fueraDeLaBitacora(pinta(f), 'strong'))
      for (const n of negritas(f.cuerpo)) expect(strongs, `${f.id}: «${n}»`).toContain(n)
      cleanup()
    }
  })

  it('el cuerpo se lee en sus párrafos, no en uno solo con todo', () => {
    for (const f of conVariosParrafos) {
      const ps = textos(fueraDeLaBitacora(pinta(f), 'p'))
      for (const p of parrafosDe(f.cuerpo)) expect(ps, f.id).toContain(comoSeLee(p))
      cleanup()
    }
  })

  it('en la bitácora cada versión conserva su negrita —la retirada, tachada— y se lee entera', () => {
    for (const { f, c, i } of filasConNegrita) {
      const fila = filas(pinta(f), f)[i]
      const donde = `${f.id} · fila ${i} · ${c.field}`
      expect(fila, `${donde}: no se pintó`).toBeTruthy()
      const tachadas = textos([...fila.querySelectorAll('del strong')])
      const puestas = textos([...fila.querySelectorAll('strong')].filter((s) => !s.closest('del')))
      for (const n of negritas(c.original)) expect(tachadas, donde).toContain(n)
      for (const n of negritas(c.corrected)) expect(puestas, donde).toContain(n)
      // Los párrafos de cada versión, seguidos y con su espacio: ni pegados
      // («nunca.En») ni con nada perdido por el camino.
      expect(norm(fila.textContent), donde).toContain(comoSeLee(c.original))
      expect(norm(fila.textContent), donde).toContain(comoSeLee(c.corrected))
      cleanup()
    }
  })
})
