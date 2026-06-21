import { describe, it, expect } from 'vitest'
import { assessTranscript } from '../src/scraper/transcript-quality'

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
