import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  luminance,
  parseHex,
  readableInk,
  meetsAA,
  INK_DARK,
  INK_LIGHT,
} from '../../src/lib/contrast'
import { SECTION_TONES } from '../../src/variants/direction-d/SectionHeader'
import { PALETTE } from '../../src/variants/direction-d/tokens'

describe('parseHex / luminance', () => {
  it('parses long and short hex, with or without #', () => {
    expect(parseHex('#FFFFFF')).toEqual([255, 255, 255])
    expect(parseHex('000')).toEqual([0, 0, 0])
    expect(parseHex('#16A34A')).toEqual([22, 163, 74])
  })

  it('anchors luminance at the known endpoints', () => {
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 5)
    expect(luminance('#000000')).toBeCloseTo(0, 5)
  })
})

describe('contrastRatio', () => {
  it('gives the textbook 21:1 for black on white, symmetrically', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 3)
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 3)
  })

  it('is 1 for a colour against itself', () => {
    expect(contrastRatio('#B45309', '#B45309')).toBeCloseTo(1, 6)
  })
})

describe('readableInk', () => {
  it('picks dark ink on the light Metrovalencia lines that failed with white', () => {
    // The measured failures: L10 lime 1.54:1, L1 yellow 1.79:1, L8 blue 1.87:1.
    for (const brand of ['#B6DD79', '#E4BE36', '#96C4DA']) {
      expect(readableInk(brand)).toBe(INK_DARK)
      expect(contrastRatio(readableInk(brand), brand)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps white on genuinely dark fills', () => {
    for (const dark of ['#1E3A8A', '#B0291F', '#0B0F19']) {
      expect(readableInk(dark)).toBe(INK_LIGHT)
    }
  })

  it('never returns the worse of the two options', () => {
    for (const bg of ['#808080', '#777777', '#7F7F7F', '#A47E52', '#4E886D']) {
      const chosen = readableInk(bg)
      const other = chosen === INK_DARK ? INK_LIGHT : INK_DARK
      expect(contrastRatio(chosen, bg)).toBeGreaterThanOrEqual(contrastRatio(other, bg))
    }
  })
})

describe('landing palette meets AA where it is used as text', () => {
  const PAPER = '#FAF8F2'

  it('the -Ink text variants clear the floor on the warm paper', () => {
    // The FILL variants (ok 3.10, warn 3.00) deliberately do not — they are for
    // sparkline strokes and dots, where contrast thresholds don't apply.
    expect(meetsAA(PALETTE.okInk, PAPER)).toBe(true)
    expect(meetsAA(PALETTE.warnInk, PAPER)).toBe(true)
    expect(meetsAA(PALETTE.amber, PAPER)).toBe(true)
    expect(meetsAA(PALETTE.crit, PAPER)).toBe(true)
    expect(meetsAA(PALETTE.civic, PAPER)).toBe(true)
    expect(meetsAA(PALETTE.accent, PAPER)).toBe(true)
  })

  it('every section-tone ink clears the floor against its OWN wash', () => {
    // Measuring against the paper is what hid this: the wash darkens the
    // effective background enough to push a 4.7:1 pairing under 4.5.
    for (const [name, tone] of Object.entries(SECTION_TONES)) {
      if (!tone.ink.startsWith('#')) continue // neutral uses an rgba ink
      const effective = blendOverPaper(tone.wash, PAPER)
      const ratio = contrastRatio(tone.ink, effective)
      expect(ratio, `${name}: ${tone.ink} on ${effective}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

/** Flatten an `rgba(r,g,b,a)` wash over an opaque backdrop. */
function blendOverPaper(wash, paper) {
  const m = /rgba?\(([^)]+)\)/.exec(wash)
  if (!m) return wash
  const [r, g, b, a = 1] = m[1].split(',').map(Number)
  const base = parseHex(paper)
  const out = [r, g, b].map((v, i) => Math.round(v * a + base[i] * (1 - a)))
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('')
}
