import { describe, it, expect } from 'vitest'
import {
  applyFindingCorrection,
  validateFindingsSnapshot,
  isSpeakerGroupField,
  ATTRIBUTION_RETRACTED_LABEL,
} from '../src/scraper/pleno-finding'
import { retractionFor, reconcileAttributions } from '../src/scraper/attribution-reconcile'
import type { SpeakerMap } from '../src/scraper/speaker-map'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The snapshot header comes from the published file, not from a literal here.
 * `validateFindingsSnapshot` requires `version`, `legalNotice`, `contactUrl`
 * and `methodologyUrl`, and a hand-copied set would drift the moment one of
 * them changed — the restated-shape trap in DATA_INTEGRITY rule 1.
 */
const REAL = JSON.parse(readFileSync(resolve('public/data/pleno-findings.json'), 'utf8')) as Record<
  string,
  unknown
>
const HEADER = {
  version: REAL.version,
  legalNotice: REAL.legalNotice,
  contactUrl: REAL.contactUrl,
  methodologyUrl: REAL.methodologyUrl,
}

describe('isSpeakerGroupField', () => {
  it('matches a quote attribution path and nothing near it', () => {
    expect(isSpeakerGroupField('quote.0.speakerGroup')).toBe(true)
    expect(isSpeakerGroupField('quote.12.speakerGroup')).toBe(true)
    expect(isSpeakerGroupField('quote.0.text')).toBe(false)
    expect(isSpeakerGroupField('summary')).toBe(false)
    expect(isSpeakerGroupField('quote.speakerGroup')).toBe(false)
  })
})

/**
 * The collision this label exists to resolve, found by running the reconciler
 * for real: `applyFindingCorrection` stores `null`, but the corrections log's
 * `corrected` side is a REQUIRED non-empty string, so an empty one fails
 * `validateFindingsSnapshot` outright — the first `--apply` died on
 * `items[3].corrections[4].corrected required`.
 */
describe('retracting an attribution survives the snapshot validator', () => {
  /**
   * Built from a REAL published finding with only the corrections log swapped.
   * Hand-writing one meant discovering the validator's rules by failing them
   * one at a time — sourceClaimId length, curatorName, the snapshot header —
   * which is the restated-shape trap wearing a test's clothes.
   */
  const snapshot = (corrected: string) => {
    const real = JSON.parse(JSON.stringify(REAL)) as {
      items: Array<Record<string, unknown>>
    }
    const item = real.items[0]
    item.corrections = [
      {
        field: 'quote.0.speakerGroup',
        original: 'PSOE',
        corrected,
        reason: 'Atribución retirada porque la grabación acredita otro grupo distinto.',
        editor: 'reconcile-attribution (automático)',
        correctedAt: '2026-08-11T00:00:00.000Z',
      },
    ]
    return JSON.stringify({ ...real, items: [item] })
  }

  it('is a valid snapshot to begin with — otherwise the test below proves nothing', () => {
    expect(() => validateFindingsSnapshot(snapshot('PP'))).not.toThrow()
  })

  it('rejects an empty corrected side', () => {
    expect(() => validateFindingsSnapshot(snapshot(''))).toThrow()
  })

  it('accepts the retraction label', () => {
    expect(() => validateFindingsSnapshot(snapshot(ATTRIBUTION_RETRACTED_LABEL))).not.toThrow()
  })

  /** The stored value is still null — the label is the log's, not the data's. */
  it('stores null while the log carries words', () => {
    const finding = {
      quotes: [{ text: 't', speakerGroup: 'PSOE', sourceClaimId: 'p1-000-afi-abc123' }],
    } as never
    const original = applyFindingCorrection(finding, 'quote.0.speakerGroup', '')
    expect(original).toBe('PSOE')
    expect(
      (finding as { quotes: Array<{ speakerGroup: unknown }> }).quotes[0].speakerGroup,
    ).toBeNull()
    expect(ATTRIBUTION_RETRACTED_LABEL).not.toBe('')
  })
})

const MAP: SpeakerMap = {
  plenoId: 'p1',
  generatedAt: '2026-08-11T00:00:00Z',
  model: 'test',
  chunkSeconds: 600,
  segments: [],
  rejected: [],
  stats: {
    chunksExpected: 1,
    chunksTranscribed: 1,
    failedChunks: [],
    labelsSeen: 1,
    rowsAccepted: 1,
    rowsRejected: 0,
    rejectedBy: {},
    coverage: 1,
  },
  rows: [
    {
      label: 'c00/S1',
      bloc: 'VOX',
      slug: 'jose-luis-fernandez-santamaria',
      heardAs: 'José Luis',
      namesIndividual: true,
      weak: false,
      evidence: [{ spokenBy: 'c00/S0', at: 42, quote: 'Vox, José Luis.', relation: 'turn-grant' }],
    },
  ],
}

/**
 * Verified end to end against the real corpus on 2026-08-11 with a fabricated
 * map: the contradicted case produced one corrections row and set the stored
 * value to null; the additive case left `pleno-findings.json` byte-identical.
 * These pin the invariant so a later edit cannot quietly widen it.
 */
describe('only a contradiction is actionable', () => {
  const quote = (speakerGroup: string | null) => ({
    findingId: 'f-1',
    quoteIndex: 0,
    text: 'la barrera está funcionando muy bien',
    speakerGroup,
  })
  const resolveBloc = () => 'VOX'

  it('yields a retraction for a contradicted attribution', () => {
    const row = reconcileAttributions({ quotes: [quote('PSOE')], resolveBloc, map: MAP }).rows[0]
    const fix = retractionFor(row, MAP)
    expect(fix).not.toBeNull()
    expect(fix!.corrected).toBe('')
    expect(fix!.field).toBe('quote.0.speakerGroup')
  })

  it('yields NOTHING for an unattributed quote the map could fill in', () => {
    const row = reconcileAttributions({ quotes: [quote(null)], resolveBloc, map: MAP }).rows[0]
    expect(row.verdict).toBe('additive')
    expect(retractionFor(row, MAP)).toBeNull()
  })

  it('yields nothing when map and finding agree', () => {
    const row = reconcileAttributions({ quotes: [quote('VOX')], resolveBloc, map: MAP }).rows[0]
    expect(retractionFor(row, MAP)).toBeNull()
  })
})
