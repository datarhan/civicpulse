import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  computeLegalSensitivity,
  isHighSensitivity,
  validateDraftsSnapshot,
  validateReportsSnapshot,
  JournalistValidationError,
} from '../src/scraper/journalist'
import { JournalistPlanResponseSchema } from '../src/llm/schemas'
import { exportSoulMarkdown } from '../src/scraper/journalist-soul-export'

// Regression tests for the four defects fixed during the journalist-agent
// refactor. These guard the libel-material behaviour that the decomposition
// must never silently change.

const ISO = '2026-06-03T10:00:00.000Z'

const draftSnapshot = (overrides: Record<string, unknown>) =>
  JSON.stringify({
    version: '1.0',
    generatedAt: ISO,
    items: [
      {
        id: 'r-x-2026-06-03',
        assignmentId: 'a-x',
        generatedAt: ISO,
        agentVersion: 'journalist-v1',
        promptVersion: 'plan=journalist-plan-v3',
        budgetTokens: 1000,
        costUSD: 0.01,
        sections: [],
        sources: [],
        warnings: [],
        legalSensitivity: 'low',
        requiresHumanApproval: true,
        ...overrides,
      },
    ],
  })

// ─── Defect #1 — plan-tool enum reachability ────────────────────────────────

describe('defect #1 — JournalistPlanResponseSchema tool reachability', () => {
  const PREVIOUSLY_UNREACHABLE = [
    'pdf-fetch',
    'headless-fetch',
    'boe-search',
    'dogv-search',
    'dialnet-search',
    'hemeroteca-search',
  ] as const

  it('accepts the 6 external tools the dispatch switch handles', () => {
    for (const tool of PREVIOUSLY_UNREACHABLE) {
      const parsed = JournalistPlanResponseSchema.safeParse({
        questions: [
          {
            id: 'q_doc',
            question: '¿Existe documentación pública sobre el cargo del sujeto?',
            suggestedTool: tool,
            queryHint: null,
            rationale: 'cross-check the public record',
          },
        ],
        notes: null,
      })
      expect(parsed.success, tool).toBe(true)
    }
  })

  it('still accepts the original local + whitelist tools', () => {
    for (const tool of ['local-snapshot', 'wikidata', 'web-search', 'fetch-url', 'audit-url']) {
      const parsed = JournalistPlanResponseSchema.safeParse({
        questions: [
          {
            id: 'q_t',
            question: '¿Pregunta de prueba sobre el sujeto?',
            suggestedTool: tool,
            queryHint: null,
            rationale: 'comprobación',
          },
        ],
      })
      expect(parsed.success, tool).toBe(true)
    }
  })
})

// ─── Defect #2 — single high-sensitivity predicate (no drift) ───────────────

describe('defect #2 — isHighSensitivity unifies the libel predicate', () => {
  it('is false for benign sources / warnings / sections', () => {
    expect(
      isHighSensitivity(
        [{ excerpt: 'alcalde desde 2023', title: 'Ficha oficial' }],
        ['nota editorial sin relevancia'],
        [{ kind: 'narrative' }],
      ),
    ).toBe(false)
  })

  it('is true on a judicial token in a source excerpt', () => {
    expect(isHighSensitivity([{ excerpt: 'Sentencia 12/2024 del juzgado', title: 'x' }], [])).toBe(
      true,
    )
  })

  it('is true on a judicial token in a warning', () => {
    expect(isHighSensitivity([{ excerpt: '', title: 'x' }], ['posible querella pendiente'])).toBe(
      true,
    )
  })

  it('is true when a legal-record section is present', () => {
    expect(isHighSensitivity([{ title: 'limpio' }], [], [{ kind: 'legal-record' }])).toBe(true)
  })

  it('computeLegalSensitivity and the validator agree (parity)', () => {
    const source = {
      id: 'src-legal',
      kind: 'web',
      url: 'https://www.boe.es/diario_boe/x',
      title: 'BOE — resolución',
      retrievedAt: ISO,
      trust: 'high',
    }
    const legalRecord = {
      kind: 'legal-record',
      payload: {
        items: [
          {
            caseRef: 'PA 123/2024',
            court: 'Juzgado de lo Contencioso nº1',
            verbatimRef: 'Resolución firme del expediente citado en el BOE',
            sourceIds: ['src-legal'],
          },
        ],
      },
    }
    // The agent's stamp:
    expect(computeLegalSensitivity([source], [], [{ kind: 'legal-record' }])).toBe('high')

    // The validator demands the same: legalSensitivity 'high' validates …
    expect(() =>
      validateDraftsSnapshot(
        draftSnapshot({ sections: [legalRecord], sources: [source], legalSensitivity: 'high' }),
      ),
    ).not.toThrow()

    // … and 'low' on the same payload is rejected.
    expect(() =>
      validateDraftsSnapshot(
        draftSnapshot({ sections: [legalRecord], sources: [source], legalSensitivity: 'low' }),
      ),
    ).toThrow(/must be 'high'/)
  })
})

// ─── Defect #3 — financial-URL parse swallow now fails closed ───────────────

