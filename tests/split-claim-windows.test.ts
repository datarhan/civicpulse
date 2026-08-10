import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { splitClaimWindows } from '../src/scraper/pleno-claim-llm'

const TRANSCRIPT = readFileSync(resolve('public/data/pleno-transcripts/10yl550.txt'), 'utf8')

/** A window is well-formed when every line it contains is a whole one. */
const LINE = /^\[\s*[\d.]+\s*→\s*[\d.]+\s*\]\s*\(SPEAKER_\d+\)/

describe('splitClaimWindows', () => {
  it('returns the whole transcript when it fits in one window', () => {
    expect(splitClaimWindows('one line', 1200, 600)).toEqual(['one line'])
  })

  /**
   * The defect this replaces: a raw character slice lands inside
   * `[123.4 → 130.2] (SPEAKER_05)` roughly as often as not, so the model was
   * handed fragments like `AKER_05) …texto` with a half-eaten timestamp.
   */
  it('never cuts a transcript line in half', () => {
    const windows = splitClaimWindows(TRANSCRIPT, 1200, 600)
    expect(windows.length).toBeGreaterThan(50)
    let checked = 0
    for (const w of windows) {
      for (const line of w.split('\n')) {
        if (!line.trim()) continue
        expect(line).toMatch(LINE)
        checked += 1
      }
    }
    // Assert the check actually looked at something — a loop over zero lines
    // passes just as quietly as a correct one.
    expect(checked).toBeGreaterThan(1000)
  })

  it('covers every line of the transcript at least once', () => {
    const windows = splitClaimWindows(TRANSCRIPT, 1200, 600)
    const seen = new Set(windows.flatMap((w) => w.split('\n')))
    for (const line of TRANSCRIPT.split('\n')) {
      if (line.trim()) expect(seen.has(line)).toBe(true)
    }
  })

  it('overlaps consecutive windows so a claim on a boundary is seen whole', () => {
    const windows = splitClaimWindows(TRANSCRIPT, 1200, 600)
    const first = new Set(windows[0].split('\n'))
    const shared = windows[1].split('\n').filter((l) => first.has(l))
    expect(shared.length).toBeGreaterThan(0)
  })

  it('keeps a single line that is longer than the window rather than dropping it', () => {
    const long = 'x'.repeat(3000)
    const windows = splitClaimWindows(`${long}\nshort`, 1200, 600)
    expect(windows.some((w) => w.includes(long))).toBe(true)
  })

  it('terminates on pathological input instead of looping', () => {
    const many = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n')
    const windows = splitClaimWindows(many, 20, 1)
    expect(windows.length).toBeGreaterThan(0)
    expect(windows.length).toBeLessThan(2000)
  })
})
