import { describe, it, expect } from 'vitest'
import {
  validateAssignmentsSnapshot,
  validateDraftsSnapshot,
  validateReportsSnapshot,
  JournalistValidationError,
  computeLegalSensitivity,
  isJournalistFrozen,
} from '../src/scraper/journalist'

// ─── Fixtures ──────────────────────────────────────────────────────────────

const SAMPLE_ASSIGNMENT = {
  id: 'a-sample-bio',
  kind: 'biography' as const,
  subject: { slug: 'sample-slug', name: 'Sample Subject', kind: 'official' as const },
  brief:
    'Compile a public-record biography focusing on political career, judicial matters, electoral commitments.',
  createdBy: 'curator-0',
  createdAt: '2026-05-23T10:00:00.000Z',
  status: 'pending' as const,
}

const SAMPLE_SOURCE = {
  id: 'src-001',
  kind: 'local-snapshot' as const,
  title: 'Officials snapshot — Sample Subject record',
  retrievedAt: '2026-05-23T11:00:00.000Z',
  localPath: 'public/data/officials.json',
  trust: 'high' as const,
  excerpt: 'role: alcalde · party: PSOE · portfolios: Alcaldía, Innovación',
}

const SAMPLE_PORTRAIT_SECTION = {
  kind: 'portrait' as const,
  payload: {
    officialSlug: 'sample-slug',
    photoPath: '/data/photos/sample-slug.jpg',
    partyTone: 'civic',
    portfolios: ['Alcaldía'],
    cvUrl: 'https://example.org/cv',
  },
}

const SAMPLE_NARRATIVE_SECTION = {
  kind: 'narrative' as const,
  payload: {
    heading: 'Trayectoria política',
    bodyMarkdown:
      'El sujeto preside el pleno municipal desde 2023. Su grupo ostenta once escaños en la corporación actual.',
    sourceIds: ['src-001'],
  },
}

const SAMPLE_DRAFT = {
  id: 'r-sample-2026-05-23',
  assignmentId: 'a-sample-bio',
  generatedAt: '2026-05-23T12:00:00.000Z',
  agentVersion: 'journalist-v1',
  promptVersion: 'journalist-draft-v1',
  budgetTokens: 12500,
  costUSD: 0.04,
  sections: [SAMPLE_PORTRAIT_SECTION, SAMPLE_NARRATIVE_SECTION],
  sources: [SAMPLE_SOURCE],
  warnings: [],
  legalSensitivity: 'low' as const,
  requiresHumanApproval: true as const,
}

const SAMPLE_REPORT = {
  id: 'r-sample-2026-05-23',
  assignmentId: 'a-sample-bio',
  generatedAt: '2026-05-23T12:00:00.000Z',
  agentVersion: 'journalist-v1',
  promptVersion: 'journalist-draft-v1',
  budgetTokens: 12500,
  costUSD: 0.04,
  sections: [SAMPLE_PORTRAIT_SECTION, SAMPLE_NARRATIVE_SECTION],
  sources: [SAMPLE_SOURCE],
  warnings: [],
  legalSensitivity: 'low' as const,
  promotedBy: 'curator-0',
  promotedAt: '2026-05-23T13:00:00.000Z',
  curatorNotes: 'Reviewed and approved.',
  corrections: [],
  response: null,
}

const VALID_REPORTS_SNAPSHOT = {
  version: '1.0',
  generatedAt: '2026-05-23T13:30:00.000Z',
  legalNotice:
    'Informes periodísticos elaborados por un agente automático y revisados por curación humana antes de su publicación. Cada afirmación incluye cita verbatim y enlace de archivo cuando procede; cada grupo o persona aludida puede ejercer derecho de réplica por el formulario público.',
  contactUrl: 'https://github.com/datarhan/civicpulse/issues/new/choose',
  methodologyUrl: '/metodologia',
  items: [SAMPLE_REPORT],
}

// ─── Assignments ───────────────────────────────────────────────────────────

