/**
 * The guard on the press-side twin of the `corroboration[]` defect.
 *
 * `press-findings.json` carried a field called `corroboration[]` that
 * `press-auto-curate.composeFinding` filled with EVERY verifier evidence ref
 * for the bundled claims — agreeing or not — while hard-coding
 * `contradiction: []`. Identical to the pleno defect fixed in 339fc58, and
 * caught before it could accumulate data: the file holds 0 items, so nothing
 * published ever carried the wrong name.
 *
 * That emptiness is also the hazard these tests are written against. Every
 * row-level assertion over `press-findings.json` passes vacuously today, so
 * each block below states how many rows it examined, and the published-file
 * block fault-injects the failure it claims to catch before claiming the file
 * is clean. The repo has shipped two suites that were green while measuring
 * nothing.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  evidenceStance,
  EVIDENCE_STANCES,
  type ClaimEvidence,
} from '../../src/scraper/claim-verifier'
import { verifyPressClaim } from '../../src/scraper/press-verifier'
import type { PressClaim } from '../../src/scraper/press-claim'
import {
  selectBundles,
  composeFinding,
  type VerifiedPressItem,
} from '../../src/scraper/press-auto-curate'
import { validatePressFindingsSnapshot, type PressFinding } from '../../src/scraper/press-finding'

// ─── fixtures ──────────────────────────────────────────────────────────────

function mkClaim(over: Partial<PressClaim> = {}): PressClaim {
  return {
    id: 'a-001-0-num',
    articleId: 'a-001',
    articleFingerprint: 'fp-001',
    articleSource: 'Test Outlet',
    articleSourceHost: 'example.test',
    articleUrl: 'https://example.test/articles/001',
    articleDate: '2026-05-20T10:00:00.000Z',
    segmentIndex: 0,
    segmentKind: 'title',
    type: 'afirmacion_numerica',
    attributedSource: 'municipal',
    verbatim: 'Riba-roja invierte 185.000 € en el parque del Túria',
    context: '',
    topic: 'medio-ambiente',
    entities: { amountEuros: 185000, referencedEntity: 'parque del túria' },
    confidence: 0.85,
    reasoning: 'numeric headline',
    requiresHumanApproval: true,
    ...over,
  }
}

const ev = (over: Partial<ClaimEvidence> = {}): ClaimEvidence => ({
  kind: 'tender',
  ref: 'https://example.test/tender/pmus',
  snippet: 'Plan de Movilidad Urbana Sostenible (PMUS) de Riba-roja de Túria · 61.000 €',
  similarity: 0.68,
  ...over,
})

function mkItem(evidence: ClaimEvidence[], over: Partial<PressClaim> = {}): VerifiedPressItem {
  const claim = mkClaim(over)
  return {
    claim,
    verification: {
      claimId: claim.id,
      verdict: 'parcial',
      summary: 'resumen del verificador',
      evidence,
      checkedAgainst: ['tenders'],
      articleUrl: claim.articleUrl,
      articleSource: claim.articleSource,
      articleSourceHost: claim.articleSourceHost,
      articleFingerprint: claim.articleFingerprint,
    },
  }
}

/** Compose one finding from a single bundle carrying `evidence`. */
function compose(evidence: ClaimEvidence[]): PressFinding {
  const item = mkItem(evidence)
  return composeFinding({
    bundle: {
      fingerprint: 'fp-001',
      articleIds: [item.claim.articleId],
      attributedOutlets: [item.claim.articleSource],
      topic: item.claim.topic,
      items: [item],
      verdictMix: {
        verificado: 0,
        parcial: 1,
        contradicho: 0,
        'sin-datos': 0,
        'promesa-repetida': 0,
      },
      score: 1.8,
      earliestDate: '2026-05-19',
      latestDate: '2026-05-20',
    },
    publishedAt: '2026-08-05',
  })
}

// ─── the press-only verifier paths record the signal ───────────────────────

