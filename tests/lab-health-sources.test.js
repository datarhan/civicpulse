import { describe, it, expect } from 'vitest'
import { LAB_SOURCES } from '../src/hooks/useLabHealth'

describe('lab-health source registry', () => {
  it('does not list the ungated monoliths (excluded from deploy)', () => {
    const paths = LAB_SOURCES.map((s) => s.path)
    expect(paths).not.toContain('/data/pleno-claims-verified.json')
    expect(paths).not.toContain('/data/pleno-claims-suggestions.json')
  })
  it('tracks the chunk manifest instead', () => {
    const paths = LAB_SOURCES.map((s) => s.path)
    expect(paths).toContain('/data/pleno-claims/index.json')
  })
})