describe('validateAssignmentsSnapshot', () => {
  const VALID = {
    version: '1.0',
    generatedAt: '2026-05-23T10:00:00.000Z',
    items: [SAMPLE_ASSIGNMENT],
  }

  it('accepts a well-formed snapshot', () => {
    const snap = validateAssignmentsSnapshot(JSON.stringify(VALID))
    expect(snap.items).toHaveLength(1)
    expect(snap.items[0].id).toBe('a-sample-bio')
    expect(snap.items[0].subject.slug).toBe('sample-slug')
    expect(snap.items[0].status).toBe('pending')
  })

  it('rejects an assignment whose brief is <40 chars', () => {
    const bad = { ...VALID, items: [{ ...SAMPLE_ASSIGNMENT, brief: 'too short' }] }
    expect(() => validateAssignmentsSnapshot(JSON.stringify(bad))).toThrow(
      JournalistValidationError,
    )
  })

  it('rejects an unknown kind', () => {
    const bad = { ...VALID, items: [{ ...SAMPLE_ASSIGNMENT, kind: 'feature' }] }
    expect(() => validateAssignmentsSnapshot(JSON.stringify(bad))).toThrow(/kind must be one of/)
  })

  it('rejects duplicate ids', () => {
    const bad = { ...VALID, items: [SAMPLE_ASSIGNMENT, SAMPLE_ASSIGNMENT] }
    expect(() => validateAssignmentsSnapshot(JSON.stringify(bad))).toThrow(
      /duplicate assignment id/,
    )
  })

  it('rejects a non-kebab slug', () => {
    const bad = {
      ...VALID,
      items: [
        { ...SAMPLE_ASSIGNMENT, subject: { ...SAMPLE_ASSIGNMENT.subject, slug: 'Sample Slug' } },
      ],
    }
    expect(() => validateAssignmentsSnapshot(JSON.stringify(bad))).toThrow(/kebab-case/)
  })

  it('rejects an unknown status', () => {
    const bad = { ...VALID, items: [{ ...SAMPLE_ASSIGNMENT, status: 'done' }] }
    expect(() => validateAssignmentsSnapshot(JSON.stringify(bad))).toThrow(/status must be one of/)
  })
})

// ─── Drafts ────────────────────────────────────────────────────────────────

