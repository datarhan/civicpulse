/**
 * `journalist:archive` — the sanctioned way to retire a published biography
 * once a newer report about the same subject has been promoted.
 *
 * Until now the only way to do this was a hand edit of journalist-reports.json,
 * which the curated-write guard denies (Raga v1–v3 were removed by hand in
 * f4e7c5bd, before the guard existed). These tests pin the refusals as much as
 * the happy path: an archive that retires the wrong report, or one about a
 * different person, is exactly the misattribution the guard exists to prevent.
 */
import { describe, it, expect } from 'vitest'
import { archiveAssignment } from '../scripts/journalist-archive'
import {
  validateAssignmentsSnapshot,
  validateReportsSnapshot,
  type JournalistAssignment,
  type JournalistAssignmentsSnapshot,
  type JournalistReport,
  type JournalistReportsSnapshot,
  type ReportSection,
  type SourceCitation,
} from '../src/scraper/journalist'

// ─── Fixtures (shapes copied from tests/journalist-schema.test.ts) ─────────
// Factories, not constants: every test gets fresh objects so the "does not
// mutate" case measures the function and not a fixture another test bent.

const OLD_ID = 'a-sample-bio'
const NEW_ID = 'a-sample-bio-v2'
const OLD_REPORT_ID = 'r-sample-2026-05-23'
const NEW_REPORT_ID = 'r-sample-v2-2026-07-29'

function assignment(
  id: string,
  overrides: Partial<JournalistAssignment> = {},
): JournalistAssignment {
  return {
    id,
    kind: 'biography',
    subject: { slug: 'sample-slug', name: 'Sample Subject', kind: 'official' },
    brief:
      'Compile a public-record biography focusing on political career, judicial matters, electoral commitments.',
    createdBy: 'curator-0',
    createdAt: '2026-05-23T10:00:00.000Z',
    status: 'promoted',
    lastRunAt: '2026-05-23T11:30:00.000Z',
    ...overrides,
  }
}

const SAMPLE_SOURCE: SourceCitation = {
  id: 'src-001',
  kind: 'local-snapshot',
  title: 'Officials snapshot — Sample Subject record',
  retrievedAt: '2026-05-23T11:00:00.000Z',
  localPath: 'public/data/officials.json',
  trust: 'high',
  excerpt: 'role: alcalde · party: PSOE · portfolios: Alcaldía, Innovación',
}

const SAMPLE_PORTRAIT_SECTION: ReportSection = {
  kind: 'portrait',
  payload: {
    officialSlug: 'sample-slug',
    photoPath: '/data/photos/sample-slug.jpg',
    partyTone: 'civic',
    portfolios: ['Alcaldía'],
    cvUrl: 'https://example.org/cv',
  },
}

const SAMPLE_NARRATIVE_SECTION: ReportSection = {
  kind: 'narrative',
  payload: {
    heading: 'Trayectoria política',
    bodyMarkdown:
      'El sujeto preside el pleno municipal desde 2023. Su grupo ostenta once escaños en la corporación actual.',
    sourceIds: ['src-001'],
  },
}

function report(id: string, assignmentId: string): JournalistReport {
  return {
    id,
    assignmentId,
    generatedAt: '2026-05-23T12:00:00.000Z',
    agentVersion: 'journalist-v1',
    promptVersion: 'journalist-draft-v1',
    budgetTokens: 12500,
    costUSD: 0.04,
    sections: [SAMPLE_PORTRAIT_SECTION, SAMPLE_NARRATIVE_SECTION],
    sources: [SAMPLE_SOURCE],
    warnings: [],
    legalSensitivity: 'low',
    promotedBy: 'curator-0',
    promotedAt: '2026-05-23T13:00:00.000Z',
    curatorNotes: 'Reviewed and approved.',
    corrections: [],
    response: null,
  }
}

const EXISTING_NOTE = '2026-08-04 · Curator: re-clasificado selfDeclared sobre el fragmento citado.'

function assignmentsSnapshot(
  items: JournalistAssignment[] = [assignment(OLD_ID), assignment(NEW_ID)],
): JournalistAssignmentsSnapshot {
  return { version: '1.0', generatedAt: '2026-07-29T10:00:00.000Z', items }
}

function reportsSnapshot(
  items: JournalistReport[] = [report(OLD_REPORT_ID, OLD_ID), report(NEW_REPORT_ID, NEW_ID)],
  curatorNotes: string | undefined = EXISTING_NOTE,
): JournalistReportsSnapshot {
  return {
    version: '1.0',
    generatedAt: '2026-05-23T13:30:00.000Z',
    legalNotice:
      'Informes periodísticos elaborados por un agente automático y revisados por curación humana antes de su publicación. Cada afirmación incluye cita verbatim y enlace de archivo cuando procede; cada grupo o persona aludida puede ejercer derecho de réplica por el formulario público.',
    contactUrl: 'https://github.com/datarhan/civicpulse/issues/new/choose',
    methodologyUrl: '/metodologia',
    items,
    ...(curatorNotes ? { curatorNotes } : {}),
  }
}

