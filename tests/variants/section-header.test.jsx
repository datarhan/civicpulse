import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  SectionHeader,
  SECTION_TONES,
  sectionTone,
} from '../../src/variants/direction-d/SectionHeader'

describe('direction-d/SectionHeader — tone map', () => {
  it('every tone exposes bar + wash + ink strings', () => {
    const names = Object.keys(SECTION_TONES)
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      const t = SECTION_TONES[name]
      expect(typeof t.bar).toBe('string')
      expect(typeof t.wash).toBe('string')
      expect(typeof t.ink).toBe('string')
      expect(t.bar.length).toBeGreaterThan(0)
    }
  })

  it('exposes the semantic tones the editorial column needs', () => {
    for (const key of ['pleno', 'promesas', 'rendicion', 'prensa', 'contratos', 'participa']) {
      expect(SECTION_TONES[key]).toBeTruthy()
    }
  })

  it('sectionTone falls back to neutral for an unknown name', () => {
    expect(sectionTone('does-not-exist')).toBe(SECTION_TONES.neutral)
    expect(sectionTone('prensa')).toBe(SECTION_TONES.prensa)
  })
})

describe('direction-d/SectionHeader — render', () => {
  it('renders the title and right-aligned meta', () => {
    render(<SectionHeader tone="prensa" title="Prensa · 152 titulares" meta="17 medios" />)
    expect(screen.getByText('Prensa · 152 titulares')).toBeInTheDocument()
    expect(screen.getByText('17 medios')).toBeInTheDocument()
  })

  it('applies the tone as a left accent rule + tinted background band', () => {
    render(<SectionHeader tone="prensa" title="Prensa" />)
    const band = screen.getByText('Prensa').closest('[data-section-band]')
    expect(band).toBeTruthy()
    expect(band.style.borderLeftStyle).toBe('solid')
    expect(band.style.borderLeftWidth).toBe('3px')
    // A non-empty background wash is applied (exact rgba normalisation varies).
    expect(band.style.background).not.toBe('')
  })

  it('renders a badge node between the title and the meta', () => {
    render(
      <SectionHeader
        tone="promesas"
        title="Seguimiento de promesas"
        badge={<span>LOREG · congelado</span>}
        meta="16"
      />
    )
    expect(screen.getByText('LOREG · congelado')).toBeInTheDocument()
  })
})