describe('validateDraftsSnapshot', () => {
  const VALID = {
    version: '1.0',
    generatedAt: '2026-05-23T12:30:00.000Z',
    items: [SAMPLE_DRAFT],
  }

  it('accepts a well-formed draft snapshot', () => {
    const snap = validateDraftsSnapshot(JSON.stringify(VALID))
    expect(snap.items).toHaveLength(1)
    expect(snap.items[0].requiresHumanApproval).toBe(true)
    expect(snap.items[0].sections).toHaveLength(2)
  })

  it('rejects when requiresHumanApproval is missing', () => {
    const bad = {
      ...VALID,
      items: [{ ...SAMPLE_DRAFT, requiresHumanApproval: undefined as unknown }],
    }
    expect(() => validateDraftsSnapshot(JSON.stringify(bad))).toThrow(/requiresHumanApproval/)
  })

  it('rejects when requiresHumanApproval is false', () => {
    const bad = { ...VALID, items: [{ ...SAMPLE_DRAFT, requiresHumanApproval: false }] }
    expect(() => validateDraftsSnapshot(JSON.stringify(bad))).toThrow(/requiresHumanApproval/)
  })

  it('rejects a narrative section without a sourceId', () => {
    const orphanNarrative = {
      kind: 'narrative' as const,
      payload: {
        heading: 'Sin fuente',
        bodyMarkdown: 'Un párrafo sin ninguna cita asociada que aporte respaldo.',
        sourceIds: [],
      },
    }
    const bad = {
      ...VALID,
      items: [{ ...SAMPLE_DRAFT, sections: [SAMPLE_PORTRAIT_SECTION, orphanNarrative] }],
    }
    expect(() => validateDraftsSnapshot(JSON.stringify(bad))).toThrow(
      /sourceIds must reference ≥1 citation/,
    )
  })

  it('rejects a section that references an unknown sourceId', () => {
    const dangling = {
      kind: 'narrative' as const,
      payload: {
        heading: 'Cita inexistente',
        bodyMarkdown: 'Texto que pretende citar src-999 que no existe en sources[].',
        sourceIds: ['src-999'],
      },
    }
    const bad = {
      ...VALID,
      items: [{ ...SAMPLE_DRAFT, sections: [SAMPLE_PORTRAIT_SECTION, dangling] }],
    }
    expect(() => validateDraftsSnapshot(JSON.stringify(bad))).toThrow(/unknown sourceId/)
  })

  it('rejects when legalSensitivity is not high but a source excerpt names a judicial case', () => {
    const sensitiveSource = {
      ...SAMPLE_SOURCE,
      id: 'src-jud',
      excerpt:
        'Recurso PA 1045/2017 contra el alcalde y otros — Sentencia favorable a la administración.',
    }
    const bad = {
      ...VALID,
      items: [
        {
          ...SAMPLE_DRAFT,
          sources: [SAMPLE_SOURCE, sensitiveSource],
          legalSensitivity: 'low' as const,
        },
      ],
    }
    expect(() => validateDraftsSnapshot(JSON.stringify(bad))).toThrow(
      /legalSensitivity must be 'high'/,
    )
  })

  it('accepts the same draft when legalSensitivity is bumped to high', () => {
    const sensitiveSource = {
      ...SAMPLE_SOURCE,
      id: 'src-jud',
      excerpt:
        'Recurso PA 1045/2017 contra el alcalde y otros — Sentencia favorable a la administración.',
    }
    const ok = {
      ...VALID,
      items: [
        {
          ...SAMPLE_DRAFT,
          sources: [SAMPLE_SOURCE, sensitiveSource],
          legalSensitivity: 'high' as const,
        },
      ],
    }
    const snap = validateDraftsSnapshot(JSON.stringify(ok))
    expect(snap.items[0].legalSensitivity).toBe('high')
  })

  it('rejects a portrait section pointing at an invalid photo path', () => {
    const badPortrait = {
      kind: 'portrait' as const,
      payload: { ...SAMPLE_PORTRAIT_SECTION.payload, photoPath: 'data/photos/x.jpg' },
    }
    const bad = {
      ...VALID,
      items: [{ ...SAMPLE_DRAFT, sections: [badPortrait, SAMPLE_NARRATIVE_SECTION] }],
    }
    expect(() => validateDraftsSnapshot(JSON.stringify(bad))).toThrow(
      /photoPath must start with \//,
    )
  })

  it('rejects a relationships edge that references an unknown node', () => {
    const rel = {
      kind: 'relationships' as const,
      payload: {
        nodes: [{ id: 'n1', label: 'Subject', tone: 'civic', kind: 'person' as const }],
        edges: [{ from: 'n1', to: 'n42', relation: 'coalición', sourceIds: ['src-001'] }],
      },
    }
    const bad = {
      ...VALID,
      items: [
        { ...SAMPLE_DRAFT, sections: [SAMPLE_PORTRAIT_SECTION, SAMPLE_NARRATIVE_SECTION, rel] },
      ],
    }
    expect(() => validateDraftsSnapshot(JSON.stringify(bad))).toThrow(/unknown node/)
  })
})

// ─── Reports ───────────────────────────────────────────────────────────────

