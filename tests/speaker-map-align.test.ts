import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseSpeakerMapResponse, globalLabel, type SpeakerMap } from '../src/scraper/speaker-map'
import { validateSpeakerMap } from '../src/scraper/speaker-map-validate'
import {
  alignSpeakerMap,
  locateQuote,
  blocByPublishedSpeaker,
  blocResolverFor,
  type AlignmentResult,
} from '../src/scraper/speaker-map-align'
import { parseDiarizedTranscript } from '../src/scraper/voice-id'
import { quoteCoverage } from '../src/scraper/quote-match'
import {
  seatsFromOfficials,
  type OfficialLike,
  type OfficialsDoc,
} from '../src/scraper/corporation-seats'

const doc = JSON.parse(readFileSync(resolve('public/data/officials.json'), 'utf8')) as OfficialsDoc
const OFFICIALS = (doc.officials ?? []) as OfficialLike[]
const SEATS = seatsFromOfficials(doc)

/**
 * The fixture covers session minutes 110–120 of pleno 10yl550, so its
 * chunk-relative times are offset by 6600 s to land on the published
 * transcript's clock — exactly what `extract-speaker-map.ts` does per chunk.
 */
const OFFSET = 6600
const parsed = parseSpeakerMapResponse(
  readFileSync(resolve('tests/fixtures/gemini-speaker-map_2026-08-10.txt'), 'utf8'),
)
const validated = validateSpeakerMap({
  candidates: parsed.candidates,
  segments: parsed.segments,
  officials: OFFICIALS,
  seats: SEATS,
})

const MAP: SpeakerMap = {
  plenoId: '10yl550',
  generatedAt: '2026-08-10T00:00:00Z',
  model: 'gemini-3.5-flash',
  chunkSeconds: 600,
  segments: parsed.segments.map((s) => ({
    ...s,
    start: s.start + OFFSET,
    end: s.end + OFFSET,
    speaker: globalLabel(0, s.speaker),
  })),
  rows: validated.rows.map((r) => ({ ...r, label: globalLabel(0, r.label) })),
  rejected: [],
  stats: {
    chunksExpected: 1,
    chunksTranscribed: 1,
    failedChunks: [],
    labelsSeen: 4,
    rowsAccepted: validated.rows.length,
    rowsRejected: validated.rejected.length,
    rejectedBy: {},
    coverage: 1,
  },
}

/** The real published transcript, restricted to the window the fixture covers. */
const PUBLISHED = parseDiarizedTranscript(
  readFileSync(resolve('public/data/pleno-transcripts/10yl550.txt'), 'utf8'),
).filter((s) => s.start >= OFFSET && s.start < OFFSET + 600)

describe('locateQuote', () => {
  /**
   * The aligner needs a position, `quoteCoverage` only gives a fraction. Two
   * implementations of the same idea drift, so the agreement is asserted on
   * real text rather than assumed — the alternative is an aligner that scores
   * a line differently from the published-quote audit.
   */
  it('agrees with quoteCoverage on every published line in the window', () => {
    const hay = MAP.segments.map((s) => s.text).join(' ')
    expect(PUBLISHED.length).toBeGreaterThan(20)
    for (const line of PUBLISHED) {
      expect(locateQuote(line.text, hay).coverage).toBeCloseTo(quoteCoverage(line.text, hay), 10)
    }
  })

  it('reports where the match starts, not just that it matched', () => {
    const { coverage, at } = locateQuote('mundo', 'hola mundo')
    expect(coverage).toBe(1)
    expect(at).toBe(5)
  })

  it('returns -1 and zero for text that is absent', () => {
    expect(locateQuote('zzz qqq', 'hola mundo')).toEqual({ coverage: 0, at: -1 })
  })

  it('is empty-safe', () => {
    expect(locateQuote('', 'hola')).toEqual({ coverage: 0, at: -1 })
  })
})

describe('alignSpeakerMap on the real pair', () => {
  const result = alignSpeakerMap({ published: PUBLISHED, map: MAP })

  it('evaluates every published line in the window', () => {
    expect(result.lines).toHaveLength(PUBLISHED.length)
    const { aligned, unaligned, conflicting, matchedButNoBloc } = result.stats
    expect(aligned + unaligned + conflicting + matchedButNoBloc).toBe(PUBLISHED.length)
  })

  /**
   * Not "most lines align" — the map only vouches for two speakers in this
   * 10-minute fixture, so most lines correctly get nothing. What matters is
   * that SOMETHING aligns, or the aligner is measuring nothing at all.
   */
  it('carries a bloc onto at least one real published line', () => {
    expect(result.stats.aligned).toBeGreaterThan(0)
  })

  it('never invents a bloc the map does not vouch for', () => {
    const vouched = new Set(MAP.rows.filter((r) => !r.weak).map((r) => r.bloc))
    for (const l of result.lines) {
      if (l.bloc) expect(vouched.has(l.bloc)).toBe(true)
    }
  })

  it('reports matched-but-unidentified apart from never-matched', () => {
    // The text was found but the label is weak or absent — a failure to
    // IDENTIFY, not a failure to align. Reporting them as one number would
    // hide which half of the pipeline needs work.
    const s = result.stats
    expect(s).toHaveProperty('matchedButNoBloc')
    expect(s).toHaveProperty('unaligned')
  })

  it('assigns nothing when nothing matches', () => {
    const empty = alignSpeakerMap({
      published: [{ start: 0, end: 5, speaker: 'SPEAKER_00', text: 'texto que no existe' }],
      map: MAP,
    })
    expect(empty.stats.aligned).toBe(0)
    expect(empty.lines[0].bloc).toBeNull()
  })

  it('rules out a candidate outside the drift window', () => {
    const far = alignSpeakerMap({
      published: PUBLISHED.map((l) => ({ ...l, start: l.start + 99999, end: l.end + 99999 })),
      map: MAP,
    })
    expect(far.stats.aligned).toBe(0)
    expect(far.stats.unaligned).toBe(PUBLISHED.length)
  })
})

