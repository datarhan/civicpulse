import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ¿Ejecuta ALGUIEN las pruebas del bot?
 *
 * El 2026-09-09 la respuesta era no. `bot/tests/` tenía 124 pruebas y ninguna
 * corría en CI: el `vitest.config.js` de la raíz incluye `tests/**` y `src/**`
 * y nada más, así que `npm test` —lo que mira la puerta de salud de la
 * nocturna— nunca las veía, y no había ningún workflow que entrara en `bot/`.
 * Se ejecutaban a mano o no se ejecutaban.
 *
 * Es el defecto de cableado de esta casa otra vez, y en su forma más barata de
 * pasar por alto: la suite existe, pasa cuando la corres, y por eso nadie
 * sospecha que no la corre nadie. Verde por no ejecutarse.
 *
 * Esta prueba NO exige que las del bot vivan en la suite de la raíz —no deben:
 * la raíz corre en `happy-dom` con su propio setup, y meter ahí 124 pruebas con
 * SQLite nativo haría la nocturna más frágil, que es justo lo contrario de lo
 * que se acaba de arreglar—. Exige lo único que importa: que algún workflow las
 * ejecute.
 */
const WF = join(__dirname, '..', '.github', 'workflows')
const RAIZ = join(__dirname, '..')

/** Los ficheros de workflow, sin comentarios: dentro de uno hay órdenes falsas. */
const workflows = readdirSync(WF)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((f) => ({
    nombre: f,
    texto: readFileSync(join(WF, f), 'utf8')
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .join('\n'),
  }))

/**
 * Correr las pruebas DEL BOT significa correrlas CON `bot` de directorio, y hay
 * que ser preciso o la guarda se firma su propio visto bueno: la primera
 * versión de esta prueba buscaba «bot» y «npm test» en el mismo fichero, y
 * pasaba en verde el día que no existía ningún workflow del bot — porque la
 * nocturna dice «civicpulse-bot» al comitear y corre `npm test`, el de la RAÍZ.
 * Dos cadenas ciertas, conclusión falsa.
 */
const CORRE_EL_BOT =
  /working-directory:\s*\.?\/?bot\b|cd\s+bot\s*&&[^\n]*\btest\b|npm[^\n]*--prefix[= ]\.?\/?bot[^\n]*\btest\b/

describe('las pruebas del bot las ejecuta alguien', () => {
  // Si esto deja de existir, la prueba de abajo se volvería vacua: estaría
  // comprobando la cobertura de un directorio sin pruebas y pasaría sola.
  it('el bot tiene pruebas que cubrir', () => {
    const dir = join(RAIZ, 'bot', 'tests')
    expect(existsSync(dir)).toBe(true)
    const suites = readdirSync(dir).filter((f) => /\.test\.[jt]sx?$/.test(f))
    expect(suites.length, 'bot/tests sin ficheros de prueba').toBeGreaterThan(0)
  })

  it('algún workflow entra en bot/ y corre su suite', () => {
    const cubren = workflows.filter((w) => CORRE_EL_BOT.test(w.texto))
    expect(
      cubren.map((w) => w.nombre),
      'ningún workflow ejecuta las pruebas del bot: existen, pasan a mano, y CI no las mira',
    ).not.toEqual([])
  })

  // Un workflow que sólo se dispara a mano no es cobertura: nadie lo lanza.
  it('ese workflow se dispara solo, no sólo a mano', () => {
    const cubren = workflows.filter((w) => CORRE_EL_BOT.test(w.texto))
    const automaticos = cubren.filter((w) => /^\s*(push|pull_request|schedule):/m.test(w.texto))
    expect(
      automaticos.map((w) => w.nombre),
      'el único que corre las pruebas del bot es de disparo manual',
    ).not.toEqual([])
  })
})
