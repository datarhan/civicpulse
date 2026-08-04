import { describe, it, expect } from 'vitest'
import {
  classifySelfDeclared,
  mapSelfDeclaredVerdicts,
  SelfDeclaredIndexError,
} from '../scripts/backfill-self-declared'

describe('classifySelfDeclared (title-only regex — CROSS-CHECK ONLY, does not decide)', () => {
  it('marks the subject-authored documents', () => {
    expect(classifySelfDeclared('CV autodeclarado (ficha oficial de transparencia) — Teresa')).toBe(
      true,
    )
    expect(
      classifySelfDeclared('CV publicado en el portal municipal — formación (autodeclarado)'),
    ).toBe(true)
    expect(
      classifySelfDeclared('Declaración de actividades — toma de posesión 2023 (expte. 4533)'),
    ).toBe(true)
    expect(classifySelfDeclared('Declaración de bienes patrimoniales 2023')).toBe(true)
  })

  it('marks independent records false', () => {
    expect(classifySelfDeclared('BOP n.º 79 — proclamación de electos')).toBe(false)
    expect(classifySelfDeclared('Acta constitutiva de la corporación, 13-06-2015')).toBe(false)
    expect(classifySelfDeclared('BOE-A-2018-3760 — Real Decreto 128/2018')).toBe(false)
  })

  it('returns null when it cannot tell, rather than guessing', () => {
    // An honest miss beats a wrong flag: null routes the row to the curator
    // instead of sealing self-declaration as corroborated.
    expect(classifySelfDeclared('Nota de prensa municipal, 12-03-2024')).toBeNull()
    expect(classifySelfDeclared('')).toBeNull()
  })

  it('no longer matches "PDF SN D." — that pattern encoded a wrong conclusion', () => {
    // 2026-08-04 review: this title's cited excerpt turned out to be a
    // HEADER (áreas delegated by mayoral decree, not self-declared) in one
    // report and a self-submitted CV BODY in another — the identical title
    // pattern, opposite ground truth. A title-only regex cannot see which;
    // the pattern that assumed it always meant `true` is gone for good, not
    // just skipped for the two known cases.
    expect(classifySelfDeclared('PDF SN D. ROBERT RAGA GADEA - ribarroja.es')).toBeNull()
    expect(classifySelfDeclared('PDF SN D. JOSÉ LUIS RAMOS MARCH - ribarroja.es')).toBeNull()
  })

  it('documents the known blind spot that demoted this regex to a cross-check', () => {
    // Real titles from journalist-reports.json, same underlying BOP notice,
    // same page-1 anuncio-cover excerpt in both — only the title wording
    // differs, and only one trips "declaración de actividades|bienes".
    // This is NOT something to "fix" in the regex: the point of the fix is
    // that title wording must never decide this field at all — the LLM
    // classifies the cited excerpt instead, and the regex stays only as a
    // logged cross-check.
    expect(
      classifySelfDeclared(
        'BOP de València n.º 180, 15-09-2023 (anuncio 2023/12011) — publicación de las declaraciones tras la toma de posesión',
      ),
    ).toBe(false)
    expect(
      classifySelfDeclared(
        'BOP de València n.º 180, 15-09-2023 (anuncio 2023/12011) — declaración de actividades y bienes, legislatura 2023-2027',
      ),
    ).toBe(true)
  })
})

describe("mapSelfDeclaredVerdicts (cite-by-index — the repo's standing anti-drift rule)", () => {
  it('maps a complete, in-range response back onto every index', () => {
    const out = mapSelfDeclaredVerdicts(3, [
      { index: 1, selfDeclared: true, motivo: 'CV en primera persona' },
      { index: 2, selfDeclared: false, motivo: 'anuncio del ayuntamiento' },
      { index: 3, selfDeclared: null, motivo: 'fragmento demasiado corto' },
    ])
    expect(out.get(1)).toEqual({ selfDeclared: true, motivo: 'CV en primera persona' })
    expect(out.get(2)).toEqual({ selfDeclared: false, motivo: 'anuncio del ayuntamiento' })
    expect(out.get(3)).toEqual({ selfDeclared: null, motivo: 'fragmento demasiado corto' })
  })

  it('throws — never repairs — on an index outside range', () => {
    // A drifted index would attach a selfDeclared verdict, a claim about how
    // a named person's record was sourced, to the wrong citation. Refusing
    // beats guessing which real source index 5 "probably" meant.
    expect(() =>
      mapSelfDeclaredVerdicts(3, [
        { index: 1, selfDeclared: true, motivo: 'x' },
        { index: 2, selfDeclared: true, motivo: 'x' },
        { index: 5, selfDeclared: true, motivo: 'x' },
      ]),
    ).toThrow(SelfDeclaredIndexError)
  })

  it('throws on a duplicated index', () => {
    expect(() =>
      mapSelfDeclaredVerdicts(2, [
        { index: 1, selfDeclared: true, motivo: 'x' },
        { index: 1, selfDeclared: false, motivo: 'y' },
      ]),
    ).toThrow(SelfDeclaredIndexError)
  })

  it('throws on an incomplete response (a source the model silently skipped)', () => {
    expect(() =>
      mapSelfDeclaredVerdicts(3, [
        { index: 1, selfDeclared: true, motivo: 'x' },
        { index: 2, selfDeclared: false, motivo: 'y' },
      ]),
    ).toThrow(SelfDeclaredIndexError)
  })

  it('passes a null verdict through unmodified — never coerced to false', () => {
    const out = mapSelfDeclaredVerdicts(1, [{ index: 1, selfDeclared: null, motivo: 'ambiguo' }])
    expect(out.get(1)?.selfDeclared).toBeNull()
  })
})
