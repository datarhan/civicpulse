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
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { openDb, type Db } from '../src/db/client'
import {
  createQueja,
  getQuejaViva,
  setState,
  softDeleteQueja,
  type NewQuejaInput,
} from '../src/db/queries'
import { registerBatch } from '../src/services/batch'
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

/**
 * Lo mismo, del lado de quien PREGUNTA por un id. `getQueja` a secas devuelve
 * también las retiradas, y cinco sitios la usaban para contestar: /estado
 * enseñaba el título de una queja retirada a cualquiera que tuviera su id —y los
 * id se publican—, /apoyar le sumaba apoyos y al décimo la volvía a anunciar en
 * el canal, /escalar la mandaba al Síndic, el lote la registraba en el
 * ayuntamiento y el documento del Síndic la servía por HTTP.
 *
 * Los comandos no se pueden montar sin un `Bot` de grammy, así que la regla vive
 * en una función de `db/queries.ts` y una guarda comprueba que nadie más la
 * esquiva llamando a `getQueja`.
 */
describe('una retirada no se enseña, no se apoya, no se escala ni entra en un lote', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  it('getQuejaViva no devuelve la retirada, y sí la viva (el control)', () => {
    const viva = seed(db)
    const ida = seedYRetira(db)
    expect(getQuejaViva(db, ida.id)).toBeNull()
    expect(getQuejaViva(db, viva.id)?.id).toBe(viva.id)
  })

  it('registerBatch rechaza la retirada como si no existiera', () => {
    // Verificada ANTES de retirarse: con 0 apoyos el lote ya la rechazaría por
    // «insufficient apoyos» y la prueba pasaría por el motivo equivocado.
    const ida = seed(db)
    setState(db, ida.id, 'apoyada_verificada')
    softDeleteQueja(db, ida.id, 1)
    const r = registerBatch(db, {
      ids: [ida.id],
      entry_number: 'RE-1',
      csv: 'x',
      moderator_user_id: 9,
    })
    expect(r.registered).toEqual([])
    expect(r.failed).toEqual([{ id: ida.id, reason: 'not found' }])
  })

  it('una verificada y viva sí entra en el lote (el control)', () => {
    const viva = seed(db)
    setState(db, viva.id, 'apoyada_verificada')
    const r = registerBatch(db, {
      ids: [viva.id],
      entry_number: 'RE-2',
      csv: 'y',
      moderator_user_id: 9,
    })
    expect(r.registered.map((q) => q.id)).toEqual([viva.id])
  })

  it('nadie fuera de db/queries.ts llama a getQueja: la regla vive en un sitio', () => {
    const RAIZ = join(__dirname, '../src')
    const ts = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? ts(join(d, e.name)) : e.name.endsWith('.ts') ? [join(d, e.name)] : [],
      )
    const sinComentarios = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const ficheros = ts(RAIZ)
    expect(ficheros.length, 'no lee el código del bot').toBeGreaterThan(20)
    const llaman = ficheros
      .filter((f) => !f.endsWith(join('db', 'queries.ts')))
      .filter((f) => /\bgetQueja\(/.test(sinComentarios(readFileSync(f, 'utf8'))))
      .map((f) => f.slice(RAIZ.length + 1))
      .sort()
    expect(llaman).toEqual([])
  })
})
