/**
 * El azul de marca era, hexadecimal a hexadecimal, el azul del Partido Popular:
 * `--civic: #2463eb` y `PARTY_COLORS.PP: '#2463EB'`. En /promesas la pastilla de
 * atribución del PP se pintaba con el color del logo del sitio, y el bloque de
 * propuesta automática dibujaba una inferencia de máquina sobre una promesa en
 * el hexadecimal exacto del partido.
 *
 * Y la escala de tinta tenía cinco tiers de texto con cuatro valores dentro de
 * trece centésimas: .82 / .73 / .64 / .62 / .60. Tres de ellos indistinguibles.
 *
 * Este guard no repite ninguna de esas cifras: analiza src/index.css e importa
 * PARTY_COLORS. Un guard que copiase la escala a mano se quedaría verde
 * mientras producción diverge, que es exactamente el defecto que vigila.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { PARTY_COLORS, partyColor } from '../src/lib/party-colors.js'
import { contrastRatioOver, parseRgba } from '../src/lib/contrast.js'

const ROOT = join(__dirname, '..')
const CSS = readFileSync(join(ROOT, 'src/index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * `Otro` no es un partido: es el sentinela que party-colors.js devuelve TAMBIÉN
 * para una formación desconocida, y su pizarra #64748B es un gris de interfaz
 * corriente que el sitio usa en doce sitios sin relación con la política.
 * Vigilarlo como si fuera una marca daría doce falsos positivos y enseñaría a
 * saltarse esta prueba.
 *
 * La exclusión se DERIVA de esa identidad —el color de un partido inventado— en
 * vez de escribirse a mano. Si algún día `Otro` deja de ser el fallback, vuelve
 * a vigilarse solo. Un allow-set copiado a mano es lo que dejó 298 contratos en
 * `unknown`: la lista decía `finalized` y la fuente emitía `formalized`.
 */
const SENTINELA = partyColor('«una formación que no existe»')
const PARTIDOS = Object.fromEntries(
  Object.entries(PARTY_COLORS).filter(([, hex]) => hex.toLowerCase() !== SENTINELA.toLowerCase()),
)

/** Los sitios que AÚN pintan un hex de partido, con motivo y ola. Se declaran
 *  uno a uno: «omitido con motivo» se informa aparte, nunca se pliega sobre
 *  «limpio».
 *
 *  Los pines y polígonos SALIERON de esta lista: son rellenos de un solo color
 *  que se leen como marca —55 círculos en la portada— y pasaron a petróleo.
 *  Lo que queda son series categóricas de gráfico, y ahí no hay retono trivial:
 *  se midieron cinco azules de sustitución y los cinco caen a menos de 20° de
 *  tono del PP o del propio petróleo. No existe un «azul de repuesto»; hace
 *  falta rediseñar la rampa entera, que es §07 y es la ola 3. Inventar un azul
 *  a medio camino sería colar una decisión de paleta dentro de una limpieza. */
const DIFERIDOS = {
  // VACÍO. Ya no queda ni un hexadecimal de partido fuera de party-colors.js.
  //
  // Los últimos tres eran series de gráfico, y el arreglo no fue encontrarles
  // un azul de repuesto —se midieron cinco y los cinco caían a menos de 20° de
  // tono del PP o del propio petróleo—. Fue leer bien §07: una barra de
  // MAGNITUD lleva un solo color, y las filas del presupuesto ya van
  // etiquetadas, así que los dos arcoíris no codificaban nada. La única barra
  // que sí necesita distinguir —la composición apilada por tipo de gasto—
  // pasó a una rampa de un solo tono.
  //
  // Esta aserción cazó las dos veces que se arregló algo sin darlo de baja, que
  // es la dirección en la que casi ningún guard falla.
}

