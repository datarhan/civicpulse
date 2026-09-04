import { describe, it, expect } from 'vitest'
import { construirGrafoApp, ENTRADAS_VACIAS } from '../src/scraper/app-graph'

describe('app-graph · la espina', () => {
  it('une un script con el snapshot que escribe', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      scripts: [
        {
          ruta: 'scripts/scrape-padron.ts',
          fuente: [
            "const OUT = join(PROJECT_ROOT, 'public/data/padron.json')",
            'writeFileSync(OUT, JSON.stringify(datos))',
          ].join('\n'),
        },
      ],
      snapshots: [{ nombre: 'padron.json', bytes: 5900, generatedAt: null, source: null }],
    })

    const ids = grafo.nodos.map((n) => n.id)
    expect(ids).toContain('script:scrape-padron.ts')
    expect(ids).toContain('snapshot:padron.json')
    expect(grafo.aristas).toContainEqual({
      de: 'script:scrape-padron.ts',
      a: 'snapshot:padron.json',
      tipo: 'escribe',
      origen: 'derivada',
    })
  })
})

describe('app-graph · lo que no se pudo leer', () => {
  const CLARO = "const OUT = join(R, 'public/data/claro.json')\nwriteFileSync(OUT, d)"
  const OPACO = 'const p = construirRuta(dominio)\nwriteFileSync(p, x)'

  it('cuenta aparte los scripts que no se pudieron analizar', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      scripts: [
        { ruta: 'scripts/claro.ts', fuente: CLARO },
        { ruta: 'scripts/opaco.ts', fuente: OPACO },
      ],
    })

    expect(grafo.stats.scriptsAnalizados).toBe(1)
    expect(grafo.stats.scriptsSinAnalizar).toBe(1)
    expect(grafo.nodos.find((n) => n.id === 'script:opaco.ts')?.analizado).toBe(false)
    expect(grafo.nodos.find((n) => n.id === 'script:claro.ts')?.analizado).toBe(true)
  })

  it('no inventa una hoja limpia: el script opaco no cuelga de ningún snapshot', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      scripts: [{ ruta: 'scripts/opaco.ts', fuente: OPACO }],
    })
    expect(grafo.aristas).toEqual([])
    expect(grafo.stats.scriptsSinAnalizar).toBe(1)
  })
})

describe('app-graph · el resto de la espina', () => {
  it('apunta las aristas en el sentido en que corre el dato', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      scripts: [
        {
          ruta: 'scripts/compute-entities.ts',
          fuente: [
            "const DATA = resolve('public/data')",
            "const TENDERS = resolve(DATA, 'tenders.json')",
            "const OUT = resolve(DATA, 'entities.json')",
            'const t = readFileSync(TENDERS)',
            'writeFileSync(OUT, JSON.stringify(t))',
          ].join('\n'),
        },
      ],
      snapshots: [
        { nombre: 'tenders.json', bytes: 10, generatedAt: null, source: null },
        { nombre: 'entities.json', bytes: 10, generatedAt: null, source: null },
      ],
    })

    expect(grafo.aristas).toContainEqual({
      de: 'snapshot:tenders.json',
      a: 'script:compute-entities.ts',
      tipo: 'lee',
      origen: 'derivada',
    })
    expect(grafo.aristas).toContainEqual({
      de: 'script:compute-entities.ts',
      a: 'snapshot:entities.json',
      tipo: 'escribe',
      origen: 'derivada',
    })
  })

  it('cuelga la ruta del snapshot que la alimenta, y la liga a su módulo de página', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      snapshots: [{ nombre: 'padron.json', bytes: 5900, generatedAt: null, source: null }],
      rutas: {
        rutas: ['/datos'],
        rutasPorSnapshot: { 'padron.json': ['/datos'] },
        paginaPorRuta: { '/datos': 'src/pages/Datos.jsx' },
        snapshotsDe: {},
        rutasPorFichero: {},
        importa: {},
      },
    })

    const ids = grafo.nodos.map((n) => n.id)
    expect(ids).toContain('ruta:/datos')
    expect(ids).toContain('vista:Datos.jsx')
    expect(grafo.aristas).toContainEqual({
      de: 'snapshot:padron.json',
      a: 'ruta:/datos',
      tipo: 'alimenta',
      origen: 'derivada',
    })
    expect(grafo.aristas).toContainEqual({
      de: 'vista:Datos.jsx',
      a: 'ruta:/datos',
      tipo: 'monta',
      origen: 'derivada',
    })
  })

  it('liga el hook con el snapshot que carga', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      hooks: [
        { ruta: 'src/hooks/usePadron.js', fuente: "return useJsonFetch('/data/padron.json')" },
      ],
      snapshots: [{ nombre: 'padron.json', bytes: 10, generatedAt: null, source: null }],
      rutas: {
        rutas: [],
        rutasPorSnapshot: {},
        paginaPorRuta: {},
        snapshotsDe: { 'src/hooks/usePadron.js': ['padron.json'] },
        rutasPorFichero: {},
        importa: {},
      },
    })

    expect(grafo.nodos.map((n) => n.id)).toContain('hook:usePadron.js')
    expect(grafo.aristas).toContainEqual({
      de: 'snapshot:padron.json',
      a: 'hook:usePadron.js',
      tipo: 'sirve',
      origen: 'derivada',
    })
  })
})

describe('app-graph · parsers y fuentes', () => {
  it('cuelga del script el parser puro que importa', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      scripts: [
        {
          ruta: 'scripts/scrape-padron.ts',
          fuente: [
            "import { parseInePadron } from '../src/scraper/padron'",
            "const OUT = join(R, 'public/data/padron.json')",
            'writeFileSync(OUT, d)',
          ].join('\n'),
        },
      ],
      parsers: [{ ruta: 'src/scraper/padron.ts', fuente: 'export function parseInePadron() {}' }],
    })

    expect(grafo.nodos.map((n) => n.id)).toContain('parser:padron.ts')
    expect(grafo.aristas).toContainEqual({
      de: 'script:scrape-padron.ts',
      a: 'parser:padron.ts',
      tipo: 'importa',
      origen: 'derivada',
    })
  })

  it('no inventa un parser que el script no importa', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      scripts: [{ ruta: 'scripts/scrape-padron.ts', fuente: 'const x = 1' }],
      parsers: [{ ruta: 'src/scraper/padron.ts', fuente: 'export function parseInePadron() {}' }],
    })
    expect(grafo.aristas.filter((a) => a.tipo === 'importa')).toEqual([])
  })

  it('saca la fuente de arriba del propio snapshot, y la marca como DECLARADA', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      snapshots: [
        {
          nombre: 'padron.json',
          bytes: 5900,
          generatedAt: null,
          source: 'https://www.ine.es/jaxiT3/files/t/es/csv_bd/2903.csv',
        },
      ],
    })

    expect(grafo.nodos.map((n) => n.id)).toContain('fuente:www.ine.es')
    expect(grafo.aristas).toContainEqual({
      de: 'fuente:www.ine.es',
      a: 'snapshot:padron.json',
      tipo: 'alimenta',
      origen: 'declarada',
    })
  })

  it('un snapshot sin fuente declarada no recibe una fuente inventada', () => {
    const grafo = construirGrafoApp({
      ...ENTRADAS_VACIAS,
      snapshots: [{ nombre: 'x.json', bytes: 10, generatedAt: null, source: null }],
    })
    expect(grafo.nodos.filter((n) => n.carril === 'fuente')).toEqual([])
  })
})
