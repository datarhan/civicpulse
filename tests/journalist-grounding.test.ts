import { describe, it, expect } from 'vitest'
import { groundNarrativeSections } from '../src/scraper/journalist-agent/grounding'
import type { ReportSection, SourceCitation } from '../src/scraper/journalist'

const src = (id: string, excerpt?: string): SourceCitation => ({
  id,
  kind: 'web',
  url: 'https://example.gob.es/x',
  title: `Fuente ${id}`,
  retrievedAt: '2026-07-29T00:00:00Z',
  trust: 'medium',
  ...(excerpt ? { excerpt } : {}),
})

const narrative = (heading: string, body: string, sourceIds: string[]): ReportSection => ({
  kind: 'narrative',
  payload: { heading, bodyMarkdown: body, sourceIds },
})

describe('groundNarrativeSections', () => {
  it('passes a narrative whose facts and figures appear in the cited excerpts', () => {
    const sections = [
      narrative(
        'Reconstrucción',
        'El Ayuntamiento cifró en 12 millones los daños de la DANA en la zona industrial.',
        ['src-1'],
      ),
    ]
    const sources = [
      src(
        'src-1',
        'Riba-roja cifra en 12 millones de euros los daños provocados por la DANA en la zona industrial del municipio.',
      ),
    ]
    const out = groundNarrativeSections(sections, sources)
    expect(out.checked).toBe(1)
    expect(out.warnings).toEqual([])
  })

  it('flags figures that appear in no cited excerpt (fabricated-number signal)', () => {
    const sections = [
      narrative(
        'Presupuesto',
        'El presupuesto de reconstrucción asciende a 47 millones, aprobado en 2019.',
        ['src-1'],
      ),
    ]
    const sources = [
      src('src-1', 'El pleno aprobó el plan de reconstrucción tras la DANA con amplio consenso.'),
    ]
    const out = groundNarrativeSections(sections, sources)
    expect(out.warnings).toHaveLength(1)
    expect(out.warnings[0]).toContain('Presupuesto')
    expect(out.warnings[0]).toContain('47')
    expect(out.warnings[0]).toContain('2019')
  })

  it('flags a narrative with very low lexical overlap against its citations', () => {
    const sections = [
      narrative(
        'Trayectoria',
        'Estudió ingeniería aeronáutica en Múnich y trabajó en la industria automovilística bávara.',
        ['src-1'],
      ),
    ]
    const sources = [src('src-1', 'El alcalde presentó el cartel de fiestas patronales.')]
    const out = groundNarrativeSections(sections, sources)
    expect(out.warnings.length).toBeGreaterThanOrEqual(1)
    expect(out.warnings.join(' ')).toContain('Trayectoria')
  })

  it('warns when the cited sources carry no excerpts at all', () => {
    const sections = [
      narrative('Sin extractos', 'Afirmación imposible de contrastar aquí.', ['src-1']),
    ]
    const sources = [src('src-1')] // no excerpt
    const out = groundNarrativeSections(sections, sources)
    expect(out.warnings).toHaveLength(1)
    expect(out.warnings[0]).toContain('sin extractos')
  })

  it('ignores non-narrative sections and handles empty input', () => {
    const out = groundNarrativeSections(
      [{ kind: 'promise-board', payload: { promiseIds: [] } } as ReportSection],
      [],
    )
    expect(out.checked).toBe(0)
    expect(out.warnings).toEqual([])
  })
})
