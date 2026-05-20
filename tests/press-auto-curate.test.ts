import { describe, it, expect } from 'vitest'
import {
  selectBundles,
  composeFinding,
  renderQuarantineMarkdown,
  type VerifiedPressItem,
} from '../src/scraper/press-auto-curate'
import { validatePressFindingsSnapshot } from '../src/scraper/press-finding'

function makeItem(overrides: Partial<VerifiedPressItem['claim']> = {}): VerifiedPressItem {
  return {
    claim: {
      id: 'a-1-0-num',
      articleId: 'a-1',
      articleFingerprint: 'fp-001',
      articleSource: 'Outlet A',
      articleSourceHost: 'a.test',
      articleUrl: 'https://a.test/articles/1',
      articleDate: '2026-05-19T10:00:00Z',
      segmentIndex: 0,
      segmentKind: 'title',
      type: 'afirmacion_numerica',
      attributedSource: 'municipal',
      verbatim: 'Riba-roja invierte 185.000 € en el parque del Túria',
      context: '',
      topic: 'medio-ambiente',
      entities: { amountEuros: 185000 },
      confidence: 0.85,
      reasoning: '',
      requiresHumanApproval: true,
      ...overrides,
    },
    verification: {
      claimId: overrides.id ?? 'a-1-0-num',
      verdict: 'verificado',
      summary: 'matches',
      evidence: [
        { kind: 'bdns', ref: 'BDB-2026-001', snippet: 'BDNS · 184.940 €', similarity: 0.99 },
      ],
      checkedAgainst: ['bdns'],
      articleUrl: 'https://a.test/articles/1',
      articleSource: 'Outlet A',
      articleSourceHost: 'a.test',
      articleFingerprint: 'fp-001',
    },
  }
}

describe('press-auto-curate — selectBundles', () => {
  it('groups by fingerprint and elevates 2+ outlet bundles', () => {
    const items = [
      makeItem({ id: 'a-1-0', articleId: 'a-1', articleFingerprint: 'shared', articleSource: 'A' }),
      makeItem({ id: 'a-2-0', articleId: 'a-2', articleFingerprint: 'shared', articleSource: 'B' }),
    ]
    const r = selectBundles(items)
    expect(r.eligible.length).toBe(1)
    expect(r.eligible[0].attributedOutlets).toEqual(['A', 'B'])
  })

  it('quarantines any bundle containing ≥1 contradicho', () => {
    const verifiedItem = makeItem()
    const contradichoItem: VerifiedPressItem = {
      ...verifiedItem,
      claim: { ...verifiedItem.claim, id: 'a-1-1-num' },
      verification: { ...verifiedItem.verification, claimId: 'a-1-1-num', verdict: 'contradicho' },
    }
    const r = selectBundles([verifiedItem, contradichoItem])
    expect(r.eligible.length).toBe(0)
    expect(r.quarantine.length).toBe(1)
  })

  it('drops opinativa accusations entirely', () => {
    const opin = makeItem({
      type: 'acusacion_publica',
      accusationSubtype: 'opinativa',
      verbatim: 'Pieza de opinión sobre el ayuntamiento y su gestión',
    })
    const r = selectBundles([opin])
    expect(r.eligible.length + r.quarantine.length + r.skipped.length).toBe(0)
  })

  it('drops claims below the confidence floor', () => {
    const low = makeItem({ confidence: 0.4 })
    const r = selectBundles([low])
    expect(r.eligible.length + r.quarantine.length + r.skipped.length).toBe(0)
  })

  it('respects LOREG freeze when frozenUntil > today', () => {
    const item = makeItem()
    const r = selectBundles([item], {
      frozenUntil: '2099-01-01',
      now: new Date('2026-05-20T00:00:00Z'),
    })
    expect(r.frozen).toBe(true)
    expect(r.eligible.length).toBe(0)
  })

  it('skips a bundle with a single sin-datos claim (no corroboration)', () => {
    const lonely = makeItem()
    lonely.verification.verdict = 'sin-datos'
    lonely.verification.evidence = []
    const r = selectBundles([lonely])
    expect(r.skipped.length).toBe(1)
    expect(r.eligible.length).toBe(0)
  })
})

describe('press-auto-curate — composeFinding produces a valid PressFinding', () => {
  it('passes validatePressFindingsSnapshot', () => {
    const items = [
      makeItem({ id: 'a-1-0', articleId: 'a-1', articleFingerprint: 'shared', articleSource: 'A' }),
      makeItem({ id: 'a-2-0', articleId: 'a-2', articleFingerprint: 'shared', articleSource: 'B' }),
    ]
    const r = selectBundles(items)
    expect(r.eligible.length).toBe(1)
    const finding = composeFinding({ bundle: r.eligible[0] })

    const snap = {
      version: '1',
      generatedAt: '2026-05-20',
      legalNotice:
        'Auditoría editorial. Las verificaciones contrastan datos municipales públicos con la prensa citada.',
      contactUrl: 'https://github.com/datarhan/civicpulse/issues',
      methodologyUrl: '/metodologia#laboratorio-prensa',
      items: [finding],
    }
    const parsed = validatePressFindingsSnapshot(JSON.stringify(snap))
    expect(parsed.items.length).toBe(1)
    expect(parsed.items[0].severity).toBe('informational')
    expect(parsed.items[0].attributedOutlets.length).toBe(2)
  })
})

describe('press-auto-curate — renderQuarantineMarkdown', () => {
  it('renders a markdown queue when quarantine is non-empty', () => {
    const items = [
      makeItem({ id: 'a-1-0', articleFingerprint: 'fp-x' }),
      (() => {
        const c = makeItem({ id: 'a-1-1', articleFingerprint: 'fp-x' })
        c.verification.verdict = 'contradicho'
        return c
      })(),
    ]
    const r = selectBundles(items)
    const md = renderQuarantineMarkdown(r.quarantine)
    expect(md).toMatch(/Press auto-curation queue/)
    expect(md).toMatch(/Fingerprint/)
  })

  it('renders an empty-queue message when nothing was quarantined', () => {
    const md = renderQuarantineMarkdown([])
    expect(md).toMatch(/No bundles in quarantine/)
  })
})
