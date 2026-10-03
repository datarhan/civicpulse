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
    //
    // PP is in the composition on purpose: a bloc the composition does not
    // list is withheld (see «grupos de un escaño» below), and this case is
    // about the slug, not about an unknown bloc.
    const res = await extractClaimsWithLlm(
      SAMPLE_TRANSCRIPT,
      {
        plenoId: 'test',
        plenoDate: '2026-04-29',
        currentSeats: [
          { bloc: 'PSOE', seats: 11 },
          { bloc: 'PP', seats: 7 },
        ],
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
 * Un grupo con un solo escaño nombra a su concejal por eliminación.
 *
 * El mapa de voces puede acreditar que habló VOX con la frase exacta con que la
 * presidencia le dio la palabra, y aun así esa etiqueta no la escribe una pasada
 * sin persona: `decideAutomation({ kind: 'name-individual', namesIndividual:
 * true })` la pone en el nivel C. El extractor la retiene y CUENTA las
 * retenidas, porque una etiqueta que falta por política no es una que el mapa
 * no dio (DATA_INTEGRITY, regla 2).
 *
 * Medido el 30-09-2026: 16 de las 116 declaraciones servidas con VOX, EU-Podem
 * o Compromís venían de aquí —re-extraídas por hallazgos-pipeline al llegar el
 * mapa— y ninguna llevaba firma.
 */
describe('extractClaimsWithLlm · grupos de un escaño', () => {
  // La composición del caso, escrita a mano: es la ENTRADA, no el enum de
  // producción, que se deriva de officials.json.
  const COMPOSICION = [
    { bloc: 'PSOE', seats: 11 },
    { bloc: 'PP', seats: 7 },
    { bloc: 'VOX', seats: 1 },
    { bloc: 'EU-Podem', seats: 1 },
    { bloc: 'Compromís', seats: 1 },
  ]
  const conGrupo = (
    resolveBloc: (() => string | null) | undefined,
    opts: {
      slug?: string | null
      currentSeats?: { bloc: string; seats: number }[]
      allowedSpeakers?: typeof ENROLLED
    } = {},
  ) =>
    extractClaimsWithLlm(
      SAMPLE_TRANSCRIPT,
      {
        plenoId: 'test',
        plenoDate: '2026-04-29',
        currentSeats: opts.currentSeats ?? COMPOSICION,
        allowedSpeakers: opts.allowedSpeakers ?? ENROLLED,
        windowChars: 5000,
        resolveBloc,
      },
      callerOnce(opts.slug ?? null),
    )

  it('no escribe un grupo de un escaño aunque el mapa lo acredite, y cuenta la retenida', async () => {
    for (const bloc of ['VOX', 'EU-Podem', 'Compromís']) {
      const res = await conGrupo(() => bloc)
      expect(res.items, bloc).toHaveLength(1)
      expect(res.items[0].speakerGroup, bloc).toBeNull()
      expect(res.stats.blocsRetenidos, bloc).toEqual({ unEscano: 1, fueraDeLaComposicion: 0 })
    }
  })

  it('escribe un grupo de varios escaños, y no retiene nada', async () => {
    const res = await conGrupo(() => 'PP')
    expect(res.items[0].speakerGroup).toBe('PP')
    expect(res.stats.blocsRetenidos).toEqual({ unEscano: 0, fueraDeLaComposicion: 0 })
  })

  it('retiene un grupo que la composición no trae: no saber sus escaños no es saber que son varios', async () => {
    const res = await conGrupo(() => 'Ciudadanos')
    expect(res.items[0].speakerGroup).toBeNull()
    expect(res.stats.blocsRetenidos).toEqual({ unEscano: 0, fueraDeLaComposicion: 1 })
  })

  it('sin composición no atribuye nada', async () => {
    const res = await conGrupo(() => 'PSOE', { currentSeats: [] })
    expect(res.items[0].speakerGroup).toBeNull()
    expect(res.stats.blocsRetenidos).toEqual({ unEscano: 0, fueraDeLaComposicion: 1 })
  })

  it('se lleva también al concejal: sin su grupo no queda su speakerSlug', async () => {
    const conVox = [
      ...ENROLLED,
      { slug: 'concejal-de-prueba', name: 'Concejal de Prueba', party: 'VOX' },
    ]
    const res = await conGrupo(() => 'VOX', { slug: 'concejal-de-prueba', allowedSpeakers: conVox })
    expect(res.items[0].speakerGroup).toBeNull()
    expect(res.items[0].speakerSlug).toBeUndefined()
  })

  it('sin mapa no hay nada que retener', async () => {
    const res = await conGrupo(undefined)
    expect(res.items[0].speakerGroup).toBeNull()
    expect(res.stats.blocsRetenidos).toEqual({ unEscano: 0, fueraDeLaComposicion: 0 })
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
    const res = await extractClaimsWithLlm(SAMPLE_TRANSCRIPT, opts, async (): Promise<any> => ({
      claims: [],
    }))
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
