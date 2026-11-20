import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { RawSegment, SpeakerMap, SpeakerMapRow } from '../src/scraper/speaker-map'
import {
  blocsPorLinea,
  compararConOro,
  compararMapas,
  fraccion,
  lineasNoEvaluadas,
  tramosDeRelabels,
  wilson,
} from '../src/scraper/speaker-map-compare'

/**
 * La medida que decide si el mapa de texto puede sustituir al de Gemini. Lo que se
 * fija aquí: los cubos van separados — una contradicción nunca se cuenta como
 * cobertura, una etiqueta con dos bloques no es una abstención, y un tramo que un
 * mapa no miró no es «se abstuvo».
 */
const PUB: RawSegment[] = [
  { start: 0, end: 5, speaker: 'SPEAKER_00', text: 'Té la paraula el grup socialista, endavant.' },
  {
    start: 5,
    end: 12,
    speaker: 'SPEAKER_01',
    text: 'Moltes gràcies senyor alcalde, bona vesprada a tothom.',
  },
  {
    start: 12,
    end: 20,
    speaker: 'SPEAKER_02',
    text: 'La moción que presentamos hoy pide más limpieza en los barrios.',
  },
  {
    start: 20,
    end: 26,
    speaker: 'SPEAKER_03',
    text: 'Votamos en contra porque el contrato ya lo contempla todo.',
  },
]

const fila = (label: string, bloc: string, weak = false): SpeakerMapRow => ({
  label,
  bloc,
  slug: null,
  heardAs: null,
  evidence: [{ spokenBy: 'SPEAKER_00', at: 1, quote: 'x', relation: 'turn-grant' }],
  namesIndividual: false,
  weak,
})

const mapa = (
  rows: SpeakerMapRow[],
  over: Partial<SpeakerMap> & { separacion?: string } = {},
  segments: RawSegment[] = PUB,
): SpeakerMap =>
  ({
    plenoId: 'prueba',
    generatedAt: '2026-11-20T00:00:00Z',
    model: 'prueba',
    chunkSeconds: 600,
    segments,
    rows,
    rejected: [],
    stats: {
      chunksExpected: 1,
      chunksTranscribed: 1,
      failedChunks: [],
      labelsSeen: 4,
      rowsAccepted: rows.length,
      rowsRejected: 0,
      rejectedBy: {},
      coverage: 1,
    },
    ...over,
  }) as SpeakerMap

describe('compararMapas', () => {
  const a = mapa([fila('SPEAKER_01', 'PSOE'), fila('SPEAKER_02', 'PP'), fila('SPEAKER_03', 'VOX')])
  const b = mapa([
    fila('SPEAKER_01', 'PSOE'),
    fila('SPEAKER_02', 'Compromís'),
    fila('SPEAKER_00', 'PSOE'),
  ])
  const c = compararMapas(PUB, a, b)

  it('separa coinciden · contradicen · sólo A · sólo B · ninguno', () => {
    expect(c.porLinea).toMatchObject({
      total: 4,
      coinciden: 1,
      contradicen: 1,
      soloA: 1,
      soloB: 1,
      ninguno: 0,
    })
    expect(c.porEtiqueta).toMatchObject({
      total: 4,
      coinciden: 1,
      contradicen: 1,
      soloA: 1,
      soloB: 1,
    })
  })
  it('cada contradicción sale con su línea, para escucharla', () => {
    expect(c.contradicciones).toEqual([
      expect.objectContaining({ index: 2, a: 'PP', b: 'Compromís', speaker: 'SPEAKER_02' }),
    ])
  })
  it('las etiquetas a las que sólo el texto da bloque se listan: no se pueden juzgar contra Gemini', () => {
    expect(c.soloB).toEqual([{ label: 'SPEAKER_00', bloc: 'PSOE', start: 0 }])
  })
  it('una fila débil no vota: el alineador no la avala', () => {
    expect(blocsPorLinea(PUB, mapa([fila('SPEAKER_01', 'PSOE', true)]))[1]).toBeNull()
  })
})

describe('mixto: una etiqueta con dos bloques no es una abstención', () => {
  // Dos líneas publicadas bajo una misma etiqueta; el mapa (con su propia
  // segmentación) las atribuye a dos bloques distintos.
  const pub: RawSegment[] = [
    {
      start: 0,
      end: 5,
      speaker: 'SPEAKER_07',
      text: 'Volem que el contracte de neteja es torne a licitar enguany.',
    },
    {
      start: 5,
      end: 10,
      speaker: 'SPEAKER_07',
      text: 'El govern ja ha explicat que la pròrroga és legal i necessària.',
    },
  ]
  const segs: RawSegment[] = [
    { ...pub[0], speaker: 'X' },
    { ...pub[1], speaker: 'Y' },
  ]
  const a = mapa([fila('X', 'Compromís'), fila('Y', 'PSOE')], {}, segs)
  it('cuenta como mixto, no como ninguno ni como acuerdo', () => {
    const c = compararMapas(pub, a, mapa([], {}, pub))
    expect(c.porEtiqueta.mixto).toBe(1)
    expect(c.porEtiqueta.ninguno).toBe(0)
  })
})

