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

  describe('findings-crosschecked-tenders', () => {
    const tenders = {
      contracts: [{ id: 1, permalink: 'https://contrataciondelestado.es/x?idEvl=AAA' }],
      tenders: [{ id: 2, permalink: 'https://contrataciondelestado.es/x?idEvl=BBB' }],
    }

    it('flags a cross-checked tender absent from the published corpus', () => {
      const rs = byName(
        runRelationsChecks({
          tenders,
          findings: {
            items: [
              {
                id: 'f1',
                crossChecked: [
                  { kind: 'tender', ref: 'https://contrataciondelestado.es/x?idEvl=AAA' },
                  { kind: 'tender', ref: 'https://contrataciondelestado.es/x?idEvl=GONE' },
                ],
              },
            ],
          },
        }),
      )
      expect(rs['findings-crosschecked-tenders'].status).toBe('broken')
      expect(rs['findings-crosschecked-tenders'].level).toBe('error')
      expect(rs['findings-crosschecked-tenders'].checked).toBe(2)
      expect(rs['findings-crosschecked-tenders'].broken[0]).toContain('GONE')
    })

    it('passes when every tender ref resolves, matching against both arrays', () => {
      const rs = byName(
        runRelationsChecks({
          tenders,
          findings: {
            items: [
              {
                id: 'f1',
                crossChecked: [
                  { kind: 'tender', ref: 'https://contrataciondelestado.es/x?idEvl=AAA' },
                  { kind: 'tender', ref: 'https://contrataciondelestado.es/x?idEvl=BBB' },
                ],
              },
            ],
          },
        }),
      )
      expect(rs['findings-crosschecked-tenders'].status).toBe('ok')
      expect(rs['findings-crosschecked-tenders'].checked).toBe(2)
    })

    /**
     * The check must not claim coverage it does not have. A finding carrying
     * only kinds with no permalink corpus verified NOTHING, and `empty` is the
     * only honest report — an `ok` here would be the green-while-measuring-
     * nothing failure this repo keeps finding.
     */
    it('reports empty — not ok — when no ref is of a joinable kind', () => {
      const rs = byName(
        runRelationsChecks({
          tenders,
          findings: {
            items: [
              {
                id: 'f1',
                crossChecked: [
                  { kind: 'pleno-video', ref: 'https://www.youtube.com/watch?v=zzz' },
                  { kind: 'document', ref: 'https://example.org/informe.pdf' },
                  { kind: 'bdns', ref: 'bdns:123' },
                ],
              },
            ],
          },
        }),
      )
      expect(rs['findings-crosschecked-tenders'].status).toBe('empty')
      expect(rs['findings-crosschecked-tenders'].checked).toBe(0)
    })
  })

  describe('findings-crosschecked-video', () => {
    const videos = {
      items: [
        { url: 'https://www.youtube.com/watch?v=AAA', plenoDate: '2026-07-06' },
        { url: 'https://www.youtube.com/watch?v=BBB', plenoDate: '2026-07-27' },
      ],
    }

    it('warns — never errors — on a video outside the channel window', () => {
      const rs = byName(
        runRelationsChecks({
          videos,
          findings: {
            items: [
              {
                id: 'f1',
                plenoDate: '2026-07-03',
                crossChecked: [{ kind: 'pleno-video', ref: 'https://www.youtube.com/watch?v=OLD' }],
              },
            ],
          },
        }),
      )
      expect(rs['findings-crosschecked-video'].status).toBe('broken')
      expect(rs['findings-crosschecked-video'].level).toBe('warn')
      expect(rs['findings-crosschecked-video'].broken[0]).toContain('outside the channel window')
    })

    it("flags a finding citing another session's recording", () => {
      const rs = byName(
        runRelationsChecks({
          videos,
          findings: {
            items: [
              {
                id: 'f1',
                plenoDate: '2026-07-06',
                crossChecked: [{ kind: 'pleno-video', ref: 'https://www.youtube.com/watch?v=BBB' }],
              },
            ],
          },
        }),
      )
      expect(rs['findings-crosschecked-video'].status).toBe('broken')
      expect(rs['findings-crosschecked-video'].broken[0]).toContain('cites the video of 2026-07-27')
    })

    it('passes when the recording matches the session date', () => {
      const rs = byName(
        runRelationsChecks({
          videos,
          findings: {
            items: [
              {
                id: 'f1',
                plenoDate: '2026-07-06',
                crossChecked: [{ kind: 'pleno-video', ref: 'https://www.youtube.com/watch?v=AAA' }],
              },
            ],
          },
        }),
      )
      expect(rs['findings-crosschecked-video'].status).toBe('ok')
      expect(rs['findings-crosschecked-video'].checked).toBe(1)
    })
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

describe('relations-check — officials hub', () => {
  const officials = { officials: [{ slug: 'robert-raga-gadea' }] }

  it('flags a queja routed to a councillor who does not exist', () => {
    const r = runRelationsChecks({
      officials,
      quejas: { items: [{ service_request_id: 'Q-1', concejal_slug: 'ghost-slug' }] },
    } as never).find((x) => x.name === 'quejas-officials')
    expect(r?.status).toBe('broken')
    expect(r?.broken[0]).toContain('ghost-slug')
  })

  it('flags a social account filed under an unknown slug', () => {
    const r = runRelationsChecks({
      officials,
      social: { accounts: [{ slug: 'ghost-slug', platform: 'instagram' }] },
    } as never).find((x) => x.name === 'social-officials')
    expect(r?.status).toBe('broken')
  })

  it('flags a biography assignment for a non-existent official', () => {
    const r = runRelationsChecks({
      officials,
      assignments: { items: [{ id: 'a-1', subject: { slug: 'ghost-slug', kind: 'official' } }] },
    } as never).find((x) => x.name === 'assignments-officials')
    expect(r?.status).toBe('broken')
  })

  it('passes when every slug resolves', () => {
    const res = runRelationsChecks({
      officials,
      quejas: { items: [{ service_request_id: 'Q-1', concejal_slug: 'robert-raga-gadea' }] },
      social: { accounts: [{ slug: 'robert-raga-gadea', platform: 'x' }] },
    } as never)
    expect(res.find((x) => x.name === 'quejas-officials')?.status).toBe('ok')
    expect(res.find((x) => x.name === 'social-officials')?.status).toBe('ok')
  })

  it('reports a check with no references as empty, not ok', () => {
    // Three checks sat permanently at 0 refs while printing [ok], so a green
    // summary implied coverage that did not exist.
    const r = runRelationsChecks({ officials, social: { accounts: [] } } as never).find(
      (x) => x.name === 'social-officials',
    )
    expect(r?.status).toBe('empty')
  })
})

describe('relations-check — encaje declarado', () => {
  const cited = { label: 'Grado en Derecho', sourceIds: ['src-1'] }
  const reports = {
    items: [{ id: 'r-1', sources: [{ id: 'src-1' }], warnings: ['El CV no cita el año.'] }],
  }
  const row = (
    formacion: unknown,
    experiencia: unknown = { value: 'no-consta', evidence: [] },
  ) => ({
    rows: [
      {
        officialSlug: 'robert-raga-gadea',
        portfolio: 'Hacienda',
        reportId: 'r-1',
        formacion,
        experiencia,
      },
    ],
  })

  it('flags an assessment that cites evidence and carries no respaldo', () => {
    const r = runRelationsChecks({
      areaFit: row({ value: 'relacionada', evidence: [cited] }),
    } as never).find((x) => x.name === 'areafit-respaldo-classified')
    expect(r?.status).toBe('broken')
    expect(r?.level).toBe('error')
    expect(r?.broken[0]).toContain('formacion')
  })

  it('flags a respaldo nobody classified — «0 corroboradas» and «nobody looked» must not look alike', () => {
    const r = runRelationsChecks({
      areaFit: row({ value: 'relacionada', evidence: [cited], respaldo: 'sin-clasificar' }),
    } as never).find((x) => x.name === 'areafit-respaldo-classified')
    expect(r?.status).toBe('broken')
    expect(r?.broken[0]).toContain('sin-clasificar')
  })

  it('flags a respaldo outside the enum, which renders as no backing line at all', () => {
    const r = runRelationsChecks({
      areaFit: row({ value: 'relacionada', evidence: [cited], respaldo: 'verificada' }),
    } as never).find((x) => x.name === 'areafit-respaldo-classified')
    expect(r?.status).toBe('broken')
    expect(r?.broken[0]).toContain('verificada')
  })

  it('does NOT demand a respaldo from an assessment that cites nothing', () => {
    // By design: there is no citation whose backing could be described, and a
    // gate demanding one would make most published rows unpublishable.
    const r = runRelationsChecks({
      areaFit: row(
        { value: 'relacionada', evidence: [cited], respaldo: 'autodeclarada' },
        { value: 'sin-relacion-declarada', evidence: [] },
      ),
    } as never).find((x) => x.name === 'areafit-respaldo-classified')
    expect(r?.status).toBe('ok')
    expect(r?.checked).toBe(1)
  })

  it('reports empty, not ok, when no assessment cites anything', () => {
    const r = runRelationsChecks({
      areaFit: row({ value: 'no-consta', evidence: [] }),
    } as never).find((x) => x.name === 'areafit-respaldo-classified')
    expect(r?.status).toBe('empty')
  })

  it('flags a stored «corroborada» whose cited sources are all the subject’s own', () => {
    // The dangerous direction: the card would say an independent source backs
    // this, about a named councillor, while every source behind it is his CV.
    const r = runRelationsChecks({
      reports: { items: [{ id: 'r-1', sources: [{ id: 'src-1', selfDeclared: true }] }] },
      areaFit: row({ value: 'relacionada', evidence: [cited], respaldo: 'corroborada' }),
    } as never).find((x) => x.name === 'areafit-respaldo-derived')
    expect(r?.status).toBe('broken')
    expect(r?.level).toBe('error')
    expect(r?.broken[0]).toContain('robert-raga-gadea')
    expect(r?.broken[0]).toContain('Hacienda')
    expect(r?.broken[0]).toContain('corroborada')
    expect(r?.broken[0]).toContain('autodeclarada')
  })

  it('flags the understating direction too — a stale value is stale either way', () => {
    const r = runRelationsChecks({
      reports: { items: [{ id: 'r-1', sources: [{ id: 'src-1', selfDeclared: false }] }] },
      areaFit: row({ value: 'relacionada', evidence: [cited], respaldo: 'autodeclarada' }),
    } as never).find((x) => x.name === 'areafit-respaldo-derived')
    expect(r?.status).toBe('broken')
  })

  it('passes when the stored respaldo is what the cited sources derive', () => {
    const r = runRelationsChecks({
      reports: { items: [{ id: 'r-1', sources: [{ id: 'src-1', selfDeclared: true }] }] },
      areaFit: row({ value: 'relacionada', evidence: [cited], respaldo: 'autodeclarada' }),
    } as never).find((x) => x.name === 'areafit-respaldo-derived')
    expect(r?.status).toBe('ok')
    expect(r?.checked).toBe(1)
  })

  it('exempts «discrepancia-documentada», which no automation derives', () => {
    const rs = byName(
      runRelationsChecks({
        reports: { items: [{ id: 'r-1', sources: [{ id: 'src-1', selfDeclared: true }] }] },
        areaFit: row(
          { value: 'relacionada', evidence: [cited], respaldo: 'discrepancia-documentada' },
          { value: 'relacionada', evidence: [cited], respaldo: 'autodeclarada' },
        ),
      } as never),
    )
    // The curator's reading survives; the derivable sibling is still measured.
    expect(rs['areafit-respaldo-derived'].status).toBe('ok')
    expect(rs['areafit-respaldo-derived'].checked).toBe(1)
  })

  it('reports empty, not ok, when nothing cites anything to re-derive', () => {
    const r = runRelationsChecks({
      reports: { items: [{ id: 'r-1', sources: [{ id: 'src-1', selfDeclared: true }] }] },
      areaFit: row({ value: 'no-consta', evidence: [] }),
    } as never).find((x) => x.name === 'areafit-respaldo-derived')
    expect(r?.status).toBe('empty')
  })

  it('flags an aviso whose index is outside the report it cites', () => {
    const r = runRelationsChecks({
      reports,
      areaFit: {
        rows: [],
        avisos: [
          { officialSlug: 'robert-raga-gadea', reportId: 'r-1', avisoIndex: 3, verbatim: 'x' },
        ],
      },
    } as never).find((x) => x.name === 'areafit-avisos')
    expect(r?.status).toBe('broken')
    expect(r?.broken[0]).toContain('1 warning')
  })

  it('flags an aviso citing a report that does not exist', () => {
    const r = runRelationsChecks({
      reports,
      areaFit: {
        rows: [],
        avisos: [
          { officialSlug: 'robert-raga-gadea', reportId: 'r-gone', avisoIndex: 0, verbatim: 'x' },
        ],
      },
    } as never).find((x) => x.name === 'areafit-avisos')
    expect(r?.status).toBe('broken')
    expect(r?.broken[0]).toContain('r-gone')
  })

  it('flags an aviso whose verbatim the biography no longer holds at that index', () => {
    // The index stays in range when the warnings list is REORDERED — only the
    // text tells you the quote moved out from under a councillor's name.
    const r = runRelationsChecks({
      reports,
      areaFit: {
        rows: [],
        avisos: [
          {
            officialSlug: 'robert-raga-gadea',
            reportId: 'r-1',
            avisoIndex: 0,
            verbatim: 'Una advertencia que el informe ya no dice.',
          },
        ],
      },
    } as never).find((x) => x.name === 'areafit-avisos')
    expect(r?.status).toBe('broken')
    expect(r?.broken[0]).toContain('verbatim')
  })

  it('passes an aviso that still resolves, and reports empty with none', () => {
    const rs = byName(
      runRelationsChecks({
        reports,
        areaFit: {
          rows: [],
          avisos: [
            {
              officialSlug: 'robert-raga-gadea',
              reportId: 'r-1',
              avisoIndex: 0,
              verbatim: 'El CV no cita el año.',
            },
          ],
        },
      } as never),
    )
    expect(rs['areafit-avisos'].status).toBe('ok')
    expect(rs['areafit-avisos'].checked).toBe(1)
    expect(
      byName(runRelationsChecks({ reports, areaFit: { rows: [] } } as never))['areafit-avisos']
        .status,
    ).toBe('empty')
  })
})

/**
 * The read-side twins of the provenance guard.
 *
 * Both are FAULT-INJECTED here rather than merely run against a clean file. The
 * mistake this whole feature exists to correct is a check that was green over
 * 16 broken rows, and two suites in this repo have already been green while
 * measuring nothing (docs/DATA_INTEGRITY.md). A check nobody has watched fail
 * is not evidence.
 */
describe('relations-check — vote provenance', () => {
  const transcriptRef = {
    kind: 'transcripcion',
    url: '/data/pleno-transcripts/qz6weg.txt',
    verification: 'sin-verificar',
  }
  const regmeetRef = {
    kind: 'regmeet',
    url: 'https://regmeet.com/x',
    verification: 'sin-verificar',
  }
  const tally = [{ bloc: 'PSOE', direction: 'a_favor' }]
  const assets = new Set(['/data/pleno-transcripts/qz6weg.txt'])

  const run = (items: unknown[], publishedAssets: Set<string> | null = assets) =>
    byName(
      runRelationsChecks({
        votes: { items: items as never, retractions: [] },
        publishedAssets,
      }),
    )

  it('passes a row whose breakdown cites a transcript that is in the build', () => {
    // ABLATION for every "broken" case below: this input is the same shape and
    // it passes, so a failure there is the injected fault and not the fixture.
    const rs = run([
      { id: 'a-01', votes: tally, provenance: { outcome: regmeetRef, breakdown: transcriptRef } },
    ])
    expect(rs['votes-breakdown-source'].status).toBe('ok')
    expect(rs['votes-breakdown-source'].checked).toBe(1)
  })

  it('BREAKS at error level when a tally is attributed to regmeet', () => {
    const rs = run([
      { id: 'a-01', votes: tally, provenance: { outcome: regmeetRef, breakdown: regmeetRef } },
    ])
    expect(rs['votes-breakdown-source'].status).toBe('broken')
    expect(rs['votes-breakdown-source'].level).toBe('error')
    expect(rs['votes-breakdown-source'].broken[0]).toMatch(/publishes no per-bloc tally/)
  })

  it('BREAKS when a tally is published with no breakdown source at all', () => {
    // The literal pre-2026-08-05 state of all 17 published rows.
    const rs = run([{ id: 'a-01', votes: tally, provenance: { outcome: regmeetRef } }])
    expect(rs['votes-breakdown-source'].status).toBe('broken')
    expect(rs['votes-breakdown-source'].broken[0]).toMatch(/no breakdown source/)
  })

  it('BREAKS when the cited transcript is not in the build', () => {
    const rs = run(
      [{ id: 'a-01', votes: tally, provenance: { outcome: regmeetRef, breakdown: transcriptRef } }],
      new Set(),
    )
    expect(rs['votes-breakdown-source'].status).toBe('broken')
    expect(rs['votes-breakdown-source'].broken[0]).toMatch(/not in public\//)
  })

  it('reports `empty`, not `ok`, when no row publishes a tally', () => {
    // A withdrawn breakdown leaves nothing to source. A green line there would
    // read as "provenance verified" over zero refs.
    const rs = run([
      { id: 'a-01', votes: [], provenance: { outcome: regmeetRef, breakdown: null } },
    ])
    expect(rs['votes-breakdown-source'].status).toBe('empty')
    expect(rs['votes-breakdown-verified'].status).toBe('empty')
  })

  it('warns — never errors — on a breakdown nobody has cotejado', () => {
    const rs = run([
      { id: 'a-01', votes: tally, provenance: { outcome: regmeetRef, breakdown: transcriptRef } },
    ])
    expect(rs['votes-breakdown-verified'].status).toBe('broken')
    expect(rs['votes-breakdown-verified'].level).toBe('warn')
    expect(rs['votes-breakdown-verified'].checked).toBe(1)
    expect(rs['votes-breakdown-verified'].broken[0]).toMatch(/sin-verificar/)
  })

  it('says the acta is unreachable, not that a curator never got to it', () => {
    // The line this replaces read «never cotejado against the acta», which
    // describes sixteen rows of neglect. Nobody has skipped this work: no acta
    // is fetchable at all (scripts/fetch-pleno-actas.ts is broken four ways
    // against the Aug-2026 portal, and zero actas are cached). A warn that
    // misnames its own cause is a warn that gets dismissed for the wrong reason.
    const rs = run([
      { id: 'a-01', votes: tally, provenance: { outcome: regmeetRef, breakdown: transcriptRef } },
    ])
    const line = rs['votes-breakdown-verified'].broken[0]
    expect(line).toMatch(/unreachable, not unread/)
    expect(line).not.toMatch(/never cotejado/)
  })

  it('goes quiet once a curator has cotejado the breakdown against the acta', () => {
    // Was: flipping `verification` on the transcript ref — the tally's OWN
    // source — turned this green, which is what made the whole check hollow.
    // The positive control now names an independent document.
    const rs = run([
      {
        id: 'a-01',
        votes: tally,
        provenance: {
          outcome: regmeetRef,
          breakdown: {
            ...transcriptRef,
            verification: 'verificado',
            quote: 'tretze vots en contra i huit a favor',
            verifiedBy: 'Curator',
            verifiedAgainst: { kind: 'acta', url: 'https://ribarroja.es/…/acta.pdf' },
          },
        },
      },
    ])
    expect(rs['votes-breakdown-verified'].status).toBe('ok')
    expect(rs['votes-breakdown-verified'].checked).toBe(1)
    expect(rs['votes-breakdown-source'].status).toBe('ok')
  })

  it('BREAKS at error level on a tally "verified" against its own transcript', () => {
    // The exact edit this test file used to assert was fine.
    const rs = run([
      {
        id: 'a-01',
        votes: tally,
        provenance: {
          outcome: regmeetRef,
          breakdown: {
            ...transcriptRef,
            verification: 'verificado',
            quote: 'tretze vots en contra i huit a favor',
            verifiedBy: 'Curator',
            verifiedAgainst: { kind: 'transcripcion', url: transcriptRef.url },
          },
        },
      },
    ])
    expect(rs['votes-breakdown-source'].status).toBe('broken')
    expect(rs['votes-breakdown-source'].level).toBe('error')
    expect(rs['votes-breakdown-source'].broken[0]).toMatch(
      /not independent of the transcripcion the tally came from/,
    )
  })

  it('keeps counting a self-verified row as unverified — the count never goes silent', () => {
    // If the warn had kept asking `verification === 'verificado'`, the row above
    // would have dropped out of the unverified tally at the same moment it
    // became a defect: the number on /datos would fall while the site got less
    // trustworthy.
    const rs = run([
      {
        id: 'a-01',
        votes: tally,
        provenance: {
          outcome: regmeetRef,
          breakdown: {
            ...transcriptRef,
            verification: 'verificado',
            verifiedAgainst: { kind: 'transcripcion', url: transcriptRef.url },
          },
        },
      },
    ])
    expect(rs['votes-breakdown-verified'].status).toBe('broken')
    expect(rs['votes-breakdown-verified'].checked).toBe(1)
    expect(rs['votes-breakdown-verified'].broken[0]).toMatch(
      /claims verificado without an independent source/,
    )
  })

  it('BREAKS at error level when "verificado" names no document at all', () => {
    const rs = run([
      {
        id: 'a-01',
        votes: tally,
        provenance: {
          outcome: regmeetRef,
          breakdown: { ...transcriptRef, verification: 'verificado' },
        },
      },
    ])
    expect(rs['votes-breakdown-source'].status).toBe('broken')
    expect(rs['votes-breakdown-source'].broken[0]).toMatch(/names no verifiedAgainst/)
  })
})

describe('portrait-officials', () => {
  // Two councillors, and the ONE fact that makes this check discriminate:
  // «Comercio» is Hernández's área today. Ramos held it in 2023 and no longer
  // does — his own biography says so in its body text.
  const officials = {
    officials: [
      {
        slug: 'jose-angel-hernandez-carrizosa',
        portfolios: ['Fomento económico', 'Empleo y Emprendimiento', 'Comercio'],
      },
      {
        slug: 'jose-luis-ramos-march',
        portfolios: ['Agenda 2030', 'Actividades', 'Edificios públicos'],
      },
    ],
  }
  const portrait = (officialSlug: string, portfolios: string[]) => ({
    kind: 'portrait',
    payload: { officialSlug, portfolios },
  })
  const run = (id: string, sections: ReturnType<typeof portrait>[]) =>
    byName(runRelationsChecks({ officials, reports: { items: [{ id, sections }] } }))[
      'portrait-officials'
    ]

  it('flags an área that only becomes real once the list conjunction is dropped', () => {
    const r = run('r-jah', [
      portrait('jose-angel-hernandez-carrizosa', ['Fomento económico', 'y Comercio']),
    ])
    expect(r.status).toBe('broken')
    expect(r.level).toBe('error')
    expect(r.checked).toBe(3) // the portrait itself + its two áreas
    expect(r.broken).toHaveLength(1)
    expect(r.broken[0]).toContain('«y Comercio»')
    expect(r.broken[0]).toContain('«Comercio»')
    expect(r.broken[0]).toContain('officials.json le atribuye hoy')
  })

  it('POSITIVE CONTROL — silent on a delegation that legitimately moved on', () => {
    // Ramos' portrait was seeded in July 2023, when the decreto de áreas gave
    // him Comercio; the register files him elsewhere now. A roster-equality
    // predicate would red on this forever for an entirely honest reason, which
    // is the "permanently-red check everybody skips" failure this repo has hit.
    // The assertion that matters is the pair: nothing broken, AND it looked.
    const r = run('r-jlr', [portrait('jose-luis-ramos-march', ['Agenda 2030', 'Comercio'])])
    expect(r.broken).toEqual([])
    expect(r.checked).toBe(3)
    expect(r.status).toBe('ok')
  })

  it('keeps an área whose own name contains « y » whole', () => {
    // Only a LEADING conjunction is a list artifact. A greedier rule would
    // rename "Empleo y Emprendimiento" to "Emprendimiento" and invent an área.
    const r = run('r-jah', [
      portrait('jose-angel-hernandez-carrizosa', ['Empleo y Emprendimiento']),
    ])
    expect(r.status).toBe('ok')
    expect(r.checked).toBe(2)
  })

  it('flags a portrait printed under a slug the roster does not know', () => {
    const r = run('r-ghost', [portrait('quien-sea', ['Comercio'])])
    expect(r.status).toBe('broken')
    expect(r.level).toBe('error')
    expect(r.broken[0]).toContain('quien-sea')
    // The áreas of an unknown official are not judged: the slug is the defect.
    expect(r.checked).toBe(1)
  })

  it('names the área as absent when the stripped form is nobody’s', () => {
    const r = run('r-jah', [portrait('jose-angel-hernandez-carrizosa', ['y Turismo'])])
    expect(r.status).toBe('broken')
    expect(r.broken[0]).toContain('hoy no figura entre sus áreas')
  })

  it('reports empty — never ok — when no report carries a portrait', () => {
    const r = byName(
      runRelationsChecks({
        officials,
        reports: { items: [{ id: 'r-x', sections: [{ kind: 'narrative', payload: {} }] }] },
      }),
    )['portrait-officials']
    expect(r.status).toBe('empty')
    expect(r.checked).toBe(0)
  })

  it('reports skipped — never ok — when officials.json is absent', () => {
    const r = byName(
      runRelationsChecks({
        reports: {
          items: [{ id: 'r-jah', sections: [portrait('quien-sea', ['y Comercio'])] }],
        },
      }),
    )['portrait-officials']
    expect(r.status).toBe('skipped')
  })
})
