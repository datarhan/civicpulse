import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { decodeElapsed, parseSpeakerMapResponse } from '../src/scraper/speaker-map'

/**
 * The model writes M.SS instead of seconds, and the parser read it as decimal.
 *
 * Measured 2026-08-11 by re-running `15uvjew` chunk 1, one of the four chunks
 * the earlier pass rejected. It came back `finishReason: STOP`, 10,318
 * characters, 43 segments — a COMPLETE reading of the 600 s chunk. But it
 * emitted the first minute as seconds and then switched notation:
 *
 *     [48.5 → 59.5]  ← seconds, one decimal, as the prompt asks
 *     [1.19 → 1.26]  ← 1 min 19 s, written M.SS, two decimals
 *     [9.36 → 9.59]  ← 9 min 59 s = 599 s, i.e. the end of the chunk
 *
 * Read as decimals the transcript "ends" at 9.6 s of 600 s → 1.6 % coverage,
 * which is the «covered 2%» the run recorded. The audio was fully transcribed
 * and thrown away, then re-transcribed twice more and thrown away again — the
 * retry cannot help, because the model does it the same way every time.
 *
 * The prompt ALREADY says «Nunca mm:ss». It is disregarded, so this has to be
 * handled on the way in.
 *
 * The rule is deliberately the conservative one: **prefer seconds, and only
 * read M.SS when seconds would run time backwards.** A well-formed response
 * never goes backwards, so the conversion cannot touch one — verified against
 * chunk 6, whose 134 timestamps are all one-decimal and all left alone.
 */
describe('decodeElapsed', () => {
  it('leaves an ordinary seconds sequence untouched', () => {
    expect(decodeElapsed(['0.0', '11.0', '20.0', '33.0', '599.0'])).toEqual([0, 11, 20, 33, 599])
  })

  it('reads M.SS once seconds would go backwards — the real chunk 1 switch', () => {
    // …48.5, 59.5 in seconds, then 1.19 meaning 1 min 19 s.
    expect(decodeElapsed(['48.5', '59.5', '1.19', '1.26', '9.59'])).toEqual([
      48.5, 59.5, 79, 86, 599,
    ])
  })

  it('does not convert a two-decimal value that is already moving forwards', () => {
    // 12.45 after 10.0 is 12.45 s. Only a backwards jump justifies M.SS.
    expect(decodeElapsed(['10.0', '12.45'])).toEqual([10, 12.45])
  })

  it('refuses M.SS when the seconds part exceeds 59', () => {
    // 1.75 cannot be a clock reading, so it stays 1.75 s even though that
    // leaves the sequence broken — a wrong timestamp is worse than a rejected
    // chunk, and the coverage floor is what catches the leftovers.
    expect(decodeElapsed(['59.5', '1.75'])).toEqual([59.5, 1.75])
  })

  it('handles the whole first minute being seconds and the rest M.SS', () => {
    const raw = ['0.0', '6.5', '59.5', '1.19', '2.30', '10.05']
    expect(decodeElapsed(raw)).toEqual([0, 6.5, 59.5, 79, 150, 605])
  })

  it('is empty for no input', () => {
    expect(decodeElapsed([])).toEqual([])
  })
})

describe('parseSpeakerMapResponse · M.SS in the wild', () => {
  const response = [
    '### Bloque 1 · la transcripción',
    '',
    '[0.0 → 6.5] (SPEAKER_00) Passem al següent punt.',
    '[48.5 → 59.5] (SPEAKER_00) Té la paraula.',
    '[1.19 → 1.26] (SPEAKER_01) Hola, bones vesprades.',
    '[9.36 → 9.59] (SPEAKER_01) Per això ho vam portar a ple.',
    '',
    '=== HABLANTES ===',
    'SPEAKER_01 | José Ángel | sin identificar | SPEAKER_00 @ 1.56 "Paraules? José Ángel." | rel: turn-grant',
  ].join('\n')

  it('recovers the full span of a chunk the old parser collapsed to 9.6 s', () => {
    const parsed = parseSpeakerMapResponse(response)
    expect(parsed.segments).toHaveLength(4)
    expect(parsed.segments[parsed.segments.length - 1].end).toBeCloseTo(599, 3)
  })

  it('keeps the segments in order after decoding', () => {
    const starts = parseSpeakerMapResponse(response).segments.map((s) => s.start)
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
  })

  /**
   * The identity block carries M.SS too — chunk 1 cited «@ 1.56» for a line at
   * 1 min 56 s. `at` is the timestamp a curator listens to in order to check a
   * published attribution, so it cannot be 1.56 s of a different sentence.
   */
  it('decodes the evidence timestamp against the segment timeline', () => {
    const [candidate] = parseSpeakerMapResponse(response).candidates
    expect(candidate.evidence?.at).toBeCloseTo(116, 3)
  })

  it('leaves a healthy response completely alone', () => {
    const healthy = [
      '[0.0 → 11.0] (SPEAKER_01) Amb respecte a Casa quaranta-set.',
      '[280.0 → 291.5] (SPEAKER_02) José Ángel, té la paraula.',
      '[588.0 → 599.0] (SPEAKER_01) Gràcies.',
      '=== HABLANTES ===',
      'SPEAKER_04 | José Ángel | sin identificar | SPEAKER_02 @ 280.0 "José Ángel, té la paraula." | rel: turn-grant',
    ].join('\n')
    const parsed = parseSpeakerMapResponse(healthy)
    expect(parsed.segments.map((s) => [s.start, s.end])).toEqual([
      [0, 11],
      [280, 291.5],
      [588, 599],
    ])
    expect(parsed.candidates[0].evidence?.at).toBe(280)
  })
})