describe('validateReportsSnapshot', () => {
  it('accepts a well-formed published-reports snapshot', () => {
    const snap = validateReportsSnapshot(JSON.stringify(VALID_REPORTS_SNAPSHOT))
    expect(snap.items).toHaveLength(1)
    expect(snap.items[0].promotedBy).toBe('curator-0')
    expect(snap.items[0].corrections).toEqual([])
    expect(snap.items[0].response).toBeNull()
  })

  it('carries the snapshot-wide curatorNotes through a round trip', () => {
    // This validator's return value is what the curator CLIs write back, so a
    // field it does not name is a field the next correction DELETES. That was
    // not hypothetical: `backfill-self-declared.ts` has appended a
    // snapshot-level `curatorNotes` since 2026-08-04, the interface never
    // declared it, and the first `correct-journalist-report` run through this
    // gate silently dropped two curator entries. A log the gate protecting it
    // can erase is not a log.
    const notes = '2026-08-04 · Curator: re-clasificado selfDeclared sobre el fragmento citado.'
    const snap = validateReportsSnapshot(
      JSON.stringify({ ...VALID_REPORTS_SNAPSHOT, curatorNotes: notes }),
    )
    expect(snap.curatorNotes).toBe(notes)
    // And a second pass over the re-serialized output keeps it — that is the
    // trip that actually happens, read → edit → write → read.
    expect(validateReportsSnapshot(JSON.stringify(snap)).curatorNotes).toBe(notes)
  })

  it('rejects a non-string curatorNotes rather than silently dropping it', () => {
    expect(() =>
      validateReportsSnapshot(JSON.stringify({ ...VALID_REPORTS_SNAPSHOT, curatorNotes: 42 })),
    ).toThrow(/curatorNotes must be string/)
  })

  it('rejects a published report that still carries requiresHumanApproval', () => {
    const bad = {
      ...VALID_REPORTS_SNAPSHOT,
      items: [{ ...SAMPLE_REPORT, requiresHumanApproval: true }],
    }
    expect(() => validateReportsSnapshot(JSON.stringify(bad))).toThrow(
      /requiresHumanApproval must not be set/,
    )
  })

  it('rejects a report without legalNotice ≥40 chars', () => {
    const bad = { ...VALID_REPORTS_SNAPSHOT, legalNotice: 'short' }
    expect(() => validateReportsSnapshot(JSON.stringify(bad))).toThrow(
      /legalNotice must be ≥40 chars/,
    )
  })

  it('rejects a correction whose reason is too short', () => {
    const bad = {
      ...VALID_REPORTS_SNAPSHOT,
      items: [
        {
          ...SAMPLE_REPORT,
          corrections: [
            {
              field: 'sections[1].payload.heading',
              original: 'Old heading',
              corrected: 'New heading',
              reason: 'oops',
              editor: 'curator-0',
              correctedAt: '2026-05-24',
            },
          ],
        },
      ],
    }
    expect(() => validateReportsSnapshot(JSON.stringify(bad))).toThrow(/reason must be ≥20 chars/)
  })

  it('accepts a valid right-of-reply payload', () => {
    const ok = {
      ...VALID_REPORTS_SNAPSHOT,
      items: [
        {
          ...SAMPLE_REPORT,
          response: {
            from: 'PSOE',
            quote:
              'Reafirmamos que el procedimiento se resolvió en plazo y forma según la legislación vigente.',
            respondedAt: '2026-05-25',
          },
        },
      ],
    }
    const snap = validateReportsSnapshot(JSON.stringify(ok))
    expect(snap.items[0].response?.from).toBe('PSOE')
  })

  it('rejects a response.from value not in the allowed list', () => {
    const bad = {
      ...VALID_REPORTS_SNAPSHOT,
      items: [
        {
          ...SAMPLE_REPORT,
          response: {
            from: 'Independent',
            quote: 'Reafirmamos lo dicho hace ya varios meses en sede municipal.',
            respondedAt: '2026-05-25',
          },
        },
      ],
    }
    expect(() => validateReportsSnapshot(JSON.stringify(bad))).toThrow(
      /response.from must be one of/,
    )
  })

  it('rejects duplicate report ids', () => {
    const bad = { ...VALID_REPORTS_SNAPSHOT, items: [SAMPLE_REPORT, SAMPLE_REPORT] }
    expect(() => validateReportsSnapshot(JSON.stringify(bad))).toThrow(/duplicate report id/)
  })
})

// ─── Helpers ───────────────────────────────────────────────────────────────

describe('computeLegalSensitivity', () => {
  it('returns low for vanilla sources', () => {
    expect(
      computeLegalSensitivity(
        [{ title: 'Officials snapshot', excerpt: 'PSOE councillor portfolios' }],
        [],
      ),
    ).toBe('low')
  })

  it('escalates to high when a source excerpt matches a judicial token', () => {
    expect(
      computeLegalSensitivity(
        [{ title: 'Press article', excerpt: 'el procedimiento PA 1045/2017 sigue activo' }],
        [],
      ),
    ).toBe('high')
  })

  it('escalates to high when a warning matches a judicial token', () => {
    expect(
      computeLegalSensitivity(
        [{ title: 'safe', excerpt: 'safe' }],
        ['Sentencia archivada mencionada en fuente externa'],
      ),
    ).toBe('high')
  })
})

describe('isJournalistFrozen', () => {
  it('returns false when there is no frozenUntil', () => {
    expect(isJournalistFrozen({ frozenUntil: null })).toBe(false)
  })

  it('returns true when frozenUntil is in the future', () => {
    expect(
      isJournalistFrozen({ frozenUntil: '2099-01-01' }, new Date('2026-05-23T00:00:00Z')),
    ).toBe(true)
  })

  it('returns false when frozenUntil is in the past', () => {
    expect(
      isJournalistFrozen({ frozenUntil: '2020-01-01' }, new Date('2026-05-23T00:00:00Z')),
    ).toBe(false)
  })

  it('returns false when snapshot is null', () => {
    expect(isJournalistFrozen(null)).toBe(false)
  })
})