function bloque(selector) {
  const m = CSS.match(new RegExp(selector + '\\s*\\{([\\s\\S]*?)\\n\\}', 'm'))
  if (!m) throw new Error(`no se encontró el bloque ${selector} en src/index.css`)
  return m[1]
}
function tokens(texto) {
  const out = {}
  for (const m of texto.matchAll(/--([\w-]+):\s*([^;]+);/g)) out['--' + m[1]] = m[2].trim()
  return out
}
const CLARO = tokens(bloque(':root'))
const OSCURO = tokens(bloque('html\\.dark'))

/** Alfa de un token de tinta. Un hex opaco es 1. */
function alfa(valor) {
  return valor.startsWith('#') ? 1 : parseRgba(valor).a
}
/** Los tiers que pintan TEXTO, derivados del valor: por debajo de .5 un token
 *  de tinta es borde o wash, no texto. No hay lista escrita a mano. */
function tiersDeTexto(t) {
  return Object.entries(t)
    .filter(([k]) => /^--ink\d*$/.test(k))
    .map(([k, v]) => [k, alfa(v)])
    .filter(([, a]) => a >= 0.5)
    .sort((x, y) => y[1] - x[1])
}

const EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.svg'])
function ficheros(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'dist' || e.startsWith('.')) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) ficheros(p, acc)
    else if (EXT.has(p.slice(p.lastIndexOf('.')))) acc.push(p)
  }
  return acc
}
const ESCANEADOS = [
  ...ficheros(join(ROOT, 'src')),
  ...ficheros(join(ROOT, 'public')),
  join(ROOT, 'index.html'),
].filter((p) => !p.endsWith(join('src', 'lib', 'party-colors.js')))

/** Todas las formas en que este repo escribe un color: `#rrggbb` y `rgba(r,g,b,…)`. */
function patronesDe(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return [
    new RegExp(hex, 'gi'),
    new RegExp(`rgba?\\(\\s*${r}\\s*,\\s*${g}\\s*,\\s*${b}\\s*[,)]`, 'gi'),
  ]
}

