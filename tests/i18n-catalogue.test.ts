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

/**
 * Los huecos que un fichero rellena, POR LOS DOS CAMINOS que usa este repo.
 *
 * El primero es `.replace('{hueco}', x)`, y basta con que el literal aparezca.
 * El segundo lo estrenó /presupuesto: `rellena(t('clave'), { hueco: x })`, un
 * ayudante que sustituye todas las claves de un objeto de una vez. Es mejor
 * mecanismo —`String.replace` con un patrón de texto cambia SÓLO la primera
 * aparición, y un `$&` en el valor se interpreta— pero es invisible a un grep
 * del literal, así que esta prueba lo daba por no sustituido en 45 cadenas.
 *
 * Se lee el objeto DE LA LLAMADA, no del fichero entero. Aceptar cualquier
 * `total:` suelto convertiría el guard en un colador: pasaría una cadena con
 * {n} y {total} sustituyendo sólo {n}, que es exactamente el defecto que esta
 * prueba existe para cazar. Se localiza `rellena(`, se recorre hasta su
 * paréntesis de cierre contando comillas y anidamiento, y sólo si esa llamada
 * nombra la clave se toman las claves de su último argumento.
 */
function huecosSustituidos(texto: string, clave: string): Set<string> {
  const out = new Set<string>()
  for (const m of texto.matchAll(/\{(\w+)\}/g)) {
    const literal = texto.slice(Math.max(0, m.index! - 1), m.index! + m[0].length + 1)
    if (/^['`]\{\w+\}['`]$/.test(literal)) out.add(m[0])
  }
  const nombra = (llamada: string) =>
    llamada.includes(`'${clave}'`) || llamada.includes(`"${clave}"`)
  for (const inicio of indicesDe(texto, 'rellena(')) {
    const llamada = llamadaCompleta(texto, inicio + 'rellena('.length - 1)
    if (!llamada || !nombra(llamada)) continue
    for (const k of clavesDelObjeto(llamada)) out.add(`{${k}}`)
  }
  return out
}

function indicesDe(texto: string, aguja: string): number[] {
  const out: number[] = []
  let i = texto.indexOf(aguja)
  while (i !== -1) {
    out.push(i)
    i = texto.indexOf(aguja, i + 1)
  }
  return out
}

/** Desde el `(` de apertura hasta su cierre, saltando comillas y anidamiento. */
function llamadaCompleta(texto: string, abre: number): string | null {
  let prof = 0
  let comilla: string | null = null
  for (let i = abre; i < texto.length; i++) {
    const c = texto[i]
    if (comilla) {
      if (c === '\\') i++
      else if (c === comilla) comilla = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') comilla = c
    else if (c === '(' || c === '{' || c === '[') prof++
    else if (c === ')' || c === '}' || c === ']') {
      prof--
      if (prof === 0) return texto.slice(abre, i + 1)
    }
  }
  return null
}

/**
 * Las claves del objeto literal de la llamada, sólo las de su primer nivel.
 *
 * Con posición explícita de CLAVE, no buscando `\w+:` a secas. Dos motivos, y
 * los dos aparecieron nada más escribirlo: la abreviatura `{ periodo }` no
 * lleva dos puntos y se daba por no sustituida —tres cadenas de /presupuesto—,
 * y al revés, en `{ n: total }` el VALOR `total` casaría como clave y taparía
 * un hueco `{total}` que nadie rellena, que es el defecto del revés.
 */
function clavesDelObjeto(llamada: string): string[] {
  const abre = llamada.indexOf('{')
  if (abre === -1) return []
  const objeto = llamadaCompleta(llamada, abre)
  if (!objeto) return []
  const out: string[] = []
  let prof = 1
  let enClave = true
  for (let i = 1; i < objeto.length; i++) {
    const c = objeto[i]
    if (c === "'" || c === '"' || c === '`') {
      // Una clave entrecomillada («'total': x») cuenta; un valor de texto no.
      const fin = saltaCadena(objeto, i)
      if (prof === 1 && enClave && objeto.slice(fin).trimStart().startsWith(':')) {
        out.push(objeto.slice(i + 1, fin - 1))
        enClave = false
      }
      i = fin - 1
      continue
    }
    if (c === '(' || c === '{' || c === '[') prof++
    else if (c === ')' || c === '}' || c === ']') prof--
    else if (prof === 1 && c === ',') enClave = true
    else if (prof === 1 && enClave && /[\w$]/.test(c)) {
      const m = /^([\w$]+)\s*([:,}])/.exec(objeto.slice(i))
      // `x: 1` es clave con valor; `x,` y `x }` son la forma abreviada. Un
      // `...spread` no casa a propósito: el guard no puede saber qué trae, y
      // dar por cubierto lo que no puede leer es cómo un guard se queda ciego.
      if (m) out.push(m[1])
      const salto = /^[\w$]+/.exec(objeto.slice(i))![0].length
      if (m?.[2] === ':') enClave = false
      i += salto - 1
    }
  }
  return out
}

/** Desde la comilla de apertura hasta el índice siguiente al cierre. */
function saltaCadena(texto: string, abre: number): number {
  const comilla = texto[abre]
  for (let i = abre + 1; i < texto.length; i++) {
    if (texto[i] === '\\') i++
    else if (texto[i] === comilla) return i + 1
  }
  return texto.length
}

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
      const sustituido = usos.some((t) => huecosSustituidos(t, clave).has(hueco))
      expect(sustituido, `${clave} lleva ${hueco} y ningún fichero que la use lo sustituye`).toBe(
        true,
      )
    }
  })
})

