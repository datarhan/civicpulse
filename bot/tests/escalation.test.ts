import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import {
  addApoyo,
  setState,
  softDeleteQueja,
  type NewQuejaInput,
  autorTelegram,
} from '../src/db/queries'
import {
  buildSindicTemplate,
  motivoParaNoEscalar,
  renderSindicMarkdown,
  renderSindicHtml,
} from '../src/services/sindic'
import { checkSilencio, plazosSinCalendario } from '../src/services/cron'
import { routeUsingLocalOfficials } from '../src/services/router'
import type { AvisosHitos } from '../src/services/avisos-hitos'
import { creaPublicada } from './helpers/publicada'

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

/**
 * La «Fecha de Registro» de un recibo: las 11:00 del jueves 15-01-2026 en Madrid
 * (UTC sin la Z, como la guarda el bot). Tres meses acaban el miércoles 15 de
 * abril y uno el domingo 15 de febrero, que pasa al lunes 16 (art. 30.5).
 *
 * Era la hora a la que corría la prueba (`marcaDeAhora`). Desde que un año sin
 * calendario de días inhábiles no se cuenta, eso caducaba solo: registrada a
 * partir del 1-10-2026, el plazo acaba en 2027, que todavía no está en la tabla,
 * y el silencio ya no se decide.
 */
const REGISTRO = '2026-01-15 10:00:00'

function register(db: Db, id: string, entryNumber = '2026-RE-0001') {
  setState(db, id, 'registrada', {
    entry_number: entryNumber,
    csv: 'ABC123',
    registered_at: REGISTRO,
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

  it('da el último día del plazo, el prorrogado si caía en inhábil (art. 30.5)', () => {
    // 12:00 del viernes 14-08-2026 en Madrid: tres meses acaban el sábado 14 de
    // noviembre, y el plazo, el lunes 16. El escrito no puede fechar el silencio
    // un día antes que el bot que lo declaró.
    const q = seed(db)
    register(db, q.id)
    db.prepare('UPDATE quejas SET registered_at = ? WHERE id = ?').run('2026-08-14 10:00:00', q.id)
    const row = db.prepare('SELECT * FROM quejas WHERE id = ?').get(q.id) as typeof q
    const routing = routeUsingLocalOfficials({
      title: q.title,
      detail: q.detail,
      category: q.category as never,
    })
    const md = renderSindicMarkdown(
      buildSindicTemplate(row, routing, new Date('2026-11-20T10:00:00Z')),
    )
    expect(md).toMatch(/concluyó el lunes 16 de noviembre de 2026/)
    expect(md).toMatch(/el sábado 14 de noviembre de 2026 era inhábil/)
    expect(md).toMatch(/art\. 30\.5 LPACAP/)
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

  it('si el último día es inhábil, el silencio espera al primer día hábil (art. 30.5)', () => {
    enCadaZona((db, hitos) => {
      // 12:00 del viernes 14-08-2026 en Madrid: tres meses acaban el sábado
      // 14-11-2026, y el plazo, el lunes 16. Hasta el 29-09-2026 pasaba a
      // silencio el domingo 15. En noviembre Madrid va a UTC+1.
      const q = registradaEl(db, '2026-08-14 10:00:00')
      const domingo = checkSilencio(db, hitos, new Date('2026-11-15T12:00:00Z'))
      expect(domingo.checked).toBe(1)
      expect(domingo.transitioned, 'silencio el domingo, con el plazo prorrogado').toEqual([])
      const lunes = checkSilencio(db, hitos, new Date('2026-11-16T22:59:00Z')) // 23:59 del lunes
      expect(lunes.transitioned, 'silencio en el último día prorrogado').toEqual([])
      const martes = checkSilencio(db, hitos, new Date('2026-11-16T23:00:00Z')) // 00:00 del martes
      expect(martes.transitioned.map((r) => r.id)).toEqual([q.id])
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
      expect(r.sinCalendario).toEqual([])
    })
  })
})

/**
 * Sin el calendario del año en que acaba el plazo, el bot no decide el silencio.
 *
 * El art. 30.5 prorroga al primer día hábil un último día inhábil, y un año sin
 * calendario no es un año sin festivos: tomarlo así pasaría a silencio, el día de
 * Año Nuevo, una queja cuyo plazo sigue abierto, al lado del nombre de un cargo.
 * La queja no se evalúa y se dice, aparte de las de fecha ilegible: las dos
 * piden cosas distintas a quien lo lea (corregir un registro, añadir un año).
 */
describe('cron — sin el calendario del año, no hay silencio', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })
  /** Una queja registrada con la marca que guardaría el bot (UTC, sin la Z). */
  function registradaEl(marca: string) {
    const q = seed(db)
    register(db, q.id)
    db.prepare('UPDATE quejas SET registered_at = ? WHERE id = ?').run(marca, q.id)
    return q
  }

  it('pasado el día nominal, no pasa a silencio: no se evalúa, y lo dice', async () => {
    // Tres meses desde el 15-01-2099 acaban el 15-04-2099 o el primer hábil
    // siguiente, y 2099 no tiene calendario: el 1 de mayo no se sabe.
    const q = registradaEl('2099-01-15 10:00:00')
    const hitos = fakeHitos()
    const r = checkSilencio(db, hitos, new Date('2099-05-01T10:00:00Z'))
    expect(r.checked).toBe(1)
    expect(r.transitioned).toEqual([])
    expect(r.sinCalendario).toEqual([{ id: q.id, anio: 2099 }])
    expect(r.sinFechaLegible, 'no es una fecha ilegible: la fecha se lee bien').toEqual([])
    expect(await r.avisos).toEqual({ avisadas: 0, fallidas: 0 })
    const fila = db.prepare('SELECT state FROM quejas WHERE id = ?').get(q.id) as { state: string }
    expect(fila.state).toBe('registrada')
  })

  it('antes del día nominal está en plazo seguro, y no hay nada que decir todavía', () => {
    // La prórroga sólo alarga el plazo: el 10 de abril sigue abierto con o sin
    // calendario, así que ni pasa a silencio ni se cuenta como no evaluada.
    registradaEl('2099-01-15 10:00:00')
    const r = checkSilencio(db, fakeHitos(), new Date('2099-04-10T10:00:00Z'))
    expect(r.checked).toBe(1)
    expect(r.transitioned).toEqual([])
    expect(r.sinCalendario).toEqual([])
  })
})

