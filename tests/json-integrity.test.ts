import { describe, it, expect } from 'vitest'
import {
  inspectJsonText,
  CONFLICT_MARKERS_JSON,
  CONFLICT_MARKERS_SOURCE,
} from '../src/scraper/json-integrity'

// The exact bytes git writes. Reconstructed as a template rather than pasted,
// so this file does not itself trip `check:json`'s source scan.
const O = '<'.repeat(7)
const S = '='.repeat(7)
const C = '>'.repeat(7)
const conflicted = [
  `${O} Updated upstream`,
  '{ "items": [1] }',
  S,
  '{ "items": [2] }',
  `${C} Stashed changes`,
].join('\n')

describe('json-integrity — the ffab006 shape', () => {
  it('catches the file that sat in main for a day', () => {
    const v = inspectJsonText(conflicted)
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.reason).toBe('contains merge-conflict markers')
  })

  it('says "merge conflict", not "unexpected token"', () => {
    // A conflicted file is ALSO unparseable. The order of the two checks is the
    // difference between a diagnosis and a puzzle, so it is pinned here.
    expect(() => JSON.parse(conflicted)).toThrow()
    const v = inspectJsonText(conflicted)
    expect(v.ok === false && v.reason).not.toMatch(/token|JSON/i)
  })

  it('accepts an ordinary snapshot', () => {
    expect(inspectJsonText('{\n  "stats": { "total": 3 },\n  "items": []\n}\n').ok).toBe(true)
  })

  it('reports a parse error with its reason, truncated', () => {
    const v = inspectJsonText('{ "items": [1,2,')
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.reason.length).toBeLessThanOrEqual(80)
    expect(v.ok === false && v.reason.length).toBeGreaterThan(0)
  })

  it('rejects an empty file — zero bytes is not a document', () => {
    expect(inspectJsonText('').ok).toBe(false)
  })
})

describe('json-integrity — the two patterns differ ON PURPOSE', () => {
  // If someone ever "tidies" these into one constant, these tests say why not.
  it('the JSON pattern looks for the ======= separator', () => {
    expect(CONFLICT_MARKERS_JSON.test(`a\n${S}\nb`)).toBe(true)
  })

  it('the source pattern does NOT — a Markdown setext heading underlines with =', () => {
    expect(new RegExp(CONFLICT_MARKERS_SOURCE, 'm').test(`Título\n${S}\n\ntexto`)).toBe(false)
    // …but it still catches the marker that opens the conflict, which git
    // always writes alongside the separator.
    expect(new RegExp(CONFLICT_MARKERS_SOURCE, 'm').test(`${O} HEAD\nx`)).toBe(true)
  })

  it('a JSON string cannot legally contain a bare ======= line', () => {
    // This is what makes the separator arm safe for JSON specifically: a real
    // newline inside a string is illegal, so seven equals alone on a line can
    // only be a marker, never data.
    const escaped = JSON.stringify({ note: `antes\n${S}\ndespués` })
    expect(escaped).toContain('\\n')
    expect(inspectJsonText(escaped).ok).toBe(true)
  })

  it('does not fire on equals signs that are indented or longer', () => {
    expect(inspectJsonText(`{\n  "rule": "${S}"\n}`).ok).toBe(true)
    expect(CONFLICT_MARKERS_JSON.test(`a\n${'='.repeat(8)}\nb`)).toBe(false)
  })
})
