import { describe, it, expect } from 'vitest'
import {
  extractOrgCandidates,
  findUnbackedOrgNames,
  foldForLookup,
  NON_COMPANY_ACRONYMS,
} from '../src/scraper/finding-entities'

const names = (t: string) =>
  extractOrgCandidates(t)
    .map((c) => c.name)
    .sort()

describe('extractOrgCandidates', () => {
  it('catches an explicitly named company — the FCC shape', () => {
    const t =
      'Según el registro municipal, la empresa FCC comenzó a operar bajo contrato de emergencia.'
    const c = extractOrgCandidates(t)
    expect(c.find((x) => x.name === 'FCC')?.via).toBe('empresa-phrase')
  })

  it('catches multi-word razón social after the empresa phrase', () => {
    expect(names('adjudicado a la mercantil Obras Publicas Montaner')).toContain(
      'Obras Publicas Montaner',
    )
  })

  it('ignores dataset, statute and party acronyms', () => {
    // Without this the check drowns in its own vocabulary and gets muted.
    const t = 'El PSOE y el PP citan BDNS, PLACSP y la LPACAP; el expediente no consta en el BOE.'
    expect(names(t)).toEqual([])
  })

  it('every acronym in the exclusion set is actually excluded', () => {
    for (const a of NON_COMPANY_ACRONYMS) {
      expect(names(`consta en ${a} el expediente`)).not.toContain(a)
    }
  })

  it('ignores the municipality and institutional nouns', () => {
    expect(names('El Ayuntamiento de Riba-roja de Túria y la Generalitat')).toEqual([])
  })

  it('returns nothing for empty or missing prose', () => {
    expect(extractOrgCandidates('')).toEqual([])
    expect(extractOrgCandidates(undefined as unknown as string)).toEqual([])
  })
})

describe('findUnbackedOrgNames', () => {
  const findings = [
    { id: 'f-1', summary: 'la empresa FCC operó con contrato de emergencia' },
    { id: 'f-2', summary: 'adjudicado a la empresa Garbialdi para la recogida' },
  ]
  const haystack = 'Servicio de limpieza de caminos GARBIALDI, S.A. contrato de recogida'

  it('flags a company absent from the published data', () => {
    const flags = findUnbackedOrgNames(findings, haystack)
    expect(flags.map((f) => f.name)).toEqual(['FCC'])
  })

  it('does not flag a company that is present, whatever the casing or accents', () => {
    const flags = findUnbackedOrgNames(
      [{ id: 'f-3', summary: 'la empresa Garbialdi' }],
      'contrato con GARBIALDI, S.A.',
    )
    expect(flags).toEqual([])
  })

  it('suppresses names a human has already reviewed and accepted', () => {
    // Naming an absent company is often CORRECT — one real finding accurately
    // reports a councillor asking whether FCC was working.
    expect(findUnbackedOrgNames(findings, haystack, ['FCC'])).toEqual([])
  })

  it('matches the baseline regardless of accent or punctuation', () => {
    const f = [{ id: 'f-4', summary: 'la empresa Aigües' }]
    expect(findUnbackedOrgNames(f, '', ['Aigues'])).toEqual([])
  })

  it('reports which finding each name came from', () => {
    const flags = findUnbackedOrgNames(findings, haystack)
    expect(flags[0].findingId).toBe('f-1')
  })

  it('is quiet when there are no findings', () => {
    expect(findUnbackedOrgNames([], haystack)).toEqual([])
  })
})

describe('foldForLookup', () => {
  it('folds case, accents and punctuation so lookups are not defeated by spelling', () => {
    expect(foldForLookup('GARBIALDI, S.A.')).toBe('garbialdi sa')
    expect(foldForLookup('Aigües de València')).toBe('aigues de valencia')
  })
})