/**
 * The same defect against the REAL responses, not strings I typed.
 *
 * `tests/fixtures/gemini-speaker-map-mmss_2026-08-11.txt` is verbatim what the
 * API returned for `15uvjew` chunk 1 on 2026-08-11 — the response the pipeline
 * scored «covered 2%» and threw away three times. Its clean sibling is chunk 6
 * from the same session and the same run. Committing both is the repo's own
 * cadence: fixtures are the RED contract.
 *
 * Each assertion here carries a control, because a fixture can rot into
 * something that no longer reproduces anything and the test would still pass.
 */
describe('parseSpeakerMapResponse · the real captured responses', () => {
  const mmss = readFileSync(
    resolve('tests/fixtures/gemini-speaker-map-mmss_2026-08-11.txt'),
    'utf8',
  )
  const clean = readFileSync(
    resolve('tests/fixtures/gemini-speaker-map-clean_2026-08-11.txt'),
    'utf8',
  )
  const stamps = (raw: string) =>
    [...raw.matchAll(/^\[([0-9.]+) → ([0-9.]+)\]/gm)].flatMap((m) => [m[1], m[2]])

  it('CONTROL · the mmss fixture still contains the slip it was captured for', () => {
    // If this fails the fixture was replaced and the test below proves nothing.
    const twoDecimal = stamps(mmss).filter((v) => v.split('.')[1]?.length === 2)
    expect(twoDecimal.length).toBeGreaterThan(50)
    expect(twoDecimal.every((v) => Number(v.split('.')[1]) <= 59)).toBe(true)
    // Read naively as decimals it collapses — that is the bug, still present.
    const naiveLast = Number(stamps(mmss).at(-1))
    expect(naiveLast / 600).toBeLessThan(0.05)
  })

  it('recovers the full 600 s chunk the pipeline discarded as "covered 2%"', () => {
    const parsed = parseSpeakerMapResponse(mmss)
    expect(parsed.segments).toHaveLength(43)
    expect(parsed.segments.at(-1)!.end).toBeCloseTo(599, 3)
  })

  it('keeps the recovered segments in time order', () => {
    const starts = parseSpeakerMapResponse(mmss).segments.map((s) => s.start)
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
  })

  it('decodes the evidence timestamps of the mmss response too', () => {
    // Block 2 cited «@ 6.53» for «Segona intervenció, Rafa» — 6 min 53 s.
    const ats = parseSpeakerMapResponse(mmss)
      .candidates.map((c) => c.evidence?.at)
      .filter((n): n is number => typeof n === 'number')
    expect(ats.length).toBeGreaterThan(0)
    expect(Math.max(...ats)).toBeGreaterThan(60)
  })

  it('CONTROL · the clean fixture has no two-decimal stamp to decode', () => {
    const twoDecimal = stamps(clean).filter((v) => v.split('.')[1]?.length === 2)
    expect(stamps(clean).length).toBeGreaterThan(100)
    expect(twoDecimal).toEqual([])
  })

  it('leaves every timestamp of the clean response exactly as it arrived', () => {
    const parsed = parseSpeakerMapResponse(clean)
    const asWritten = stamps(clean).map(Number)
    const asParsed = parsed.segments.flatMap((s) => [s.start, s.end])
    expect(asParsed).toEqual(asWritten)
    expect(parsed.segments.at(-1)!.end).toBeCloseTo(599, 3)
  })
})
