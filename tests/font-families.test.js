/**
 * §03: dos familias, una por función. En este repo son TRES, y la tercera está
 * justificada: Outfit para la interfaz, DM Mono para todo lo auditable y
 * Fraunces para la voz editorial larga (/reportajes y el modo prensa del
 * ticker). Un cuadro de mando y una pieza de fondo no se leen igual.
 *
 * Donde el brandbook sí acierta es en que no se carga una familia que nadie
 * usa: Inter se pedía en cuatro pesos con CERO usos en todo `src/`. Ese es el
 * defecto que esta prueba impide que vuelva, en los dos sentidos —una familia
 * cargada sin usar, y una usada sin cargar, que es peor porque el navegador la
 * sustituye en silencio por la de sistema.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const html = readFileSync(join(ROOT, 'index.html'), 'utf8')

/** Las familias que index.html pide a Google Fonts. */
const cargadas = (() => {
  const url = html.match(/fonts\.googleapis\.com\/css2\?([^"']+)/)?.[1] ?? ''
  return url
    .split('&')
    .filter((p) => p.startsWith('family='))
    .map((p) => decodeURIComponent(p.slice('family='.length)).split(':')[0].replace(/\+/g, ' '))
})()

function ficheros(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) ficheros(p, acc)
    else if (/\.(jsx?|tsx?|css)$/.test(p)) acc.push(p)
  }
  return acc
}
const FUENTES = ficheros(join(ROOT, 'src'))
const codigo = FUENTES.map((p) => readFileSync(p, 'utf8')).join('\n')

describe('las familias tipográficas', () => {
  it('el análisis encontró de verdad el enlace y el código', () => {
    // Prueba de trabajo: si la regex del enlace fallara, «ninguna familia
    // cargada» pasaría las dos comprobaciones de abajo sin mirar nada.
    expect(cargadas.length, 'no se leyó ninguna familia de index.html').toBeGreaterThan(1)
    expect(FUENTES.length).toBeGreaterThan(100)
  })

  it('no se carga ninguna familia que no use nadie', () => {
    const sinUsar = cargadas.filter((f) => !codigo.includes(`'${f}'`) && !codigo.includes(`"${f}"`))
    expect(sinUsar, 'familias pedidas a la red que no pinta nada').toEqual([])
  })

  it('no se usa ninguna familia que no se cargue', () => {
    // El fallo silencioso: el navegador cae a la fuente de sistema y la página
    // se compone en otra letra sin avisar. Sólo cuentan las que se declaran
    // como primera opción de una pila, no los fallbacks tipo Georgia o Menlo.
    const usadas = new Set()
    for (const m of codigo.matchAll(/font-?[Ff]amily:\s*["'`]?['"]([A-Z][\w ]+)['"]/g))
      usadas.add(m[1])
    for (const m of codigo.matchAll(/=\s*"'([A-Z][\w ]+)',/g)) usadas.add(m[1])
    const faltan = [...usadas].filter((f) => !cargadas.includes(f))
    expect(faltan, 'familias que el código pide y nadie carga').toEqual([])
  })

  it('son exactamente tres, y cada una tiene su función declarada', () => {
    // Una cuarta familia es una decisión editorial, no un detalle de estilo:
    // que falle aquí obliga a justificarla y a escribir para qué es.
    expect(cargadas.sort()).toEqual(['DM Mono', 'Fraunces', 'Outfit'])
    for (const f of cargadas) {
      expect(html, `index.html no dice para qué es ${f}`).toContain(f)
    }
  })
})
