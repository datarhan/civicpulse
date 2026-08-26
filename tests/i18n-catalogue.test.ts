/**
 * Dos cosas que sólo se veían abriendo la página.
 *
 * 1. **Un hueco sin rellenar.** Una cadena nueva llevaba `{n}` y `{total}`, el
 *    componente sólo sustituía `{n}`, y /empleo publicó literalmente
 *    «sobre 24 de {total} ofertas». La suite entera pasó: ninguna prueba mira
 *    el texto renderizado, y el `.replace()` vive en el componente, lejos de la
 *    cadena. Lo cazó una mirada al navegador, que es tarde.
 *
 * 2. **Un idioma con menos claves que el otro.** El catálogo cae al castellano
 *    cuando falta una clave en valencià, así que una traducción olvidada NO
 *    rompe nada: se ve castellano en medio de la página valenciana y nadie se
 *    entera.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { CATALOGUE, LOCALES } from '../src/i18n'

const SRC = join(__dirname, '..', 'src')

function fuentes(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) fuentes(p, out)
    else if (/\.(jsx?|tsx?)$/.test(e) && !p.endsWith('i18n.jsx')) out.push(p)
  }
  return out
}
const TEXTO = fuentes(SRC).map((f) => readFileSync(f, 'utf8'))

describe('catálogo i18n — paridad entre idiomas', () => {
  it('los dos idiomas tienen exactamente las mismas claves', () => {
    const [a, b] = LOCALES as string[]
    const ka = Object.keys(CATALOGUE[a as keyof typeof CATALOGUE])
    const kb = Object.keys(CATALOGUE[b as keyof typeof CATALOGUE])
    expect(
      ka.filter((k) => !kb.includes(k)),
      `faltan en ${b}`,
    ).toEqual([])
    expect(
      kb.filter((k) => !ka.includes(k)),
      `faltan en ${a}`,
    ).toEqual([])
  })

  it('mira algo: el catálogo no está vacío', () => {
    // Sin esto, un catálogo que no cargue imprimiría «0 claves, 0 problemas».
    expect(Object.keys(CATALOGUE.es).length).toBeGreaterThan(100)
  })
})

describe('catálogo i18n — ningún hueco llega al lector', () => {
  const conHueco = Object.entries(CATALOGUE.es as Record<string, string>)
    .map(([clave, valor]) => ({
      clave,
      huecos: [...String(valor).matchAll(/\{(\w+)\}/g)].map((m) => m[0]),
    }))
    .filter((r) => r.huecos.length > 0)

  it('hay cadenas con hueco que comprobar (si no, esta prueba no mide nada)', () => {
    expect(conHueco.length).toBeGreaterThan(0)
  })

  it.each(conHueco)('$clave: alguien sustituye todos sus huecos', ({ clave, huecos }) => {
    const usos = TEXTO.filter((t) => t.includes(`'${clave}'`) || t.includes(`"${clave}"`))
    expect(usos.length, `nadie usa ${clave}`).toBeGreaterThan(0)
    for (const hueco of huecos) {
      const sustituido = usos.some((t) => t.includes(`'${hueco}'`) || t.includes(`\`${hueco}\``))
      expect(sustituido, `${clave} lleva ${hueco} y ningún fichero que la use lo sustituye`).toBe(
        true,
      )
    }
  })
})
