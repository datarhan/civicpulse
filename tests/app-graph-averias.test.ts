/**
 * Las averías: puntos débiles MEDIDOS, cada uno con la comprobación que lo
 * encontró. Tres desenlaces, nunca dos — «no lo pude medir» no puede salir por
 * pantalla como un visto bueno.
 */
import { describe, it, expect } from 'vitest'
import { ENTRADAS_VACIAS, construirGrafoApp, detectarAverias } from '../src/scraper/app-graph'

const snap = (nombre: string) => ({ nombre, bytes: 1, generatedAt: null, source: null })
const conRuta = (nombre: string, ruta: string) => ({
  rutas: [ruta],
  rutasPorSnapshot: { [nombre]: [ruta] },
  paginaPorRuta: {},
  snapshotsDe: {},
  rutasPorFichero: {},
  importa: {},
})

describe('app-graph · averías', () => {
  it('señala el snapshot que no lee ninguna página: se publica y nadie lo mira', () => {
    const entradas = { ...ENTRADAS_VACIAS, snapshots: [snap('huerfano.json')], curados: [] }
    const parte = detectarAverias(construirGrafoApp(entradas), entradas)
    expect(parte.averias.map((a) => [a.codigo, a.nodo])).toContainEqual([
      'sin-superficie',
      'snapshot:huerfano.json',
    ])
  })

  it('señala el snapshot que una ruta lee y ningún guion escribe', () => {
    const entradas = {
      ...ENTRADAS_VACIAS,
      snapshots: [snap('singuion.json')],
      rutas: conRuta('singuion.json', '/x'),
      curados: [],
    }
    const parte = detectarAverias(construirGrafoApp(entradas), entradas)
    expect(parte.averias.map((a) => a.codigo)).toContain('sin-productor')
  })

  it('NO lo señala si el fichero es curado: ahí el escritor es una persona', () => {
    const entradas = {
      ...ENTRADAS_VACIAS,
      snapshots: [snap('promises.json')],
      rutas: conRuta('promises.json', '/promesas'),
      curados: ['promises.json'],
    }
    const parte = detectarAverias(construirGrafoApp(entradas), entradas)
    expect(parte.averias.map((a) => a.codigo)).not.toContain('sin-productor')
  })

  it('si la lista de curados no se pudo cargar, la comprobación es NO MEDIDA, no un aluvión', () => {
    // Ésta es la prueba que importa. Con `curados: null` —el fichero del gancho
    // ilegible— la versión ingenua señalaría los 16 ficheros curados del
    // repositorio como defectos el primer día.
    const entradas = {
      ...ENTRADAS_VACIAS,
      snapshots: [snap('promises.json')],
      rutas: conRuta('promises.json', '/promesas'),
      curados: null,
    }
    const parte = detectarAverias(construirGrafoApp(entradas), entradas)
    expect(parte.averias.map((a) => a.codigo)).not.toContain('sin-productor')
    expect(parte.noMedido.map((n) => n.codigo)).toContain('sin-productor')
    expect(parte.noMedido[0].motivo).toMatch(/curad/i)
  })

  it('señala el guion que no se pudo leer', () => {
    const entradas = {
      ...ENTRADAS_VACIAS,
      scripts: [{ ruta: 'scripts/opaco.ts', fuente: 'const p = f(x)' }],
      curados: [],
    }
    const parte = detectarAverias(construirGrafoApp(entradas), entradas)
    expect(parte.averias.map((a) => a.codigo)).toContain('sin-analizar')
  })

  it('un repositorio sano no inventa averías', () => {
    const entradas = {
      ...ENTRADAS_VACIAS,
      snapshots: [snap('bien.json')],
      scripts: [
        {
          ruta: 'scripts/scrape-bien.ts',
          fuente: "const OUT = join(R, 'public/data/bien.json')\nwriteFileSync(OUT, d)",
        },
      ],
      rutas: conRuta('bien.json', '/bien'),
      curados: [],
      // Un repositorio sano también declara quién vigila que esto no se quede
      // quieto: sin expectativa de frescura, `sin-expectativa` salta con razón.
      expectativas: ['bien.json'],
    }
    const parte = detectarAverias(construirGrafoApp(entradas), entradas)
    expect(parte.averias).toEqual([])
    expect(parte.noMedido).toEqual([])
  })
})

describe('app-graph · averías · lo visto pero sin clasificar', () => {
  // scrape-asociaciones.ts liga su ruta así: el escaneo VE el nombre pero no
  // puede atarlo a una llamada de escritura, y lo dice en `unclassified`.
  const COMO_ASOCIACIONES = [
    "const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public/data/asociaciones.json')",
    'await writeFile(OUT, JSON.stringify(d))',
  ].join('\n')

  it('no declara «sin productor» lo que un guion nombra pero el escaneo no supo clasificar', () => {
    const entradas = {
      ...ENTRADAS_VACIAS,
      snapshots: [snap('asociaciones.json')],
      scripts: [{ ruta: 'scripts/scrape-asociaciones.ts', fuente: COMO_ASOCIACIONES }],
      rutas: conRuta('asociaciones.json', '/datos'),
      curados: [],
    }
    const parte = detectarAverias(construirGrafoApp(entradas), entradas)

    expect(parte.averias.map((a) => a.codigo)).not.toContain('sin-productor')
    expect(parte.noMedido.map((n) => n.codigo)).toContain('sin-productor')
    expect(parte.noMedido[0].motivo).toMatch(/asociaciones\.json/)
  })

  it('sigue señalando el que de verdad no nombra nadie', () => {
    const entradas = {
      ...ENTRADAS_VACIAS,
      snapshots: [snap('nadie.json')],
      rutas: conRuta('nadie.json', '/datos'),
      curados: [],
    }
    const parte = detectarAverias(construirGrafoApp(entradas), entradas)
    expect(parte.averias.map((a) => a.codigo)).toContain('sin-productor')
  })
})