/**
 * Lo que /health cuenta (services/health.ts): las registradas cuyo plazo acaba en
 * un año sin calendario de días inhábiles, con el día nominal más próximo. Hasta
 * ahora sólo lo decía el log del cron, y sólo pasado ese día.
 *
 * Con la MISMA selección que el cron —si contara otras quejas, avisaría de plazos
 * que el cron no evalúa o callaría los que sí—, y sin tocar nada: lo lee cada
 * comprobación de Fly, cada 30 segundos.
 */
describe('plazosSinCalendario — lo que el cron no podrá decidir, para /health', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })
  /** Una queja registrada con la marca que guardaría el bot (UTC, sin la Z). */
  function registradaEl(marca: string, overrides: Partial<NewQuejaInput> = {}) {
    const q = seed(db, overrides)
    register(db, q.id)
    db.prepare('UPDATE quejas SET registered_at = ? WHERE id = ?').run(marca, q.id)
    return q
  }

  it('el año que falta, el día nominal y los días que quedan hasta él', () => {
    // Tres meses desde el 15-01-2099 acaban el 15-04-2099 o el primer hábil
    // siguiente, y 2099 no tiene calendario.
    registradaEl('2099-01-15 10:00:00')
    expect(plazosSinCalendario(db, new Date('2099-03-16T10:00:00Z'))).toEqual({
      quejas: 1,
      anios: [2099],
      primerNominal: '2099-04-15',
      quedanAlPrimero: 30,
    })
  })

  it('pasado el día nominal, lo que queda es negativo', () => {
    registradaEl('2099-01-15 10:00:00')
    expect(plazosSinCalendario(db, new Date('2099-05-01T10:00:00Z'))).toMatchObject({
      quejas: 1,
      primerNominal: '2099-04-15',
      quedanAlPrimero: -16,
    })
  })

  it('con el calendario del año, no cuenta (el control)', () => {
    registradaEl(REGISTRO) // tres meses acaban el 15-04-2026, y 2026 está en la tabla
    expect(plazosSinCalendario(db, new Date('2026-03-16T10:00:00Z'))).toEqual({
      quejas: 0,
      anios: [],
      primerNominal: null,
      quedanAlPrimero: null,
    })
  })

  it('el día nominal más próximo, y cada año que falta una vez', () => {
    registradaEl('2098-11-15 10:00:00') // → 15-02-2099
    registradaEl('2098-12-01 10:00:00', {
      title: 'Farola apagada',
      detail: 'La farola de la calle Mayor lleva un mes apagada',
    }) // → 01-03-2099
    registradaEl('2097-12-10 10:00:00', {
      title: 'Contenedor roto',
      detail: 'El contenedor de la plaza lleva semanas roto y sin tapa',
    }) // → 10-03-2098
    expect(plazosSinCalendario(db, new Date('2098-02-20T10:00:00Z'))).toEqual({
      quejas: 3,
      anios: [2098, 2099],
      primerNominal: '2098-03-10',
      quedanAlPrimero: 18,
    })
  })

  it('la misma selección que el cron: ni olvidadas, ni silencio positivo, ni sin registrar', () => {
    const viva = registradaEl('2099-01-15 10:00:00')
    const olvidada = registradaEl('2099-01-15 10:00:00', {
      title: 'Farola apagada',
      detail: 'La farola de la calle Mayor lleva un mes apagada',
    })
    softDeleteQueja(db, olvidada.id, autorTelegram(1))
    registradaEl('2099-01-15 10:00:00', {
      category: 'urbanismo',
      title: 'Licencia de obra menor',
      detail: 'Solicito licencia para reforma de cocina en vivienda unifamiliar',
    })
    seed(db, { title: 'Sin registrar', detail: 'Una queja que nunca llegó a la sede electrónica' })
    const ahora = new Date('2099-05-01T10:00:00Z')
    expect(plazosSinCalendario(db, ahora)?.quejas).toBe(1)
    // Y es la que el cron deja sin evaluar pasado el día nominal.
    expect(checkSilencio(db, fakeHitos(), ahora).sinCalendario.map((s) => s.id)).toEqual([viva.id])
  })

  it('no toca nada: una vencida con calendario sigue registrada', () => {
    const vencida = registradaEl(REGISTRO) // su plazo acabó el 15-04-2026
    plazosSinCalendario(db, new Date('2026-05-01T10:00:00Z'))
    const fila = db.prepare('SELECT state FROM quejas WHERE id = ?').get(vencida.id) as {
      state: string
    }
    expect(fila.state).toBe('registrada')
  })

  it('si no puede contar devuelve null y lo deja en el log: /health no se cae', () => {
    // Una excepción en /health rechaza el manejador de la petición y tumba el
    // proceso, y Fly pregunta cada 30 segundos.
    registradaEl('2099-01-15 10:00:00')
    db.close()
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      expect(plazosSinCalendario(db, new Date('2099-05-01T10:00:00Z'))).toBeNull()
      expect(log).toHaveBeenCalled()
    } finally {
      log.mockRestore()
    }
  })
})