describe('verifyPressClaim records a stance on every evidence row it emits', () => {
  // The three families that do NOT delegate to claim-verifier.ts and so had
  // no stance of their own: padrón/paro, third-party fact-checks, BOE.
  const cases: Array<{ name: string; run: () => ClaimEvidence[] }> = [
    {
      name: 'padrón INE',
      run: () =>
        verifyPressClaim({
          claim: mkClaim({
            type: 'dato_municipal',
            verbatim: 'Riba-roja supera ya los 24.600 habitantes según el último padrón',
            entities: { count: 24600, countUnit: 'habitantes', referencedEntity: 'padrón INE' },
            topic: 'demografia',
          }),
          padron: { items: [{ year: 2025, total: 24616 }] },
        }).evidence,
    },
    {
      name: 'paro SEPE',
      run: () =>
        verifyPressClaim({
          claim: mkClaim({
            type: 'dato_municipal',
            verbatim: 'El paro registrado en Riba-roja se sitúa en 1.250 personas',
            entities: { count: 1250, countUnit: 'personas', referencedEntity: 'paro registrado' },
            topic: 'empleo',
          }),
          paro: { items: [{ month: '2026-03', total: 1247 }] },
        }).evidence,
    },
    {
      name: 'fact-check de tercero',
      run: () =>
        verifyPressClaim({
          claim: mkClaim({
            verbatim: 'Riba-roja invertirá 50 millones de euros en el parque del Túria',
          }),
          tenders: { contracts: [] },
          factchecks: [
            {
              id: 'fc-newtral-1',
              claim: 'Riba-roja invertirá 50 millones de euros en el parque del Túria',
              claimant: null,
              claimDate: null,
              reviewerName: 'Newtral',
              reviewerSite: 'newtral.es',
              reviewTitle: 'No es cierto que Riba-roja invertirá 50 millones',
              reviewUrl: 'https://www.newtral.es/riba-roja-fake-claim/20260201/',
              reviewDate: '2026-02-01',
              verdict: 'Falso',
              normalizedVerdict: 'contradicho' as const,
              languageCode: 'es',
            },
          ],
        }).evidence.filter((e) => e.kind === 'factcheck'),
    },
    {
      name: 'BOE',
      run: () =>
        verifyPressClaim({
          claim: mkClaim({
            verbatim:
              'El ayuntamiento aprueba una subvención nominativa para el conservatorio municipal',
            entities: { referencedEntity: 'conservatorio municipal' },
          }),
          tenders: { contracts: [] },
          boe: [
            {
              id: 'boe-001',
              identificador: 'BOE-A-2026-00001',
              publicacionDate: '2026-03-01T00:00:00.000Z',
              departamento: 'Ayuntamiento de Riba-roja de Túria',
              seccion: 'III. Otras disposiciones',
              epigrafe: 'Subvenciones',
              titulo:
                'Resolución por la que se publica la subvención nominativa concedida al conservatorio municipal del ayuntamiento',
              urlHtml: 'https://boe.es/diario_boe/txt.php?id=BOE-A-2026-00001',
              urlPdf: 'https://boe.es/boe/dias/2026/03/01/pdfs/BOE-A-2026-00001.pdf',
            },
          ],
        }).evidence.filter((e) => e.kind === 'boe'),
    },
  ]

  it('classifies every row the press-only paths emit — no row is left to guess', () => {
    let examined = 0
    for (const c of cases) {
      const rows = c.run()
      // Guard the guard, per path: a path that emitted nothing would let the
      // loop below "pass" without checking a single row.
      expect(rows.length, `${c.name} emitted no evidence rows`).toBeGreaterThan(0)
      for (const r of rows) {
        expect(EVIDENCE_STANCES, `${c.name}: ${r.ref} carries no stance the enum knows`).toContain(
          r.stance,
        )
        examined += 1
      }
    }
    expect(examined).toBeGreaterThanOrEqual(cases.length)
  })

  it('never marks a press-only row as contradicting, including a "Falso" fact-check', () => {
    // The directional judgement in a fact-check is the third party's; our
    // match is token overlap, and contradiction[] gates severity=critical
    // about a NAMED outlet. Where the fact-checker's disagreement takes
    // effect is the verdict, not the ref.
    let examined = 0
    for (const c of cases) {
      for (const r of c.run()) {
        expect(evidenceStance(r), `${c.name}: ${r.ref}`).toBe('checked')
        examined += 1
      }
    }
    expect(examined).toBeGreaterThan(0)
  })
})