describe('blocByPublishedSpeaker', () => {
  it('summarises a published label only when every line agrees', () => {
    const result = alignSpeakerMap({ published: PUBLISHED, map: MAP })
    const bySpeaker = blocByPublishedSpeaker(result)
    for (const [, bloc] of bySpeaker) expect(typeof bloc).toBe('string')
  })

  /**
   * A published label that spans two people must resolve to neither. Averaging
   * would be this code inventing a mis-attribution of its own.
   */
  it('refuses a label whose lines disagree', () => {
    const conflicted = {
      lines: [
        {
          index: 0,
          start: 0,
          publishedSpeaker: 'SPEAKER_20',
          mapLabel: 'a',
          bloc: 'PSOE',
          coverage: 1,
          conflict: false,
        },
        {
          index: 1,
          start: 1,
          publishedSpeaker: 'SPEAKER_20',
          mapLabel: 'b',
          bloc: 'PP',
          coverage: 1,
          conflict: false,
        },
        {
          index: 2,
          start: 2,
          publishedSpeaker: 'SPEAKER_21',
          mapLabel: 'c',
          bloc: 'VOX',
          coverage: 1,
          conflict: false,
        },
      ],
      stats: { aligned: 3, unaligned: 0, conflicting: 0, matchedButNoBloc: 0 },
    }
    const out = blocByPublishedSpeaker(conflicted)
    expect(out.has('SPEAKER_20')).toBe(false)
    expect(out.get('SPEAKER_21')).toBe('VOX')
  })
})

describe('blocResolverFor — una cita que cruza un cambio de orador', () => {
  // Resolvía el bloque sólo con la línea donde EMPIEZA la cita. alignSpeakerMap
  // mira los dos extremos y se abstiene si discrepan; esto no, así que una cita
  // que cruzaba un cambio de turno heredaba el bloque del primero. Las costuras
  // de los trozos de transcripción producen justo eso (19-11-2026).
  const published = [
    {
      start: 0,
      end: 5,
      speaker: 'SPEAKER_00',
      text: 'el contrato del agua vence el año que viene',
    },
    { start: 5, end: 9, speaker: 'SPEAKER_01', text: 'y no lo vamos a prorrogar sin concurso' },
    { start: 9, end: 14, speaker: 'SPEAKER_02', text: 'lo pagan los vecinos de su bolsillo' },
  ]
  const linea = (index: number, bloc: string | null) => ({
    index,
    start: published[index].start,
    publishedSpeaker: published[index].speaker,
    mapLabel: bloc ? 'M' : null,
    bloc,
    coverage: 1,
    conflict: false,
  })
  const alineacion = (blocs: Array<string | null>): AlignmentResult => ({
    lines: blocs.map((b, i) => linea(i, b)),
    stats: { aligned: 0, unaligned: 0, conflicting: 0, matchedButNoBloc: 0 },
  })

  it('dentro de una línea, el bloque de esa línea', () => {
    const r = blocResolverFor(published, alineacion(['PSOE', 'PP', 'VOX']))
    expect(r('no lo vamos a prorrogar sin concurso')).toBe('PP')
  })

  it('a caballo de dos bloques distintos, nadie', () => {
    const r = blocResolverFor(published, alineacion(['PSOE', 'PP', 'VOX']))
    expect(r('vence el año que viene y no lo vamos a prorrogar')).toBeNull()
  })

  it('aunque discrepe sólo la línea del medio', () => {
    const r = blocResolverFor(published, alineacion(['PSOE', 'PP', 'PSOE']))
    expect(
      r('vence el año que viene y no lo vamos a prorrogar sin concurso lo pagan los vecinos'),
    ).toBeNull()
  })

  it('a caballo de dos líneas del mismo bloque, ese bloque', () => {
    const r = blocResolverFor(published, alineacion(['PSOE', 'PSOE', 'VOX']))
    expect(r('vence el año que viene y no lo vamos a prorrogar')).toBe('PSOE')
  })

  it('una línea sin bloque no contradice a la otra', () => {
    const r = blocResolverFor(published, alineacion(['PSOE', null, 'VOX']))
    expect(r('vence el año que viene y no lo vamos a prorrogar')).toBe('PSOE')
  })
})