describe('defect #3 — unparseable financial source URL fails closed', () => {
  const financialDraft = (url: string) =>
    draftSnapshot({
      sections: [
        {
          kind: 'financial',
          payload: {
            items: [
              {
                year: 2023,
                metric: 'salary',
                description: 'Salario municipal',
                sourceIds: ['src-fin'],
              },
            ],
          },
        },
      ],
      sources: [
        {
          id: 'src-fin',
          kind: 'web',
          url,
          title: 'Fuente financiera',
          retrievedAt: ISO,
          trust: 'high',
        },
      ],
      legalSensitivity: 'low',
    })

  it('throws (not silently accepts) when the URL is regex-valid but unparseable', () => {
    // 'https://[bad' passes URL_RE but new URL() throws — previously this
    // resolved to host '' and slipped the FINANCIAL_SOURCE_ALLOW gate.
    expect(() => validateDraftsSnapshot(financialDraft('https://[bad'))).toThrow(
      JournalistValidationError,
    )
    expect(() => validateDraftsSnapshot(financialDraft('https://[bad'))).toThrow(/unparseable/)
  })

  it('still rejects a parseable but off-allowlist financial source host', () => {
    expect(() => validateDraftsSnapshot(financialDraft('https://example.com/x'))).toThrow(
      /FINANCIAL_SOURCE_ALLOW/,
    )
  })
})

// ─── The «y Comercio» portrait seed ─────────────────────────────────────────
//
// a720cfc taught `extractPortfolios` to drop the Spanish list conjunction that
// introduces the last item of the council's «Áreas» block, and repaired
// officials.json and area-fit.json. It missed the biography's portrait seed —
// the chips printed beside the councillor's photograph — so /laboratorio/
// agentes/a-jose-angel-hernandez-bio kept a live chip reading «y Comercio».
//
// The two assertions below pull in OPPOSITE directions on purpose. The seed had
// to change; the dated source excerpt beside it must not. A fix that also
// "helpfully" tidied the excerpt has to go red here.

describe('the José Ángel Hernández portrait names the área, not the parse', () => {
  const REPORT_ID = 'r-jose-angel-hernandez-bio-2026-07-31'
  const SLUG = 'jose-angel-hernandez-carrizosa'

  type Portrait = { kind: string; payload: { officialSlug: string; portfolios: string[] } }
  type Source = { id: string; excerpt: string; retrievedAt: string; localPath?: string }
  type Doc = {
    sections: Array<{ kind: string; payload: Record<string, unknown> }>
    sources: Source[]
    corrections: Array<{ field: string; original: string; corrected: string }>
  }

  const snapshot = validateReportsSnapshot(
    readFileSync('public/data/journalist-reports.json', 'utf8'),
  )
  const monolith = snapshot.items.find((r) => r.id === REPORT_ID) as unknown as Doc | undefined
  const chunk = JSON.parse(
    readFileSync('public/data/journalist-reports/a-jose-angel-hernandez-bio.json', 'utf8'),
  ) as Doc

  // The browser reads the monolith (useJournalistReports.js); the chunk is
  // served by URL all the same. Both, or the bug is only half fixed.
  const copies = (): Array<[string, Doc]> => {
    expect(monolith, 'report missing from the published snapshot').toBeTruthy()
    return [
      ['monolith', monolith as Doc],
      ['chunk', chunk],
    ]
  }

  it('prints «Comercio» as an área chip, and never «y Comercio»', () => {
    for (const [where, doc] of copies()) {
      const portrait = doc.sections.find((s) => s.kind === 'portrait') as Portrait | undefined
      expect(portrait, `${where}: no portrait section`).toBeTruthy()
      expect(portrait!.payload.officialSlug).toBe(SLUG)
      // ASSERT THE CHECK EVALUATED SOMETHING. An empty portfolios array would
      // satisfy every `not.toContain` below while proving nothing at all.
      expect(portrait!.payload.portfolios.length, `${where}: no áreas to check`).toBeGreaterThan(0)
      expect(portrait!.payload.portfolios, where).toContain('Comercio')
      expect(portrait!.payload.portfolios, where).not.toContain('y Comercio')
    }
  })

  it('leaves src-001 saying verbatim what officials.json said on 2026-07-31', () => {
    // THE OTHER DIRECTION, and the one an over-eager sweep breaks. This excerpt
    // is journalist-agent.ts serialising the roster as it stood nine days
    // before the parser was fixed. SourceLedger renders it to the reader under
    // a line asserting it was verified verbatim against the document, so
    // "correcting" it would make a dated, high-trust citation assert something
    // its source did not say at that timestamp.
    for (const [where, doc] of copies()) {
      const src = doc.sources.find((s) => s.id === 'src-001')
      expect(src, `${where}: src-001 missing`).toBeTruthy()
      expect(src!.retrievedAt, where).toBe('2026-07-31T07:34:06.576Z')
      expect(src!.localPath, where).toBe('public/data/officials.json')
      expect(src!.excerpt, where).toContain('Empleo y Emprendimiento, y Comercio')
    }
  })

  it('logs the rename in the reader-visible corrections ledger', () => {
    for (const [where, doc] of copies()) {
      const entry = doc.corrections.find((c) => c.field.startsWith('portrait.portfolios'))
      expect(entry, `${where}: no correction recorded`).toBeTruthy()
      expect(entry!.original, where).toBe('y Comercio')
      expect(entry!.corrected, where).toBe('Comercio')
    }
  })
})

// ─── Soul exporter determinism ──────────────────────────────────────────────

describe('exportSoulMarkdown is deterministic', () => {
  it('renders the same report to byte-identical markdown across calls', () => {
    const snap = validateReportsSnapshot(
      readFileSync('public/data/journalist-reports.json', 'utf8'),
    )
    const report = snap.items[0]
    const opts = { subjectName: 'Robert Raga Gadea', subjectSlug: 'robert-raga-gadea' }
    const a = exportSoulMarkdown(report, opts)
    const b = exportSoulMarkdown(report, opts)
    expect(a).toBe(b)
    expect(a.length).toBeGreaterThan(100)
  })
})