// ─── the composer cannot upgrade an unclassified ref ───────────────────────

describe('press composeFinding buckets refs by the recorded stance only', () => {
  it('routes a contradicting ref to contradiction[] and nowhere else', () => {
    const f = compose([ev({ stance: 'contradicts' })])
    expect(f.contradiction).toHaveLength(1)
    expect(f.crossChecked).toHaveLength(0)
  })

  it('routes a checked ref to crossChecked[]', () => {
    const f = compose([ev({ stance: 'checked' })])
    expect(f.crossChecked).toHaveLength(1)
    expect(f.contradiction).toHaveLength(0)
  })

  it('treats a ref with NO stance as checked — a snapshot written before the field existed', () => {
    const legacy = ev()
    delete legacy.stance
    const f = compose([legacy])
    expect(f.crossChecked).toHaveLength(1)
    expect(f.contradiction).toHaveLength(0)
  })

  it('treats an unrecognised stance as checked rather than trusting it', () => {
    // Asserted on evidenceStance() itself and not only on where the ref
    // lands: a downstream `=== 'contradicts'` would file `corroborates`
    // correctly by accident while still handing it back to anyone who asks.
    for (const bogus of ['corroborates', 'CONTRADICTS', '', 'true']) {
      const stance = evidenceStance({ stance: bogus })
      expect(EVIDENCE_STANCES, `evidenceStance returned «${stance}» for «${bogus}»`).toContain(
        stance,
      )
      expect(stance).toBe('checked')
    }
    const f = compose([ev({ stance: 'corroborates' as unknown as ClaimEvidence['stance'] })])
    expect(f.crossChecked).toHaveLength(1)
    expect(f.contradiction).toHaveLength(0)
  })

  it('emits no field named corroboration at all', () => {
    const f = compose([ev({ stance: 'checked' })])
    expect(Object.keys(f)).not.toContain('corroboration')
    expect(Object.keys(f)).toContain('crossChecked')
  })

  it('never files verifier output under a curator-only ref kind', () => {
    // `document` / `press` / `transcript` mean "a curator attached this".
    // Factcheck and BOE rows used to fall through to `document`.
    const f = compose([
      ev({ kind: 'factcheck', ref: 'https://newtral.es/x', stance: 'checked' }),
      ev({ kind: 'boe', ref: 'https://boe.es/x', stance: 'checked' }),
    ])
    expect(f.crossChecked).toHaveLength(2)
    expect(f.crossChecked.map((r) => r.kind).sort()).toEqual(['boe', 'factcheck'])
  })
})

// ─── the schema is the second layer ────────────────────────────────────────

const SNAP_HEAD = {
  version: '1',
  generatedAt: '2026-08-05',
  legalNotice: 'Aviso legal de prueba con longitud suficiente para el validador del schema.',
  contactUrl: 'https://github.com/datarhan/civicpulse/issues',
  methodologyUrl: '/metodologia#laboratorio-prensa',
}

function snapWith(over: Partial<PressFinding>): string {
  const base = compose([ev({ stance: 'checked' })])
  return JSON.stringify({ ...SNAP_HEAD, items: [{ ...base, ...over }] })
}

