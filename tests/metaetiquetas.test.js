/**
 * La ficha del sitio —`description`, `og:description` y `twitter:description`
 * de index.html— es el one-liner de docs/DESCRIPCION.md, no una frase propia.
 *
 * Eran tres frases distintas y las tres afirmaban de más: «16 fuentes
 * abiertas», una cifra congelada en el HTML contra la regla del repo, y
 * «escalado automático al Síndic», que es `/escalar`, una orden del
 * administrador del bot. Y no la leía sólo la portada: `prerender-meta` copia la
 * `og:description` en la ficha de cada ruta sin reportaje propio, así que la
 * frase viajaba en las tarjetas de casi todo el sitio.
 *
 * El texto se DERIVA de DESCRIPCION.md, que es la fuente única de la
 * descripción. Una copia escrita aquí dejaría la prueba verde mientras el
 * documento y el HTML se separan.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8')
const DESCRIPCION = readFileSync(join(ROOT, 'docs/DESCRIPCION.md'), 'utf8')

/** El one-liner ES: la cita que sigue a su encabezado, con las líneas unidas. */
function oneLiner(md) {
  const m = /^### One-liner ES\s*\n+((?:>.*\n?)+)/m.exec(md)
  if (!m) return null
  return m[1]
    .split('\n')
    .map((l) => l.replace(/^>\s?/, '').trim())
    .filter(Boolean)
    .join(' ')
}

/** El `content` de una metaetiqueta, con la misma forma que usa prerender-meta. */
function contenido(atributo, nombre) {
  const re = new RegExp(`<meta[^>]*${atributo}="${nombre}"[^>]*content="([^"]*)"`)
  return re.exec(HTML)?.[1]?.trim() ?? null
}

const ETIQUETAS = [
  ['name', 'description'],
  ['property', 'og:description'],
  ['name', 'twitter:description'],
]

describe('la ficha del sitio es el one-liner de DESCRIPCION.md', () => {
  const esperado = oneLiner(DESCRIPCION)

  it('se encontró el one-liner y las tres etiquetas', () => {
    // Sin esto, un encabezado renombrado o una etiqueta escrita con otra forma
    // dejarían las comparaciones de abajo midiendo null contra null.
    expect(esperado, 'no se encontró «### One-liner ES» en DESCRIPCION.md').toBeTruthy()
    expect(esperado.length).toBeGreaterThan(40)
    for (const [atributo, nombre] of ETIQUETAS) {
      expect(contenido(atributo, nombre), `no se encontró ${nombre} en index.html`).toBeTruthy()
    }
  })

  for (const [atributo, nombre] of ETIQUETAS) {
    it(`${nombre} dice el one-liner, literal`, () => {
      expect(contenido(atributo, nombre)).toBe(esperado)
    })
  }

  it('ninguna lleva una cifra', () => {
    // Una cifra en el HTML no se refresca con los datos: «16 fuentes» siguió
    // ahí mientras el número real se movía.
    for (const [atributo, nombre] of ETIQUETAS) {
      expect(contenido(atributo, nombre), nombre).not.toMatch(/\d/)
    }
  })
})
