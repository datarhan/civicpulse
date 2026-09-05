import { describe, it, expect } from 'vitest'
import { canonicalizeDepartment, canonicalizeDepartments } from '../src/scraper/departments'

/**
 * A delegated área is often a LIST («Juventud y Servicios Jurídicos»), and the
 * single-slug mapper can only answer with one department — the longest rule
 * wins, so «servicios juridicos» beat «juventud» and David Barbancho's card on
 * /cargos linked Servicios generales while the Juventud department, which
 * exists and which he holds, never appeared. The chips are navigation: every
 * department a portfolio names has to be reachable from it.
 *
 * The single-slug mapper is untouched — agenda items, votes and quejas name
 * one department and are counted once — so its behaviour is pinned here too.
 */
describe('departments — canonicalizeDepartments (compound portfolios)', () => {
  it('returns every department a compound área names, in reading order', () => {
    expect(canonicalizeDepartments('Juventud y Servicios Jurídicos')).toEqual([
      'juventud',
      'servicios-generales',
    ])
  })

  it('keeps a single-department área as a single chip', () => {
    expect(canonicalizeDepartments('Servicios públicos municipales')).toEqual([
      'servicios-generales',
    ])
    expect(canonicalizeDepartments('Arte y Cultura')).toEqual(['cultura'])
  })

  it('dedupes when both halves land on the same department', () => {
    expect(canonicalizeDepartments('Fallas, Fiestas y Tradiciones')).toEqual(['fiestas'])
  })

  it('answers nothing for an empty or unknown área, never a guess', () => {
    expect(canonicalizeDepartments('')).toEqual([])
    expect(canonicalizeDepartments('Asuntos varios sin departamento')).toEqual([])
  })

  it('leaves the single-slug mapper as it was (longest rule wins)', () => {
    expect(canonicalizeDepartment('Juventud y Servicios Jurídicos')).toBe('servicios-generales')
  })
})
