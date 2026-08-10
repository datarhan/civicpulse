import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseSpeakerMapResponse } from '../src/scraper/speaker-map'
import {
  validateSpeakerMap,
  segmentAt,
  nameMatches,
  rejectionTally,
} from '../src/scraper/speaker-map-validate'
import {
  seatsFromOfficials,
  type OfficialsDoc,
  type OfficialLike,
} from '../src/scraper/corporation-seats'

/** The real corporación, not a restatement of it. */
const doc = JSON.parse(readFileSync(resolve('public/data/officials.json'), 'utf8')) as OfficialsDoc
const OFFICIALS = (doc.officials ?? []) as OfficialLike[]
const SEATS = seatsFromOfficials(doc)

const RAW = readFileSync(resolve('tests/fixtures/gemini-speaker-map_2026-08-10.txt'), 'utf8')
const PARSED = parseSpeakerMapResponse(RAW)

const run = (over: Partial<Parameters<typeof validateSpeakerMap>[0]> = {}) =>
  validateSpeakerMap({
    candidates: PARSED.candidates,
    segments: PARSED.segments,
    officials: OFFICIALS,
    seats: SEATS,
    ...over,
  })

describe('segmentAt — the boundary that broke the first audit', () => {
  const segs = [
    { start: 0, end: 10, speaker: 'SPEAKER_00', text: 'a' },
    { start: 10, end: 20, speaker: 'SPEAKER_01', text: 'b' },
  ]

  /**
   * Turn-grants sit exactly on boundaries by nature: the chair stops, the next
   * speaker starts. A ±0.05 s tolerance makes the PREVIOUS segment win there,
   * which turned every correct citation into a mismatch.
   */
  it('assigns a boundary timestamp to the segment that STARTS on it', () => {
    expect(segmentAt(segs, 10)).toBe(1)
  })

  it('is half-open at the end', () => {
    expect(segmentAt(segs, 20)).toBe(-1)
    expect(segmentAt(segs, 19.9)).toBe(1)
  })

  it('returns -1 outside the transcript', () => {
    expect(segmentAt(segs, -1)).toBe(-1)
    expect(segmentAt([], 5)).toBe(-1)
  })
})

describe('nameMatches', () => {
  it('accepts the abbreviations the chair actually uses', () => {
    expect(nameMatches('Rafa', 'Rafael Folgado Navarro')).toBe(true)
    expect(nameMatches('Albert', 'Alberto Gimeno Calvo')).toBe(true)
    expect(nameMatches('José Luis', 'José Luis Fernández Santamaría')).toBe(true)
  })

  it('rejects a mishearing rather than reaching for the nearest name', () => {
    // Both from the fixture. Edit-distance matching would rescue "Abert" and
    // in doing so would name the wrong councillor.
    expect(nameMatches('Pep', 'Alberto Gimeno Calvo')).toBe(false)
    expect(nameMatches('Abert', 'Alberto Gimeno Calvo')).toBe(false)
  })

  it('needs three characters before a prefix counts', () => {
    expect(nameMatches('Jo', 'José Luis Ramos March')).toBe(false)
  })

  it('requires every heard token to land', () => {
    expect(nameMatches('José Manuel', 'José Luis Ramos March')).toBe(false)
  })
})

