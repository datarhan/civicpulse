import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { violacionesDeAmbito, type RedMetro } from '../src/scraper/metro-network'

/**
 * El snapshot que se publica, no el fixture: la nocturna reescribe
 * `metro-network.json` cada día, y esto es lo que ve quien abre la portada. Hasta el
 * 15-09-2026 traía el TRAM d'Alacant dentro de la red de València: la leyenda titulaba
 * L1–L4 y L9 con nombres del TRAM, y las estaciones de Alicante salían como parte de
 * la red.
 */
const SNAP = JSON.parse(
  readFileSync(join(__dirname, '../public/data/metro-network.json'), 'utf8'),
) as RedMetro

describe('la red publicada es sólo Metrovalencia', () => {
  it('mide algo: líneas, vías, estaciones y relaciones incluidas', () => {
    expect(SNAP.lines.length).toBeGreaterThan(0)
    expect(SNAP.tracks.length).toBeGreaterThan(0)
    expect(SNAP.stations.length).toBeGreaterThan(0)
    expect(SNAP.ambito?.relaciones?.incluidas ?? 0).toBeGreaterThan(0)
  })

  it('no trae nada fuera del ámbito', () => {
    expect(violacionesDeAmbito(SNAP)).toEqual([])
  })

  it('y la guarda ve una estación de Luceros plantada en él', () => {
    const plantada = {
      ...SNAP,
      stations: [
        ...SNAP.stations,
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
})
