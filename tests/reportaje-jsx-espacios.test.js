import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

// JSX se come el salto de línea entre una palabra y una etiqueta en línea. Si
// Prettier parte una frase justo ahí, la página publica dos palabras pegadas:
// «reconstrucción DANA» publicó «control externoespecífico» y «de esamirada»
// hasta el 19-10-2026, y ninguna prueba lo vio, porque todas buscan frases y
// ninguna mira los espacios. Esto barre las piezas en busca de las dos formas:
//
//   palabra al final de una línea  +  <i>, <b>, <a>… al principio de la siguiente
//   </i>, </b>, </a>… al final de una línea  +  palabra al principio de la siguiente
//
// El arreglo es un {' '} al final de la primera línea.

const DIRS = ['src/pages/reportajes', 'src/components/reportajes']
const EN_LINEA = 'i|b|em|strong|a|code|abbr|span|mark|Link'
const ficheros = DIRS.flatMap((d) =>
  readdirSync(d)
    .filter((f) => f.endsWith('.jsx'))
    .map((f) => `${d}/${f}`),
)

/** Las parejas de líneas que JSX uniría sin espacio. */
function pegadas(src) {
  const lineas = src.split('\n')
  const out = []
  for (let i = 1; i < lineas.length; i++) {
    const antes = lineas[i - 1].trimEnd()
    const ahora = lineas[i].trim()
    // Código, no texto: comentarios, sentencias, cierres de llave.
    if (/^\s*(\/\/|\*|\/\*|import|export|const|let|return|if|\}|\{)/.test(lineas[i - 1])) continue
    const palabraYEtiqueta =
      /[\p{L}\p{N},;:»)]$/u.test(antes) && new RegExp(`^<(${EN_LINEA})[\\s>]`).test(ahora)
    const cierreYPalabra =
      new RegExp(`</(${EN_LINEA})>$`).test(antes) && /^[\p{L}\p{N}«(]/u.test(ahora)
    if (palabraYEtiqueta || cierreYPalabra) out.push(`${i + 1}: ${antes.trim()} ⏎ ${ahora}`)
  }
  return out
}

describe('ninguna pieza pega dos palabras por un salto de línea', () => {
  it('mide algo: barre las piezas', () => {
    expect(ficheros.length).toBeGreaterThan(5)
  })

  it('la prueba ve el defecto que la estrenó', () => {
    const roto =
      'texto\n          sin un control externo\n          <i>específico</i>. Y fuera de <i>esa</i>\n          mirada.'
    expect(pegadas(roto)).toHaveLength(2)
    const sano =
      "texto\n          sin un control externo{' '}\n          <i>específico</i>. Y fuera de <i>esa</i>{' '}\n          mirada."
    expect(pegadas(sano)).toEqual([])
  })

  it('ninguna pareja en las piezas', () => {
    const malas = ficheros.flatMap((f) => pegadas(readFileSync(f, 'utf8')).map((l) => `${f}:${l}`))
    expect(malas).toEqual([])
  })
})
