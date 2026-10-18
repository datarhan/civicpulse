/**
 * The deterministic half of the decision sheet the review sweep leaves after
 * each pass (`triage:senalamientos`).
 *
 * A reader-review flag says «a reader would conclude X, but the data says Y».
 * Half of them, measured by hand over the autumn, were wrong about the
 * implication while quoting real figures — the commonest being two CORRECT
 * figures from different fields. The first step of checking one is always the
 * same: where does each figure the flag quotes live in `public/data`? That is
 * mechanical, so it is done before any model is asked, and a model's proposal
 * that cites a figure found neither in the flag nor in the data is not shown
 * as a proposal at all.
 */
import { describe, it, expect } from 'vitest'
import { cifrasDe, indexarCifras, localizar, anclada } from '../src/scraper/flag-triage'

describe('cifrasDe', () => {
  it('reads Spanish-format figures as numbers', () => {
    const v = cifrasDe('Suman 328.461,34 € en 62,68 días; 805 contratos y un 30,4 %.').map(
      (c) => c.valor,
    )
    expect(v).toEqual([328461.34, 62.68, 805, 30.4])
  })

  it('marks a bare year, which locates nothing useful', () => {
    const [c] = cifrasDe('en 2024')
    expect(c.valor).toBe(2024)
    expect(c.esAnio).toBe(true)
  })

  it('skips single digits, which match everywhere', () => {
    expect(cifrasDe('los 3 grupos y 1 concejal')).toEqual([])
  })
})

describe('indexarCifras + localizar', () => {
  const datos = {
    'tenders.json': { stats: { adjudicados: 699 }, items: new Array(805).fill({ a: 1 }) },
    'dedicaciones.json': { brackets: [{ amountEuros: 59195.48, count: 1 }] },
  }
  const indice = indexarCifras(datos)

  it('finds a figure as a numeric field, with its path', () => {
    const [u] = localizar(cifrasDe('59.195,48 €'), indice)
    expect(u.ubicaciones).toContainEqual({
      file: 'dedicaciones.json',
      path: 'brackets[0].amountEuros',
    })
  })

  it('finds a count as the length of a list — «805 contratos» is rarely a stored number', () => {
    const [u] = localizar(cifrasDe('805 contratos'), indice)
    expect(u.ubicaciones).toContainEqual({ file: 'tenders.json', path: 'items.length' })
  })

  it('says when a figure is nowhere in the data', () => {
    const [u] = localizar(cifrasDe('725 contratos'), indice)
    expect(u.ubicaciones).toEqual([])
  })
})

describe('anclada', () => {
  const flag = {
    quote: 'en los 725 contratos con fecha de adjudicación',
    inference: 'Un lector entiende 725.',
    contradictedBy: 'Los hechos dan 715 contratos adjudicados.',
  }
  const indice = indexarCifras({ 'tenders.json': { stats: { adjudicados: 715 } } })

  it('accepts a reason whose figures come from the flag or the data', () => {
    expect(anclada('725 no está en el snapshot; 715 sí.', flag, indice)).toEqual({
      ok: true,
      sinAncla: [],
    })
  })

  it('rejects a reason citing a figure found in neither', () => {
    expect(anclada('El registro tiene 812 filas.', flag, indice)).toEqual({
      ok: false,
      sinAncla: ['812'],
    })
  })
})