describe('validatePressFindingsSnapshot', () => {
  it('accepts what composeFinding produces', () => {
    const parsed = validatePressFindingsSnapshot(snapWith({}))
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0].crossChecked).toHaveLength(1)
  })

  it('rejects a row that still carries the old corroboration key', () => {
    const base = compose([ev({ stance: 'checked' })])
    const legacy = { ...base, corroboration: base.crossChecked } as unknown as PressFinding
    expect(() =>
      validatePressFindingsSnapshot(JSON.stringify({ ...SNAP_HEAD, items: [legacy] })),
    ).toThrow(/renamed to `crossChecked`/)
  })

  it('rejects severity=critical backed only by cross-checked documents', () => {
    // /metodologia#laboratorio-prensa has always said a critical finding
    // needs "al menos una referencia de contradicción". The gate accepted a
    // cross-checked ref instead, so the published rule had never been met.
    expect(() =>
      validatePressFindingsSnapshot(snapWith({ severity: 'critical', contradiction: [] })),
    ).toThrow(/severity=critical requires ≥1 contradiction ref/)
  })

  it('accepts severity=critical with a contradiction ref', () => {
    expect(() =>
      validatePressFindingsSnapshot(
        snapWith({
          severity: 'critical',
          contradiction: [
            {
              kind: 'tender',
              ref: 'https://example.test/tender/pmus',
              snippet: 'El contrato sigue abierto en PLACSP · expediente 2025-042.',
            },
          ],
        }),
      ),
    ).not.toThrow()
  })
})

// ─── the published file ────────────────────────────────────────────────────

describe('published press-findings.json', () => {
  const path = resolve('public/data/press-findings.json')
  const raw = readFileSync(path, 'utf8')
  const snap = validatePressFindingsSnapshot(raw)

  it('carries no `corroboration` key — and the check that says so can fail', () => {
    // The file holds 0 items today, so a per-row loop proves nothing. The
    // byte-level check runs regardless; fault-inject the defect first so
    // "no match" means the matcher looked, not that it cannot fire.
    const OLD_KEY = /"corroboration"\s*:/
    const injected = JSON.stringify({
      ...SNAP_HEAD,
      items: [{ ...compose([ev({ stance: 'checked' })]), corroboration: [] }],
    })
    expect(OLD_KEY.test(injected), 'the guard cannot detect the key it guards against').toBe(true)

    expect(raw.length).toBeGreaterThan(0)
    expect(OLD_KEY.test(raw)).toBe(false)

    // And the row-level check for when the file stops being empty. The count
    // is reported so a reader of a green run knows what it covered.
    for (const f of snap.items) {
      expect(Object.keys(f), `${f.id}`).not.toContain('corroboration')
      expect(Array.isArray(f.crossChecked), `${f.id}`).toBe(true)
    }
  })

  it('publishes no critical finding without a contradiction ref', () => {
    const critical = snap.items.filter((f) => f.severity === 'critical')
    for (const f of critical) expect(f.contradiction.length).toBeGreaterThanOrEqual(1)
    // The validator above is what keeps it that way; this only records that
    // nothing in the file evades it.
    expect(critical.length).toBe(0)
  })
})

// ─── end to end, through the real selector ─────────────────────────────────

describe('the auto-curation path end to end', () => {
  it('publishes a cross-checked ref under crossChecked, never as corroboration', () => {
    const items = [
      mkItem([ev({ stance: 'checked' })], {
        id: 'a-1-0',
        articleId: 'a-1',
        articleFingerprint: 'fp-a',
        articleSource: 'A',
      }),
      mkItem([ev({ ref: 'https://example.test/tender/other', stance: 'checked' })], {
        id: 'a-2-0',
        articleId: 'a-2',
        articleFingerprint: 'fp-b',
        articleSource: 'B',
      }),
    ]
    const r = selectBundles(
      items,
      {},
      new Map([
        ['a-1', 'a-1+a-2'],
        ['a-2', 'a-1+a-2'],
      ]),
    )
    expect(r.eligible).toHaveLength(1)
    const finding = composeFinding({ bundle: r.eligible[0], publishedAt: '2026-08-05' })
    expect(finding.crossChecked).toHaveLength(2)
    expect(finding.contradiction).toHaveLength(0)
    const parsed = validatePressFindingsSnapshot(JSON.stringify({ ...SNAP_HEAD, items: [finding] }))
    expect(parsed.items[0].crossChecked).toHaveLength(2)
  })
})
