import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateReportsSnapshot } from '../src/scraper/journalist/validators'

const SNAP = JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'data', 'journalist-reports.json'), 'utf8'),
)
const clone = () => JSON.parse(JSON.stringify(SNAP))

describe('SourceCitation.selfDeclared', () => {
  it('survives validation instead of being silently dropped', () => {
    // validators.ts rebuilds each source field-by-field from an allow-list, so
    // a new field that is not added there vanishes on the way through and the
    // downstream axis silently reads `undefined` for every row.
    const s = clone()
    s.items[0].sources[0].selfDeclared = true
    const out = validateReportsSnapshot(JSON.stringify(s))
    expect(out.items[0].sources[0].selfDeclared).toBe(true)
  })

  it('keeps false distinct from absent', () => {
    // `undefined` means "nobody classified this yet" and must never render as
    // "independently corroborated". They are different facts.
    const s = clone()
    s.items[0].sources[0].selfDeclared = false
    const out = validateReportsSnapshot(JSON.stringify(s))
    expect(out.items[0].sources[0].selfDeclared).toBe(false)
    const t = clone()
    delete t.items[0].sources[0].selfDeclared
    expect(
      validateReportsSnapshot(JSON.stringify(t)).items[0].sources[0].selfDeclared,
    ).toBeUndefined()
  })

  it('rejects a non-boolean', () => {
    const s = clone()
    s.items[0].sources[0].selfDeclared = 'yes'
    expect(() => validateReportsSnapshot(JSON.stringify(s))).toThrow()
  })
})