// ─── Phase B: soul.md / digital-person dossier sections ────────────────────

const HIGH_TRUST_SOURCE = {
  id: 'src-tx',
  kind: 'web' as const,
  url: 'https://transparentia.newtral.es/ficha/test',
  title: 'Transparentia salary record',
  retrievedAt: '2026-05-23T11:00:00.000Z',
  trust: 'high' as const,
}

const MEDIUM_TRUST_NON_FIN_SOURCE = {
  id: 'src-press',
  kind: 'web' as const,
  url: 'https://www.levante-emv.com/article-x',
  title: 'Press piece',
  retrievedAt: '2026-05-23T11:00:00.000Z',
  trust: 'medium' as const,
}

function dossierDraft(
  extraSection: Record<string, unknown>,
  extraSources: Array<Record<string, unknown>> = [],
) {
  return {
    ...SAMPLE_DRAFT,
    sources: [SAMPLE_SOURCE, ...extraSources],
    sections: [SAMPLE_PORTRAIT_SECTION, SAMPLE_NARRATIVE_SECTION, extraSection],
  }
}

describe('Phase B: identity section', () => {
  const VALID_BASE = {
    version: '1.0',
    generatedAt: '2026-05-23T12:30:00.000Z',
    items: [] as unknown[],
  }

  it('accepts an identity section with no family', () => {
    const draft = dossierDraft({
      kind: 'identity',
      payload: {
        dateOfBirth: '1966-04-09',
        birthplace: 'Riba-roja de Túria',
        sourceIds: ['src-001'],
      },
    })
    const snap = { ...VALID_BASE, items: [draft] }
    expect(() => validateDraftsSnapshot(JSON.stringify(snap))).not.toThrow()
  })

  it('rejects an identity.family[n].name without a high-trust source', () => {
    const draft = dossierDraft(
      {
        kind: 'identity',
        payload: {
          sourceIds: ['src-001'],
          family: [{ relation: 'esposa', name: 'Persona Privada', sourceIds: ['src-press'] }],
        },
      },
      [MEDIUM_TRUST_NON_FIN_SOURCE],
    )
    const snap = { ...VALID_BASE, items: [draft] }
    expect(() => validateDraftsSnapshot(JSON.stringify(snap))).toThrow(/must be trust='high'/)
  })

  it('accepts an identity.family[n].name when every source is high-trust', () => {
    const draft = dossierDraft(
      {
        kind: 'identity',
        payload: {
          sourceIds: ['src-001'],
          family: [{ relation: 'esposa', name: 'Persona Pública', sourceIds: ['src-tx'] }],
        },
      },
      [HIGH_TRUST_SOURCE],
    )
    const snap = { ...VALID_BASE, items: [draft] }
    expect(() => validateDraftsSnapshot(JSON.stringify(snap))).not.toThrow()
  })
})

describe('Phase B: education + career sections', () => {
  const VALID_BASE = {
    version: '1.0',
    generatedAt: '2026-05-23T12:30:00.000Z',
    items: [] as unknown[],
  }

  it('accepts an education section with mixed degree/institution rows', () => {
    const draft = dossierDraft({
      kind: 'education',
      payload: {
        items: [
          {
            degree: 'Acceso a Universidad Mayores de 25 años',
            institution: 'Universitat de València',
            startYear: 1991,
            sourceIds: ['src-001'],
          },
          { degree: 'EGB', sourceIds: [] },
        ],
      },
    })
    const snap = { ...VALID_BASE, items: [draft] }
    expect(() => validateDraftsSnapshot(JSON.stringify(snap))).not.toThrow()
  })

  it('requires startYear on career-political rows', () => {
    const draft = dossierDraft({
      kind: 'career-political',
      payload: { items: [{ role: 'Alcalde', org: 'Ayuntamiento', sourceIds: ['src-001'] }] },
    })
    const snap = { ...VALID_BASE, items: [draft] }
    expect(() => validateDraftsSnapshot(JSON.stringify(snap))).toThrow(
      /startYear required for career-political/,
    )
  })

  it('allows optional startYear on career-professional rows', () => {
    const draft = dossierDraft({
      kind: 'career-professional',
      payload: { items: [{ role: 'Asesor', org: 'Diputació', sourceIds: ['src-001'] }] },
    })
    const snap = { ...VALID_BASE, items: [draft] }
    expect(() => validateDraftsSnapshot(JSON.stringify(snap))).not.toThrow()
  })
})

