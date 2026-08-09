/**
 * Invariants over `public/data/pleno-findings.json` as it is published.
 *
 * The unit tests next door pin the CLI and the schema. These pin the file —
 * the artifact Vercel serves and /hallazgos renders — because every defect
 * repaired here reached a reader through the file and not through a function.
 *
 * Each block asserts that it EVALUATED SOMETHING before asserting that it
 * found nothing. Two suites in this repo were green while measuring nothing
 * (docs/DATA_INTEGRITY.md); a "no bad rows" test over an empty selection is
 * the same shape.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  CORRECTION_REMOVAL_FIELD_RE,
  type PlenoFinding,
  type PlenoFindingsSnapshot,
} from '../src/scraper/pleno-finding'

/**
 * Parsed RAW, deliberately — not through `validateFindingsSnapshot`.
 *
 * The validator strips the similarity annotation on the way through, so a
 * suite that reads the file through it asserts the strip works and says
 * nothing about the bytes Vercel serves. Ablation caught exactly that: with
 * `· sim=0.50` written back into the file by hand, the first version of this
 * suite stayed green. The browser has no validator — `useJsonFetch` hands the
 * parsed JSON straight to the page — so the file is what the reader gets, and
 * the file is what these tests must read.
 */
const snapshot = JSON.parse(
  readFileSync(resolve('public/data/pleno-findings.json'), 'utf8'),
) as PlenoFindingsSnapshot
const items = snapshot.items
const byId = (id: string): PlenoFinding => {
  const f = items.find((x) => x.id === id)
  if (!f) throw new Error(`fixture drift: ${id} is no longer in pleno-findings.json`)
  return f
}
const allRefs = items.flatMap((f) => [...f.crossChecked, ...f.contradiction])
const allCorrections = items.flatMap((f) => f.corrections ?? [])
const removals = allCorrections.filter((c) => CORRECTION_REMOVAL_FIELD_RE.test(c.field))

describe('published pleno findings — no matcher internals in reader-facing text', () => {
  it('no snippet carries the similarity annotation', () => {
    // One did: «Aplicativo área de policía local · … · unknown · sim=0.50»
    // rendered under «Documentos cotejados», presenting a cosine score as
    // part of the record it cites.
    expect(allRefs.length).toBeGreaterThan(0)
    const leaking = allRefs.filter((r) => r.snippet.includes('sim='))
    expect(leaking.map((r) => r.snippet)).toEqual([])
  })

  it('no summary, title or quote carries it either', () => {
    const prose = items.flatMap((f) => [f.title, f.summary, ...f.quotes.map((q) => q.text)])
    expect(prose.length).toBeGreaterThan(0)
    expect(prose.filter((s) => s.includes('sim='))).toEqual([])
  })

  it('every snippet fits the label the reader is shown', () => {
    expect(allRefs.every((r) => r.snippet.length > 0 && r.snippet.length <= 240)).toBe(true)
  })
})

