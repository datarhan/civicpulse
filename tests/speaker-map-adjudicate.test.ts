import { describe, it, expect } from 'vitest'
import {
  adjudicateWeakRows,
  applyAdjudications,
  buildAdjudicationPrompt,
} from '../src/scraper/speaker-map-adjudicate'
import type { RawSegment, SpeakerMapRow } from '../src/scraper/speaker-map'

const SEGMENTS: RawSegment[] = [
  { start: 0, end: 6, speaker: 'S0', text: 'Bona vesprada, comencem la sessió.' },
  { start: 6, end: 12, speaker: 'S1', text: 'Nace de los jóvenes que no pueden emanciparse.' },
  {
    start: 12,
    end: 18,
    speaker: 'S2',
    text: 'que no té res que vore en la moció que ha plantejat David.',
  },
  { start: 18, end: 24, speaker: 'S2', text: 'De totes formes, jo expose.' },
]

const weakRow = (over: Partial<SpeakerMapRow> = {}): SpeakerMapRow => ({
  label: 'S1',
  bloc: 'PSOE',
  slug: 'david-barbancho-martinez',
  heardAs: 'David',
  namesIndividual: false,
  weak: true,
  evidence: [
    {
      spokenBy: 'S2',
      at: 12,
      quote: 'que ha plantejat David',
      relation: 'back-reference',
    },
  ],
  ...over,
})

const caller = (identifies: boolean) => async () => ({ identifies, reasoning: 'motivo de prueba' })

describe('adjudicateWeakRows', () => {
  it('only sends weak rows', async () => {
    const seen: string[] = []
    await adjudicateWeakRows({
      rows: [weakRow(), weakRow({ label: 'S3', weak: false })],
      segments: SEGMENTS,
      caller: (async (o: { userPrompt: string }) => {
        seen.push(o.userPrompt)
        return { identifies: true, reasoning: 'x' }
      }) as never,
    })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toContain('S1')
  })

  it('accepts when the model says the line identifies the speaker', async () => {
    const run = await adjudicateWeakRows({
      rows: [weakRow()],
      segments: SEGMENTS,
      caller: caller(true) as never,
    })
    expect(run.tally).toEqual({ accepted: 1, rejected: 0, 'not-adjudicated': 0 })
  })

  it('rejects when it says the line merely mentions the person', async () => {
    const run = await adjudicateWeakRows({
      rows: [weakRow()],
      segments: SEGMENTS,
      caller: caller(false) as never,
    })
    expect(run.tally).toEqual({ accepted: 0, rejected: 1, 'not-adjudicated': 0 })
  })

  /**
   * The failure this module is shaped around. `r?.verdict ?? reject` turns a
   * dead backend into a confident answer; here a null must be its own outcome.
   */
  it('treats a null response as not-adjudicated, never as a rejection', async () => {
    const run = await adjudicateWeakRows({
      rows: [weakRow()],
      segments: SEGMENTS,
      caller: (async () => null) as never,
    })
    expect(run.tally).toEqual({ accepted: 0, rejected: 0, 'not-adjudicated': 1 })
  })

  it('treats a thrown backend error the same way', async () => {
    const run = await adjudicateWeakRows({
      rows: [weakRow()],
      segments: SEGMENTS,
      caller: (async () => {
        throw new Error('claude-code not found')
      }) as never,
    })
    expect(run.results[0].outcome).toBe('not-adjudicated')
  })

  it('caps the calls and reports what it never sent, apart from the verdicts', async () => {
    let calls = 0
    const run = await adjudicateWeakRows({
      rows: [weakRow({ label: 'A' }), weakRow({ label: 'B' }), weakRow({ label: 'C' })],
      segments: SEGMENTS,
      max: 2,
      caller: (async () => {
        calls += 1
        return { identifies: true, reasoning: 'x' }
      }) as never,
    })
    expect(calls).toBe(2)
    expect(run.skipped).toBe(1)
    expect(run.tally.accepted).toBe(2)
  })

  it('shows the model the surrounding turns, not just the quote', async () => {
    let prompt = ''
    await adjudicateWeakRows({
      rows: [weakRow()],
      segments: SEGMENTS,
      caller: (async (o: { userPrompt: string }) => {
        prompt = o.userPrompt
        return { identifies: false, reasoning: 'x' }
      }) as never,
    })
    expect(prompt).toContain('Bona vesprada')
    expect(prompt).toContain('De totes formes')
    expect(prompt).toContain('que ha plantejat David')
  })
})

describe('the prompt forbids proposing anyone', () => {
  it('says so, and says which way to fail', () => {
    const p = buildAdjudicationPrompt()
    expect(p).toContain('No propongas a nadie')
    expect(p).toContain('Si dudas')
  })
})

describe('applyAdjudications', () => {
  it('clears weak on an accepted row', () => {
    const out = applyAdjudications(
      [weakRow()],
      [{ label: 'S1', outcome: 'accepted', reasoning: 'x' }],
    )
    expect(out[0].weak).toBe(false)
  })

  it('drops a rejected row entirely', () => {
    const out = applyAdjudications(
      [weakRow()],
      [{ label: 'S1', outcome: 'rejected', reasoning: 'x' }],
    )
    expect(out).toEqual([])
  })

  /** The resting state for evidence nobody could confirm. */
  it('leaves a not-adjudicated row weak and present', () => {
    const out = applyAdjudications(
      [weakRow()],
      [{ label: 'S1', outcome: 'not-adjudicated', reasoning: null }],
    )
    expect(out).toHaveLength(1)
    expect(out[0].weak).toBe(true)
  })

  it('leaves a row nobody adjudicated exactly as it was', () => {
    const out = applyAdjudications([weakRow()], [])
    expect(out[0].weak).toBe(true)
  })

  it('never touches a strong row', () => {
    const strong = weakRow({ label: 'S9', weak: false })
    expect(applyAdjudications([strong], [])[0].weak).toBe(false)
  })
})
