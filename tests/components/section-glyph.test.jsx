import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SECTION_GLYPHS, glyphFor, SectionGlyph } from '../../src/components/SectionGlyph'
import { NAV } from '../../src/components/Sidebar'
import { NAV_SECONDARY } from '../../src/nav'

// The canonical assignment from Detalles Gráficos v2 §03 ("Un glifo, una sección").
const SPEC = {
  '/': '◉',
  '/cambios': '✦',
  '/cargos': '◇',
  '/presupuesto': '€',
  '/plenos': '▤',
  '/promesas': '▣',
  '/departamentos': '▦',
  '/hallazgos': '▲',
  '/declaraciones': '❝',
  '/datos': '▥',
  '/quejas': '◍',
  '/laboratorio': '◈',
}

describe('SectionGlyph — canonical per-section assignment', () => {
  it('assigns the exact spec glyph to every documented section', () => {
    for (const [to, glyph] of Object.entries(SPEC)) {
      expect(SECTION_GLYPHS[to], `glyph for ${to}`).toBeTruthy()
      expect(SECTION_GLYPHS[to].glyph, `glyph char for ${to}`).toBe(glyph)
    }
  })

  it('marks Laboratorio (the AI surface) with the intel tone — the deliberate §03 exception', () => {
    expect(SECTION_GLYPHS['/laboratorio'].tone).toBe('intel')
    expect(SECTION_GLYPHS['/promesas'].tone).toBe('civic')
  })

  it('gives every nav route a glyph — primary + secondary, no section left unmarked', () => {
    // Both the labelled Sidebar and the landing's section bar render these from
    // the shared src/nav.js, each row led by its glyph, so every one needs one.
    for (const n of [...NAV, ...NAV_SECONDARY]) {
      expect(SECTION_GLYPHS[n.to], `nav route ${n.to} needs a glyph`).toBeTruthy()
    }
  })

  it('assigns a unique glyph to every section — resolves the scale×2 / warn×3 collisions', () => {
    const glyphs = Object.values(SECTION_GLYPHS).map((g) => g.glyph)
    expect(new Set(glyphs).size).toBe(glyphs.length)
  })

  it('glyphFor falls back to a neutral dot for an unknown route', () => {
    const fb = glyphFor('/does-not-exist')
    expect(fb.glyph).toBeTruthy()
    expect(fb.tone).toBe('civic')
    expect(glyphFor('/promesas').glyph).toBe('▣')
  })
})

describe('SectionGlyph — render', () => {
  it('renders the glyph character for a route', () => {
    const { container } = render(
      <MemoryRouter>
        <SectionGlyph to="/quejas" />
      </MemoryRouter>,
    )
    expect(container.textContent).toContain('◍')
  })

  it('colors the intel-tone glyph with the intel token, civic glyphs inherit currentColor', () => {
    const { container: lab } = render(<SectionGlyph to="/laboratorio" />)
    expect(lab.querySelector('[data-section-glyph]').style.color).toContain('--intel')

    const { container: civic } = render(<SectionGlyph to="/promesas" />)
    // The CSSOM lowercases the keyword — assert case-insensitively.
    expect(civic.querySelector('[data-section-glyph]').style.color.toLowerCase()).toBe(
      'currentcolor',
    )
  })

  it('is aria-hidden — the adjacent text label is the accessible name', () => {
    const { container } = render(<SectionGlyph to="/datos" />)
    expect(container.querySelector('[data-section-glyph]').getAttribute('aria-hidden')).toBe('true')
  })
})
