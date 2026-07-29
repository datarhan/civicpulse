import { describe, it, expect } from 'vitest'
import { runRelationsChecks } from '../src/scraper/relations-check'

const byName = (rs: ReturnType<typeof runRelationsChecks>) =>
  Object.fromEntries(rs.map((r) => [r.name, r]))

describe('runRelationsChecks', () => {
  it('flags a finding citing a claimId absent from verified', () => {
    const rs = byName(
      runRelationsChecks({
        verified: { items: [{ claim: { id: 'p1-001-afi-aaaaaa' } }] },
        findings: { items: [{ id: 'f1', sourceClaimIds: ['p1-001-afi-aaaaaa', 'GONE-id'] }] },
      }),
    )
    expect(rs['findings-claims'].status).toBe('broken')
    expect(rs['findings-claims'].level).toBe('error')
    expect(rs['findings-claims'].broken[0]).toContain('GONE-id')
  })

  it('passes a clean findings↔claims join and counts refs', () => {
    const rs = byName(
      runRelationsChecks({
        verified: { items: [{ claim: { id: 'x' } }] },
        findings: { items: [{ id: 'f1', sourceClaimIds: ['x'] }] },
      }),
    )
    expect(rs['findings-claims'].status).toBe('ok')
    expect(rs['findings-claims'].checked).toBe(1)
  })

  it('reports skipped when an input file is absent', () => {
    const rs = byName(runRelationsChecks({}))
    expect(rs['findings-claims'].status).toBe('skipped')
    expect(rs['relations-quejas-tenders'].status).toBe('skipped')
    expect(rs['manifest-chunks'].status).toBe('skipped')
  })

  it('flags manifest chunk itemCount mismatches and missing chunk files', () => {
    const rs = byName(
      runRelationsChecks({
        manifest: {
          plenos: [
            { plenoId: 'p1', chunkPath: 'pleno-claims/p1.json', itemCount: 2 },
            { plenoId: 'p2', chunkPath: 'pleno-claims/p2.json', itemCount: 1 },
          ],
          totals: { items: 3 },
        },
        chunkFiles: { 'pleno-claims/p1.json': { items: [{}] } },
      }),
    )
    expect(rs['manifest-chunks'].status).toBe('broken')
    expect(rs['manifest-chunks'].broken.join(' ')).toContain('p1')
    expect(rs['manifest-chunks'].broken.join(' ')).toContain('p2')
  })

  it('passes a consistent manifest', () => {
    const rs = byName(
      runRelationsChecks({
        manifest: {
          plenos: [{ plenoId: 'p1', chunkPath: 'pleno-claims/p1.json', itemCount: 2 }],
          totals: { items: 2 },
        },
        chunkFiles: { 'pleno-claims/p1.json': { items: [{}, {}] } },
      }),
    )
    expect(rs['manifest-chunks'].status).toBe('ok')
  })

  it('flags a relation link pointing at an unknown queja or tender', () => {
    const rs = byName(
      runRelationsChecks({
        quejas: { items: [{ service_request_id: 'Q-AAAA1111' }] },
        tenders: { contracts: [{ id: 'c-1' }], tenders: [] },
        relations: {
          links: [
            { quejaId: 'Q-AAAA1111', tenderId: 'c-1' },
            { quejaId: 'Q-MISSING', tenderId: 'c-1' },
          ],
        },
      }),
    )
    expect(rs['relations-quejas-tenders'].status).toBe('broken')
    expect(rs['relations-quejas-tenders'].broken[0]).toContain('Q-MISSING')
  })

  it('flags an approval not present in the relations links', () => {
    const rs = byName(
      runRelationsChecks({
        relations: { links: [{ quejaId: 'Q-A', tenderId: 't-1' }] },
        approvedRelations: {
          approvals: [
            { quejaId: 'Q-A', tenderId: 't-1' },
            { quejaId: 'Q-A', tenderId: 't-999' },
          ],
        },
      }),
    )
    expect(rs['approved-relations'].status).toBe('broken')
    expect(rs['approved-relations'].broken[0]).toContain('t-999')
  })

  it('treats stale overlay ids as warn-level, not error', () => {
    const rs = byName(
      runRelationsChecks({
        verified: { items: [{ claim: { id: 'live' } }] },
        overlay: { entries: { live: {}, stale: {} } },
      }),
    )
    expect(rs['overlay-verified'].status).toBe('broken')
    expect(rs['overlay-verified'].level).toBe('warn')
    expect(rs['overlay-verified'].broken[0]).toContain('stale')
  })

  it('flags votes whose plenoId resolves nowhere (plenos ∪ manifest)', () => {
    const rs = byName(
      runRelationsChecks({
        plenos: { items: [{ id: 'known' }] },
        manifest: {
          plenos: [{ plenoId: 'chunked', chunkPath: 'x', itemCount: 0 }],
          totals: { items: 0 },
        },
        chunkFiles: { x: { items: [] } },
        votes: {
          items: [
            { id: 'known-01', plenoId: 'known' },
            { id: 'chunked-02', plenoId: 'chunked' },
            { id: 'ghost-03', plenoId: 'ghost' },
          ],
        },
      }),
    )
    expect(rs['votes-plenos'].status).toBe('broken')
    expect(rs['votes-plenos'].broken[0]).toContain('ghost')
  })

  it('flags promise-suggestions pointing at unknown promises and bad dept slugs', () => {
    const rs = byName(
      runRelationsChecks({
        promises: { items: [{ id: 'pr-1', departmentSlug: 'not-a-dept' }] },
        promiseSuggestions: { suggestions: [{ promiseId: 'pr-1' }, { promiseId: 'pr-404' }] },
      }),
    )
    expect(rs['suggestions-promises'].status).toBe('broken')
    expect(rs['suggestions-promises'].broken[0]).toContain('pr-404')
    expect(rs['promises-dept-slugs'].status).toBe('broken')
    expect(rs['promises-dept-slugs'].broken[0]).toContain('not-a-dept')
  })

  it('flags findings citing unknown promises', () => {
    const rs = byName(
      runRelationsChecks({
        promises: { items: [{ id: 'pr-1' }] },
        findings: {
          items: [{ id: 'f1', sourceClaimIds: [], relatedPromiseIds: ['pr-1', 'pr-X'] }],
        },
        verified: { items: [] },
      }),
    )
    expect(rs['findings-promises'].status).toBe('broken')
    expect(rs['findings-promises'].broken[0]).toContain('pr-X')
  })

  it('warns on votes without a matching agenda item and dedicaciones slug drift', () => {
    const rs = byName(
      runRelationsChecks({
        votes: { items: [{ id: 'p1-03', plenoId: 'p1', itemNumber: 3 }] },
        agendas: { plenos: [{ id: 'p1', agenda: [{ number: 1 }] }] },
        dedicaciones: { byOfficial: [{ slug: 'someone-unknown' }] },
        officials: { officials: [{ slug: 'robert-raga-gadea' }] },
      }),
    )
    expect(rs['votes-agendas'].status).toBe('broken')
    expect(rs['votes-agendas'].level).toBe('warn')
    expect(rs['dedicaciones-officials'].status).toBe('broken')
    expect(rs['dedicaciones-officials'].level).toBe('warn')
  })
})

