import { describe, it, expect } from 'vitest'
import { PREGUNTA_DE_LA_COLA } from '../src/scraper/finding-exception'
import {
  isReviewed,
  migrarRegistro,
  pendientesDeRevision,
  recordReview,
  staleReviews,
  summaryHash,
  REVIEW_LOG_VERSION,
  type ExceptionReview,
  type ExceptionReviewLog,
} from '../src/scraper/finding-exception-review'

const review = (over: Partial<ExceptionReview> = {}): ExceptionReview => ({
  findingId: 'f-1',
  decision: 'keep',
  reviewer: 'alguien',
  reviewedAt: '2026-08-11T00:00:00.000Z',
  summaryHash: summaryHash('un sumario cualquiera'),
  note: 'relata lo dicho sin afirmarlo como hecho comprobado',
  ...over,
})

const log = (reviews: ExceptionReview[]): ExceptionReviewLog => ({
  version: REVIEW_LOG_VERSION,
  generatedAt: '2026-08-11T00:00:00.000Z',
  reviews,
})

describe('summaryHash', () => {
  it('ignores whitespace reflowing, which is not an editorial change', () => {
    expect(summaryHash('un  sumario\n cualquiera')).toBe(summaryHash('un sumario cualquiera'))
  })

  it('changes when a word changes', () => {
    expect(summaryHash('el PSOE afirma')).not.toBe(summaryHash('el PP afirma'))
  })
})

describe('isReviewed', () => {
  it('is true only for the exact summary that was judged', () => {
    const l = log([review()])
    expect(isReviewed(l, 'f-1', 'un sumario cualquiera')).toBe(true)
  })

  /**
   * The property the whole log rests on. A reviewer cleared specific words, not
   * an id; if the words change, nobody has judged what is now published.
   */
  it('is FALSE once the summary is edited', () => {
    const l = log([review()])
    expect(isReviewed(l, 'f-1', 'un sumario cualquiera, ampliado')).toBe(false)
  })

  describe('fails towards unreviewed', () => {
    it.each([
      ['no log at all', null],
      ['empty log', log([])],
      ['a different finding', log([review({ findingId: 'f-otro' })])],
    ])('%s', (_label, l) => {
      expect(isReviewed(l as ExceptionReviewLog | null, 'f-1', 'un sumario cualquiera')).toBe(false)
    })
  })
})

describe('recordReview', () => {
  it('adds a review', () => {
    expect(recordReview(null, review()).reviews).toHaveLength(1)
  })

  /** One current entry per finding, not a pile of stale ones. */
  it('replaces an earlier review of the same finding', () => {
    const first = recordReview(null, review())
    const second = recordReview(first, review({ summaryHash: summaryHash('reescrito') }))
    expect(second.reviews).toHaveLength(1)
    expect(second.reviews[0].summaryHash).toBe(summaryHash('reescrito'))
  })

  it('keeps reviews of other findings', () => {
    const l = recordReview(log([review({ findingId: 'f-otro' })]), review())
    expect(l.reviews.map((r) => r.findingId).sort()).toEqual(['f-1', 'f-otro'])
  })
})

describe('staleReviews', () => {
  it('finds a review whose summary moved on', () => {
    const l = log([review()])
    const stale = staleReviews(l, new Map([['f-1', 'otro sumario']]))
    expect(stale.map((r) => r.findingId)).toEqual(['f-1'])
  })

  it('finds a review whose finding no longer exists', () => {
    expect(staleReviews(log([review()]), new Map()).map((r) => r.findingId)).toEqual(['f-1'])
  })

  it('is empty when every review still describes what is published', () => {
    expect(staleReviews(log([review()]), new Map([['f-1', 'un sumario cualquiera']]))).toEqual([])
  })
})

/**
 * Una revisión responde a la pregunta de su versión, y a ninguna otra.
 *
 * La v1 del registro guarda respuestas a «¿merece este hallazgo la excepción?»,
 * una pregunta cuya respuesta no cambiaba nada de la página —entre ellas, las
 * 28 «keep» del 11-08-2026—. Desde el 30-09-2026 la cola pregunta si el sumario
 * dice con otras palabras lo que la cita retenida no puede decir, y una
 * respuesta a la pregunta vieja no puede sacar una ficha de la cola nueva.
 * Tampoco se tira: el registro vive en editorial/, sin otra copia.
 */