/**
 * El guard, probado por inyección.
 *
 * La regla de la casa: escribe el guard y luego hazlo fallar, o no sabes qué
 * mira. Este repositorio ha publicado cuatro veces una expresión regular que no
 * hacía lo que decía su propio comentario, así que las dos formas de sustituir
 * —y las dos formas de NO sustituir— se comprueban aquí sobre texto de mentira.
 */
describe('el propio guard de huecos', () => {
  it('ve la forma .replace y la forma rellena', () => {
    expect(huecosSustituidos(`t('k').replace('{n}', x)`, 'k')).toContain('{n}')
    expect(huecosSustituidos(`rellena(t('k'), { n: x })`, 'k')).toContain('{n}')
  })

  it('ve la abreviatura de ES6, que no lleva dos puntos', () => {
    // Tres cadenas de /presupuesto se escriben así —`{ periodo }`— y la
    // primera versión de este guard las daba por no sustituidas.
    expect(huecosSustituidos(`rellena(t('k'), { periodo })`, 'k')).toContain('{periodo}')
    expect(huecosSustituidos(`rellena(t('k'), { renove, feder: 1 })`, 'k')).toContain('{renove}')
  })

  it('un VALOR no cuenta como clave', () => {
    // En `{ n: total }` el hueco cubierto es {n}. Si `total` contara, el guard
    // taparía un hueco que nadie rellena: el defecto original al revés.
    const s = huecosSustituidos(`rellena(t('k'), { n: total })`, 'k')
    expect(s.has('{n}')).toBe(true)
    expect(s.has('{total}')).toBe(false)
  })

  it('NO da por sustituido un hueco que la llamada no nombra', () => {
    // El defecto original: la cadena lleva {n} y {total}, y el código sólo pone
    // uno. Si esto pasara, el guard no serviría para nada.
    const s = huecosSustituidos(`rellena(t('k'), { n: x })`, 'k')
    expect(s.has('{n}')).toBe(true)
    expect(s.has('{total}')).toBe(false)
  })

  it('NO cuenta un objeto suelto del fichero que no va a esta clave', () => {
    // `total:` existe en el fichero, pero en otra llamada y para otra clave.
    const texto = `const x = { total: 1 }\nrellena(t('k'), { n: y })\nrellena(t('otra'), { total: z })`
    expect(huecosSustituidos(texto, 'k').has('{total}')).toBe(false)
  })

  it('no se traga las claves de un objeto anidado como si fueran del primer nivel', () => {
    const s = huecosSustituidos(`rellena(t('k'), { n: f({ total: 1 }) })`, 'k')
    expect(s.has('{n}')).toBe(true)
    expect(s.has('{total}')).toBe(false)
  })

  it('el hueco tiene que ir entrecomillado para contar como literal', () => {
    // «lleva {n} y {total}» dentro de un comentario no sustituye nada.
    expect(huecosSustituidos(`// la cadena lleva {n}\nt('k')`, 'k').has('{n}')).toBe(false)
  })
})
