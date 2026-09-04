/**
 * «Ahora mismo»: lo que cada pieza está haciendo, medido del disco.
 *
 * Es la capa que no puede quedarse vieja, porque no se escribe: se mide. Y la
 * que más cuidado necesita con el tercer desenlace — «esta pieza no lleva parte
 * de ejecución» no es «esta pieza falla», y tampoco es «va bien».
 */
import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { leerEntradas } from '../scripts/lib/app-graph-io'
import { medirEstado, veredictoDeParte } from '../scripts/lib/app-graph-estado'
import { construirGrafoApp, ENTRADAS_VACIAS } from '../src/scraper/app-graph'
import type { RunManifest } from '../src/scraper/run-manifest'

/**
 * Un parte completo del que sólo se cambia lo que la prueba mide.
 *
 * Escribir el bloque `llm` a mano dejaba fuera tres campos y TypeScript lo
 * cazó: es la regla 1 de DATA_INTEGRITY —no reformules una forma, impórtala—
 * funcionando en el sitio donde más barata sale.
 */
const parte = (cambios: Partial<RunManifest>): RunManifest =>
  ({
    script: 'x',
    runId: '2026-09-04T00-00-00-000Z',
    startedAt: '2026-09-04T00:00:00.000Z',
    endedAt: '2026-09-04T00:01:00.000Z',
    attempted: 0,
    judged: 0,
    neverAttempted: 0,
    skipped: {},
    exitCode: 0,
    llm: {
      calls: 0,
      cacheHits: 0,
      ok: 0,
      failed: 0,
      zeroTokenFailures: 0,
      shortCircuited: 0,
      freeBackendFallbacks: 0,
      tokens: 0,
      costUSD: 0,
    },
    ...cambios,
  }) as RunManifest

const ROOT = resolve(__dirname, '..')

describe('app-graph-estado · el veredicto de un parte de ejecución', () => {
  it('sin parte no dice ni bien ni mal: dice que no lo ha medido', () => {
    const v = veredictoDeParte([])
    expect(v.tono).toBe('no-medido')
    expect(v.lineas.join(' ')).toMatch(/sin parte/i)
  })

  it('una pasada que no intentó nada NO se cuenta como una pasada limpia', () => {
    // El defecto original: plegar «nunca intentado» dentro de «sin cambios» es
    // lo que dejó a una pasada declarando «re-juzgados 1017» con cero llamadas.
    const v = veredictoDeParte([
      parte({ attempted: 0, judged: 0, neverAttempted: 40, exitCode: 0 }),
    ])
    expect(v.tono).toBe('aviso')
    expect(v.lineas.join(' ')).toMatch(/nunca intentad/i)
  })

  it('una pasada que hizo trabajo y salió bien va en verde', () => {
    const v = veredictoDeParte([
      parte({ attempted: 10, judged: 10, neverAttempted: 0, exitCode: 0 }),
    ])
    expect(v.tono).toBe('ok')
  })

  it('una salida distinta de cero es un fallo, haya hecho trabajo o no', () => {
    const v = veredictoDeParte([
      parte({ attempted: 10, judged: 10, neverAttempted: 0, exitCode: 1 }),
    ])
    expect(v.tono).toBe('malo')
  })
})

describe('app-graph-estado · sobre el repositorio real', () => {
  const grafo = construirGrafoApp(leerEntradas(ROOT))
  const estado = medirEstado(ROOT, grafo)

  it('mide de verdad: no devuelve un mapa vacío', () => {
    // Suelo. Un medidor que no encontrara nada devolvería {} y, sin esto, la
    // prueba pasaría celebrando que no hay problemas.
    expect(Object.keys(estado).length).toBeGreaterThan(50)
  })

  it('fecha los snapshots que están en disco', () => {
    const conEdad = Object.entries(estado).filter(
      ([id, e]) => id.startsWith('snapshot:') && e.lineas.some((l) => /d[ií]as?|horas?/.test(l)),
    )
    expect(conEdad.length).toBeGreaterThan(40)
  })

  it('distingue los tres desenlaces, y ninguno se come a los demás', () => {
    const tonos = new Set(Object.values(estado).map((e) => e.tono))
    expect(tonos.has('no-medido')).toBe(true)
    expect(tonos.size).toBeGreaterThan(1)
  })
})

describe('app-graph-estado · la copia', () => {
  it('no escribe «1 horas» ni deja un separador colgando', () => {
    const grafo = construirGrafoApp(leerEntradas(ROOT))
    const estado = medirEstado(ROOT, grafo)
    const todas = Object.values(estado).flatMap((e) => e.lineas)
    expect(todas.length).toBeGreaterThan(50)
    expect(todas.filter((l) => /\b1 (horas|días)\b/.test(l))).toEqual([])
    expect(todas.filter((l) => /· *$/.test(l))).toEqual([])
  })
})

describe('lo que no es un fichero no se mide como si lo fuera', () => {
  // Las cinco tablas del bot declaran `bot/data/`, que es un DIRECTORIO y
  // además vive en el volumen de Fly.io. `statSync` sobre él devolvía la fecha
  // y el tamaño de la carpeta, y la ficha decía «ok · 33 días · 0 KB» de una
  // tabla que no está en esta máquina. Una medición del objeto equivocado se
  // lee igual que una medición buena.
  it('un nodo cuya ruta es un directorio sale como no medido', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      bot: {
        comandos: [],
        servicios: [],
        datos: [],
        fuentes: {},
        tablas: ['quejas'],
        exporta: null,
      },
    })
    const estado = medirEstado(resolve(__dirname, '..'), grafo)
    const e = estado['snapshot:quejas (SQLite)']
    expect(e?.tono).toBe('no-medido')
    expect(e?.lineas.join(' ')).not.toMatch(/KB/)
  })

  it('pero una colección publicada SÍ se mide: sus ficheros están aquí', () => {
    // `public/data/pleno-claims/` también es un directorio, y la diferencia con
    // `bot/data/` es que sus veintitrés ficheros están en esta máquina. Decir
    // «no medido» de algo que se puede medir es el mismo defecto por el otro
    // lado.
    const raiz = resolve(__dirname, '..')
    const grafo = construirGrafoApp(leerEntradas(raiz))
    const e = medirEstado(raiz, grafo)['snapshot:pleno-claims/']
    expect(e?.tono).not.toBe('no-medido')
    expect(e?.lineas.join(' ')).toMatch(/23 ficheros/)
    expect(e?.lineas.join(' ')).toMatch(/KB|MB/)
  })

  it('control: un snapshot publicado de verdad SÍ se mide', () => {
    const raiz = resolve(__dirname, '..')
    const grafo = construirGrafoApp(leerEntradas(raiz))
    const e = medirEstado(raiz, grafo)['snapshot:padron.json']
    expect(e?.tono).not.toBe('no-medido')
    expect(e?.lineas.join(' ')).toMatch(/KB/)
  })
})
