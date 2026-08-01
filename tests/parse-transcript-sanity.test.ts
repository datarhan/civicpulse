import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assessTranscriptSanity } from '../src/scraper/transcript-sanity'

const fx = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8')

// Real failure corpus, July 2026: whisper-1 fed a multi-hour single-request
// upload degenerates into repetition loops ("Más información www.alimmenta.com",
// "Más palabras", "SEÑOR PRESIDENTE DE LA JUNTA DE EXTREMADURA", "no", ".").
// The gate's contract: those transcripts NEVER reach public/data/, while every
// genuine transcript in the corpus — including the 21-line extraordinario —
// passes untouched.
describe('scraper/transcript-sanity — assessTranscriptSanity', () => {
  it('rejects the brxx5g-style full hallucination loop (repetition-loop)', () => {
    const r = assessTranscriptSanity(fx('transcript_halluc-loop_2026-07.txt'))
    expect(r.ok).toBe(false)
    expect(r.reasons).toContain('repetition-loop')
  })

  it('rejects the 1l7hhu7-style all-dots transcript (no-content)', () => {
    const r = assessTranscriptSanity(fx('transcript_halluc-dots_2023-02.txt'))
    expect(r.ok).toBe(false)
    expect(r.reasons).toContain('no-content')
    expect(r.reasons).toContain('repetition-loop')
  })

  it('rejects the 1r6yy0-style half-real half-loop transcript (dominant-line)', () => {
    const r = assessTranscriptSanity(fx('transcript_partial-loop_2023-01.txt'))
    expect(r.ok).toBe(false)
    expect(r.reasons).toContain('dominant-line')
  })

  it('accepts a healthy full-session transcript', () => {
    const r = assessTranscriptSanity(fx('transcript_healthy_2026-03.txt'))
    expect(r.ok).toBe(true)
    expect(r.reasons).toEqual([])
  })

  it('accepts a genuine 21-line extraordinario (short ≠ degenerate)', () => {
    const r = assessTranscriptSanity(fx('transcript_healthy-short_2026-07.txt'))
    expect(r.ok).toBe(true)
    expect(r.reasons).toEqual([])
  })

  it('rejects an empty / near-empty transcript (too-few-lines)', () => {
    expect(assessTranscriptSanity('').ok).toBe(false)
    expect(assessTranscriptSanity('').reasons).toContain('too-few-lines')
    const r = assessTranscriptSanity('[0.0 → 5.0] Buenos días.\n[5.0 → 9.0] Se abre la sesión.\n')
    expect(r.ok).toBe(false)
    expect(r.reasons).toContain('too-few-lines')
  })

  it('reports the metrics it decided on', () => {
    const loop = Array.from({ length: 100 }, (_, i) => `[${i}.0 → ${i + 1}.0] Más palabras`).join(
      '\n',
    )
    const r = assessTranscriptSanity(loop)
    expect(r.lines).toBe(100)
    expect(r.uniqueLines).toBe(1)
    expect(r.uniqueRatio).toBeCloseTo(0.01, 3)
    expect(r.topLineShare).toBeCloseTo(1.0, 3)
    expect(r.ok).toBe(false)
  })

  it('does not flag a small file where a routine line repeats (no topCount floor breach)', () => {
    // 30 lines, 8 of them "Gracias." — realistic for a short session; the
    // dominant-line rule needs an absolute count (≥20) besides the share.
    const lines = [
      ...Array.from({ length: 8 }, (_, i) => `[${i}.0 → ${i + 1}.0] Gracias.`),
      ...Array.from(
        { length: 22 },
        (_, i) =>
          `[${i + 10}.0 → ${i + 11}.0] Punto ${i + 1} del orden del día, expediente ${1000 + i}, se aprueba por unanimidad tras el debate correspondiente.`,
      ),
    ].join('\n')
    const r = assessTranscriptSanity(lines)
    expect(r.ok).toBe(true)
  })
})

describe('transcript sanity — Whisper hallucination markers', () => {
  const speech = (n: number) =>
    Array.from({ length: n }, (_, i) => `[${i}.0 → ${i + 1}.0] Intervención número ${i} sobre el expediente municipal correspondiente.`).join('\n')

  it('flags a file padded with subtitle-corpus text', () => {
    // Real: 1du4rf5 carries 110 lines of "Más información www.alimmenta.com" —
    // a nutrition site the model memorised — and supplies 293 published claims.
    const ads = Array.from({ length: 60 }, (_, i) => `[${i}.0 → ${i + 1}.0] Más información www.alimmenta.com`).join('\n')
    const report = assessTranscriptSanity(`${speech(500)}\n${ads}`)
    expect(report.ok).toBe(false)
    expect(report.reasons).toContain('hallucination-markers')
    expect(report.hallucinatedLines).toBe(60)
  })

  it('tolerates a stray sign-off in a long real session', () => {
    // One "¡Suscríbete al canal!" in 500 lines of speech is noise, not a
    // degenerate decode. The gate exists to catch files that are mostly
    // hallucination, not to quarantine on a single line.
    const report = assessTranscriptSanity(`${speech(500)}\n[0.0 → 1.0] ¡Suscríbete al canal!`)
    expect(report.reasons).not.toContain('hallucination-markers')
    expect(report.hallucinatedLines).toBe(1)
  })
})
