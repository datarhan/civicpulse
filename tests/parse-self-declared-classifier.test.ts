import { describe, it, expect } from 'vitest'
import { classifySelfDeclared } from '../scripts/backfill-self-declared'

describe('classifySelfDeclared', () => {
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
})
