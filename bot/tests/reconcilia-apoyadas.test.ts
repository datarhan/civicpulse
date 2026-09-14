/**
 * La puesta al día del arranque: las quejas que reunieron sus apoyos mientras la
 * promoción estaba rota.
 *
 * Hace falta porque el defecto estuvo publicado. `addApoyo` contaba los apoyos y
 * al llegar al umbral insertaba el evento, pero no tocaba `quejas.state`, así que
 * quedan filas con diez apoyos y el estado en `capturada` — y nadie va a volver a
 * apoyarlas para que el `addApoyo` nuevo las empuje. Arreglar el camino de entrada
 * no arregla lo que ya entró mal.
 *
 * Lo que se fija aquí, además de que promueva: que la segunda pasada no promueva
 * nada, y que las cuentas separen lo INTENTADO de lo PROMOVIDO. Un solo número no
 * distingue «no había nada que hacer» de «había siete y no hice ninguna», que es
 * la regla 2 de docs/DATA_INTEGRITY.md.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import {
  addApoyo,
  createQueja,
  getQueja,
  listEvents,
  reconcileApoyadas,
  setState,
  softDeleteQueja,
  VERIFIED_THRESHOLD,
  type NewQuejaInput,
} from '../src/db/queries'

function sampleQueja(overrides: Partial<NewQuejaInput> = {}): NewQuejaInput {
  return {
    telegram_user_id: 42,
    telegram_username: 'maria',
    category: 'via_publica',
    title: 'Bache profundo',
    detail: 'Bache en Av. Primera que lleva 2 meses sin reparar',
    lat: 39.5439,
    lng: -0.5711,
    neighborhood: 'casco',
    photo_file_id: null,
    concejalia_area: 'Obra Pública',
    concejal_slug: 'teresa-pozuelo-martin',
    ...overrides,
  }
}

/**
 * Deja una queja como las dejaba el bot roto: con sus apoyos y en `capturada`.
 *
 * Se fuerza el estado DESPUÉS de apoyar, que es la única forma de reproducir el
 * estado heredado ahora que `addApoyo` promueve bien. Si algún día `setState`
 * dejara de poder volver a `capturada`, esta prueba se cae y hace bien: querría
 * decir que ya no se puede reproducir el caso que existe en producción.
 */
function comoLaDejabaElBotRoto(db: Db, apoyos: number): string {
  const id = createQueja(db, sampleQueja()).id
  for (let u = 0; u < apoyos; u++) addApoyo(db, id, 7000 + u)
  setState(db, id, 'capturada')
  return id
}

describe('reconcileApoyadas — pone al día lo que quedó a medias', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  it('promueve la que tenía los apoyos y se quedó en capturada', () => {
    const id = comoLaDejabaElBotRoto(db, VERIFIED_THRESHOLD)
    expect(getQueja(db, id)?.state).toBe('capturada')

    const r = reconcileApoyadas(db)
    expect(r).toEqual({ intentadas: 1, promovidas: 1 })
    expect(getQueja(db, id)?.state).toBe('apoyada_verificada')
  })

  it('no toca la que no llega al umbral (la ablación)', () => {
    // Sin esto, «promueve» lo cumpliría una pasada que promoviera todo lo que
    // encuentre en `capturada`, y una queja con un apoyo entraría en el lote.
    const id = comoLaDejabaElBotRoto(db, VERIFIED_THRESHOLD - 1)
    const r = reconcileApoyadas(db)
    expect(r).toEqual({ intentadas: 0, promovidas: 0 })
    expect(getQueja(db, id)?.state).toBe('capturada')
  })

  it('la segunda pasada no promueve nada: es idempotente', () => {
    comoLaDejabaElBotRoto(db, VERIFIED_THRESHOLD)
    reconcileApoyadas(db)
    expect(reconcileApoyadas(db)).toEqual({ intentadas: 0, promovidas: 0 })
  })

  it('cuenta lo intentado aparte de lo promovido', () => {
    // Dos con umbral alcanzado y una sin: intentadas 2, promovidas 2. Con un solo
    // número, «no había nada que hacer» y «había dos y no hice ninguna» se leen
    // igual, y eso es lo que dejó a un pase diciendo que había re-juzgado mil.
    comoLaDejabaElBotRoto(db, VERIFIED_THRESHOLD)
    comoLaDejabaElBotRoto(db, VERIFIED_THRESHOLD + 3)
    comoLaDejabaElBotRoto(db, 2)
    expect(reconcileApoyadas(db)).toEqual({ intentadas: 2, promovidas: 2 })
  })

  it('cada promoción deja UN evento del hito, no dos', () => {
    const id = comoLaDejabaElBotRoto(db, VERIFIED_THRESHOLD)
    reconcileApoyadas(db)
    const hitos = listEvents(db, id).filter((e) => e.kind === 'apoyada_verificada')
    expect(hitos.length).toBe(1)
  })

  it('no resucita una queja olvidada por su autor', () => {
    // `/olvidar` es el punto de cumplimiento del derecho al olvido: una queja
    // borrada no vuelve a la cola del ayuntamiento por tener apoyos.
    const id = comoLaDejabaElBotRoto(db, VERIFIED_THRESHOLD)
    softDeleteQueja(db, id, 42)
    expect(reconcileApoyadas(db)).toEqual({ intentadas: 0, promovidas: 0 })
  })

  it('sólo cuenta como promovida la fila que de verdad cambió', () => {
    // La cuenta se toma del `changes` del UPDATE, no de cuántas filas se
    // seleccionaron. Parece lo mismo porque el `WHERE` ya filtra por estado, y no
    // lo es: si el criterio de selección y el de actualización se separan algún
    // día —o dos procesos arrancan a la vez y uno promueve primero—, contar lo
    // seleccionado diría «promoví siete» habiendo promovido cero. Es la regla 2 de
    // DATA_INTEGRITY: lo intentado y lo hecho se informan aparte porque pueden
    // diferir.
    const id = comoLaDejabaElBotRoto(db, VERIFIED_THRESHOLD)

    // Se promueve por fuera, como lo haría el otro proceso, entre la selección y
    // la actualización: la fila sigue cumpliendo el umbral pero ya no está en
    // `capturada`, así que el UPDATE no cambia nada y no puede contarse.
    setState(db, id, 'apoyada_verificada')
    const r = reconcileApoyadas(db)
    expect(r.promovidas).toBe(0)
    expect(getQueja(db, id)?.state).toBe('apoyada_verificada')
    // Aquí NO se cuentan eventos, y conviene decir por qué: este montaje los
    // escribe él mismo. `comoLaDejabaElBotRoto` llega a diez apoyos —con lo que el
    // `addApoyo` arreglado promueve y emite el hito—, luego fuerza el estado a
    // `capturada` y `setState` registra ese cambio, y la línea de arriba vuelve a
    // `apoyada_verificada` y registra otro. Dos hitos, ninguno de la puesta al día.
    // Contarlos aquí mediría el andamio, no el código.
  })

  it('no degrada ni adelanta a las que ya avanzaron', () => {
    const id = createQueja(db, sampleQueja()).id
    for (let u = 0; u < VERIFIED_THRESHOLD; u++) addApoyo(db, id, 8000 + u)
    setState(db, id, 'registrada', { entry_number: '2026-RE-0847', csv: 'ABC123XYZ' })
    expect(reconcileApoyadas(db)).toEqual({ intentadas: 0, promovidas: 0 })
    expect(getQueja(db, id)?.state).toBe('registrada')
  })
})
