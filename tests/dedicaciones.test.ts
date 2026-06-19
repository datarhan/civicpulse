import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  validateDedicacionesSnapshot,
  dedicacionForSlug,
  DedicacionesValidationError,
  type DedicacionesSnapshot,
} from '../src/scraper/dedicaciones'

const SNAP = JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'data', 'dedicaciones.json'), 'utf8'),
) as DedicacionesSnapshot
const clone = (): DedicacionesSnapshot => JSON.parse(JSON.stringify(SNAP))

describe('scraper/dedicaciones — validateDedicacionesSnapshot', () => {
  it('accepts the committed curated snapshot', () => {
    expect(() => validateDedicacionesSnapshot(SNAP)).not.toThrow()
  })

  it('maps the 7 dedicación officials (mayor + 6), 14 sin dedicación', () => {
    expect(SNAP.byOfficial.length).toBe(7)
    expect(SNAP.sinDedicacionCount).toBe(14)
    expect(7 + 14).toBe(21)
  })

  it('every per-official amount matches a published bracket', () => {
    const brackets = new Set(SNAP.brackets.map((b) => b.amountEuros))
    for (const o of SNAP.byOfficial) expect(brackets.has(o.amountEuros)).toBe(true)
  })

  it('attributes the alcalde figure and the two pay tiers', () => {
    expect(dedicacionForSlug(SNAP, 'robert-raga-gadea')?.amountEuros).toBe(48234.08)
    const tiers = SNAP.byOfficial
      .filter((o) => o.slug !== 'robert-raga-gadea')
      .map((o) => o.amountEuros)
    expect(tiers.filter((a) => a === 43067.36).length).toBe(2)
    expect(tiers.filter((a) => a === 38891.66).length).toBe(4)
  })

  it('carries a verbatim citation to the acuerdo', () => {
    expect(SNAP.source.quote.length).toBeGreaterThanOrEqual(20)
    expect(SNAP.source.url).toMatch(/\.pdf$/i)
    expect(SNAP.source.date).toBe('2023-07-07')
  })

  it('rejects an out-of-band amount on a named official (libel guard)', () => {
    const bad = clone()
    bad.byOfficial.push({ slug: 'x', amountEuros: 99999, dedicacion: 'exclusiva', role: 'x' })
    expect(() => validateDedicacionesSnapshot(bad)).toThrow(/not one of the published brackets/)
  })

  it('rejects a source without a verbatim quote', () => {
    const bad = clone()
    bad.source.quote = 'short'
    expect(() => validateDedicacionesSnapshot(bad)).toThrow(DedicacionesValidationError)
  })
})
