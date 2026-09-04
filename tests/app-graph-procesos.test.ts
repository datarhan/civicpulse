/**
 * La banda de procesos: lo que MUEVE los datos sin ser un dato.
 *
 * Un guion que no escribe ningún snapshot publicado no pertenece al espinazo —
 * las 39 guardas y los 41 CLIs de curador lo atravesaban de lado a lado sin
 * aportar una relación que explique un dato.
 */
import { describe, it, expect } from 'vitest'
import { ENTRADAS_VACIAS, construirGrafoApp } from '../src/scraper/app-graph'

const carrilDe = (grafo, id) => grafo.nodos.find((n) => n.id === id)?.carril

describe('app-graph · la banda de procesos', () => {
  it('manda a la banda el guion que no escribe ningún snapshot', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      snapshots: [{ nombre: 'x.json', bytes: 1, generatedAt: null, source: null }],
      scripts: [
        {
          ruta: 'scripts/check-algo.ts',
          fuente: "const IN = resolve(D, 'x.json')\nreadFileSync(IN)",
        },
      ],
    })
    expect(carrilDe(grafo, 'script:check-algo.ts')).toBe('proceso')
    // Y sigue leyendo: la relación no se pierde al cambiar de banda.
    expect(grafo.aristas).toContainEqual({
      de: 'snapshot:x.json',
      a: 'script:check-algo.ts',
      tipo: 'lee',
      origen: 'derivada',
    })
  })

  it('el guion que NO se pudo leer NO se manda a la banda: no sabemos si escribe', () => {
    // La misma regla de siempre, un nivel más abajo. «No escribe nada» y «no
    // pude ver qué escribe» no son el mismo hecho, y mover el segundo a la
    // banda de procesos sería afirmar el primero.
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      scripts: [{ ruta: 'scripts/opaco.ts', fuente: 'const p = f(x)' }],
    })
    expect(carrilDe(grafo, 'script:opaco.ts')).toBe('script')
  })

  it('un cron programa el guion que ejecuta', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      crones: [
        {
          etiqueta: 'com.civicpulse.hallazgos',
          hora: 9,
          minuto: 30,
          fichero: 'scripts/com.civicpulse.hallazgos.plist',
          programa: 'scripts/hallazgos-pipeline.sh',
          log: 'scripts/logs/hallazgos-pipeline.log',
        },
      ],
    })
    expect(grafo.nodos.map((n) => n.id)).toContain('proceso:com.civicpulse.hallazgos')
    expect(carrilDe(grafo, 'proceso:com.civicpulse.hallazgos')).toBe('proceso')
    expect(grafo.aristas).toContainEqual({
      de: 'proceso:com.civicpulse.hallazgos',
      a: 'script:hallazgos-pipeline.sh',
      tipo: 'programa',
      origen: 'declarada',
    })
  })

  it('un flujo de CI programa los guiones npm que ejecuta', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      comandos: { 'scrape:padron': 'npx tsx scripts/scrape-padron.ts' },
      scripts: [
        {
          ruta: 'scripts/scrape-padron.ts',
          fuente: "const OUT = join(R, 'public/data/padron.json')\nwriteFileSync(OUT, d)",
        },
      ],
      flujos: [
        {
          fichero: '.github/workflows/nightly-scrape.yml',
          nombre: 'Nightly real-data refresh',
          cron: '30 4 * * *',
          ejecuta: ['scrape:padron'],
        },
      ],
    })
    expect(grafo.aristas).toContainEqual({
      de: 'proceso:nightly-scrape.yml',
      a: 'script:scrape-padron.ts',
      tipo: 'programa',
      origen: 'declarada',
    })
  })

  it('no inventa una arista hacia un guion npm que no existe', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      comandos: {},
      flujos: [
        {
          fichero: '.github/workflows/x.yml',
          nombre: 'X',
          cron: null,
          ejecuta: ['fantasma'],
        },
      ],
    })
    expect(grafo.aristas.filter((a) => a.tipo === 'programa')).toEqual([])
  })
})

describe('app-graph · los orquestadores en shell', () => {
  const SCRAPE_ALL = [
    '#!/usr/bin/env bash',
    'npm run scrape:padron',
    'npm run compute:tender-geo || true',
  ].join('\n')

  it('entra como proceso y programa las órdenes npm que ejecuta', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      comandos: {
        'scrape:padron': 'npx tsx scripts/scrape-padron.ts',
        'compute:tender-geo': 'npx tsx scripts/compute-tender-geo.ts',
      },
      orquestadores: [{ ruta: 'scripts/scrape-all.sh', fuente: SCRAPE_ALL }],
    })
    expect(carrilDe(grafo, 'proceso:scrape-all.sh')).toBe('proceso')
    expect(grafo.aristas).toContainEqual({
      de: 'proceso:scrape-all.sh',
      a: 'script:scrape-padron.ts',
      tipo: 'programa',
      origen: 'derivada',
    })
  })

  it('NO cuenta como «no leído»: ese escáner no habla bash', () => {
    // Marcarlos «no leído» mezclaría dos hechos distintos —«este escáner no
    // entiende shell» y «este guion construye sus rutas de forma rara»— y el
    // aviso de la página cuenta lo segundo.
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      orquestadores: [{ ruta: 'scripts/scrape-all.sh', fuente: SCRAPE_ALL }],
    })
    expect(grafo.stats.scriptsSinAnalizar).toBe(0)
    expect(grafo.nodos.find((n) => n.id === 'proceso:scrape-all.sh')?.analizado).toBe(true)
  })
})

describe('app-graph · las clases de proceso', () => {
  it('distingue lo que corre solo de lo que no, sin mirar la frase de presentación', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      crones: [
        {
          etiqueta: 'com.civicpulse.x',
          hora: 9,
          minuto: 0,
          fichero: 'scripts/com.civicpulse.x.plist',
          programa: 'scripts/x.sh',
          log: null,
        },
      ],
      flujos: [{ fichero: '.github/workflows/y.yml', nombre: 'Y', cron: null, ejecuta: [] }],
      orquestadores: [{ ruta: 'scripts/z.sh', fuente: '' }],
      bot: {
        comandos: ['queja.ts'],
        servicios: [],
        datos: [],
        fuentes: {},
        tablas: [],
        exporta: null,
      },
    })
    const clase = (id) => grafo.nodos.find((n) => n.id === id)?.clase
    expect(clase('proceso:com.civicpulse.x')).toBe('cron')
    expect(clase('proceso:y.yml')).toBe('flujo')
    expect(clase('proceso:z.sh')).toBe('orquestador')
    expect(clase('proceso:bot/commands/queja.ts')).toBe('comando-bot')
  })
})
