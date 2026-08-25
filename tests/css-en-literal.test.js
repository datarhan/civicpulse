import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Ninguna hoja escrita como template literal lleva un acento invertido dentro.
 *
 * Este repo escribe CSS en módulos `*.css.js` porque hay cosas que el prop
 * `style` no puede tener —media queries, `:hover`, `:focus-visible`— y porque
 * la regla de la casa es que lo responsivo viva en una hoja de verdad.
 *
 * La trampa es siempre la misma y ya ha mordido CUATRO veces: alguien escribe
 * un selector o una propiedad entre acentos invertidos dentro de un comentario
 * CSS, y eso CIERRA el literal a media hoja. Lo que sigue queda como código
 * JavaScript. Dos desenlaces, los dos malos:
 *
 *   · si lo que queda es sintaxis válida, el build PASA y la página muere en
 *     el navegador con un ReferenceError — que es como ocurrió la primera vez;
 *   · si no lo es, el build casca con un «Expected a semicolon» a doscientas
 *     líneas del sitio donde está el problema.
 *
 * `tests/libro-css.test.js` cubría UN fichero, el que había el día que pasó.
 * En la sesión siguiente el mismo error entró por `libro.css.js` otra vez y
 * habría entrado igual por cualquier hoja nueva. Una guarda que nombra a su
 * único fichero envejece exactamente igual que la tabla escrita a mano que
 * este repo ya ha tenido que tirar dos veces, así que aquí se descubren solas.
 */
const RAIZ = join(__dirname, '..', 'src')

function hojas(dir = RAIZ, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) hojas(p, acc)
    else if (e.name.endsWith('.css.js')) acc.push(p)
  }
  return acc
}

const FICHEROS = hojas()

describe('las hojas escritas como literal llegan enteras', () => {
  // Que la puerta demuestre que miró: un barrido que no encuentra ningún
  // fichero pasaría en verde justo el día que alguien renombra el patrón.
  it('el barrido encuentra hojas de verdad', () => {
    expect(FICHEROS.length, 'ningún *.css.js — ¿cambió el patrón de nombres?').toBeGreaterThan(0)
  })

  for (const f of FICHEROS) {
    const nombre = relative(join(__dirname, '..'), f)

    it(`${nombre} · ningún acento invertido dentro del literal`, () => {
      const fuente = readFileSync(f, 'utf8')
      // Se cuenta sobre el FICHERO, no sobre el módulo importado: si el
      // literal ya está roto, lo que se importa es otra cosa —o no compila— y
      // la comprobación se haría sobre el resultado del fallo.
      for (const m of fuente.matchAll(/export const (\w+) = `([\s\S]*?)`\n/g)) {
        expect(
          m[2].includes('`'),
          `${nombre}: ${m[1]} lleva un acento invertido dentro. Cierra el literal a media hoja: ` +
            'el build puede pasar y la página morir en el navegador.',
        ).toBe(false)
      }
    })

    it(`${nombre} · cada hoja exportada es una hoja, no un resto`, async () => {
      const mod = await import(/* @vite-ignore */ f)
      const cadenas = Object.entries(mod).filter(([, v]) => typeof v === 'string')
      expect(cadenas.length, `${nombre} no exporta ninguna cadena`).toBeGreaterThan(0)
      for (const [clave, hoja] of cadenas) {
        expect(hoja.length, `${nombre}.${clave} es sospechosamente corta`).toBeGreaterThan(200)
        // Llaves emparejadas: es lo que deja de cumplirse en cuanto el literal
        // se corta por la mitad.
        const abre = hoja.split('{').length - 1
        const cierra = hoja.split('}').length - 1
        expect(abre, `${nombre}.${clave}: la hoja se corta a media regla`).toBe(cierra)
        expect(hoja.trimEnd().endsWith('}')).toBe(true)
      }
    })
  }
})
