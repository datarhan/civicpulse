import { describe, it, expect } from 'vitest'
import { extractClaimsWithLlm } from '../src/scraper/pleno-claim-llm'
import type { PlenoClaimExtraction } from '../src/llm/schemas'

const SAMPLE_TRANSCRIPT = `
[10.0 → 35.0] (Robert Raga Gadea) Buenas tardes, este año hemos asignado 46 millones al presupuesto.
[36.0 → 70.0] (SPEAKER_01 ≈ Rafael Gómez Sánchez?) El expediente cuatro fija un plazo de 90 días.
[71.0 → 95.0] (María Esther Gómez Laredo) Construiremos 500 viviendas sociales antes de 2027.
`.trim()

const ENROLLED = [
  { slug: 'robert-raga-gadea', name: 'Robert Raga Gadea', party: 'PSOE' },
  { slug: 'rafael-gomez-sanchez', name: 'Rafael Gómez Sánchez', party: 'PSOE' },
  { slug: 'maria-esther-gomez-laredo', name: 'María Esther Gómez Laredo', party: 'PSOE' },
]

const baseClaim: PlenoClaimExtraction = {
  type: 'afirmacion_numerica',
  speakerGroup: 'PSOE',
  speakerSlug: null,
  verbatim: 'Hemos asignado 46 millones al presupuesto del año.',
  context: 'El alcalde explica el cierre presupuestario y cita la cifra que se ha consignado.',
  topic: 'fiscal',
  entities: { amountEuros: 46000000 },
  accusationSubtype: null,
  confidence: 0.9,
  reasoning: 'Cifra concreta atribuible al cierre presupuestario',
}

function callerOnce(slug: string | null, opts: Partial<PlenoClaimExtraction> = {}) {
  let called = 0
  return async () => {
    called += 1
    if (called > 1) return { claims: [] }
    return { claims: [{ ...baseClaim, speakerSlug: slug, ...opts }] }
  }
}

describe('extractClaimsWithLlm · speakerSlug validation', () => {
  it('keeps speakerSlug when slug is in allowedSpeakers and party matches speakerGroup', async () => {
    const res = await extractClaimsWithLlm(
      SAMPLE_TRANSCRIPT,
      {
        plenoId: 'test',
        plenoDate: '2026-04-29',
        currentSeats: [{ bloc: 'PSOE', seats: 11 }],
        allowedSpeakers: ENROLLED,
        windowChars: 5000,
      },
      callerOnce('robert-raga-gadea'),
    )
    expect(res.items).toHaveLength(1)
    expect(res.items[0].speakerSlug).toBe('robert-raga-gadea')
    expect(res.items[0].speakerGroup).toBe('PSOE')
  })

  it('strips speakerSlug when slug is NOT in allowedSpeakers (defensive guard)', async () => {
    const res = await extractClaimsWithLlm(
      SAMPLE_TRANSCRIPT,
      {
        plenoId: 'test',
        plenoDate: '2026-04-29',
        currentSeats: [{ bloc: 'PSOE', seats: 11 }],
        allowedSpeakers: ENROLLED,
        windowChars: 5000,
      },
      callerOnce('not-an-enrolled-councillor'),
    )
    expect(res.items).toHaveLength(1)
    expect(res.items[0].speakerSlug).toBeUndefined()
    expect(res.items[0].speakerGroup).toBe('PSOE')
  })

  it('strips speakerSlug when party disagrees with speakerGroup', async () => {
    // Robert is PSOE but the LLM (somehow) emits speakerGroup=PP — mismatch.
    const res = await extractClaimsWithLlm(
      SAMPLE_TRANSCRIPT,
      {
        plenoId: 'test',
        plenoDate: '2026-04-29',
        currentSeats: [{ bloc: 'PSOE', seats: 11 }],
        allowedSpeakers: ENROLLED,
        windowChars: 5000,
      },
      callerOnce('robert-raga-gadea', { speakerGroup: 'PP' }),
    )
    expect(res.items).toHaveLength(1)
    expect(res.items[0].speakerSlug).toBeUndefined()
    expect(res.items[0].speakerGroup).toBe('PP')
  })

  it('keeps speakerSlug when speakerGroup is null (no bloc to disagree with)', async () => {
    const res = await extractClaimsWithLlm(
      SAMPLE_TRANSCRIPT,
      {
        plenoId: 'test',
        plenoDate: '2026-04-29',
        currentSeats: [{ bloc: 'PSOE', seats: 11 }],
        allowedSpeakers: ENROLLED,
        windowChars: 5000,
      },
      callerOnce('robert-raga-gadea', { speakerGroup: null }),
    )
    expect(res.items).toHaveLength(1)
    expect(res.items[0].speakerSlug).toBe('robert-raga-gadea')
    expect(res.items[0].speakerGroup).toBeNull()
  })

  it('emits no speakerSlug when allowedSpeakers is empty', async () => {
    const res = await extractClaimsWithLlm(
      SAMPLE_TRANSCRIPT,
      {
        plenoId: 'test',
        plenoDate: '2026-04-29',
        currentSeats: [{ bloc: 'PSOE', seats: 11 }],
        allowedSpeakers: [],
        windowChars: 5000,
      },
      callerOnce('robert-raga-gadea'),
    )
    expect(res.items).toHaveLength(1)
    expect(res.items[0].speakerSlug).toBeUndefined()
  })

  it('handles raw.speakerSlug=null cleanly (no key in output)', async () => {
    const res = await extractClaimsWithLlm(
      SAMPLE_TRANSCRIPT,
      {
        plenoId: 'test',
        plenoDate: '2026-04-29',
        currentSeats: [{ bloc: 'PSOE', seats: 11 }],
        allowedSpeakers: ENROLLED,
        windowChars: 5000,
      },
      callerOnce(null),
    )
    expect(res.items).toHaveLength(1)
    expect(res.items[0].speakerSlug).toBeUndefined()
  })
})