describe('Phase B: legal-record auto-escalation', () => {
  const VALID_BASE = {
    version: '1.0',
    generatedAt: '2026-05-23T12:30:00.000Z',
    items: [] as unknown[],
  }

  it('auto-bumps legalSensitivity to high when a legal-record section is present', () => {
    const draft = {
      ...dossierDraft({
        kind: 'legal-record',
        payload: {
          items: [
            {
              caseRef: 'PA 1045/2017',
              court: 'Juzgado Contencioso Valencia n.º 4',
              date: '2017-03-14',
              outcome: 'Sentencia favorable a la administración',
              verbatimRef:
                'contra Roberto Raga Gadea y otros, PA 1045/2017, en materia de contratación pública',
              sourceIds: ['src-001'],
            },
          ],
        },
      }),
      legalSensitivity: 'medium' as const,
    }
    const snap = { ...VALID_BASE, items: [draft] }
    expect(() => validateDraftsSnapshot(JSON.stringify(snap))).toThrow(
      /legalSensitivity must be 'high'/,
    )
  })

  it('rejects a legal-record row with verbatimRef <20 chars', () => {
    const draft = {
      ...dossierDraft({
        kind: 'legal-record',
        payload: {
          items: [
            {
              caseRef: 'PA 1045/2017',
              court: 'Juzgado X',
              verbatimRef: 'too short',
              sourceIds: ['src-001'],
            },
          ],
        },
      }),
      legalSensitivity: 'high' as const,
    }
    const snap = { ...VALID_BASE, items: [draft] }
    expect(() => validateDraftsSnapshot(JSON.stringify(snap))).toThrow(
      /verbatimRef must be verbatim ≥20 chars/,
    )
  })
})

describe('Phase B: financial source-allowlist', () => {
  const VALID_BASE = {
    version: '1.0',
    generatedAt: '2026-05-23T12:30:00.000Z',
    items: [] as unknown[],
  }

  it('accepts a financial row backed by a transparentia.newtral.es source', () => {
    const draft = dossierDraft(
      {
        kind: 'financial',
        payload: {
          items: [
            {
              year: 2024,
              metric: 'salary',
              amountEuros: 65000,
              description: 'Retribución pública declarada',
              sourceIds: ['src-tx'],
            },
          ],
        },
      },
      [HIGH_TRUST_SOURCE],
    )
    const snap = { ...VALID_BASE, items: [draft] }
    expect(() => validateDraftsSnapshot(JSON.stringify(snap))).not.toThrow()
  })

  it('accepts a financial row backed by the Diputació de València transparency portal (dival.es)', () => {
    // La relación de personal eventual de la Diputació (retribución/gasto de
    // un cargo) es fuente primaria oficial; hasta el 07-09-2026 la lista sólo
    // conocía BOE, DOGV, GVA, el portal municipal y Newtral, y una cifra de la
    // Diputació no podía entrar en `financial` ni citada por la propia Diputació.
    const draft = dossierDraft(
      {
        kind: 'financial',
        payload: {
          items: [
            {
              year: 2025,
              metric: 'salary',
              amountEuros: 54861.36,
              description: 'Gasto del ejercicio 2025 en el puesto, según la Diputació',
              sourceIds: ['src-dival'],
            },
          ],
        },
      },
      [
        {
          ...HIGH_TRUST_SOURCE,
          id: 'src-dival',
          url: 'https://www.dival.es/sites/default/files/2026-01-21-resposta-personal-eventuals.pdf',
          title: 'Diputació de València — personal eventual 2025',
        },
      ],
    )
    const snap = { ...VALID_BASE, items: [draft] }
    expect(() => validateDraftsSnapshot(JSON.stringify(snap))).not.toThrow()
  })

  it('rejects a financial row whose source is not on FINANCIAL_SOURCE_ALLOW', () => {
    const draft = dossierDraft(
      {
        kind: 'financial',
        payload: {
          items: [
            {
              year: 2024,
              metric: 'salary',
              amountEuros: 65000,
              description: 'Retribución pública declarada',
              sourceIds: ['src-press'],
            },
          ],
        },
      },
      [MEDIUM_TRUST_NON_FIN_SOURCE],
    )
    const snap = { ...VALID_BASE, items: [draft] }
    expect(() => validateDraftsSnapshot(JSON.stringify(snap))).toThrow(/FINANCIAL_SOURCE_ALLOW/)
  })
})

