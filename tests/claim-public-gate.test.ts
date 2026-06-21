import { describe, it, expect } from 'vitest'
import { classifyClaimVisibility, gateItemsForPublic } from '../src/scraper/claim-public-gate'

const item = (type: string, verdict: string | undefined, accusationSubtype?: string) => ({
  claim: {
    type,
    accusationSubtype,
    plenoId: 'p1',
    plenoDate: '2026-04-20',
    verbatim: 'x',
    segmentIndex: 0,
  },
  verification: { verdict, confidence: 1 },
})

describe('classifyClaimVisibility', () => {
  it('hides opinativa accusations regardless of verdict', () => {
    expect(classifyClaimVisibility(item('acusacion_publica', 'sin-datos', 'opinativa') as never)).toBe(
      'hidden',
    )
    expect(classifyClaimVisibility(item('acusacion_publica', 'verificado', 'opinativa') as never)).toBe(
      'hidden',
    )
  })
  it('hides factual/contra-datos accusations that are NOT data-grounded', () => {
    expect(classifyClaimVisibility(item('acusacion_publica', 'sin-datos', 'factual') as never)).toBe(
      'hidden',
    )
    expect(
      classifyClaimVisibility(item('acusacion_publica', 'sin-datos', 'contra-datos') as never),
    ).toBe('hidden')
  })
  it('shows data-grounded factual/contra-datos accusations', () => {
    expect(classifyClaimVisibility(item('acusacion_publica', 'contradicho', 'factual') as never)).toBe(
      'shown',
    )
    expect(
      classifyClaimVisibility(item('acusacion_publica', 'verificado', 'contra-datos') as never),
    ).toBe('shown')
  })
  it('treats a missing accusation subtype as opinativa (hidden)', () => {
    expect(classifyClaimVisibility(item('acusacion_publica', 'verificado', undefined) as never)).toBe(
      'hidden',
    )
  })
  it('shows data-grounded non-accusation claims', () => {
    expect(classifyClaimVisibility(item('afirmacion_numerica', 'verificado') as never)).toBe('shown')
    expect(classifyClaimVisibility(item('cita_obra', 'contradicho') as never)).toBe('shown')
    expect(classifyClaimVisibility(item('promesa', 'promesa-repetida') as never)).toBe('shown')
  })
  it('puts non-grounded non-accusation claims behind the toggle', () => {
    expect(classifyClaimVisibility(item('afirmacion_numerica', 'sin-datos') as never)).toBe('toggle')
  })
  it('fail-safe: unknown verdict never resolves to shown', () => {
    expect(classifyClaimVisibility(item('acusacion_publica', undefined, 'factual') as never)).toBe(
      'hidden',
    )
    expect(classifyClaimVisibility(item('afirmacion_numerica', 'weird-verdict') as never)).toBe(
      'toggle',
    )
  })
})

describe('gateItemsForPublic', () => {
  it('drops hidden items and stamps visibility on survivors', () => {
    const out = gateItemsForPublic([
      item('acusacion_publica', 'sin-datos', 'opinativa') as never, // hidden
      item('afirmacion_numerica', 'verificado') as never, // shown
      item('afirmacion_numerica', 'sin-datos') as never, // toggle
    ])
    expect(out).toHaveLength(2)
    expect(out.map((x) => x.visibility)).toEqual(['shown', 'toggle'])
  })
})
