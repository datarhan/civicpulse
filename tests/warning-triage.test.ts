import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { triageWarnings, publishableWarnings } from '../src/scraper/journalist/warning-triage'

// REAL stage-4 output, frozen from draft a-robert-raga-bio-v4 (2026-07-30).
// Not an invented shape — DATA_INTEGRITY.md rule 1.
const FIXTURE = resolve(__dirname, 'fixtures/journalist-verify-warnings_2026-07-30.json')
const fx = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
  sourceIds: string[]
  warnings: string[]
}
const sources = fx.sourceIds.map((id) => ({ id }))
const triage = (warnings: string[], sections: unknown[] = []) =>
  triageWarnings({ warnings, sources, sections })

describe('warning-triage: the case it was built for', () => {
  it('refutes the two Raga v4 warnings that name five present ids as absent', () => {
    const out = triage(fx.warnings)
    const refuted = out.filter((t) => t.verdict === 'refuted')
    expect(refuted).toHaveLength(2)
    expect(refuted.map((r) => r.warning).join(' ')).toContain('src-021')
    expect(refuted.map((r) => r.warning).join(' ')).toContain('src-019')
    // The reason is for the curator's stderr, so it must name the ids.
    expect(refuted[0].reason).toMatch(/src-\d+/)
  })

  it('withholds exactly those two from publication and keeps the rest', () => {
    const out = triage(fx.warnings)
    const publishable = publishableWarnings(out)
    expect(publishable).toHaveLength(fx.warnings.length - 2)
    expect(publishable.join(' ')).not.toContain('which is absent from the provided sources')
  })
})

describe('warning-triage: what it must NOT touch', () => {
  // These name a source id but make a claim about its CONTENT. Deciding them
  // needs a reader. A triage module that deleted these would be a second
  // opinion silently overruling the first.
  it('leaves semantic claims about an excerpt alone, even when they name an id', () => {
    const semantic = [
      "identity: dateOfBirth/birthplace cited to src-001 only; src-001's excerpt has no birth data — actual support is in src-002 (citation mismatch).",
      "narrative[Trayectoria]: 'educación secundaria obligatoria' may overstate src-002's literal 'Educación 2ª obligatoria (EGB)'.",
      'career-political: 2015 start year is not directly shown in any cited excerpt (src-002 excerpt cuts off before political-role dates).',
    ]
    const out = triage(semantic)
    expect(out.every((t) => t.verdict === 'judgement')).toBe(true)
  })

  it('leaves warnings that name no id alone', () => {
    const out = triage([
      '[grounding] narrativa «Informe de la Junta Superior»: cifras sin respaldo: 02, 18',
      "narrative[Actividad plenaria]: 'secretaria general, Ylenia Díaz Morán' has no supporting citation excerpt — soften or corroborate.",
    ])
    expect(out.every((t) => t.verdict === 'judgement')).toBe(true)
  })

  it('does NOT refute an absence claim that is actually right', () => {
    const out = triage(['narrative[X]: cites src-999, which is absent from the provided sources.'])
    expect(out[0].verdict).toBe('judgement')
  })

  it('does NOT refute a partially-right absence claim', () => {
    // src-001 exists, src-999 does not. The curator must still see this.
    const out = triage(['narrative[X]: cites src-001/src-999, none present in provided sources.'])
    expect(out[0].verdict).toBe('judgement')
  })
})

describe('warning-triage: quote-card claims', () => {
  const sections = [
    {
      kind: 'quote-card',
      payload: {
        verbatim: 'los 50-60% que sí que se retiran de contenedores al día',
        sourceId: 'src-001',
      },
    },
  ]
  const withExcerpt = (excerpt: string) => ({
    warnings: ['quoteCard[0]: verbatim not found in cited excerpt'],
    sources: [{ id: 'src-001', excerpt }],
    sections,
  })

  it('refutes when the quote IS in the excerpt', () => {
    const out = triageWarnings(
      withExcerpt('pasar esos 50-60% que sí que se retiran de contenedores al día en el municipio'),
    )
    expect(out[0].verdict).toBe('refuted')
  })

  it('leaves it alone when the quote genuinely is not', () => {
    const out = triageWarnings(withExcerpt('una frase completamente distinta sobre otra cosa'))
    expect(out[0].verdict).toBe('judgement')
  })

  it('leaves it alone when the card or excerpt is missing', () => {
    const out = triageWarnings({
      warnings: ['quoteCard[7]: verbatim not found in cited excerpt'],
      sources: [{ id: 'src-001', excerpt: 'x' }],
      sections,
    })
    expect(out[0].verdict).toBe('judgement')
  })
})