describe('published pleno findings — a removal does not republish what it removed', () => {
  it('there are removals to check', () => {
    // The measuring assertion. Everything below is vacuously true on an empty
    // selection, which is precisely how a green suite hides a regression.
    expect(removals.length).toBeGreaterThan(0)
  })

  it('records a digest and a marker, never the removed row', () => {
    for (const c of removals) {
      const noun = c.field.startsWith('quote.') ? 'cita' : 'documento cotejado'
      expect(c.original).toMatch(new RegExp(`^${noun} · sha256:[0-9a-f]{12}$`))
      expect(c.corrected).toMatch(/^retirad[ao] del hallazgo$/)
    }
  })

  it('no removal reason names anything — Paso 2 over the published file', () => {
    // `revisar-borrador` Paso 2: the note describes the CRITERION, never the
    // material. Three biographies had to be corrected twice on 2026-07-31
    // because their notes named exactly what the exclusion protected.
    //
    // Expressed WITHOUT a denylist of the removed names, which would put them
    // back in the repository under a different filename: a removal reason
    // must contain no proper noun at all. That is strictly stronger than "no
    // proper noun from the removed row", and it needs nothing but this file.
    const offences: string[] = []
    for (const c of removals) {
      for (const m of c.reason.matchAll(/\p{Lu}[\p{L}\p{M}’'-]*/gu)) {
        const before = c.reason.slice(0, m.index).trimEnd()
        if (before.length === 0 || /[.!?:;]$/.test(before)) continue
        offences.push(`${c.field}: «${m[0]}»`)
      }
    }
    expect(offences).toEqual([])
  })

  it('every reason still explains itself at IFCN length', () => {
    expect(removals.every((c) => c.reason.trim().length >= 20)).toBe(true)
    expect(removals.every((c) => c.editor.length > 1)).toBe(true)
  })
})

describe('published pleno findings — the three corrected on 2026-08-09', () => {
  /**
   * Each block asserts BOTH halves: the item is gone, AND the neighbours it
   * sat between are exactly as they were. A correction that also perturbs
   * adjacent content has to go red — that is the whole reason the surviving
   * rows are pinned by value here rather than by count.
   */

  it('f-2025-12-01-acu-51aaa3 stands on its two salvoconductos quotes', () => {
    const f = byId('f-2025-12-01-acu-51aaa3')
    expect(f.quotes).toHaveLength(2)
    expect(f.quotes.map((q) => q.sourceClaimId)).toEqual([
      'qz6weg-192-acu-975308',
      'qz6weg-193-acu-7589c9',
    ])
    expect(f.quotes.map((q) => q.speakerGroup)).toEqual([null, 'PSOE'])
    expect(f.quotes.every((q) => q.text.includes('salvoconductos'))).toBe(true)
    // The summary is about salvoconductos and never used the removed quote,
    // so it must not have moved.
    expect(f.summary).toContain('salvoconductos')
    expect(f.crossChecked).toHaveLength(3)
    expect(f.corrections?.map((c) => c.field)).toEqual(['summary', 'quote.0'])
  })

  it('f-2025-10-06-acu-bba0e9 keeps all four quotes and the refs that name nobody', () => {
    const f = byId('f-2025-10-06-acu-bba0e9')
    // Untouched: this finding's quotes were never in scope.
    expect(f.quotes).toHaveLength(4)
    expect(f.quotes.map((q) => q.speakerGroup)).toEqual(['PSOE', 'VOX', 'PP', 'PP'])
    // The bloc-attributed VOX quote and the summary sentence it supports stay:
    // whether to publish them at all is a curator's call, not a cleanup's.
    expect(f.summary).toContain('Itziar Moreno')
    // Three refs left, and not one of them carries a person's name.
    expect(f.crossChecked).toHaveLength(4)
    expect(f.crossChecked.filter((r) => r.kind === 'tender')).toHaveLength(3)
    expect(f.crossChecked.some((r) => r.kind === 'pleno-video')).toBe(true)
    expect(f.corrections?.map((c) => c.field)).toEqual(['summary', 'crossChecked.1'])
  })

  it('f-2025-10-06-cit-591d40 no longer anchors the debate to an unrelated expediente', () => {
    const f = byId('f-2025-10-06-cit-591d40')
    // The sentence that presented a contract as the debate's context is gone…
    expect(f.summary).not.toContain('El debate coincide')
    // …and the two sentences that carried the finding are verbatim intact.
    expect(f.summary).toContain('unidad de policía local que asiste a mujeres vulnerables')
    expect(f.summary).toContain('pulseras telemáticas de control de agresores')
    // Three quotes: the two PSOE ones the summary uses, and the PP one.
    expect(f.quotes).toHaveLength(3)
    expect(f.quotes.map((q) => q.speakerGroup)).toEqual(['PSOE', 'PSOE', 'PP'])
    expect(f.quotes.every((q) => q.speakerGroup !== null)).toBe(true)
    expect(f.crossChecked).toHaveLength(3)
    expect(f.corrections?.map((c) => c.field)).toEqual([
      'summary',
      'quote.2',
      'crossChecked.2',
      'crossChecked.0',
    ])
  })

  it('every quote still keys a claim the finding declares, on every finding', () => {
    // Removing a quote must not orphan the citation trail. Checked across the
    // whole file, not just the three: the invariant is not local to them.
    let checked = 0
    for (const f of items) {
      const declared = new Set(f.sourceClaimIds)
      for (const q of f.quotes) {
        checked += 1
        expect(declared.has(q.sourceClaimId)).toBe(true)
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
})
