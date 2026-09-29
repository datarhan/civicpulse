import { afterEach, describe, expect, it, beforeEach } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import {
  addApoyo,
  setState,
  softDeleteQueja,
  type NewQuejaInput,
  autorTelegram,
} from '../src/db/queries'
import { buildSindicTemplate, renderSindicMarkdown, renderSindicHtml } from '../src/services/sindic'
import { checkSilencio } from '../src/services/cron'
import { routeUsingLocalOfficials } from '../src/services/router'
import type { AvisosHitos } from '../src/services/avisos-hitos'
import { creaPublicada } from './helpers/publicada'
import { marcaDeAhora } from './helpers/marca'

function seed(db: Db, overrides: Partial<NewQuejaInput> = {}) {
  return creaPublicada(db, {
    autor: autorTelegram(1),
    category: 'via_publica',
    title: 'Bache profundo',
    detail: 'Bache de 40cm en Av. Primera, peligroso y sin señalizar',
    neighborhood: 'casco',
    concejalia_area: 'Obra Pública',
    concejal_slug: 'teresa-pozuelo-martin',
    ...overrides,
  })
}

function register(db: Db, id: string, entryNumber = '2026-RE-0001') {
  setState(db, id, 'registrada', {
    entry_number: entryNumber,
    csv: 'ABC123',
    registered_at: marcaDeAhora(),
  })
}

/** Los avisos de hitos a quien modera, apuntados; `falla` hace fallar los primeros n. */
function fakeHitos(falla = 0) {
  const emitted: Array<{ kind: string; id: string }> = []
  let fallos = falla
  const hitos: AvisosHitos & { emitted: typeof emitted } = {
    emitted,
    avisar: async (hito, id) => {
      if (fallos > 0) {
        fallos -= 1
        throw new Error('ningún administrador recibió el aviso')
      }
      emitted.push({ kind: hito, id })
      return { entregados: 1, fallidos: 0 }
    },
  }
  return hitos
}

describe('sindic — template renderer', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  it('includes queja ID, registro entry number, CSV and verbatim detail', () => {
    const q = seed(db)
    register(db, q.id, '2026-RE-0847')
    const updated = db.prepare('SELECT * FROM quejas WHERE id = ?').get(q.id) as typeof q
    const routing = routeUsingLocalOfficials({
      title: q.title,
      detail: q.detail,
      category: q.category as never,
    })
    const now = new Date(new Date(updated.registered_at!).getTime() + 120 * 86_400_000)
    const t = buildSindicTemplate(updated, routing, now)
    const md = renderSindicMarkdown(t)
    expect(md).toMatch(q.id)
    expect(md).toMatch('2026-RE-0847')
    expect(md).toMatch(/ABC123/)
    expect(md).toMatch(/Bache de 40cm en Av. Primera/)
    expect(md).toMatch(/Síndic de Greuges/)
    expect(md).toMatch(/Ley 11\/1988/)
  })

  it('cites the LPACAP articles the router provided', () => {
    const q = seed(db)
    register(db, q.id)
    const row = db.prepare('SELECT * FROM quejas WHERE id = ?').get(q.id) as typeof q
    const routing = routeUsingLocalOfficials({
      title: q.title,
      detail: q.detail,
      category: q.category as never,
    })
    const md = renderSindicMarkdown(buildSindicTemplate(row, routing))
    expect(md).toMatch(/art.*21\.3/)
    expect(md).toMatch(/art.*21\.4/)
    expect(md).toMatch(/art.*24/)
  })

  it('counts días transcurridos from registered_at', () => {
    const q = seed(db)
    register(db, q.id)
    const row = db.prepare('SELECT * FROM quejas WHERE id = ?').get(q.id) as typeof q
    const routing = routeUsingLocalOfficials({
      title: q.title,
      detail: q.detail,
      category: q.category as never,
    })
    const now = new Date(new Date(row.registered_at!).getTime() + 95 * 86_400_000)
    const t = buildSindicTemplate(row, routing, now)
    expect(t.diasTranscurridos).toBeGreaterThanOrEqual(94)
    expect(t.diasTranscurridos).toBeLessThanOrEqual(96)
  })

  it('renders a valid HTML document', () => {
    const q = seed(db)
    register(db, q.id)
    const row = db.prepare('SELECT * FROM quejas WHERE id = ?').get(q.id) as typeof q
    const routing = routeUsingLocalOfficials({
      title: q.title,
      detail: q.detail,
      category: q.category as never,
    })
    const html = renderSindicHtml(buildSindicTemplate(row, routing))
    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toMatch(/<title>Queja al Síndic · /)
    expect(html).toMatch(/@media print/)
  })
})

