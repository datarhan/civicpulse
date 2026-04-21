import { describe, it, expect } from 'vitest'
import { stripDiacritics, slugify } from '../src/scraper/normalize'

describe('stripDiacritics', () => {
  it('folds Spanish accents to ASCII', () => {
    expect(stripDiacritics('Túria')).toBe('Turia')
    expect(stripDiacritics('Ribarroja')).toBe('Ribarroja')
    expect(stripDiacritics('Medio Ambiente · Educación')).toBe('Medio Ambiente · Educacion')
  })

  it('preserves case and whitespace', () => {
    expect(stripDiacritics('URBANISMO')).toBe('URBANISMO')
    expect(stripDiacritics('  Masía  de  Baja  ')).toBe('  Masia  de  Baja  ')
  })

  it('decomposes ñ to plain n (matches pre-refactor behavior of every call site)', () => {
    // NFD decomposes ñ → 'n' + combining-tilde U+0303, which is inside the
    // stripped range. This matches the previous inlined versions in all 8+
    // call sites (promise-inference, queja-router, geo, paro, ctbg, etc.) —
    // none of them preserved ñ through this step.
    expect(stripDiacritics('Peña')).toBe('Pena')
    expect(stripDiacritics('España')).toBe('Espana')
  })

  it('handles Catalan/Valencian diacritics', () => {
    expect(stripDiacritics('València')).toBe('Valencia')
    expect(stripDiacritics('Compromís')).toBe('Compromis')
    expect(stripDiacritics('Ribera Baixa')).toBe('Ribera Baixa')
  })

  it('is idempotent on already-plain ASCII', () => {
    const input = 'hello world 123'
    expect(stripDiacritics(input)).toBe(input)
    expect(stripDiacritics(stripDiacritics(input))).toBe(input)
  })
})

describe('slugify', () => {
  it('produces the same output as the previous inlined versions in geo.ts + corporacion.ts', () => {
    // These fixtures reproduce exactly what geo.ts:61 and corporacion.ts:51
    // used to return — the refactor must be zero-behavior-change.
    expect(slugify('Riba-roja de Túria')).toBe('riba-roja-de-turia')
    expect(slugify('Robert Raga Gadea')).toBe('robert-raga-gadea')
    expect(slugify('María José Gómez')).toBe('maria-jose-gomez')
    expect(slugify('Emergencia Climática')).toBe('emergencia-climatica')
  })

  it('collapses multiple non-alnum runs into single hyphens', () => {
    expect(slugify('foo -- bar  baz')).toBe('foo-bar-baz')
    expect(slugify('a/b/c')).toBe('a-b-c')
  })

  it('strips leading and trailing hyphens', () => {
    expect(slugify('--leading')).toBe('leading')
    expect(slugify('trailing--')).toBe('trailing')
    expect(slugify('  padded  ')).toBe('padded')
  })

  it('handles empty and whitespace-only input', () => {
    expect(slugify('')).toBe('')
    expect(slugify('   ')).toBe('')
    expect(slugify('---')).toBe('')
  })

  it('lowercases everything', () => {
    expect(slugify('URBANISMO')).toBe('urbanismo')
    expect(slugify('Medio Ambiente')).toBe('medio-ambiente')
  })
})