const REASON = 'La v2 incorpora el corpus de plenos transcritos y sustituye a la v1.'
const OPTS = {
  assignmentId: OLD_ID,
  supersededBy: NEW_ID,
  reason: REASON,
  curator: 'curator-0',
  today: '2026-09-06',
}
const EXPECTED_NOTE =
  `DEPURACIÓN EDITORIAL 2026-09-06: informe de ${OLD_ID} retirado del índice ` +
  `al quedar sustituido por ${NEW_ID} (curator-0). ${REASON}`

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

// ─── Happy path ────────────────────────────────────────────────────────────

describe('archiveAssignment — happy path', () => {
  it('marks the superseded assignment archived and keeps every other field', () => {
    const out = archiveAssignment(assignmentsSnapshot(), reportsSnapshot(), OPTS)
    const archived = out.assignments.items.find((a) => a.id === OLD_ID)
    expect(archived).toEqual({ ...assignment(OLD_ID), status: 'archived' })
    // The superseding assignment is the one the reader now lands on; it is
    // not the CLI's to touch.
    expect(out.assignments.items.find((a) => a.id === NEW_ID)).toEqual(assignment(NEW_ID))
    expect(out.assignments.items).toHaveLength(2)
    // Determinism: generatedAt is the CLI's clock, not the pure function's.
    expect(out.assignments.generatedAt).toBe('2026-07-29T10:00:00.000Z')
    expect(out.reports.generatedAt).toBe('2026-05-23T13:30:00.000Z')
  })

  it('removes the superseded report from the index and names it, plus its chunk file', () => {
    const out = archiveAssignment(assignmentsSnapshot(), reportsSnapshot(), OPTS)
    expect(out.reports.items.map((r) => r.id)).toEqual([NEW_REPORT_ID])
    expect(out.removedReportIds).toEqual([OLD_REPORT_ID])
    expect(out.removedChunkFiles).toEqual([`public/data/journalist-reports/${OLD_ID}.json`])
  })

  it('removes every report of the archived assignment, not just the first', () => {
    // An assignment promoted twice leaves two rows joined on the same id; a
    // page that keeps one of them is still publishing the superseded prose.
    const items = [
      report(OLD_REPORT_ID, OLD_ID),
      report(NEW_REPORT_ID, NEW_ID),
      report('r-sample-2026-06-01', OLD_ID),
    ]
    const out = archiveAssignment(assignmentsSnapshot(), reportsSnapshot(items), OPTS)
    expect(out.reports.items.map((r) => r.id)).toEqual([NEW_REPORT_ID])
    expect(out.removedReportIds).toEqual([OLD_REPORT_ID, 'r-sample-2026-06-01'])
  })

  it('appends a DEPURACIÓN EDITORIAL paragraph to the snapshot-level curatorNotes after a blank line', () => {
    const out = archiveAssignment(assignmentsSnapshot(), reportsSnapshot(), OPTS)
    // Exact: the marker word is what AgenteReporte.jsx splits the log on, so
    // a paraphrase would render as a tail of the previous entry.
    expect(out.reports.curatorNotes).toBe(`${EXISTING_NOTE}\n\n${EXPECTED_NOTE}`)
    expect(out.reports.curatorNotes).toContain('DEPURACIÓN EDITORIAL')
    expect(out.reports.curatorNotes).toContain(REASON)
    // The per-report notes of the surviving report are somebody else's record.
    expect(out.reports.items[0].curatorNotes).toBe('Reviewed and approved.')
  })

  it('starts the log with the paragraph when the snapshot has no curatorNotes yet', () => {
    // '' and not undefined: undefined would pick the factory's default note.
    const out = archiveAssignment(assignmentsSnapshot(), reportsSnapshot(undefined, ''), OPTS)
    expect(out.reports.curatorNotes).toBe(EXPECTED_NOTE)
  })

  it('produces snapshots that still pass both validators when re-serialised', () => {
    // The CLI writes through writeSnapshot(path, snap, validate): what these
    // two calls accept is what reaches disk, and what they reject never does.
    const out = archiveAssignment(assignmentsSnapshot(), reportsSnapshot(), OPTS)
    const assignments = validateAssignmentsSnapshot(JSON.stringify(out.assignments))
    expect(assignments.items.find((a) => a.id === OLD_ID)?.status).toBe('archived')
    const reports = validateReportsSnapshot(JSON.stringify(out.reports))
    expect(reports.items.map((r) => r.id)).toEqual([NEW_REPORT_ID])
    expect(reports.curatorNotes).toContain('DEPURACIÓN EDITORIAL 2026-09-06')
  })

  it('is deterministic given today (no clock inside the pure function)', () => {
    const a = archiveAssignment(assignmentsSnapshot(), reportsSnapshot(), OPTS)
    const b = archiveAssignment(assignmentsSnapshot(), reportsSnapshot(), OPTS)
    expect(clone(a)).toEqual(clone(b))
  })

  it('does not mutate its inputs', () => {
    const assignments = assignmentsSnapshot()
    const reports = reportsSnapshot()
    const beforeA = clone(assignments)
    const beforeR = clone(reports)
    archiveAssignment(assignments, reports, OPTS)
    expect(assignments).toEqual(beforeA)
    expect(reports).toEqual(beforeR)
  })
})