describe('cron — checkSilencio', () => {
  let db: Db
  let channel: ReturnType<typeof fakeHitos>
  beforeEach(() => {
    db = openDb(':memory:')
    channel = fakeHitos()
  })

  it('transitions registered quejas past the 90-day deadline', () => {
    const q = seed(db)
    register(db, q.id)
    const row = db.prepare('SELECT registered_at FROM quejas WHERE id = ?').get(q.id) as {
      registered_at: string
    }
    const future = new Date(new Date(row.registered_at).getTime() + 95 * 86_400_000)
    const r = checkSilencio(db, channel, future)
    expect(r.transitioned.length).toBe(1)
    expect(r.transitioned[0].state).toBe('silencio_negativo')
  })

  it('no transiciona ni avisa de una queja OLVIDADA por su autor', () => {
    // El caso más grave de los cuatro que tuvo este defecto, cuando el aviso
    // salía al canal público con el id y el TÍTULO literal:
    //
    //   ⚠️ SILENCIO ADMINISTRATIVO · Q-xxxx
    //   *Bache profundo*
    //
    // Una queja retirada con `/olvidar` —que es el punto de cumplimiento del
    // derecho al olvido— seguía entrando aquí si ya estaba registrada, así que
    // meses después su título volvía a publicarse. Borrar y que te republiquen
    // es peor que no haber borrado: el vecino cree que lo retiró. Una retirada
    // tampoco sigue su trámite, así que no hay de qué avisar a quien modera.
    const q = seed(db)
    register(db, q.id)
    const row = db.prepare('SELECT registered_at FROM quejas WHERE id = ?').get(q.id) as {
      registered_at: string
    }
    softDeleteQueja(db, q.id, autorTelegram(1))
    const future = new Date(new Date(row.registered_at).getTime() + 95 * 86_400_000)
    const r = checkSilencio(db, channel, future)
    expect(r.transitioned.length, 'ha transicionado una queja retirada').toBe(0)
    expect(channel.emitted, 'ha avisado de una queja retirada').toEqual([])
  })

  it('leaves in-time quejas alone', () => {
    const q = seed(db)
    register(db, q.id)
    const row = db.prepare('SELECT registered_at FROM quejas WHERE id = ?').get(q.id) as {
      registered_at: string
    }
    const soon = new Date(new Date(row.registered_at).getTime() + 30 * 86_400_000)
    const r = checkSilencio(db, channel, soon)
    expect(r.transitioned.length).toBe(0)
  })

  it('applies the transparencia 30-day deadline', () => {
    const q = seed(db, {
      category: 'transparencia',
      title: 'Acceso a contratos',
      detail: 'Solicito copia de los contratos de limpieza viaria de 2024',
    })
    register(db, q.id)
    const row = db.prepare('SELECT registered_at FROM quejas WHERE id = ?').get(q.id) as {
      registered_at: string
    }
    // 45 days → past transparencia deadline (30) but not past standard (90).
    const t = new Date(new Date(row.registered_at).getTime() + 45 * 86_400_000)
    const r = checkSilencio(db, channel, t)
    expect(r.transitioned.length).toBe(1)
  })

  it('does not touch urbanismo licencia (silencio positivo)', () => {
    const q = seed(db, {
      category: 'urbanismo',
      title: 'Licencia de obra menor',
      detail: 'Solicito licencia para reforma de cocina en vivienda unifamiliar',
    })
    register(db, q.id)
    const row = db.prepare('SELECT registered_at FROM quejas WHERE id = ?').get(q.id) as {
      registered_at: string
    }
    const future = new Date(new Date(row.registered_at).getTime() + 120 * 86_400_000)
    const r = checkSilencio(db, channel, future)
    expect(r.transitioned.length).toBe(0)
  })

  it('avisa a quien modera de cada queja que pasa a silencio', async () => {
    const q = seed(db)
    register(db, q.id)
    const row = db.prepare('SELECT registered_at FROM quejas WHERE id = ?').get(q.id) as {
      registered_at: string
    }
    const future = new Date(new Date(row.registered_at).getTime() + 95 * 86_400_000)
    const r = checkSilencio(db, channel, future)
    expect(await r.avisos).toEqual({ avisadas: 1, fallidas: 0 })
    expect(channel.emitted).toEqual([{ kind: 'silencio', id: q.id }])
  })

  /**
   * El canal se tragaba sus errores, así que el reintento de aquí no se
   * ejecutaba nunca, y un aviso perdido no dejaba rastro. El aviso a quien
   * modera falla cuando no le llega a nadie, y entonces se reintenta.
   */
  it('un aviso que no llega a nadie se reintenta, y si vuelve a fallar se cuenta', async () => {
    const q = seed(db)
    register(db, q.id)
    const row = db.prepare('SELECT registered_at FROM quejas WHERE id = ?').get(q.id) as {
      registered_at: string
    }
    const future = new Date(new Date(row.registered_at).getTime() + 95 * 86_400_000)
    const una = fakeHitos(1)
    expect(await checkSilencio(db, una, future, 0).avisos).toEqual({ avisadas: 1, fallidas: 0 })
    expect(una.emitted).toHaveLength(1)

    const q2 = seed(db, { title: 'Otro bache', detail: 'Otro bache de 30 cm en la calle Mayor' })
    register(db, q2.id)
    const dos = fakeHitos(2)
    expect(await checkSilencio(db, dos, future, 0).avisos).toEqual({ avisadas: 0, fallidas: 1 })
  })
})

