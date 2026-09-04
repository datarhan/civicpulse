/**
 * La capa que lee el repositorio de verdad.
 *
 * Los suelos no son decorativos: sin ellos, un lector que dejara de encontrar
 * ficheros devolvería listas vacías, el grafo saldría vacío y la prueba pasaría
 * tan campante. «No encontró nada» y «no hay nada» son hechos distintos.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { leerEntradas } from '../scripts/lib/app-graph-io'
import { construirGrafoApp } from '../src/scraper/app-graph'

const ROOT = resolve(__dirname, '..')

describe('app-graph-io · lee el repositorio', () => {
  const entradas = leerEntradas(ROOT)

  it('encuentra scripts, parsers, hooks, snapshots y rutas', () => {
    expect(entradas.scripts.length).toBeGreaterThan(100)
    expect(entradas.parsers.length).toBeGreaterThan(100)
    expect(entradas.hooks.length).toBeGreaterThan(50)
    expect(entradas.snapshots.length).toBeGreaterThan(50)
    expect(entradas.rutas.rutas.length).toBeGreaterThan(20)
  })

  it('las claves de snapshotsDe son relativas a la raíz, no absolutas', () => {
    const claves = Object.keys(entradas.rutas.snapshotsDe)
    expect(claves.length).toBeGreaterThan(20)
    expect(claves.every((k) => !k.startsWith('/'))).toBe(true)
    expect(claves.some((k) => k.startsWith('src/'))).toBe(true)
  })

  it('cada script trae su texto, no sólo su nombre', () => {
    expect(entradas.scripts.every((s) => s.fuente.length > 0)).toBe(true)
  })
})

describe('app-graph · sobre el repositorio real', () => {
  const grafo = construirGrafoApp(leerEntradas(ROOT))

  it('sale un grafo con carriles poblados, no un dibujo vacío', () => {
    expect(grafo.stats.porCarril.script).toBeGreaterThan(100)
    expect(grafo.stats.porCarril.snapshot).toBeGreaterThan(50)
    expect(grafo.stats.porCarril.hook).toBeGreaterThan(50)
    expect(grafo.stats.porCarril.ruta).toBeGreaterThan(20)
    expect(grafo.stats.aristas).toBeGreaterThan(200)
  })

  it('analiza la mayoría de los scripts, y dice cuántos no', () => {
    const { scriptsAnalizados, scriptsSinAnalizar } = grafo.stats
    expect(scriptsAnalizados).toBeGreaterThan(100)
    // No se exige cero: lo que se exige es que el que no se pudo leer se
    // CUENTE. Si esta proporción se dispara, el escáner ha dejado de entender
    // una forma que el repositorio usa, y eso hay que verlo.
    expect(scriptsSinAnalizar / (scriptsAnalizados + scriptsSinAnalizar)).toBeLessThan(0.35)
  })
})

describe('app-graph-io · la lista de curados', () => {
  it('la lee del gancho que ya la declara, y no sale vacía', () => {
    const curados = leerEntradas(ROOT).curados
    // Suelo: si el raspado dejara de reconocer el bloque devolvería null, y una
    // lista corta significaría que reconoce el bloque pero no las claves.
    expect(curados).not.toBeNull()
    expect(curados.length).toBeGreaterThan(15)
    expect(curados).toContain('promises.json')
    expect(curados).toContain('pleno-findings.json')
  })
})

describe('app-graph-io · el bot', () => {
  it('encuentra sus comandos, sus servicios y sus tablas', () => {
    const bot = leerEntradas(ROOT).bot
    expect(bot).not.toBeNull()
    expect(bot.comandos.length).toBeGreaterThan(10)
    expect(bot.servicios.length).toBeGreaterThan(10)
    // Suelo con nombre: el esquema vive en un .sql, y un filtro que sólo mire
    // .ts devuelve cero tablas sin decir que no ha mirado.
    expect(bot.tablas).toContain('quejas')
    expect(bot.tablas.length).toBeGreaterThan(3)
  })
})

describe('app-graph-io · «todo lo que está bajo public/ se publica» incluye lo que no es JSON', () => {
  // El filtro era `/\.json$/`, así que de los siete directorios publicados el
  // mapa dibujaba tres. Fuera quedaban las 44 transcripciones de pleno (.txt),
  // las fotos de concejales, las fotos anonimizadas de quejas (.jpg) y los
  // briefs del agente (.md).
  //
  // Un mapa cuyo trabajo es sostener la regla «todo lo que está bajo public/ se
  // publica» no puede aplicarle a esa regla un filtro por extensión. La lista
  // se DERIVA del disco: una comprobación contra nombres escritos a mano se
  // quedaría atrás en cuanto naciera el octavo.
  const dir = resolve(ROOT, 'public/data')
  const enDisco = readdirSync(dir)
    .filter((e) => statSync(resolve(dir, e)).isDirectory())
    .filter((e) => readdirSync(resolve(dir, e)).length > 0)
    .sort()

  it('conoce todos los directorios publicados, sea cual sea su extensión', () => {
    const entradas = leerEntradas(ROOT)
    expect(enDisco.length).toBeGreaterThan(3) // suelo: si el disco se vacía, esto cae
    expect(entradas.colecciones.map((c) => c.nombre).sort()).toEqual(enDisco.map((e) => `${e}/`))
  })

  it('cuenta sus ficheros y sus bytes de verdad', () => {
    const entradas = leerEntradas(ROOT)
    for (const c of entradas.colecciones) {
      expect(c.ficheros).toBeGreaterThan(0)
      expect(c.bytes).toBeGreaterThan(0)
    }
  })
})