describe('Phase B: small dossier kinds', () => {
  const VALID_BASE = {
    version: '1.0',
    generatedAt: '2026-05-23T12:30:00.000Z',
    items: [] as unknown[],
  }

  it('accepts an online-presence section with a verified account', () => {
    const draft = dossierDraft({
      kind: 'online-presence',
      payload: {
        accounts: [
          {
            platform: 'x',
            handle: '@example',
            url: 'https://x.com/example',
            verifiedAt: '2026-05-20',
            sourceIds: ['src-001'],
          },
        ],
      },
    })
    expect(() =>
      validateDraftsSnapshot(JSON.stringify({ ...VALID_BASE, items: [draft] })),
    ).not.toThrow()
  })

  it('accepts an awards section', () => {
    const draft = dossierDraft({
      kind: 'awards',
      payload: {
        items: [
          {
            name: 'Premio Ciudad',
            awardedBy: 'Ayuntamiento X',
            year: 2022,
            sourceIds: ['src-001'],
          },
        ],
      },
    })
    expect(() =>
      validateDraftsSnapshot(JSON.stringify({ ...VALID_BASE, items: [draft] })),
    ).not.toThrow()
  })

  it('accepts a publications section', () => {
    const draft = dossierDraft({
      kind: 'publications',
      payload: {
        items: [
          {
            title: 'El tren en el centro de Riba-roja',
            venue: 'Levante-EMV',
            year: 2018,
            sourceIds: ['src-001'],
          },
        ],
      },
    })
    expect(() =>
      validateDraftsSnapshot(JSON.stringify({ ...VALID_BASE, items: [draft] })),
    ).not.toThrow()
  })

  it('accepts a gaps-detected section (empty publication-trail is honest)', () => {
    const draft = dossierDraft({
      kind: 'gaps-detected',
      payload: {
        missing: [
          { field: 'estado civil', reason: 'campo privado' },
          { field: 'empleos anteriores a 1989', reason: 'no encontrado en fuentes públicas' },
        ],
      },
    })
    expect(() =>
      validateDraftsSnapshot(JSON.stringify({ ...VALID_BASE, items: [draft] })),
    ).not.toThrow()
  })
})

describe('assignment status: archived (superseded/unpublished)', () => {
  it('accepts an archived assignment', () => {
    const snap = {
      version: '1.0',
      generatedAt: '2026-07-29T10:00:00.000Z',
      items: [{ ...SAMPLE_ASSIGNMENT, status: 'archived' }],
    }
    const parsed = validateAssignmentsSnapshot(JSON.stringify(snap))
    expect(parsed.items[0].status).toBe('archived')
  })
})

// ─── Portrait without a published photo ─────────────────────────────────────

describe('portrait photoPath', () => {
  const BASE = { version: '1.0', generatedAt: '2026-09-06T10:00:00.000Z' }

  it('accepts an empty photoPath as «sin retrato publicado» (alta de 2025 sin foto en el portal)', () => {
    const noPhoto = {
      kind: 'portrait' as const,
      payload: { ...SAMPLE_PORTRAIT_SECTION.payload, photoPath: '' },
    }
    const ok = {
      ...BASE,
      items: [{ ...SAMPLE_DRAFT, sections: [noPhoto, SAMPLE_NARRATIVE_SECTION] }],
    }
    expect(() => validateDraftsSnapshot(JSON.stringify(ok))).not.toThrow()
  })

  it('still rejects a relative photoPath', () => {
    const relative = {
      kind: 'portrait' as const,
      payload: { ...SAMPLE_PORTRAIT_SECTION.payload, photoPath: 'data/photos/x.jpg' },
    }
    const bad = {
      ...BASE,
      items: [{ ...SAMPLE_DRAFT, sections: [relative, SAMPLE_NARRATIVE_SECTION] }],
    }
    expect(() => validateDraftsSnapshot(JSON.stringify(bad))).toThrow(
      /photoPath must start with \//,
    )
  })
})
