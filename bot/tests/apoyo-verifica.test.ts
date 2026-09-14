/**
 * A los diez apoyos, la queja pasa a `apoyada_verificada` DE VERDAD.
 *
 * Hasta ahora `addApoyo` contaba los apoyos y, al llegar al umbral, insertaba un
 * evento `apoyada_verificada`… y dejaba `quejas.state` en `capturada`. El lote
 * semanal selecciona `WHERE q.state = 'apoyada_verificada'`
 * (`services/batch.ts:68`), así que no podía coger nada: ninguna queja llegaba
 * nunca a registrarse, y sin registro no arranca el plazo de la LPACAP. El evento
 * decía que el hito había ocurrido y la columna decía que no.
 *
 * Lo tapaba una prueba: el ayudante de `batch.test.ts` daba los diez apoyos y
 * luego llamaba a `setState(db, id, 'apoyada_verificada')` a mano, con el
 * comentario «(the bot does this)» — que es justo lo que el bot no hacía. Con esa
 * línea puesta, el lote tenía siempre su fila y el defecto no se veía.
 *
 * El umbral se IMPORTA. Escribir «10» aquí haría que esta prueba siguiera en
 * verde el día que el umbral cambie, mirando un número que ya no es el del
 * producto.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import {
  addApoyo,
  countApoyos,
  createQueja,
  getQueja,
  listEvents,
  setState,
  VERIFIED_THRESHOLD,
  type NewQuejaInput,
} from '../src/db/queries'
import { selectBatch } from '../src/services/batch'

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

/** Apoya `cuantos` veces, con un usuario distinto cada vez. */
function apoyan(db: Db, id: string, cuantos: number) {
  for (let u = 0; u < cuantos; u++) addApoyo(db, id, 5000 + u)
}

describe('addApoyo — promueve al alcanzar el umbral', () => {
  let db: Db
  let id: string
  beforeEach(() => {
    db = openDb(':memory:')
    id = createQueja(db, sampleQueja()).id
  })

  it('por debajo del umbral no promueve (el control)', () => {
    // Sin esto, «promueve» lo cumpliría un `addApoyo` que promoviera al primer
    // apoyo, y una queja con un solo apoyo entraría en el lote del ayuntamiento.
    apoyan(db, id, VERIFIED_THRESHOLD - 1)
    expect(countApoyos(db, id)).toBe(VERIFIED_THRESHOLD - 1)
    expect(getQueja(db, id)?.state).toBe('capturada')
  })

  it('al alcanzar el umbral, el ESTADO pasa a apoyada_verificada', () => {
    apoyan(db, id, VERIFIED_THRESHOLD)
    expect(getQueja(db, id)?.state).toBe('apoyada_verificada')
  })

  it('y el lote semanal la coge sin que nadie la promueva a mano', () => {
    // La consecuencia real del defecto: el lote filtra por estado, así que con la
    // columna en `capturada` no había nada que registrar y el reloj de la LPACAP
    // no arrancaba nunca.
    apoyan(db, id, VERIFIED_THRESHOLD)
    const lote = selectBatch(db, 10)
    expect(lote.map((x) => x.queja.id)).toContain(id)
  })

  it('un solo evento del hito, aunque sigan llegando apoyos', () => {
    // La transición y el hito son el MISMO evento. `setState` inserta uno con el
    // `kind` del estado nuevo, así que llamarlo desde aquí emitiría dos.
    apoyan(db, id, VERIFIED_THRESHOLD + 2)
    const hitos = listEvents(db, id).filter((e) => e.kind === 'apoyada_verificada')
    expect(hitos.length).toBe(1)
  })

  it('la secuencia de eventos queda limpia: capturada y luego el hito', () => {
    apoyan(db, id, VERIFIED_THRESHOLD)
    expect(listEvents(db, id).map((e) => e.kind)).toEqual(['capturada', 'apoyada_verificada'])
  })

  it('nunca degrada una queja que ya está registrada', () => {
    // Una queja ya registrada tiene número de entrada y plazo en marcha. Que le
    // lleguen más apoyos no puede devolverla a la cola.
    setState(db, id, 'registrada', { entry_number: '2026-RE-0847', csv: 'ABC123XYZ' })
    apoyan(db, id, VERIFIED_THRESHOLD + 5)
    expect(getQueja(db, id)?.state).toBe('registrada')
  })

  it('tampoco degrada una en trámite ni una resuelta', () => {
    for (const estado of ['en_tramite', 'resuelta'] as const) {
      const otra = createQueja(db, sampleQueja()).id
      setState(db, otra, estado)
      apoyan(db, otra, VERIFIED_THRESHOLD + 1)
      expect(getQueja(db, otra)?.state).toBe(estado)
    }
  })

  it('si cruza el umbral ya en trámite, NO se emite el hito', () => {
    // El evento dice «se promovió», no «llegó a diez». Emitirlo sin promoción
    // metería una afirmación falsa en el historial que leen el resumen semanal y
    // la página de quejas: constaría una verificación que no ocurrió, sobre una
    // queja que ya iba por otro camino.
    setState(db, id, 'en_tramite')
    apoyan(db, id, VERIFIED_THRESHOLD + 2)
    const hitos = listEvents(db, id).filter((e) => e.kind === 'apoyada_verificada')
    expect(hitos.length).toBe(0)
    expect(getQueja(db, id)?.state).toBe('en_tramite')
  })

  it('apoyar dos veces el mismo usuario no cuenta ni promueve', () => {
    for (let i = 0; i < VERIFIED_THRESHOLD + 3; i++) addApoyo(db, id, 999)
    expect(countApoyos(db, id)).toBe(1)
    expect(getQueja(db, id)?.state).toBe('capturada')
  })
})