const hallazgos = []
let hexCandidatos = 0
for (const p of ESCANEADOS) {
  const txt = readFileSync(p, 'utf8')
  hexCandidatos += (txt.match(/#[0-9a-f]{6}\b/gi) || []).length
  const rel = relative(ROOT, p).split(sep).join('/')
  for (const [partido, hex] of Object.entries(PARTIDOS)) {
    const n = patronesDe(hex).reduce((s, re) => s + (txt.match(re) || []).length, 0)
    if (n) hallazgos.push({ rel, partido, hex, n })
  }
}

describe('el color de marca no es el de ningún partido', () => {
  it('1 · ningún hex de PARTY_COLORS vive fuera de party-colors.js', () => {
    // Importa el enum: añadir un partido extiende este guard solo. Copiarlo a
    // mano es el defecto que dejó 298 contratos en `unknown` sin que un test
    // pudiera fallar.
    const noDiferidos = hallazgos.filter((h) => !DIFERIDOS[h.rel])
    expect(
      noDiferidos.map((h) => `${h.rel} — ${h.partido} ${h.hex} ×${h.n}`),
      'un hex de partido pinta cromo de marca',
    ).toEqual([])
  })

  it('2 · el conjunto diferido es exactamente el declarado', () => {
    // Falla en los DOS sentidos: si aparece un séptimo fichero, y si uno se
    // arregla sin darlo de baja. «Omitido con motivo» se informa, no se pliega.
    const real = Object.fromEntries(
      hallazgos.filter((h) => DIFERIDOS[h.rel]).map((h) => [h.rel, h.n]),
    )
    const esperado = Object.fromEntries(Object.entries(DIFERIDOS).map(([k, v]) => [k, v.n]))
    expect(real).toEqual(esperado)
  })
})

describe('la escala de tinta escala', () => {
  for (const [tema, t] of [
    ['claro', CLARO],
    ['oscuro', OSCURO],
  ]) {
    it(`3 · ${tema} declara exactamente tres tiers de texto`, () => {
      // Cinco tiers con tres valores indistinguibles no es una escala.
      expect(tiersDeTexto(t).map(([k]) => k)).toHaveLength(3)
    })

    it(`4 · ${tema} separa cada tier del siguiente al menos .10 de alfa`, () => {
      // .62 frente a .64 no puede satisfacer esto. Es la aserción que convierte
      // «la escala no escala» en una puerta y no en una frase.
      const a = tiersDeTexto(t).map(([, x]) => x)
      const saltos = a.slice(1).map((x, i) => +(a[i] - x).toFixed(4))
      expect(Math.min(...saltos), `saltos: ${saltos.join(' · ')}`).toBeGreaterThanOrEqual(0.1)
    })
  }
})

describe('todo lo que pinta texto cumple AA', () => {
  const SUPERFICIES = ['--paper', '--surf', '--soft']
  for (const [tema, t, base] of [
    ['claro', CLARO, CLARO],
    ['oscuro', { ...CLARO, ...OSCURO }, { ...CLARO, ...OSCURO }],
  ]) {
    it(`5 · ${tema}: cada tier de tinta y cada par civic llega a 4,5:1`, () => {
      // Se COMPUTA desde lo analizado. Una tabla de ratios escrita a mano
      // envejece en silencio en cuanto alguien toca un token.
      const fallos = []

      // Un token que falta se informa por su nombre. Si se dejara reventar,
      // el fallo sería un stack de parseRgba y no diría cuál falta.
      const PARES = [
        ['--civic', '--paper'],
        ['--civic-ink', '--civic-soft'],
        ['--civic-on', '--civic'],
      ]
      for (const k of [...new Set(PARES.flat())]) {
        if (!t[k] && !base[k]) fallos.push(`${tema}: falta el token ${k}`)
      }

      for (const sup of SUPERFICIES) {
        const bg = base[sup]
        for (const [k] of tiersDeTexto(t)) {
          const r = contrastRatioOver(t[k], bg)
          if (r < 4.5) fallos.push(`${tema} ${k} sobre ${sup} (${bg}): ${r.toFixed(2)}:1`)
        }
      }
      for (const [fg, bg] of PARES) {
        if (!t[fg] || !(t[bg] ?? base[bg])) continue // ya informado arriba
        const r = contrastRatioOver(t[fg], t[bg] ?? base[bg])
        if (r < 4.5) fallos.push(`${tema} ${fg} sobre ${bg}: ${r.toFixed(2)}:1`)
      }
      expect(fallos).toEqual([])
    })
  }
})

describe('el guard demuestra que miró', () => {
  it('6 · el análisis encontró tokens, ficheros y hexes de verdad', () => {
    // Sin esto, una regex que no case con nada imprime su propio visto bueno.
    // Es la forma `r?.findings ?? []` que ya dejó pasar dos comprobaciones aquí.
    expect(Object.keys(CLARO).length, 'tokens en :root').toBeGreaterThan(8)
    expect(Object.keys(OSCURO).length, 'tokens en html.dark').toBeGreaterThan(8)
    expect(ESCANEADOS.length, 'ficheros escaneados').toBeGreaterThan(50)
    expect(hexCandidatos, 'hexes candidatos leídos').toBeGreaterThan(20)
    expect(Object.keys(PARTY_COLORS).length, 'partidos importados').toBeGreaterThan(3)
  })

  it('6b · la exclusión del sentinela quitó uno, y sólo uno', () => {
    // Control de la derivación de arriba. Sin esto, un fallo que vaciara
    // PARTIDOS dejaría la aserción 1 verde por no mirar a nadie — que es
    // precisamente la forma que este guard existe para no repetir.
    expect(Object.keys(PARTIDOS)).toHaveLength(Object.keys(PARTY_COLORS).length - 1)
    expect(Object.keys(PARTIDOS)).not.toContain('Otro')
    expect(Object.keys(PARTIDOS)).toContain('PP')
    expect(SENTINELA.toLowerCase()).toBe(PARTY_COLORS.Otro.toLowerCase())
  })
})
