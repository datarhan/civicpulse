import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  LIMITE_SUR_METROVALENCIA,
  ambitoDeLaRelacion,
  normaliseRef,
  parseMetroNetwork,
  violacionesDeAmbito,
  type OsmElement,
  type OsmNode,
  type OsmRelation,
  type OsmWay,
} from '../src/scraper/metro-network'

// Respuesta real de Overpass (15-09-2026) a la consulta de
// scripts/scrape-metro-network.ts, recortada: dos relaciones de Metrovalencia (L9
// Riba-roja de Túria ⇒ Alboraia y L1 Castelló ⇒ Bétera) y dos del TRAM d'Alacant con
// las mismas refs (TRAM L1 y L9 Benidorm ⇒ Dénia), cada una con sus tres primeras vías
// —la geometría cortada a tres puntos— y sus tres primeras paradas con nombre.
//
// LA TRAMPA. La consulta pide `network~Metrovalencia` O `operator~FGV`, y FGV opera
// también el TRAM de Alicante. Las refs chocan (L1–L5 y L9), así que la leyenda del
// mapa de la portada ponía nombres del TRAM a líneas de València, y las estaciones de
// Alicante enlazaban a metrovalencia.es. Ninguna relación de una red cruza la latitud
// 39,0, que queda entre Dénia y Castelló.
const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'overpass_metro-network_2026-09-15.json'), 'utf8'),
) as { elements: OsmElement[] }

const RELACIONES = FIXTURE.elements.filter((e): e is OsmRelation => e.type === 'relation')
const NODOS = new Map(
  FIXTURE.elements.filter((e): e is OsmNode => e.type === 'node').map((n) => [n.id, n]),
)
const VLC = RELACIONES.filter((r) => r.tags?.network === 'Metrovalencia')
const TRAM = RELACIONES.filter((r) => r.tags?.network === "TRAM Metropolità d'Alacant")
const refDe = (r: OsmRelation) => normaliseRef(r.tags?.ref)
const paradasDe = (r: OsmRelation) =>
  r.members
    .filter((m) => m.type === 'node')
    .map((m) => NODOS.get(m.ref)?.tags?.name)
    .filter((n): n is string => !!n)

describe('parseMetroNetwork: la red completa del mapa es sólo Metrovalencia', () => {
  const red = parseMetroNetwork(FIXTURE)

  it('mide algo: una relación de cada red con la misma ref, y el parser emite vías y estaciones', () => {
    expect(VLC.length).toBeGreaterThan(0)
    expect(TRAM.length).toBeGreaterThan(0)
    const refsVlc = new Set(VLC.map(refDe))
    expect(
      TRAM.some((r) => refsVlc.has(refDe(r))),
      'ninguna ref compartida: la prueba no mide el choque',
    ).toBe(true)
    expect(red.tracks.length).toBeGreaterThan(0)
    expect(red.stations.length).toBeGreaterThan(0)
  })

  it('ninguna estación ni ningún punto de vía al sur del límite', () => {
    expect(
      red.stations.filter((s) => s.centroid[0] < LIMITE_SUR_METROVALENCIA).map((s) => s.name),
    ).toEqual([])
    expect(
      red.tracks.flatMap((t) => t.line).filter(([lat]) => lat < LIMITE_SUR_METROVALENCIA),
    ).toEqual([])
  })

  it('ninguna parada del TRAM llega a la salida', () => {
    const delTram = new Set(TRAM.flatMap(paradasDe))
    expect(delTram.size, 'el fixture no trae paradas del TRAM').toBeGreaterThan(0)
    expect(red.stations.map((s) => s.name).filter((n) => delTram.has(n))).toEqual([])
  })

  it('ni fundida por nombre con una estación de València', () => {
    // Hoy ningún nombre coincide entre las dos redes, así que se fuerza: una parada del
    // TRAM pasa a llamarse como una de València. El parser de antes fundía por nombre.
    const nombre = paradasDe(VLC[0])[0]
    const refsEsperadas = VLC.filter((r) => paradasDe(r).includes(nombre))
      .map(refDe)
      .filter((r): r is string => !!r)
      .sort()
    const intrusa = TRAM.find((r) => !refsEsperadas.includes(refDe(r) ?? ''))
    expect(intrusa, 'no hay relación del TRAM con otra ref que plantar').toBeTruthy()
    const idParada = intrusa!.members.find((m) => m.type === 'node')!.ref

    const copia = structuredClone(FIXTURE)
    const nodo = copia.elements.find((e) => e.type === 'node' && e.id === idParada) as OsmNode
    nodo.tags = { ...nodo.tags, name: nombre }

    const estacion = parseMetroNetwork(copia).stations.find((s) => s.name === nombre)
    expect(estacion, 'desapareció la estación de València').toBeTruthy()
    expect(estacion!.lineRefs).toEqual(refsEsperadas)
    expect(estacion!.centroid[0]).toBeGreaterThanOrEqual(LIMITE_SUR_METROVALENCIA)
  })

  it('la línea de una ref compartida lleva el nombre de una relación de València, y sólo su red', () => {
    const compartidas = [...new Set(TRAM.map(refDe))].filter((ref) =>
      VLC.some((r) => refDe(r) === ref),
    )
    expect(compartidas.length).toBeGreaterThan(0)
    for (const ref of compartidas) {
      const linea = red.lines.find((l) => l.ref === ref)
      expect(linea, `falta ${ref}`).toBeTruthy()
      expect(VLC.map((r) => r.tags?.name)).toContain(linea!.name)
      expect(linea!.networks).toEqual(['Metrovalencia'])
    }
  })

  it('el ámbito cuenta lo que hizo: incluidas, sin ref y excluidas suman las consultadas', () => {
    const r = red.ambito.relaciones
    expect(r.consultadas).toBe(RELACIONES.length)
    expect(r.incluidas).toBeGreaterThan(0)
    const excluidas = r.excluidas.reduce((s, e) => s + e.relaciones, 0)
    expect(r.incluidas + r.sinRef + excluidas).toBe(r.consultadas)
    expect(r.excluidas.map((e) => [e.por, e.network])).toContainEqual([
      'otra-red',
      "TRAM Metropolità d'Alacant",
    ])
    expect(red.ambito.limiteSur).toBe(LIMITE_SUR_METROVALENCIA)
  })
})