describe('noEvaluado: lo que un mapa nunca miró', () => {
  it('Gemini: un trozo fallido saca sus líneas de toda tasa', () => {
    const a = mapa([fila('SPEAKER_01', 'PSOE')], {
      chunkSeconds: 10,
      stats: { ...mapa([]).stats, failedChunks: [{ chunk: 1, why: 'covered 40%' }] },
    })
    // Trozo 1 = [10, 20): la línea que empieza en 12.
    expect([...lineasNoEvaluadas(PUB, a)]).toEqual([2])
    const c = compararMapas(PUB, a, mapa([fila('SPEAKER_02', 'PP')]))
    expect(c.porLinea.noEvaluado).toBe(1)
    expect(c.porLinea.soloB).toBe(0)
  })
  it('sin mapa, nada fue mirado — nunca «ninguno»', () => {
    const r = compararMapas(PUB, null, null)
    expect(r.porLinea.noEvaluado).toBe(4)
    expect(r.porLinea.ninguno).toBe(0)
  })
})

describe('compararConOro', () => {
  const tramos = [
    { id: 't1', plenoId: 'prueba', desde: 4, hasta: 13, bloc: 'PSOE' },
    { id: 't2', plenoId: 'prueba', desde: 19, hasta: 27, bloc: 'PSOE' },
    { id: 't3', plenoId: 'prueba', desde: 100, hasta: 200, bloc: 'PSOE' },
    { id: 't4', plenoId: 'prueba', desde: 11, hasta: 19, bloc: 'PSOE' },
  ]
  const r = compararConOro(
    PUB,
    mapa([fila('SPEAKER_01', 'PSOE'), fila('SPEAKER_03', 'PP')]),
    tramos,
  )

  it('acierta · contradice · sin líneas · se abstiene, por tramo', () => {
    expect(r.tramos.map((t) => t.veredicto)).toEqual([
      'acierta',
      'contradice',
      'sin-lineas',
      'se-abstiene',
    ])
  })
  it('por línea: el punto medio decide si la línea es del tramo', () => {
    expect(r.lineas).toEqual({
      total: 3,
      aciertan: 1,
      contradicen: 1,
      seAbstienen: 1,
      noEvaluadas: 0,
    })
  })
})

describe('tramosDeRelabels — el oro firmado', () => {
  const doc = JSON.parse(readFileSync(resolve('public/data/pleno-claim-relabels.json'), 'utf8'))
  const t = tramosDeRelabels(doc)
  const entradas = Object.entries(
    doc.entries as Record<
      string,
      { speakerGroup?: string | null; segundos?: unknown; reason?: string }
    >,
  )
  it('lee cada entrada escuchada con bloque y segundos; ninguna se pierde en silencio', () => {
    const esperadas = entradas.filter(
      ([, e]) => e.speakerGroup && e.segundos && !/no se ha escuchado/i.test(e.reason ?? ''),
    ).length
    expect(t.length).toBe(esperadas)
    expect(t.length).toBeGreaterThan(0)
    for (const x of t) expect(x.hasta).toBeGreaterThan(x.desde)
  })
  it('una firma que dice no haber escuchado el vídeo no es oro', () => {
    const sinEscuchar = entradas
      .filter(([, e]) => /no se ha escuchado/i.test(e.reason ?? ''))
      .map(([id]) => id)
    for (const id of sinEscuchar) expect(t.map((x) => x.id)).not.toContain(id)
  })
})

describe('wilson', () => {
  it('0 de 8 no es «0 %»: la cota superior ronda el 32 %', () => {
    const w = wilson(0, 8)
    expect(w.inferior).toBe(0)
    expect(w.superior).toBeGreaterThan(0.3)
    expect(w.superior).toBeLessThan(0.34)
  })
  it('sin denominador no se sabe nada: [0, 1]', () => {
    expect(wilson(0, 0)).toEqual({ inferior: 0, superior: 1 })
  })
})

describe('fraccion', () => {
  it('numerador, denominador y porcentaje, siempre juntos', () => {
    expect(fraccion(3, 40)).toBe('3/40 (7,5 %)')
    expect(fraccion(0, 0)).toBe('0/0 (—)')
  })
})
