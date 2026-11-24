/**
 * A roll-call vote is not a turn grant.
 *
 * After an electronic vote the chair reads each group's vote back: «Grup
 * Socialista? — A favor. Partit Popular? — Abstenció. Vox? — Abstenció…». Read
 * as grants, each «Vox?» names whoever answers. That answer is a single vote
 * word, often voiced by the chair himself («Vox, abstenció. José Manuel?»), and
 * the label it names carries the bloc onto everything else that voice says in
 * the chunk. Three of the five blocs hold one seat, so a wrong one names a
 * person by elimination.
 *
 * Both cases below are REAL model output, found while measuring speaker-map
 * models on 2026-11-24 (editorial, not committed):
 *   · the published gemini-3.5-flash map of 10yl550 took «Vox?» @1579 s and
 *     «Compromís?» @1583 s as turn grants;
 *   · gemini-4-hydrogen, on the same session's chunk 1, took «Eh, Compromís?»
 *     as a grant and the chair's own «Vox, abstenció.» as a reply.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseSpeakerMapResponse,
  type RawSegment,
  type SpeakerCandidate,
} from '../src/scraper/speaker-map'
import { validateSpeakerMap, esRespuestaDeVoto } from '../src/scraper/speaker-map-validate'
import {
  seatsFromOfficials,
  type OfficialsDoc,
  type OfficialLike,
} from '../src/scraper/corporation-seats'

const doc = JSON.parse(readFileSync(resolve('public/data/officials.json'), 'utf8')) as OfficialsDoc
const OFFICIALS = (doc.officials ?? []) as OfficialLike[]
const SEATS = seatsFromOfficials(doc)

describe('esRespuestaDeVoto', () => {
  it('reads a bare vote, in either language, as a vote', () => {
    for (const t of [
      'Abstenció.',
      'A favor.',
      'En contra.',
      'Abstención',
      'eh, abstenció',
      'A favor!',
    ])
      expect(esRespuestaDeVoto(t), t).toBe(true)
  })
  it('does not read a turn that merely starts with one as a vote', () => {
    for (const t of [
      'A favor, perquè esta moció arreplega el que vam demanar',
      'Gràcies alcalde, aquesta és una proposta de declaració institucional',
      'Sí.',
      '',
    ])
      expect(esRespuestaDeVoto(t), t).toBe(false)
  })
})

describe('the published gemini-3.5-flash map of 10yl550, @1571–1587 s', () => {
  // The map's own segments, copied verbatim from pleno-speaker-map/10yl550.json.
  const segments: RawSegment[] = [
    {
      start: 1571,
      end: 1576,
      speaker: 'S00',
      text: 'Han votat tretze a favor, tretze i vuit abstencions. Eh, grup socialista?',
    },
    { start: 1576, end: 1577, speaker: 'S05', text: 'A favor.' },
    { start: 1577, end: 1578, speaker: 'S00', text: 'Partit Popular?' },
    { start: 1578, end: 1579, speaker: 'S03', text: 'Abstenció.' },
    { start: 1579, end: 1580, speaker: 'S00', text: 'Vox?' },
    { start: 1580, end: 1581, speaker: 'S06', text: 'Abstenció.' },
    { start: 1581, end: 1582, speaker: 'S00', text: 'Esquerra Unida Podem?' },
    { start: 1582, end: 1583, speaker: 'S01', text: 'Abstenció.' },
    { start: 1583, end: 1584, speaker: 'S00', text: 'Compromís?' },
    { start: 1584, end: 1585, speaker: 'S07', text: 'A favor.' },
    { start: 1585, end: 1587, speaker: 'S00', text: "Passem al següent punt de l'ordre del dia." },
    // A real grant right after the vote must survive the guard.
    { start: 1587, end: 1590, speaker: 'S00', text: 'Paraules? José Ángel.' },
    {
      start: 1590,
      end: 1620,
      speaker: 'S02',
      text: 'Gràcies, alcalde. Este punt el que porta és la modificació del pressupost',
    },
  ]
  const grant = (
    label: string,
    party: string | null,
    heardAs: string | null,
    at: number,
    quote: string,
  ): SpeakerCandidate => ({
    label,
    heardAs,
    party,
    evidence: { spokenBy: 'S00', at, quote, relation: 'turn-grant' },
  })
  const r = validateSpeakerMap({
    candidates: [
      grant('S06', 'Vox', null, 1579, 'Vox?'),
      grant('S07', 'Compromís', null, 1583, 'Compromís?'),
      grant('S02', null, 'José Ángel', 1587, 'Paraules? José Ángel.'),
    ],
    segments,
    officials: OFFICIALS,
    seats: SEATS,
  })

  it('rejects the two roll-call «grants», naming the reason', () => {
    expect(r.rows.map((x) => x.label)).not.toContain('S06')
    expect(r.rows.map((x) => x.label)).not.toContain('S07')
    const why = Object.fromEntries(r.rejected.map((x) => [x.label, x.reason]))
    expect(why.S06).toBe('roll-call')
    expect(why.S07).toBe('roll-call')
  })

  it('keeps the real grant that follows the vote', () => {
    expect(r.rows.find((x) => x.label === 'S02')?.bloc).toBe('PSOE')
  })
})

describe('gemini-4-hydrogen on 10yl550 chunk 1 (real response)', () => {
  const RAW = readFileSync(
    resolve('tests/fixtures/gemini-4-hydrogen-speaker-map-votacion_2026-11-24.txt'),
    'utf8',
  )
  const p = parseSpeakerMapResponse(RAW)
  const r = validateSpeakerMap({
    candidates: p.candidates,
    segments: p.segments,
    officials: OFFICIALS,
    seats: SEATS,
  })
  const blocs = Object.fromEntries(r.rows.map((x) => [x.label, x.bloc]))
  const why = Object.fromEntries(r.rejected.map((x) => [x.label, x.reason]))

  it('assert the fixture is the one we think: the roll-call is in it', () => {
    expect(p.segments.some((s) => s.text === 'Vox, abstenció. José Manuel?')).toBe(true)
  })

  it("rejects «Eh, Compromís?» and the chair's own «Vox, abstenció.»", () => {
    expect(blocs.SPEAKER_01).toBeUndefined()
    expect(blocs.SPEAKER_06).toBeUndefined()
    expect(why.SPEAKER_01).toBe('roll-call')
    expect(why.SPEAKER_06).toBe('roll-call')
  })

  it('keeps the three grants that open a turn of speech', () => {
    expect(blocs).toMatchObject({ SPEAKER_03: 'PSOE', SPEAKER_05: 'PP', SPEAKER_08: 'PSOE' })
  })
})
