import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseSpeakerMapResponse } from '../src/scraper/speaker-map'

/**
 * A real gemini-3.5-flash response to `buildSpeakerMapPrompt()`, 10-minute
 * window of pleno 10yl550 (session minutes 110–120), captured 2026-08-10.
 *
 * Kept verbatim because it contains defects worth pinning: a misheard name
 * («Pep», nobody on the roster), a party the cited evidence never states, and
 * two rows resting only on a back-reference. A hand-written fixture would have
 * had none of them.
 */
const RAW = readFileSync(resolve('tests/fixtures/gemini-speaker-map_2026-08-10.txt'), 'utf8')

describe('parseSpeakerMapResponse — transcript block', () => {
  const parsed = parseSpeakerMapResponse(RAW)

  it('reads every timestamped segment', () => {
    expect(parsed.segments.length).toBe(87)
  })

  it('keeps start/end as numbers, ordered and non-degenerate', () => {
    for (const s of parsed.segments) expect(s.end).toBeGreaterThan(s.start)
    const starts = parsed.segments.map((s) => s.start)
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
  })

  it('carries the SPEAKER_NN label and the text separately', () => {
    const first = parsed.segments[0]
    expect(first.start).toBe(0)
    expect(first.speaker).toBe('SPEAKER_00')
    expect(first.text).toContain('Nace de los jóvenes que trabajan')
  })

  it('ignores the model’s own markdown headings', () => {
    // The response opens with "### Bloque 1 · la transcripción".
    expect(parsed.segments.some((s) => s.text.includes('Bloque 1'))).toBe(false)
  })

  /**
   * The model overshot the 600 s window by 7 s on the final segment. Timestamps
   * are approximate, so the parser reports them as given and lets the coverage
   * gate decide — silently clamping here would hide drift from the one check
   * that looks for it.
   */
  it('does not clamp a segment that runs past the chunk', () => {
    expect(parsed.segments.at(-1)!.end).toBeGreaterThan(600)
  })
})

describe('parseSpeakerMapResponse — identity block', () => {
  const parsed = parseSpeakerMapResponse(RAW)

  it('reads one candidate per identity line', () => {
    expect(parsed.candidates.map((c) => c.label)).toEqual([
      'SPEAKER_00',
      'SPEAKER_01',
      'SPEAKER_02',
      'SPEAKER_03',
    ])
  })

  it('splits all five fields, including who uttered the evidence', () => {
    const jl = parsed.candidates.find((c) => c.label === 'SPEAKER_03')!
    expect(jl.heardAs).toBe('José Luis')
    expect(jl.party).toBe('Vox')
    expect(jl.evidence).toEqual({
      spokenBy: 'SPEAKER_01',
      at: 432.0,
      quote: 'Gràcies per la puntualitat. Eh Vox, José Luis.',
      relation: 'turn-grant',
    })
  })

  /**
   * The whole reason the format carries `spokenBy`. The chair utters the line
   * that identifies José Luis; reading it as José Luis speaking is the
   * inversion this pipeline exists to stop.
   */
  it('records the evidence speaker as someone OTHER than the identified one', () => {
    const jl = parsed.candidates.find((c) => c.label === 'SPEAKER_03')!
    expect(jl.evidence!.spokenBy).not.toBe(jl.label)
  })

  it('normalises «sin identificar» to null rather than a sentinel string', () => {
    const david = parsed.candidates.find((c) => c.label === 'SPEAKER_00')!
    expect(david.heardAs).toBe('David')
    expect(david.party).toBeNull()
  })

  it('reads the relation type verbatim, back-references included', () => {
    const byLabel = Object.fromEntries(
      parsed.candidates.map((c) => [c.label, c.evidence?.relation]),
    )
    expect(byLabel['SPEAKER_00']).toBe('back-reference')
    expect(byLabel['SPEAKER_01']).toBe('back-reference')
    expect(byLabel['SPEAKER_02']).toBe('turn-grant')
    expect(byLabel['SPEAKER_03']).toBe('turn-grant')
  })

  /**
   * Pinned deliberately. «Pep» is on nobody's roster and the cited quote never
   * says "Partido Popular" — the model supplied a party the evidence does not
   * carry. The PARSER must pass it through unjudged; catching it is the
   * validator's job, and the two must not be conflated.
   */
  it('passes through an unacredited party without judging it', () => {
    const pep = parsed.candidates.find((c) => c.label === 'SPEAKER_02')!
    expect(pep.heardAs).toBe('Pep')
    expect(pep.party).toBe('Partido Popular')
    expect(pep.evidence!.quote).not.toContain('Partido Popular')
  })
})

describe('parseSpeakerMapResponse — degenerate input', () => {
  it('returns empty rather than throwing on an empty response', () => {
    const parsed = parseSpeakerMapResponse('')
    expect(parsed.segments).toEqual([])
    expect(parsed.candidates).toEqual([])
  })

  it('returns segments but no candidates when the identity block is missing', () => {
    const parsed = parseSpeakerMapResponse('[0.0 → 2.0] (SPEAKER_00) Hola.')
    expect(parsed.segments).toHaveLength(1)
    expect(parsed.candidates).toEqual([])
  })

  it('skips an identity line that is missing fields instead of half-reading it', () => {
    const parsed = parseSpeakerMapResponse(
      ['[0.0 → 2.0] (SPEAKER_00) Hola.', '=== HABLANTES ===', 'SPEAKER_00 | David'].join('\n'),
    )
    expect(parsed.candidates).toEqual([])
  })

  it('skips an unknown relation rather than coercing it to a known one', () => {
    const parsed = parseSpeakerMapResponse(
      [
        '[0.0 → 2.0] (SPEAKER_00) Hola.',
        '=== HABLANTES ===',
        'SPEAKER_00 | David | PSOE | SPEAKER_01 @1.0 "hola David" | rel: telepatía',
      ].join('\n'),
    )
    expect(parsed.candidates).toEqual([])
  })
})
