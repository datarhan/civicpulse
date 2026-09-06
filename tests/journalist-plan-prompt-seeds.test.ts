import { describe, it, expect } from 'vitest'
import { buildJournalistPlanUserPrompt } from '../src/llm/prompts'

/**
 * El planificador tiene diez preguntas. Si no sabe que la curaduría ya
 * sembró y descargó cuatro fuentes, gasta preguntas en volver a pedirlas.
 */
const assignment = {
  id: 'a-alberto-gimeno-bio-v2',
  kind: 'biography' as const,
  subjectName: 'Alberto José Gimeno Calvo',
  subjectSlug: 'alberto-gimeno-calvo',
  subjectKind: 'official' as const,
  brief: 'Biografía de registro público con las candidaturas 2007–2023 y los cargos societarios.',
}
const localHints = {
  officialRow: null,
  pressCount: 0,
  plenoClaimCount: 0,
  promiseCount: 0,
  judicialMentions: 0,
}

describe('buildJournalistPlanUserPrompt with seeded sources', () => {
  it('lista las fuentes sembradas como ya descargadas para que no se vuelvan a pedir', () => {
    const p = buildJournalistPlanUserPrompt({
      assignment,
      localHints,
      seededSources: [
        {
          title: 'El policía Alberto Gimeno será el candidato del PP',
          url: 'https://valenciaplaza.com/x',
        },
        { title: 'BOP n.º 82 — candidaturas 2019', url: 'https://bop.dival.es/bop/y.pdf' },
      ],
    })
    expect(p).toMatch(/CURATOR-SEEDED SOURCES \(already fetched — do not re-request\)/)
    expect(p).toContain(
      'El policía Alberto Gimeno será el candidato del PP — https://valenciaplaza.com/x',
    )
    expect(p).toContain('BOP n.º 82 — candidaturas 2019 — https://bop.dival.es/bop/y.pdf')
  })

  it('sin semillas el prompt no cambia', () => {
    const sin = buildJournalistPlanUserPrompt({ assignment, localHints })
    const vacio = buildJournalistPlanUserPrompt({ assignment, localHints, seededSources: [] })
    expect(sin).not.toMatch(/CURATOR-SEEDED/)
    expect(vacio).toBe(sin)
  })
})
