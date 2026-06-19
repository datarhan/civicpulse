import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  validateRetribucionesSnapshot,
  RetribucionesValidationError,
  type RetribucionesSnapshot,
} from '../src/scraper/retribuciones'

const SNAPSHOT = JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'data', 'retribuciones.json'), 'utf8'),
) as RetribucionesSnapshot

function clone(): RetribucionesSnapshot {
  return JSON.parse(JSON.stringify(SNAPSHOT))
}

describe('scraper/retribuciones — validateRetribucionesSnapshot', () => {
  it('accepts the committed curated snapshot', () => {
    expect(() => validateRetribucionesSnapshot(SNAPSHOT)).not.toThrow()
  })

  it('the committed snapshot carries a cited verbatim quote ≥20 chars', () => {
    expect(SNAPSHOT.source.quote.length).toBeGreaterThanOrEqual(20)
    expect(SNAPSHOT.source.url).toMatch(/^https?:\/\//)
  })

  it('every per-official amount matches a published bracket (no out-of-band figures)', () => {
    const brackets = new Set(SNAPSHOT.corporation.brackets.map((b) => b.amountEuros))
    for (const o of SNAPSHOT.byOfficial) expect(brackets.has(o.amountEuros)).toBe(true)
  })

  it('rejects a source without a verbatim quote (libel-risk guard)', () => {
    const bad = clone()
    bad.source.quote = 'too short'
    expect(() => validateRetribucionesSnapshot(bad)).toThrow(RetribucionesValidationError)
  })

  it('rejects a per-official figure that is not one of the published brackets', () => {
    const bad = clone()
    bad.byOfficial.push({ slug: 'fulano', amountEuros: 99999, regime: 'dedicación exclusiva' })
    expect(() => validateRetribucionesSnapshot(bad)).toThrow(/not one of the published brackets/)
  })

  it('rejects dedicacionCount greater than seats', () => {
    const bad = clone()
    bad.corporation.dedicacionCount = bad.corporation.seats + 1
    expect(() => validateRetribucionesSnapshot(bad)).toThrow(RetribucionesValidationError)
  })

  it('rejects a duplicate official slug', () => {
    const bad = clone()
    bad.byOfficial.push({ ...bad.byOfficial[0] })
    expect(() => validateRetribucionesSnapshot(bad)).toThrow(/duplicate/)
  })
})
