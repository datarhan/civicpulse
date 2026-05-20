import { describe, it, expect } from 'vitest'
import {
  validatePressClaim,
  validatePressClaimsSnapshot,
  type PressClaim,
  type PressClaimsSnapshot,
} from '../src/scraper/press-claim'

function makeClaim(overrides: Partial<PressClaim> = {}): PressClaim {
  return {
    id: 'test-art-001-0-num',
    articleId: 'test-art-001',
    articleFingerprint: 'fp-fake-001',
    articleSource: 'Test Outlet',
    articleSourceHost: 'example.test',
    articleUrl: 'https://example.test/articles/001',
    articleDate: '2026-05-20T10:00:00.000Z',
    segmentIndex: 0,
    segmentKind: 'title',
    type: 'afirmacion_numerica',
    attributedSource: 'municipal',
    verbatim: 'Riba-roja invierte 185.000 € en el parque del Túria.',
    context:
      'Headline-only extraction. Source article describes municipal investment in protective works at the Túria river park.',
    topic: 'medio-ambiente',
    entities: { amountEuros: 185000, referencedEntity: 'parque natural del túria' },
    confidence: 0.82,
    reasoning: 'Headline asserts a specific € figure tied to an identifiable municipal project.',
    requiresHumanApproval: true,
    ...overrides,
  }
}

function makeSnapshot(items: PressClaim[]): PressClaimsSnapshot {
  return {
    generatedAt: '2026-05-20T10:00:00.000Z',
    source: {
      description: 'Press claims extracted from press.json',
      contract: 'src/scraper/press-claim.ts',
    },
    stats: {
      total: items.length,
      byType: { afirmacion_numerica: items.length } as any,
      bySource: {},
      byTopic: {} as any,
    },
    items,
  }
}

describe('press-claim — validatePressClaim', () => {
  it('accepts a well-formed claim', () => {
    expect(() => validatePressClaim(makeClaim())).not.toThrow()
  })

  it('rejects verbatim shorter than 20 chars (libel-safe quoting floor)', () => {
    expect(() => validatePressClaim(makeClaim({ verbatim: 'too short' }))).toThrow(/verbatim/)
  })

  it('rejects an unknown claim type', () => {
    // @ts-expect-error testing runtime validation
    expect(() => validatePressClaim(makeClaim({ type: 'not-a-type' }))).toThrow(
      /type must be one of/,
    )
  })

  it('rejects an unknown attributedSource', () => {
    // @ts-expect-error testing runtime validation
    expect(() => validatePressClaim(makeClaim({ attributedSource: 'partisan' }))).toThrow(
      /attributedSource must be one of/,
    )
  })

  it('rejects an unknown topic', () => {
    // @ts-expect-error testing runtime validation
    expect(() => validatePressClaim(makeClaim({ topic: 'not-a-topic' }))).toThrow(
      /topic must be one of/,
    )
  })

  it('rejects a non-http articleUrl', () => {
    expect(() => validatePressClaim(makeClaim({ articleUrl: 'javascript:alert(1)' }))).toThrow(
      /articleUrl/,
    )
  })

  it('rejects confidence outside [0,1]', () => {
    expect(() => validatePressClaim(makeClaim({ confidence: 1.5 }))).toThrow(/confidence/)
    expect(() => validatePressClaim(makeClaim({ confidence: -0.1 }))).toThrow(/confidence/)
  })

  it('rejects requiresHumanApproval !== true (schema discipline)', () => {
    // @ts-expect-error testing runtime
    expect(() => validatePressClaim(makeClaim({ requiresHumanApproval: false }))).toThrow(
      /requiresHumanApproval/,
    )
  })

  it('rejects an invalid segmentKind', () => {
    // @ts-expect-error testing runtime
    expect(() => validatePressClaim(makeClaim({ segmentKind: 'abstract' }))).toThrow(/segmentKind/)
  })

  it('validates the accusation subtype enum when type=acusacion_publica', () => {
    expect(() =>
      validatePressClaim(
        makeClaim({
          type: 'acusacion_publica',
          // @ts-expect-error testing runtime
          accusationSubtype: 'guess',
        }),
      ),
    ).toThrow(/accusationSubtype must be one of/)
    expect(() =>
      validatePressClaim(
        makeClaim({
          type: 'acusacion_publica',
          accusationSubtype: 'opinativa',
        }),
      ),
    ).not.toThrow()
  })

  it('accepts the press-only dato_municipal claim type', () => {
    expect(() => validatePressClaim(makeClaim({ type: 'dato_municipal' }))).not.toThrow()
  })
})

describe('press-claim — validatePressClaimsSnapshot', () => {
  it('round-trips a valid snapshot', () => {
    const snap = makeSnapshot([makeClaim()])
    const parsed = validatePressClaimsSnapshot(JSON.stringify(snap))
    expect(parsed.items.length).toBe(1)
    expect(parsed.items[0].id).toBe('test-art-001-0-num')
  })

  it('throws when items[] contains an invalid claim', () => {
    const snap = makeSnapshot([makeClaim({ verbatim: 'x' })])
    expect(() => validatePressClaimsSnapshot(JSON.stringify(snap))).toThrow(/verbatim/)
  })

  it('throws on missing top-level keys', () => {
    expect(() => validatePressClaimsSnapshot('{}')).toThrow(/generatedAt/)
  })

  it('throws on non-JSON input', () => {
    expect(() => validatePressClaimsSnapshot('not-json{')).toThrow(/not valid JSON/)
  })
})
