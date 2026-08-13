import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  luminance,
  parseHex,
  parseRgba,
  flatten,
  contrastRatioOver,
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

describe('flatten / contrastRatioOver — la escala de tinta es rgba, no hex', () => {
  // Los tiers de --ink son rgba con alfa. Medir su contraste exige componerlos
  // sobre el fondo real primero; sin esto, el guard de marca no puede afirmar
  // nada sobre --ink70 ni --ink50. La maths ya existía duplicada en este mismo
  // fichero (`blendOverPaper`), que es la copia local que este repo prohíbe.
  it('compone un rgba sobre un fondo opaco', () => {
    expect(flatten('rgba(11,15,25,1)', '#FFFFFF')).toBe('#0b0f19')
    expect(flatten('rgba(11,15,25,0)', '#FFFFFF')).toBe('#ffffff')
    expect(flatten('rgba(0,0,0,.5)', '#FFFFFF')).toBe('#808080')
  })

  it('acepta las dos formas que escribe el CSS de este repo', () => {
    expect(parseRgba('rgba(11, 15, 25, 0.62)').a).toBeCloseTo(0.62, 5)
    expect(parseRgba('rgba(241,245,249,.78)').rgb).toEqual([241, 245, 249])
    expect(parseRgba('rgb(11,15,25)').a).toBe(1)
  })

  it('se niega a adivinar sobre algo que no es un color rgba', () => {
    // Control: si devolviese un valor por defecto, un token mal escrito
    // pasaría el guard con un contraste inventado en vez de romperlo.
    expect(() => parseRgba('#0b0f19')).toThrow(/no es un color rgba/)
    expect(() => parseRgba('var(--ink)')).toThrow(/no es un color rgba/)
  })

  it('mide contraste tanto de un hex como de un rgba', () => {
    expect(contrastRatioOver('#0b0f19', '#ffffff')).toBeCloseTo(19.15, 1)
    expect(contrastRatioOver('rgba(11,15,25,.62)', '#ffffff')).toBeCloseTo(5.41, 1)
    expect(contrastRatioOver('rgba(241,245,249,.62)', '#12182a')).toBeCloseTo(6.8, 1)
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
      const effective = flatten(tone.wash, PAPER)
      const ratio = contrastRatio(tone.ink, effective)
      expect(ratio, `${name}: ${tone.ink} on ${effective}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
