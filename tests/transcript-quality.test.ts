import { describe, it, expect } from 'vitest'
import {
  assessTranscript,
  duplicateShare,
  MAX_DUPLICATE_SHARE,
} from '../src/scraper/transcript-quality'

const audio = [
  '[0.0 → 30.0] Buenas tardes, se abre la sesión ordinaria del pleno municipal.',
  '[30.0 → 60.0] El primer punto del orden del día es la aprobación del acta anterior.',
  '[60.0 → 95.0] ¿Votos a favor? Aprobada por unanimidad de los presentes en el salón.',
  '[95.0 → 140.0] Pasamos al segundo punto, el plan de contratación para el ejercicio.',
].join('\n')

// Acta-derived transcript: every line carries placeholder [0.0 → 0.0]. This is
// the MAJORITY of our corpus and must be considered valid.
const acta = [
  '[0.0 → 0.0] ACTA SESIÓN ORDINARIA CELEBRADA POR EL AYUNTAMIENTO PLENO.',
  '[0.0 → 0.0] Lugar: Salón de Actos del Ayuntamiento de Riba-roja de Túria.',
  '[0.0 → 0.0] Orden del día: aprobación del presupuesto municipal para el ejercicio.',
  '[0.0 → 0.0] Se aprueba por mayoría con los votos a favor del equipo de gobierno.',
].join('\n')

describe('assessTranscript', () => {
  it('accepts a normal audio transcript', () => {
    const a = assessTranscript(audio)
    expect(a.ok).toBe(true)
    expect(a.issues).toEqual([])
    expect(a.stats.parseableFraction).toBeGreaterThan(0.9)
  })

  it('accepts an acta-style transcript with all-zero timestamps', () => {
    const a = assessTranscript(acta)
    expect(a.ok).toBe(true)
  })

  it('rejects an empty transcript', () => {
    const a = assessTranscript('')
    expect(a.ok).toBe(false)
    expect(a.issues.join(' ')).toMatch(/vac|empty|corto|short/i)
  })

  it('rejects a whitespace-only transcript', () => {
    expect(assessTranscript('   \n\n   \t  ').ok).toBe(false)
  })

  it('rejects a truncated one-line stub', () => {
    expect(assessTranscript('[0.0 → 2.0] Buenas').ok).toBe(false)
  })

  it('rejects a non-transcript (e.g. an HTML error page)', () => {
    const html =
      '<!DOCTYPE html><html><head><title>404 Not Found</title></head>' +
      '<body><h1>Not Found</h1><p>The requested URL was not found on this server.</p>' +
      'Additional padding text to exceed the minimum character floor so the only ' +
      'reason it is rejected is the absence of timestamped transcript lines.</body></html>'
    const a = assessTranscript(html)
    expect(a.ok).toBe(false)
    expect(a.issues.join(' ')).toMatch(/formato|timestamp|líneas|lines/i)
  })

  it('reports stats', () => {
    const a = assessTranscript(audio)
    expect(a.stats.nonEmptyLines).toBe(4)
    expect(a.stats.timestampedLines).toBe(4)
    expect(a.stats.chars).toBeGreaterThan(200)
  })
})

describe('duplicateShare — diffuse repetition', () => {
  // Thresholds imported, never restated.
  const line = (n: number) => `[0.0 → 1.0] esta es una linea suficientemente larga numero ${n}`

  it('is zero for a transcript with no repeated lines', () => {
    const t = Array.from({ length: 40 }, (_, i) => line(i)).join('\n')
    expect(duplicateShare(t)).toBe(0)
  })

  it('counts every occurrence of a duplicated line, not just the extras', () => {
    // 10 distinct lines, each appearing twice ⇒ every line is a duplicate.
    const t = Array.from({ length: 10 }, (_, i) => `${line(i)}\n${line(i)}`).join('\n')
    expect(duplicateShare(t)).toBe(1)
  })

  it('ignores short lines — "Sí." legitimately repeats in a plenary', () => {
    const t = [...Array(30).fill('[0.0 → 1.0] Sí.'), ...Array(10).keys()]
      .map((x) => (typeof x === 'number' ? line(x) : x))
      .join('\n')
    expect(duplicateShare(t)).toBe(0)
  })

  it('strips timestamp and speaker tags before comparing', () => {
    // Same words, different timestamps and speaker tags: still duplicates.
    const t = [
      '[1.0 → 2.0] (SPEAKER_01) una frase repetida con distintas marcas',
      '[9.0 → 9.5] (SPEAKER_07) una frase repetida con distintas marcas',
    ].join('\n')
    expect(duplicateShare(t)).toBe(1)
  })

  it('handles empty and missing input', () => {
    expect(duplicateShare('')).toBe(0)
    expect(duplicateShare(undefined as unknown as string)).toBe(0)
  })
})

describe('assessTranscript — diffuse-repetition gate', () => {
  const long = (n: number) =>
    `[0.0 → 1.0] linea de contenido suficientemente larga para contar numero ${n}`

  it('rejects a transcript whose duplication exceeds the ceiling', () => {
    // Every line doubled ⇒ share 1.0, far over MAX_DUPLICATE_SHARE.
    const t = Array.from({ length: 30 }, (_, i) => `${long(i)}\n${long(i)}`).join('\n')
    const a = assessTranscript(t)
    expect(a.ok).toBe(false)
    expect(a.issues.join(' ')).toMatch(/repetici[oó]n difusa/i)
  })

  it('accepts a clean transcript — no false positive on the good population', () => {
    const t = Array.from({ length: 60 }, (_, i) => long(i)).join('\n')
    expect(assessTranscript(t).ok).toBe(true)
  })

  it('tolerates duplication under the ceiling', () => {
    // 40 lines, 8 of them (20%) duplicated — under MAX_DUPLICATE_SHARE.
    const uniq = Array.from({ length: 32 }, (_, i) => long(i))
    const dup = Array.from({ length: 4 }, (_, i) => [long(100 + i), long(100 + i)]).flat()
    const t = [...uniq, ...dup].join('\n')
    expect(duplicateShare(t)).toBeLessThan(MAX_DUPLICATE_SHARE)
    expect(assessTranscript(t).ok).toBe(true)
  })

  it('does not double-report an empty file as repetitive', () => {
    expect(assessTranscript('').issues.join(' ')).not.toMatch(/repetici[oó]n/i)
  })
})
