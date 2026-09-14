/**
 * Una queja retirada con `/olvidar` no cuenta en ningún recuento que se lea.
 *
 * `/olvidar` es el punto de cumplimiento del derecho al olvido: la fila se
 * conserva para auditoría —cinco años, art. 55 LOPD-GDD— pero deja de publicarse
 * y de tramitarse. El filtro `deleted_at IS NULL` estaba puesto en los ayudantes
 * de `db/queries.ts` y faltaba en las consultas escritas dentro de los comandos:
 * `/ranking` y `/digest` sumaban las retiradas.
 *
 * En `/ranking` no era sólo un recuento de más. La retirada entraba en `total`, y
 * `total` es el DENOMINADOR del porcentaje de resolución del barrio: el barrio
 * salía con una nota calculada sobre quejas que ya no existen.
 *
 * Ninguna de las dos funciones tenía prueba. Esto es cobertura nueva, no una
 * ampliación: de ahí que cada caso lleve su control con una queja viva al lado,
 * porque «no devuelve nada» también haría pasar un filtro que lo borre todo.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import { createQueja, setState, softDeleteQueja, type NewQuejaInput } from '../src/db/queries'
import { computeRanking } from '../src/commands/ranking'
import { computeDigest } from '../src/commands/digest'

function seed(db: Db, overrides: Partial<NewQuejaInput> = {}) {
  return createQueja(db, {
    telegram_user_id: 1,
    category: 'via_publica',
    title: 'Bache sin reparar',
    detail: 'Bache profundo en Av. Primera, 2 meses',
    neighborhood: 'casco',
    concejalia_area: 'Obra Pública',
    concejal_slug: 'teresa-pozuelo-martin',
    ...overrides,
  })
}

describe('/ranking — las retiradas no puntúan', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  it('no cuenta una queja retirada en el total del barrio', () => {
    const viva = seed(db)
    seedYRetira(db)
    const [casco] = computeRanking(db)
    expect(casco.neighborhood).toBe('casco')
    expect(casco.total, 'la retirada sigue sumando').toBe(1)
    expect(casco.pendientes).toBe(1)
    expect(viva.state).toBe('capturada')
  })

  it('y por eso no mueve el porcentaje de resolución', () => {
    // El caso que importa: una resuelta viva y una retirada. Con la retirada
    // dentro, el denominador es 2 y el barrio aparece al 50 % habiendo resuelto
    // todo lo que tenía.
    const resuelta = seed(db)
    setState(db, resuelta.id, 'resuelta')
    seedYRetira(db)
    const [casco] = computeRanking(db)
    expect(casco.total).toBe(1)
    expect(casco.resolucionPct, 'el denominador incluye una queja borrada').toBe(100)
  })

  it('con todo retirado, el barrio desaparece del ranking (el control)', () => {
    // Sin este control, «no cuenta las retiradas» lo cumpliría un filtro que
    // dejara fuera también las vivas.
    seedYRetira(db)
    expect(computeRanking(db)).toEqual([])
  })

  it('una queja viva sí puntúa (el otro control)', () => {
    seed(db)
    const [casco] = computeRanking(db)
    expect(casco.total).toBe(1)
  })
})

describe('/digest — las retiradas no suman en ninguna de las seis cuentas', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  it('nuevas y top de categorías dejan fuera la retirada', () => {
    seed(db, { category: 'alumbrado' })
    seedYRetira(db, { category: 'alumbrado' })
    const d = computeDigest(db, 7)
    expect(d.nuevas).toBe(1)
    expect(d.topCategorias).toEqual([{ category: 'alumbrado', n: 1 }])
  })

  it('resueltas deja fuera la retirada', () => {
    const viva = seed(db)
    setState(db, viva.id, 'resuelta')
    const ida = seedYRetira(db)
    setState(db, ida.id, 'resuelta')
    expect(computeDigest(db, 7).resueltas).toBe(1)
  })

  it('pendientes, silencios y escaladas dejan fuera la retirada', () => {
    // Los tres estados en una sola pasada, cada uno con su pareja viva/retirada.
    const pares: Array<[Parameters<typeof setState>[2], keyof ReturnType<typeof computeDigest>]> = [
      ['silencio_negativo', 'silencios'],
      ['escalada_sindic', 'escaladas'],
      ['en_tramite', 'pendientes'],
    ]
    for (const [estado] of pares) {
      const viva = seed(db)
      setState(db, viva.id, estado)
      const ida = seedYRetira(db)
      setState(db, ida.id, estado)
    }
    const d = computeDigest(db, 7)
    expect(d.silencios).toBe(1)
    expect(d.escaladas).toBe(1)
    expect(d.pendientes).toBe(1)
  })

  it('sin nada retirado las cuentas no cambian (el control)', () => {
    // Sin esto, todas las cuentas a cero pasarían por arreglo.
    const viva = seed(db)
    setState(db, viva.id, 'resuelta')
    const d = computeDigest(db, 7)
    expect(d.nuevas).toBe(1)
    expect(d.resueltas).toBe(1)
  })
})

/** Una queja creada y retirada acto seguido por su autor, como hace `/olvidar`. */
function seedYRetira(db: Db, overrides: Partial<NewQuejaInput> = {}) {
  const q = seed(db, overrides)
  softDeleteQueja(db, q.id, 1)
  return q
}