// ─── Refusals ──────────────────────────────────────────────────────────────

describe('archiveAssignment — refusals', () => {
  it('refuses when the superseding assignment has no published report in the index', () => {
    // Archiving on the promise of a v2 that is not in the index would leave
    // the subject with NO biography — a retraction nobody asked for.
    const reports = reportsSnapshot([report(OLD_REPORT_ID, OLD_ID)])
    expect(() => archiveAssignment(assignmentsSnapshot(), reports, OPTS)).toThrow(
      /no published report/,
    )
  })

  it('refuses when the two assignments are about a different subject slug', () => {
    const other = assignment(NEW_ID, {
      subject: { slug: 'other-slug', name: 'Other Subject', kind: 'official' },
    })
    expect(() =>
      archiveAssignment(assignmentsSnapshot([assignment(OLD_ID), other]), reportsSnapshot(), OPTS),
    ).toThrow(/subject/)
  })

  it('refuses when the two assignments differ in subject kind', () => {
    const other = assignment(NEW_ID, {
      subject: { slug: 'sample-slug', name: 'Sample Subject', kind: 'entity' },
    })
    expect(() =>
      archiveAssignment(assignmentsSnapshot([assignment(OLD_ID), other]), reportsSnapshot(), OPTS),
    ).toThrow(/subject/)
  })

  it('refuses a target that is not promoted', () => {
    // A second run over an already-archived assignment must not append a
    // second DEPURACIÓN paragraph for a report that is no longer there.
    const snap = assignmentsSnapshot([
      assignment(OLD_ID, { status: 'archived' }),
      assignment(NEW_ID),
    ])
    expect(() => archiveAssignment(snap, reportsSnapshot(), OPTS)).toThrow(
      /only a promoted assignment/,
    )
  })

  it('refuses a superseding assignment that is not promoted', () => {
    const snap = assignmentsSnapshot([
      assignment(OLD_ID),
      assignment(NEW_ID, { status: 'drafted' }),
    ])
    expect(() => archiveAssignment(snap, reportsSnapshot(), OPTS)).toThrow(/superseding assignment/)
  })

  it('refuses an unknown assignment and an unknown superseding assignment', () => {
    expect(() =>
      archiveAssignment(assignmentsSnapshot(), reportsSnapshot(), {
        ...OPTS,
        assignmentId: 'a-nobody',
      }),
    ).toThrow(/a-nobody not found/)
    expect(() =>
      archiveAssignment(assignmentsSnapshot(), reportsSnapshot(), {
        ...OPTS,
        supersededBy: 'a-nobody-v2',
      }),
    ).toThrow(/a-nobody-v2 not found/)
  })

  it('refuses a reason shorter than 20 chars once trimmed', () => {
    expect(() =>
      archiveAssignment(assignmentsSnapshot(), reportsSnapshot(), {
        ...OPTS,
        reason: 'superseded',
      }),
    ).toThrow(/≥20/)
    // Padding is not an explanation.
    expect(() =>
      archiveAssignment(assignmentsSnapshot(), reportsSnapshot(), {
        ...OPTS,
        reason: '        superseded          ',
      }),
    ).toThrow(/≥20/)
  })

  it('refuses self-supersession', () => {
    expect(() =>
      archiveAssignment(assignmentsSnapshot(), reportsSnapshot(), {
        ...OPTS,
        supersededBy: OLD_ID,
      }),
    ).toThrow(/itself/)
  })

  it('refuses a malformed today so the public log never carries a garbage date', () => {
    expect(() =>
      archiveAssignment(assignmentsSnapshot(), reportsSnapshot(), { ...OPTS, today: '6/9/2026' }),
    ).toThrow(/YYYY-MM-DD/)
  })

  it('refuses a blank curator so the note always says who signed the retirement', () => {
    expect(() =>
      archiveAssignment(assignmentsSnapshot(), reportsSnapshot(), { ...OPTS, curator: '   ' }),
    ).toThrow(/curator/)
  })
})
