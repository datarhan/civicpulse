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
