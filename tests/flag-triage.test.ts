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
import { cifrasDe, indexarCifras, localizar, anclada, contextoDe } from '../src/scraper/flag-triage'

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

/**
 * The first dry run over the 18-10 flags listed «13», «20» and «28» against
 * hundreds of coste-efectivo rows: two were pieces of dates («13 de octubre»,
 * «2026-09-28») and one an article number. A location list that long is noise
 * a reader has to wade through, and handing it to a model invites it to pick
 * one. Dates are not figures; a value found everywhere is said to be common.
 */
describe('what is not worth locating', () => {
  it('does not read dates as figures', () => {
    const v = cifrasDe('el 13 de octubre de 2026, la entrada 2026-09-28 y el 09/09/2026').map(
      (c) => c.valor,
    )
    expect(v).toEqual([2026])
  })

  it('locates each value once, however often the flag repeats it', () => {
    const indice = indexarCifras({ 'a.json': { x: 715 } })
    expect(localizar(cifrasDe('715 aquí y 715 allí'), indice)).toHaveLength(1)
  })

  it('calls a value found in many places common instead of listing them', () => {
    const muchos = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`f${i}.json`, { n: 20 }]),
    )
    const [l] = localizar(cifrasDe('20'), indexarCifras(muchos))
    expect(l.comun).toBe(true)
    expect(l.ubicaciones).toEqual([])
  })
})

/**
 * The first real run (18-10, ten flags) came back «indecidible» nine times,
 * each saying why: «no veo el párrafo completo», and «68,0 M€ no se puede
 * situar» about a figure stored as 68.041.517,23. The second reader needs the
 * passage around the flagged sentence — in the published data for a reportaje,
 * in the page's source for interface copy — and amounts in millions matched at
 * the precision they are printed with.
 */
describe('millions, at the precision printed', () => {
  const indice = indexarCifras({ 'tenders.json': { stats: { totalAdjudicado: 68041517.23 } } })

  it('matches «68,0 M€» to an amount that rounds to it', () => {
    const [l] = localizar(cifrasDe('son 68,0 M€ sobre 698 contratos'), indice)
    expect(l.cifra.escala).toBe(1e6)
    expect(l.ubicaciones).toContainEqual({ file: 'tenders.json', path: 'stats.totalAdjudicado' })
  })

  it('does not match a different amount in millions', () => {
    const [l] = localizar(cifrasDe('14,05 millones'), indice)
    expect(l.ubicaciones).toEqual([])
  })
})

describe('contextoDe', () => {
  const textos = [
    {
      file: 'public/data/reportajes/x.json',
      text:
        'Antes. ' +
        'Relleno de la pieza. '.repeat(20) +
        'La serie va de 2014 a 2024, y cero en las cinco de en medio, que es lo que falta. Después.',
    },
    {
      file: 'src/pages/Y.jsx',
      text: '<p>\n  Importes sin IVA, sobre contratos\n  adjudicados (datos a {fecha}).\n</p>',
    },
  ]

  it('returns the passage around the sentence, and where it lives', () => {
    const c = contextoDe('y cero en las cinco de en medio', textos)
    expect(c?.file).toBe('public/data/reportajes/x.json')
    expect(c?.pasaje).toContain('La serie va de 2014 a 2024')
  })

  it('finds interface copy in the source even when JSX breaks the line', () => {
    const c = contextoDe(
      'Importes sin IVA, sobre contratos adjudicados (datos a 2026-07-06).',
      textos,
    )
    expect(c?.file).toBe('src/pages/Y.jsx')
  })

  it('says null when the sentence is nowhere, instead of guessing', () => {
    expect(contextoDe('una frase que no está en ninguna parte', textos)).toBeNull()
  })
})

describe('anclada — the passage handed to the model is evidence too', () => {
  // 18-10: a second reading about /eficiencia cited «62,5» and «77,5» from the
  // passage it had been given, and was thrown out as ungrounded.
  it('accepts a figure printed in the passage', () => {
    const flag = {
      quote: 'Riba-roja repite el 100 %',
      inference: 'x'.repeat(12),
      contradictedBy: 'y'.repeat(6),
    }
    const indice = indexarCifras({})
    expect(anclada('va de 62,5 a 77,5', flag, indice, 'un reparto de 62,5 a 77,5 %').ok).toBe(true)
    expect(anclada('va de 62,5 a 77,5', flag, indice).ok).toBe(false)
  })
})