/**
 * El silencio llega al acabar el último día del plazo, en el calendario de la sede.
 *
 * Medido el 28-09-2026: el cron comparaba los días del plazo con las horas
 * transcurridas desde la marca del registro, así que una queja registrada a las
 * 11:00 de Madrid pasaba a silencio a las 12:00 de su último día —y lo difundía
 * en el canal, y sumaba un «silencio» junto al nombre de un cargo en /cargos—
 * cuando el art. 30.4 deja a la Administración ese día entero. Y contaba desde el
 * día de UTC: una registrada pasada la medianoche de Madrid vencía un día antes.
 *
 * El bot corre en Fly en UTC y sus pruebas en un portátil de Madrid: lo que decide
 * no puede depender de eso, así que cada caso corre en las dos zonas.
 */
describe('cron — el silencio, al acabar el último día en Madrid', () => {
  const antes = process.env.TZ
  afterEach(() => {
    if (antes === undefined) delete process.env.TZ
    else process.env.TZ = antes
  })
  const DESFASE_EN_ENERO: Record<string, number> = { UTC: 0, 'Europe/Madrid': -60 }
  function enCadaZona(prueba: (db: Db, hitos: ReturnType<typeof fakeHitos>) => void) {
    for (const [zona, desfase] of Object.entries(DESFASE_EN_ENERO)) {
      process.env.TZ = zona
      expect(new Date(2026, 0, 15, 12).getTimezoneOffset(), `no se aplicó ${zona}`).toBe(desfase)
      prueba(openDb(':memory:'), fakeHitos())
    }
  }
  /** Una queja registrada con la marca que guardaría el bot (UTC, sin la Z). */
  function registradaEl(db: Db, marca: string) {
    const q = seed(db)
    register(db, q.id)
    db.prepare('UPDATE quejas SET registered_at = ? WHERE id = ?').run(marca, q.id)
    return q
  }

  it('el último día del plazo no hay silencio: todavía se puede notificar', () => {
    enCadaZona((db, hitos) => {
      // 11:00 del 15 de enero en Madrid: el plazo acaba con el 15 de abril.
      const q = registradaEl(db, '2026-01-15 10:00:00')
      const ultimoDia = checkSilencio(db, hitos, new Date('2026-04-15T21:59:00Z'))
      expect(ultimoDia.checked).toBe(1)
      expect(ultimoDia.transitioned, 'silencio a las 23:59 del último día').toEqual([])
      // 00:00 del 16 de abril en Madrid.
      const vencido = checkSilencio(db, hitos, new Date('2026-04-15T22:00:00Z'))
      expect(vencido.transitioned.map((r) => r.id)).toEqual([q.id])
    })
  })

  it('cuenta desde el día de la sede en que entró, no desde el de UTC', () => {
    enCadaZona((db, hitos) => {
      // 00:30 del 31 de mayo en Madrid: vence el 31 de agosto, no el 30.
      const q = registradaEl(db, '2026-05-30 22:30:00')
      const ultimoDia = checkSilencio(db, hitos, new Date('2026-08-31T12:00:00Z'))
      expect(ultimoDia.transitioned, 'silencio el 31 de agosto').toEqual([])
      const vencido = checkSilencio(db, hitos, new Date('2026-08-31T22:00:00Z'))
      expect(vencido.transitioned.map((r) => r.id)).toEqual([q.id])
    })
  })

  it('una fecha de registro que no se puede leer no pasa a silencio, y lo dice', () => {
    // `new Date('ayer')` es NaN, `NaN < plazo` es falso, y el código de antes
    // pasaba la queja a silencio en la primera vuelta.
    enCadaZona((db, hitos) => {
      const q = registradaEl(db, 'ayer')
      const r = checkSilencio(db, hitos, new Date('2030-01-01T00:00:00Z'))
      expect(r.checked).toBe(1)
      expect(r.transitioned).toEqual([])
      expect(r.sinFechaLegible).toEqual([q.id])
    })
  })
})
