/**
 * Clarity builders — reproducers from the 2026-07-30 operator review of the
 * published Robert Raga bio: (a) the bio-extract stage emits one gap row per
 * self-declared item (9 identical machine strings keyed by schema paths
 * drowned the block), (b) the promoted ledger carried 35 uncited search rows
 * incl. Wikipedia's «Robert (muñeco)». Pin the deterministic fixes.
 */
import { describe, expect, it } from 'vitest'
import {
  groupSelfDeclaredGaps,
  pruneUncitedSources,
} from '../src/scraper/journalist-agent/builders'
import type { ReportSection, SourceCitation } from '../src/scraper/journalist'

const MACHINE_REASON = 'sólo autodeclarado (CV oficial) — sin corroboración independiente'

describe('groupSelfDeclaredGaps', () => {
  it('collapses the per-item self-declared rows into one human row per theme', () => {
    const rows = [
      { field: 'identity.dateOfBirth', reason: MACHINE_REASON },
      { field: 'identity.birthplace', reason: MACHINE_REASON },
      { field: 'education[0]', reason: MACHINE_REASON },
      { field: 'education[1]', reason: MACHINE_REASON },
      { field: 'education[2]', reason: MACHINE_REASON },
      { field: 'careerPolitical[0]', reason: MACHINE_REASON },
      { field: 'careerProfessional[0]', reason: MACHINE_REASON },
      { field: 'careerProfessional[1]', reason: MACHINE_REASON },
      { field: 'careerProfessional[2]', reason: MACHINE_REASON },
      {
        field: 'careerPolitical (mandato 2023-actual)',
        reason: 'ninguna fuente indica explícitamente el año de inicio del tercer mandato',
      },
    ]
    const grouped = groupSelfDeclaredGaps(rows)
    expect(grouped.map((g) => g.field)).toEqual([
      'Identidad (nacimiento)',
      'Formación declarada',
      'Trayectoria declarada',
      'careerPolitical (mandato 2023-actual)',
    ])
    // Human reasons, no schema paths, no repeated machine string.
    for (const g of grouped.slice(0, 3)) {
      expect(g.reason).toMatch(/CV autodeclarado/)
      expect(g.reason).not.toBe(MACHINE_REASON)
    }
  })

  it('passes non-self-declared rows through untouched even when the field matches a theme', () => {
    const rows = [
      { field: 'education[0]', reason: 'la fuente citada no indica el año de titulación' },
    ]
    expect(groupSelfDeclaredGaps(rows)).toEqual(rows)
  })

  it('matches the accent-less «solo autodeclarado» variant too', () => {
    const rows = [
      { field: 'identity.dateOfBirth', reason: 'solo autodeclarado, sin corroboración' },
    ]
    expect(groupSelfDeclaredGaps(rows)).toEqual([
      { field: 'Identidad (nacimiento)', reason: expect.stringMatching(/CV autodeclarado/) },
    ])
  })
})

describe('pruneUncitedSources', () => {
  const src = (id: string, title: string): SourceCitation => ({
    id,
    kind: 'web',
    title,
    retrievedAt: '2026-07-30',
    trust: 'low',
  })

  it('keeps only sources cited by a section (sourceIds arrays and quote-card sourceId)', () => {
    const sections = [
      {
        kind: 'narrative',
        payload: { heading: 'H', bodyMarkdown: 'x'.repeat(40), sourceIds: ['src-001'] },
      },
      {
        kind: 'quote-card',
        payload: { verbatim: 'x'.repeat(24), attributedTo: 'A', sourceId: 'src-039' },
      },
      {
        kind: 'timeline',
        payload: { events: [{ date: '2023-05-28', label: 'Elecciones', sourceIds: ['src-008'] }] },
      },
    ] as unknown as ReportSection[]
    const sources = [
      src('src-001', 'Officials snapshot'),
      src('src-008', 'Resultados electorales'),
      src('src-039', 'Entrevista Las Provincias'),
      src('src-045', 'Robert (muñeco) - Wikipedia'),
      src('src-047', 'Robert Sánchez - Transfermarkt'),
    ]
    const kept = pruneUncitedSources(sections, sources)
    expect(kept.map((s) => s.id)).toEqual(['src-001', 'src-008', 'src-039'])
  })

  it('returns an empty ledger when no section cites anything', () => {
    expect(pruneUncitedSources([], [src('src-001', 'x')])).toEqual([])
  })
})
