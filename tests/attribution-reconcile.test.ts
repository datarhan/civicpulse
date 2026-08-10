import { describe, it, expect } from 'vitest'
import {
  reconcileAttributions,
  retractionFor,
  type PublishedQuote,
} from '../src/scraper/attribution-reconcile'
import type { SpeakerMap } from '../src/scraper/speaker-map'
import { applyFindingCorrection } from '../src/scraper/pleno-finding'

const MAP: SpeakerMap = {
  plenoId: 'test',
  generatedAt: '2026-08-10T00:00:00Z',
  model: 'gemini-3.5-flash',
  chunkSeconds: 600,
  segments: [],
  rejected: [],
  stats: {
    chunksExpected: 1,
    chunksTranscribed: 1,
    failedChunks: [],
    labelsSeen: 2,
    rowsAccepted: 1,
    rowsRejected: 0,
    rejectedBy: {},
    coverage: 1,
  },
  rows: [
    {
      label: 'c00/SPEAKER_03',
      bloc: 'VOX',
      slug: 'jose-luis-fernandez-santamaria',
      heardAs: 'José Luis',
      namesIndividual: true,
      weak: false,
      evidence: [
        {
          spokenBy: 'c00/SPEAKER_01',
          at: 432,
          quote: 'Gràcies per la puntualitat. Eh Vox, José Luis.',
          relation: 'turn-grant',
        },
      ],
    },
  ],
}

/** Stands in for `blocResolverFor`: VOX for the known quote, null otherwise. */
const resolveBloc = (t: string) => (t.includes('partido socialista') ? 'VOX' : null)

const q = (over: Partial<PublishedQuote> = {}): PublishedQuote => ({
  findingId: 'f-1',
  quoteIndex: 0,
  text: 'viniendo de un partido socialista donde Pedro Sánchez ha realizado anuncios',
  speakerGroup: 'PSOE',
  ...over,
})

describe('reconcileAttributions', () => {
  /**
   * The production defect, exactly: a VOX councillor attacking the PSOE, filed
   * under PSOE because that is the party the sentence names.
   */
  it('flags a published bloc the map contradicts', () => {
    const r = reconcileAttributions({ quotes: [q()], resolveBloc, map: MAP })
    expect(r.rows[0].verdict).toBe('contradicted')
    expect(r.rows[0].published).toBe('PSOE')
    expect(r.rows[0].fromMap).toBe('VOX')
    expect(r.rows[0].retractable).toBe(true)
  })

  it('leaves an agreeing attribution alone', () => {
    const r = reconcileAttributions({ quotes: [q({ speakerGroup: 'VOX' })], resolveBloc, map: MAP })
    expect(r.rows[0].verdict).toBe('agrees')
    expect(r.rows[0].retractable).toBe(false)
  })

  /**
   * The asymmetry. An unattributed quote plus a map row is an ADDITION — it
   * would start saying who spoke — and no automated pass may do that however
   * good the evidence looks.
   */
  it('never treats filling in a missing attribution as automatable', () => {
    const r = reconcileAttributions({ quotes: [q({ speakerGroup: null })], resolveBloc, map: MAP })
    expect(r.rows[0].verdict).toBe('additive')
    expect(r.rows[0].retractable).toBe(false)
  })

  it('says nothing about a quote the map does not vouch for', () => {
    const r = reconcileAttributions({
      quotes: [q({ text: 'una frase que el mapa no cubre' })],
      resolveBloc,
      map: MAP,
    })
    expect(r.rows[0].verdict).toBe('unknown')
    expect(r.rows[0].retractable).toBe(false)
  })

  it('marks a one-seat bloc as naming an individual', () => {
    const r = reconcileAttributions({ quotes: [q()], resolveBloc, map: MAP })
    expect(r.rows[0].namesIndividual).toBe(true)
  })

  it('counts every quote under exactly one verdict', () => {
    const quotes = [
      q(),
      q({ speakerGroup: 'VOX' }),
      q({ speakerGroup: null }),
      q({ text: 'sin cobertura' }),
    ]
    const r = reconcileAttributions({ quotes, resolveBloc, map: MAP })
    const total = Object.values(r.stats).reduce((a, b) => a + b, 0)
    expect(total).toBe(quotes.length)
    expect(r.stats).toEqual({ agrees: 1, contradicted: 1, additive: 1, unknown: 1 })
  })

  /**
   * The invariant that matters most, asserted over every verdict rather than
   * the one case: exactly the contradicted rows are actionable, and nothing
   * else ever is.
   */
  it('makes ONLY contradicted rows retractable', () => {
    const quotes = [q(), q({ speakerGroup: 'VOX' }), q({ speakerGroup: null }), q({ text: 'x' })]
    const r = reconcileAttributions({ quotes, resolveBloc, map: MAP })
    for (const row of r.rows) {
      expect(row.retractable).toBe(row.verdict === 'contradicted')
    }
  })
})

describe('retractionFor', () => {
  const rows = reconcileAttributions({ quotes: [q()], resolveBloc, map: MAP }).rows

  it('always empties the field — there is no path that writes a bloc', () => {
    const fix = retractionFor(rows[0], MAP)!
    expect(fix.field).toBe('quote.0.speakerGroup')
    expect(fix.corrected).toBe('')
  })

  it('cites the audio evidence in the public reason', () => {
    const fix = retractionFor(rows[0], MAP)!
    expect(fix.reason).toContain('Vox, José Luis')
    expect(fix.reason).toContain('432')
    expect(fix.reason.length).toBeGreaterThan(20)
  })

  it('returns null for anything not contradicted', () => {
    const agreeing = reconcileAttributions({
      quotes: [q({ speakerGroup: 'VOX' })],
      resolveBloc,
      map: MAP,
    }).rows[0]
    expect(retractionFor(agreeing, MAP)).toBeNull()
  })
})

describe('the corrections CLI can now carry the retraction', () => {
  const finding = () =>
    ({
      id: 'f-1',
      title: 't',
      summary: 's',
      severity: 'informational',
      sourceClaimIds: ['c1'],
      quotes: [
        { text: 'una cita cualquiera de prueba', speakerGroup: 'PSOE', sourceClaimId: 'c1' },
      ],
      crossChecked: [],
    }) as never

  it('empties speakerGroup and reports the previous value', () => {
    const f = finding()
    const original = applyFindingCorrection(f, 'quote.0.speakerGroup', '')
    expect(original).toBe('PSOE')
    expect((f as { quotes: Array<{ speakerGroup: unknown }> }).quotes[0].speakerGroup).toBeNull()
  })

  it('lets a curator set a real bloc — that judgement is theirs to make', () => {
    const f = finding()
    applyFindingCorrection(f, 'quote.0.speakerGroup', 'VOX')
    expect((f as { quotes: Array<{ speakerGroup: unknown }> }).quotes[0].speakerGroup).toBe('VOX')
  })

  it('refuses a bloc that is not publishable', () => {
    const f = finding()
    expect(() => applyFindingCorrection(f, 'quote.0.speakerGroup', 'Otro')).toThrow(
      /not a publishable bloc/,
    )
  })
})