describe('las revisiones de una versión anterior no cuentan', () => {
  const V1 = 'finding-exception-review-v1'
  const registroV1 = (reviews: ExceptionReview[]): ExceptionReviewLog => ({
    version: V1,
    generatedAt: '2026-08-11T09:07:22.909Z',
    reviews,
  })

  it('la versión vigente ya no es la v1', () => {
    expect(REVIEW_LOG_VERSION).not.toBe(V1)
  })

  it('una «keep» de la v1 NO cuenta, aunque se ate al sumario vigente', () => {
    expect(isReviewed(registroV1([review()]), 'f-1', 'un sumario cualquiera')).toBe(false)
  })

  it('ni la cuenta pendientesDeRevision', () => {
    const filas = [{ findingId: 'f-1', summary: 'un sumario cualquiera' }]
    const { pendientes, revisadas } = pendientesDeRevision(filas, registroV1([review()]))
    expect(pendientes).toEqual(filas)
    expect(revisadas).toEqual([])
  })

  it('al migrar no se pierde ninguna: van a `anteriores`, con la pregunta a la que respondían', () => {
    const viejas = [review(), review({ findingId: 'f-otro' })]
    const m = migrarRegistro(registroV1(viejas), '2026-09-30T00:00:00.000Z')
    expect(m.version).toBe(REVIEW_LOG_VERSION)
    expect(m.reviews).toEqual([])
    expect(m.anteriores).toHaveLength(1)
    expect(m.anteriores![0].version).toBe(V1)
    expect(m.anteriores![0].reviews).toEqual(viejas)
    expect(m.anteriores![0].pregunta).toMatch(/merece .*excepci[oó]n/i)
    for (const r of viejas) expect(isReviewed(m, r.findingId, 'un sumario cualquiera')).toBe(false)
  })

  it('y la cabecera del registro lo dice', () => {
    const m = migrarRegistro(registroV1([review()]), '2026-09-30T00:00:00.000Z')
    expect(m.pregunta).toBe(PREGUNTA_DE_LA_COLA)
    expect(m._comment).toContain(REVIEW_LOG_VERSION)
    expect(m._comment).toContain('anteriores')
    expect(m._comment).toMatch(/no cuentan/i)
    expect(m._comment).toMatch(/editorial\//)
  })

  it('recordReview migra antes de anotar: la nueva cuenta, las viejas siguen sin contar', () => {
    const l = recordReview(
      registroV1([review()]),
      review({ findingId: 'f-2', summaryHash: summaryHash('otro sumario') }),
    )
    expect(l.version).toBe(REVIEW_LOG_VERSION)
    expect(l.reviews.map((r) => r.findingId)).toEqual(['f-2'])
    expect(isReviewed(l, 'f-2', 'otro sumario')).toBe(true)
    expect(isReviewed(l, 'f-1', 'un sumario cualquiera')).toBe(false)
    expect(l.anteriores?.[0].reviews.map((r) => r.findingId)).toEqual(['f-1'])
    expect(l._comment).toMatch(/no cuentan/i)
  })

  it('migrar dos veces no duplica nada, y un registro vigente conserva sus revisiones', () => {
    const una = migrarRegistro(registroV1([review()]), '2026-09-30T00:00:00.000Z')
    const dos = migrarRegistro(una, '2026-10-01T00:00:00.000Z')
    expect(dos.anteriores).toEqual(una.anteriores)
    expect(dos.reviews).toEqual(una.reviews)

    const vigente = recordReview(null, review())
    expect(migrarRegistro(vigente, '2026-10-01T00:00:00.000Z').reviews).toEqual(vigente.reviews)
    expect(migrarRegistro(vigente, '2026-10-01T00:00:00.000Z').anteriores).toBeUndefined()
  })

  it('un registro sin revisiones que migrar no inventa un bloque vacío', () => {
    expect(migrarRegistro(registroV1([]), '2026-09-30T00:00:00.000Z').anteriores).toBeUndefined()
    expect(migrarRegistro(null, '2026-09-30T00:00:00.000Z').anteriores).toBeUndefined()
  })
})

describe('pendientesDeRevision', () => {
  it('separa lo mantenido a este sumario de lo que falta por mirar', () => {
    const filas = [
      { findingId: 'f-1', summary: 'un sumario cualquiera' },
      { findingId: 'f-2', summary: 'otro' },
    ]
    const { pendientes, revisadas } = pendientesDeRevision(filas, recordReview(null, review()))
    expect(revisadas.map((r) => r.findingId)).toEqual(['f-1'])
    expect(pendientes.map((r) => r.findingId)).toEqual(['f-2'])
  })

  it('sin registro, todo pendiente', () => {
    const filas = [{ findingId: 'f-1', summary: 'un sumario cualquiera' }]
    expect(pendientesDeRevision(filas, null).pendientes).toEqual(filas)
  })
})
