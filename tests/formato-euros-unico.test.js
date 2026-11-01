/**
 * El dinero se escribe con `euros`, `eurosExactos` o `eurosBreves`
 * (src/lib/formatters.js), y con nada más.
 *
 * El 28-10-2026 el inventario contó doce formas de escribir euros en el sitio,
 * cada una en su copia local de `fmtEur`: «126.1 M €» con punto inglés,
 * «€5112», «879 mil €», «19,30 M€»… La convención la fijó el operador ese día.
 * Ésta es la guarda que faltaba: sin ella, la próxima tarjeta vuelve a traer su
 * `new Intl.NumberFormat(…, { style: 'currency' })` y las doce vuelven solas.
 *
 * Quedan fuera los reportajes publicados (sus cifras salen como se publicaron)
 * y `src/scraper/`, que escribe prosa en los snapshots: nada automático
 * reescribe prosa publicada. Las tarifas por unidad («66,94 €/t») no casan con
 * ningún patrón de aquí, a propósito.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const RAIZ = join(__dirname, '..')
const CARPETAS = ['src/components', 'src/pages', 'src/variants', 'src/hooks', 'src/lib']
const FUERA = [
  'src/pages/reportajes/',
  'src/components/reportajes/',
  'src/lib/formatters.js', // donde vive la convención
]

/** Cada patrón, con el porqué: lo que dice el mensaje cuando salta. */
const FORMAS_PROHIBIDAS = [
  {
    re: /style:\s*['"]currency['"]/,
    porque: 'Intl con moneda: usa euros / eurosExactos / eurosBreves',
  },
  { re: /['"`]€['"`]\s*\+|`€\$\{/, porque: 'el símbolo delante («€14.984»)' },
  {
    re: /\/\s*1e6\)[^\n]*M\s?€|\/\s*1_000_000\)[^\n]*M\s?€/,
    porque: 'millones a mano: eurosBreves',
  },
  { re: /\d\s?[kK]\s?€|\}\s?[kK]\s?€/, porque: '«k€» / «K €»: los miles se escriben enteros' },
]

/**
 * El código sin sus comentarios, con las mismas líneas. Los comentarios cuentan
 * la historia de las formas viejas («lector no podía cuadrar «81 K €»…»), y eso
 * no es escribir euros. Un `/*` dentro de una cadena se tragaría código hasta el
 * siguiente `*\/`: la guarda callaría ahí, no gritaría en falso.
 */
const sinComentarios = (texto) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/^\s*\/\/.*$/gm, '')

function ficheros(dir) {
  const fuera = []
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) fuera.push(...ficheros(ruta))
    else if (/\.(jsx?|tsx?)$/.test(nombre)) fuera.push(ruta)
  }
  return fuera
}

function infracciones(texto) {
  const halladas = []
  sinComentarios(texto)
    .split('\n')
    .forEach((linea, i) => {
      for (const { re, porque } of FORMAS_PROHIBIDAS) {
        if (re.test(linea)) halladas.push(`${i + 1}: ${porque} — ${linea.trim()}`)
      }
    })
  return halladas
}

describe('una sola forma de escribir euros', () => {
  const vistos = CARPETAS.flatMap((c) => ficheros(join(RAIZ, c)))
    .map((f) => relative(RAIZ, f))
    .filter((f) => !FUERA.some((x) => f.startsWith(x)))

  it('la guarda lee el sitio entero, no una carpeta vacía', () => {
    // Una guarda que no encuentra nada porque no leyó nada sale verde igual.
    expect(vistos.length).toBeGreaterThan(200)
    expect(vistos).toContain('src/pages/Presupuesto.jsx')
  })

  it('cada patrón caza la forma que prohíbe', () => {
    const muestras = [
      "new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })",
      "ent.push('€' + cifra.toLocaleString('es-ES'))",
      'return `€${(n / 1e6).toFixed(1)}M`',
      "`${(n / 1e6).toFixed(2).replace('.', ',')} M€`",
      '`${Math.round(n / 1e3)} k€`',
    ]
    for (const m of muestras) expect(infracciones(m), m).not.toEqual([])
    // Y no confunde las formas buenas ni las tarifas por unidad.
    for (const bien of [
      "euros(n) + ' sin IVA'",
      '`${num(v, 2)} €/t`',
      "'de cada 100 €'",
      '{/* Decía «81 K €»,\n    y otra de 418 k€. */}',
    ]) {
      expect(infracciones(bien), bien).toEqual([])
    }
  })

  it('ningún componente escribe euros por su cuenta', () => {
    const fallos = vistos.flatMap((f) =>
      infracciones(readFileSync(join(RAIZ, f), 'utf8')).map((x) => `${f}:${x}`),
    )
    expect(fallos).toEqual([])
  })
})