describe('entity registry checks', () => {
  it('flags a company citing an unknown contractId (error level)', () => {
    const rs = byName(
      runRelationsChecks({
        tenders: { contracts: [{ id: 'c-1' }], tenders: [] },
        entities: {
          companies: [{ id: 'co-x', nameKey: 'acme sl', contractIds: ['c-1', 'c-GONE'] }],
        },
      }),
    )
    expect(rs['entities-contracts'].status).toBe('broken')
    expect(rs['entities-contracts'].level).toBe('error')
    expect(rs['entities-contracts'].broken[0]).toContain('c-GONE')
  })

  it('passes a clean registry and skips without inputs', () => {
    const clean = byName(
      runRelationsChecks({
        tenders: { contracts: [{ id: 'c-1' }], tenders: [] },
        entities: { companies: [{ id: 'co-x', nameKey: 'acme sl', contractIds: ['c-1'] }] },
      }),
    )
    expect(clean['entities-contracts'].status).toBe('ok')
    expect(byName(runRelationsChecks({}))['entities-contracts'].status).toBe('skipped')
  })

  it('warns on stale alias keys (variant no longer among razones sociales, canonical gone)', () => {
    const rs = byName(
      runRelationsChecks({
        entities: {
          companies: [
            {
              id: 'co-x',
              nameKey: 'acme sl',
              // raw variants normalize to 'acme sl' and 'acme comercial sl'
              variants: ['ACME, S.L.', 'ACME COMERCIAL SL'],
              contractIds: [],
            },
          ],
        },
        entityOverrides: {
          aliases: [
            // LIVE alias: variant still present among raw variants, canonical exists
            { variantKey: 'acme comercial sl', canonicalKey: 'acme sl' },
            // STALE alias: no current razón social normalizes to 'ghost co'
            { variantKey: 'ghost co', canonicalKey: 'acme sl' },
          ],
        },
      }),
    )
    expect(rs['entity-overrides-keys'].status).toBe('broken')
    expect(rs['entity-overrides-keys'].level).toBe('warn')
    expect(rs['entity-overrides-keys'].broken).toHaveLength(1)
    expect(rs['entity-overrides-keys'].broken[0]).toContain('ghost co')
  })
})