describe('validateSpeakerMap on the real fixture', () => {
  const { rows, rejected } = run()

  it('accepts only what the audio acredits', () => {
    expect(rows.map((r) => r.label)).toEqual(['SPEAKER_00', 'SPEAKER_03'])
  })

  /**
   * «que ha plantejat David» names one councillor unambiguously — David
   * Barbancho is the only David on the roster — so the row resolves. But it is
   * a back-reference: nothing positional confirms that the David being
   * discussed is the speaker labelled SPEAKER_00. It is kept for review and
   * marked weak, and `blocForLabel` refuses weak rows, so it can never
   * attribute a published quote on its own.
   */
  it('keeps a uniquely-resolving back-reference, but only as weak', () => {
    const david = rows.find((r) => r.label === 'SPEAKER_00')!
    expect(david.slug).toBe('david-barbancho-martinez')
    expect(david.bloc).toBe('PSOE')
    expect(david.weak).toBe(true)
  })

  it('resolves José Luis to the VOX councillor, party first', () => {
    const jl = rows.find((r) => r.label === 'SPEAKER_03')!
    expect(jl.bloc).toBe('VOX')
    expect(jl.slug).toBe('jose-luis-fernandez-santamaria')
    // VOX holds one seat, so the bloc tag names him. Tier C, not a free pass.
    expect(jl.namesIndividual).toBe(true)
    expect(jl.weak).toBe(false)
  })

  /**
   * The fixture's planted defect: «Partido Popular» claimed from a line that
   * says «Es paraules. Abert, Pep?». Party unacredited, name matches nobody.
   */
  it('rejects the row whose party the evidence never states', () => {
    const pep = rejected.find((r) => r.label === 'SPEAKER_02')!
    expect(pep.reason).toBe('unresolvable')
    expect(pep.detail).toContain('Pep')
  })

  it('rejects a role where a name was needed', () => {
    // SPEAKER_01 was heard as «alcalde». That is an office, not a name on the
    // roster, and no party appears in its quote — so nothing pins a person.
    const chair = rejected.find((r) => r.label === 'SPEAKER_01')!
    expect(chair.reason).toBe('unresolvable')
    expect(chair.detail).toContain('alcalde')
  })

  it('reports why, per reason, instead of a bare count', () => {
    expect(rejected.map((r) => r.label).sort()).toEqual(['SPEAKER_01', 'SPEAKER_02'])
    expect(rejectionTally(rejected)).toEqual({ unresolvable: 2 })
  })
})

describe('the gates fire — fault injection', () => {
  const good = PARSED.candidates.find((c) => c.label === 'SPEAKER_03')!
  const only = (c: unknown) => run({ candidates: [c as never] })

  it('gate 1 · rejects a citation pointing outside the transcript', () => {
    const r = only({ ...good, evidence: { ...good.evidence!, at: 99999 } })
    expect(r.rows).toHaveLength(0)
    expect(r.rejected[0].reason).toBe('evidence-outside-transcript')
  })

  it('gate 1 · rejects a citation attributed to the wrong speaker', () => {
    const r = only({ ...good, evidence: { ...good.evidence!, spokenBy: 'SPEAKER_02' } })
    expect(r.rows).toHaveLength(0)
    expect(r.rejected[0].reason).toBe('evidence-speaker-mismatch')
  })

  it('gate 2 · rejects a turn-grant the sequence contradicts', () => {
    // Same quote, but claimed to identify a speaker who does not follow it.
    const r = only({ ...good, label: 'SPEAKER_00' })
    expect(r.rows).toHaveLength(0)
    expect(r.rejected[0].reason).toBe('relation-contradicted')
  })

  it('gate 2 · keeps a back-reference but marks it weak', () => {
    const r = only({
      ...good,
      evidence: { ...good.evidence!, relation: 'back-reference' as const },
    })
    expect(r.rows[0].weak).toBe(true)
  })

  it('gate 3 · drops a party the quote does not carry', () => {
    // Claim PSOE from a quote that says "Vox". Without the acredited party the
    // name "José Luis" fits two councillors, so it fails closed.
    const r = only({ ...good, party: 'PSOE' })
    expect(r.rows).toHaveLength(0)
    expect(r.rejected[0].reason).toBe('ambiguous')
    expect(r.rejected[0].detail).toContain('José Luis Ramos March')
  })

  it('gate 4 · fails closed on an ambiguous first name', () => {
    const r = only({ ...good, party: null, heardAs: 'José' })
    expect(r.rows).toHaveLength(0)
    expect(r.rejected[0].reason).toBe('ambiguous')
  })

  it('gate 5 · drops BOTH labels when two resolve to one councillor', () => {
    const twin = { ...good, label: 'SPEAKER_09' }
    // Give the twin a citation that is positionally valid for SPEAKER_09 by
    // making it a back-reference, which is not checked against the sequence.
    const r = run({
      candidates: [
        good,
        { ...twin, evidence: { ...good.evidence!, relation: 'back-reference' as const } },
      ] as never,
    })
    expect(r.rows).toHaveLength(0)
    expect(r.rejected.every((x) => x.reason === 'label-collision')).toBe(true)
  })
})
