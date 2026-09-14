import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { CATALOGUE } from '../src/i18n'

/**
 * «Con evidencia» sumaba verificadas, parciales y contradichas —lo que se pudo
 * comparar con un documento, saliera a favor o en contra— y se leía «respaldada».
 * La revisión lectora de /departamentos/urbanismo lo señaló sobre dos
 * declaraciones parciales, en la ficha de un área con el nombre de quien la
 * dirige encima. El agregado se llama «contrastadas» / «contrastades».
 *
 * No juzga prosa: busca un rótulo retirado en lo que la web pinta —el texto de
 * las páginas, sin comentarios— y en los valores del catálogo, en los dos idiomas.
 */
const RAIZ = join(__dirname, '..')
const RETIRADO = /\bcon\s+evidencia\b|\bamb\s+evidència/i

function jsx(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const ruta = join(dir, f)
    if (statSync(ruta).isDirectory()) jsx(ruta, out)
    else if (ruta.endsWith('.jsx')) out.push(ruta)
  }
  return out
}

/** El código sin comentarios y con las frases que Prettier parte, unidas. */
const pintable = (codigo) =>
  codigo
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\{' '\}/g, ' ')
    .replace(/\s+/g, ' ')

const PAGINAS = jsx(join(RAIZ, 'src'))

describe('el agregado se llama «contrastadas», no «con evidencia»', () => {
  it('mide algo: lee las páginas y el catálogo', () => {
    expect(PAGINAS.length).toBeGreaterThan(100)
    expect(Object.keys(CATALOGUE.es).length).toBeGreaterThan(500)
  })

  it('el detector ve el rótulo partido y no ve los comentarios (el control)', () => {
    expect(RETIRADO.test(pintable('<strong>2</strong> con\n    evidencia'))).toBe(true)
    expect(RETIRADO.test(pintable("con{' '}evidencia"))).toBe(true)
    expect(RETIRADO.test(pintable('// decía «con evidencia»\nconst x = 1'))).toBe(false)
    expect(RETIRADO.test(pintable('{/* «0% con evidencia» */}'))).toBe(false)
  })

  it('ninguna página lo pinta', () => {
    const conRotulo = PAGINAS.filter((p) => RETIRADO.test(pintable(readFileSync(p, 'utf8'))))
    expect(conRotulo.map((p) => relative(RAIZ, p))).toEqual([])
  })

  it('ningún valor del catálogo lo dice, en ninguno de los dos idiomas', () => {
    const claves = ['es', 'ca'].flatMap((l) =>
      Object.entries(CATALOGUE[l])
        .filter(([, v]) => RETIRADO.test(String(v)))
        .map(([k]) => `${l}:${k}`),
    )
    expect(claves).toEqual([])
  })
})