describe('ambitoDeLaRelacion, caso por caso', () => {
  const FGV = 'Ferrocarrils de la Generalitat Valenciana'
  const via = (id: number, lat: number): OsmWay => ({
    type: 'way',
    id,
    geometry: [
      { lat, lon: -0.5 },
      { lat: lat + 0.001, lon: -0.5 },
    ],
    tags: { railway: 'light_rail' },
  })
  const relacion = (tags: Record<string, string>, idVia: number): OsmRelation => ({
    type: 'relation',
    id: idVia * 10,
    members: [{ type: 'way', ref: idVia, role: '' }],
    tags,
  })
  const NORTE = 1
  const SUR = 2
  const vias = new Map([
    [NORTE, via(NORTE, 39.5)],
    [SUR, via(SUR, 38.4)],
  ])
  const nodos = new Map<number, OsmNode>()
  const ambito = (tags: Record<string, string>, idVia: number) =>
    ambitoDeLaRelacion(relacion(tags, idVia), vias, nodos)

  it('Metrovalencia al norte: dentro, por su network', () => {
    expect(ambito({ network: 'Metrovalencia', operator: FGV }, NORTE)).toEqual({
      dentro: true,
      por: 'network',
      network: 'Metrovalencia',
    })
  })

  it('otra network, aunque la opere FGV: fuera', () => {
    expect(ambito({ network: "TRAM Metropolità d'Alacant", operator: FGV }, NORTE)).toEqual({
      dentro: false,
      por: 'otra-red',
      network: "TRAM Metropolità d'Alacant",
    })
  })

  it('sin network y al sur: fuera', () => {
    expect(ambito({ operator: FGV }, SUR)).toEqual({ dentro: false, por: 'al-sur', network: null })
  })

  it('sin network y al norte: dentro, por geografía', () => {
    expect(ambito({ operator: FGV }, NORTE)).toEqual({
      dentro: true,
      por: 'geografia',
      network: null,
    })
  })

  it('la etiqueta de Metrovalencia no mete en el mapa una geometría del sur', () => {
    expect(ambito({ network: 'Metrovalencia' }, SUR)).toEqual({
      dentro: false,
      por: 'al-sur',
      network: 'Metrovalencia',
    })
  })

  it('sin geometría que medir: fuera, y dice por qué', () => {
    expect(ambito({ network: 'Metrovalencia' }, 99)).toEqual({
      dentro: false,
      por: 'sin-geometria',
      network: 'Metrovalencia',
    })
  })
})

describe('violacionesDeAmbito', () => {
  const red = parseMetroNetwork(FIXTURE)

  it('limpia sobre lo que emite el parser, y ve una estación de Luceros plantada', () => {
    expect(violacionesDeAmbito(red)).toEqual([])
    const plantada = {
      ...red,
      stations: [
        ...red.stations,
        {
          id: 'node-1',
          name: 'Luceros',
          lineRefs: ['L1'],
          centroid: [38.3452, -0.4815] as [number, number],
        },
      ],
    }
    expect(violacionesDeAmbito(plantada).join('\n')).toMatch(/Luceros/)
  })

  it('una línea con nombre del TRAM, o sin red, es una violación', () => {
    const conNombreDelTram = {
      ...red,
      lines: red.lines.map((l, i) =>
        i === 0 ? { ...l, name: 'TRAM L1: Alicante-Luceros ⇒ Benidorm' } : l,
      ),
    }
    expect(violacionesDeAmbito(conNombreDelTram).length).toBeGreaterThan(0)
    const sinRed = {
      ...red,
      lines: red.lines.map((l, i) => (i === 0 ? { ...l, networks: [] } : l)),
    }
    expect(violacionesDeAmbito(sinRed).length).toBeGreaterThan(0)
  })
})