/**
 * /escalar lleva al Síndic un escrito que afirma que «ha operado el silencio».
 *
 * Aceptaba una queja `registrada` «con el plazo vencido» sin mirar el plazo: el
 * mensaje lo pedía y el código no lo comprobaba, así que podía salir hacia el
 * Síndic un escrito que daba por vencido un plazo abierto. Ahora pregunta a la
 * misma cuenta que el bot y las páginas (`relojDelPlazo`).
 */
describe('/escalar — sólo con el plazo vencido, con la misma cuenta', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })
  function registradaEl(marca: string) {
    const q = seed(db)
    register(db, q.id)
    db.prepare('UPDATE quejas SET registered_at = ? WHERE id = ?').run(marca, q.id)
    return db.prepare('SELECT * FROM quejas WHERE id = ?').get(q.id) as typeof q
  }
  const rutaDe = (q: { title: string; detail: string; category: string }) =>
    routeUsingLocalOfficials({ title: q.title, detail: q.detail, category: q.category as never })

  it('una registrada con el plazo abierto no se escala; vencido, sí', () => {
    // Tres meses desde el viernes 14-08-2026 acaban el sábado 14-11, y el plazo,
    // el lunes 16: el domingo sigue abierto.
    const q = registradaEl('2026-08-14 10:00:00')
    expect(motivoParaNoEscalar(q, rutaDe(q), new Date('2026-11-15T12:00:00Z'))).toMatch(
      /sigue abierto: el último día es el lunes 16 de noviembre de 2026/,
    )
    expect(motivoParaNoEscalar(q, rutaDe(q), new Date('2026-11-16T23:00:00Z'))).toBeNull()
  })

  it('sin el calendario del año no se puede afirmar que venció', () => {
    const q = registradaEl('2099-01-15 10:00:00')
    const motivo = motivoParaNoEscalar(q, rutaDe(q), new Date('2099-05-01T10:00:00Z'))
    expect(motivo).toMatch(/calendario de días inhábiles de 2099/)
  })

  it('una en silencio se escala; una sin registrar, no', () => {
    const q = registradaEl('2099-01-15 10:00:00')
    const enSilencio = { ...q, state: 'silencio_negativo' as const }
    expect(motivoParaNoEscalar(enSilencio, rutaDe(q), new Date('2099-05-01T10:00:00Z'))).toBeNull()
    const capturada = { ...q, state: 'capturada' as const }
    expect(motivoParaNoEscalar(capturada, rutaDe(q), new Date('2099-05-01T10:00:00Z'))).toMatch(
      /capturada/,
    )
  })
})
