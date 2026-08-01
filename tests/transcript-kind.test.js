import { describe, it, expect } from 'vitest'
import { transcriptKind } from '../src/lib/transcript-kind.js'

describe('transcriptKind', () => {
  it('calls a file with only 0.0 → 0.0 stamps an acta', () => {
    // Real shape of 1080zow.txt — acta text with synthetic stamps.
    const acta = [
      '[0.0 → 0.0] ACTA SESIÓN ORDINARIA CELEBRADA POR EL',
      '[0.0 → 0.0] AYUNTAMIENTO PLENO EL DÍA 15 DE ABRIL DE 2024',
      '[0.0 → 0.0] Lugar: Salón de Actos',
    ].join('\n')
    expect(transcriptKind(acta)).toBe('acta')
  })

  it('calls a file with moving timestamps an audio transcript', () => {
    const audio = [
      '[0.0 → 4.2] (SPEAKER_00) Bon dia a tots.',
      '[4.2 → 9.8] (SPEAKER_01) Gràcies, senyor alcalde.',
      '[9.8 → 15.0] (SPEAKER_00) Passem al punt primer.',
      '[15.0 → 20.0] (SPEAKER_01) Sí.',
    ].join('\n')
    expect(transcriptKind(audio)).toBe('audio')
  })

  it('does not guess when there are no timestamps at all', () => {
    expect(transcriptKind('texto suelto sin marcas')).toBe('unknown')
    expect(transcriptKind('')).toBe('unknown')
    expect(transcriptKind(null)).toBe('unknown')
  })
})
