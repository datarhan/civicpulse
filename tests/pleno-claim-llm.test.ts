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
  speakerSlug: null,
  verbatim: 'Hemos asignado 46 millones al presupuesto del año.',
  context: 'El alcalde explica el cierre presupuestario y cita la cifra que se ha consignado.',
  topic: 'fiscal',
  entities: { amountEuros: 46000000 },
  accusationSubtype: null,
  confidence: 0.9,
  reasoning: 'Cifra concreta atribuible al cierre presupuestario',
}

// The return is annotated `Promise<any>` because `LlmCaller` is generic over
// the zod schema chosen at the call site, so no concrete literal is assignable
// to it. What the payload must look like is pinned by `baseClaim`, which IS
// typed `PlenoClaimExtraction` — that is where a schema drift surfaces.
function callerOnce(slug: string | null, opts: Partial<PlenoClaimExtraction> = {}) {
  let called = 0
  return async (): Promise<any> => {
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
        resolveBloc: () => 'PSOE',
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
        resolveBloc: () => 'PSOE',
      },
      callerOnce('not-an-enrolled-councillor'),
    )
    expect(res.items).toHaveLength(1)
    expect(res.items[0].speakerSlug).toBeUndefined()
    expect(res.items[0].speakerGroup).toBe('PSOE')
  })

  it('strips speakerSlug when party disagrees with speakerGroup', async () => {
    // Robert is PSOE but the speaker map puts this quote in PP's mouth. The
    // slug and the bloc now come from two independent sources, so they CAN
    // disagree — and when they do, the individual attribution is the one that
    // goes, not the evidence-backed bloc.
    const res = await extractClaimsWithLlm(
      SAMPLE_TRANSCRIPT,
      {
        plenoId: 'test',
        plenoDate: '2026-04-29',
        currentSeats: [{ bloc: 'PSOE', seats: 11 }],
        allowedSpeakers: ENROLLED,
        windowChars: 5000,
        resolveBloc: () => 'PP',
      },
      callerOnce('robert-raga-gadea'),
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
        resolveBloc: () => null,
      },
      callerOnce('robert-raga-gadea'),
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

/**
 * A window that got no answer is not a window with nothing in it.
 *
 * `if (!response) return 0` treated the two identically, and
 * `segmentsScanned: windows.length` then reported every window as scanned.
 * `callLLM` returns null when the backend refused, when the circuit breaker is
 * open, or when every retry failed — so a degraded backend produced a smaller
 * set of claims and a run that looked complete.
 *
 * Live on 2026-08-11: the 13:52 run exited 0 with `attempted 1 · judged 1` and
 * `319 claims`, while its own LLM stats recorded 14 zero-token failures and
 * **144 short-circuited calls**. Roughly 40% of the transcript's windows never
 * got an answer. Nothing in the output said so, because the pleno-level count
 * is 1-of-1 either way and `segmentsScanned` counts iterations.
 *
 * `docs/DATA_INTEGRITY.md` rule 2, and the reason `/hallazgos` findings are
 * only as complete as the windows that actually answered.
 */
describe('extractClaimsWithLlm · a window with no answer', () => {
  const opts = {
    plenoId: 'test',
    plenoDate: '2026-04-29',
    currentSeats: [{ bloc: 'PSOE', seats: 11 }],
    allowedSpeakers: ENROLLED,
    windowChars: 120,
    resolveBloc: () => 'PSOE',
  }

  it('counts an unanswered window apart from one that answered with nothing', async () => {
    let n = 0
    const res = await extractClaimsWithLlm(
      SAMPLE_TRANSCRIPT,
      opts,
      // Odd windows refuse (null), even ones answer with no claims.
      async (): Promise<any> => (++n % 2 ? null : { claims: [] }),
    )
    expect(res.stats.windowsUnanswered).toBeGreaterThan(0)
    expect(res.stats.windowsAnswered).toBeGreaterThan(0)
    expect(res.stats.windowsAnswered + res.stats.windowsUnanswered).toBe(res.stats.segmentsScanned)
  })

  it('reports zero unanswered when every window replies', async () => {
    const res = await extractClaimsWithLlm(
      SAMPLE_TRANSCRIPT,
      opts,
      async (): Promise<any> => ({
        claims: [],
      }),
    )
    expect(res.stats.windowsUnanswered).toBe(0)
    expect(res.stats.windowsAnswered).toBe(res.stats.segmentsScanned)
  })

  it('reports every window unanswered when the backend is dead', async () => {
    // The shape that shipped as success: a totally dead backend used to be
    // indistinguishable from a transcript containing no claims at all.
    const res = await extractClaimsWithLlm(SAMPLE_TRANSCRIPT, opts, async (): Promise<any> => null)
    expect(res.items).toEqual([])
    expect(res.stats.windowsAnswered).toBe(0)
    expect(res.stats.windowsUnanswered).toBe(res.stats.segmentsScanned)
    expect(res.stats.segmentsScanned).toBeGreaterThan(0)
  })
})
