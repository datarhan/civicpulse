import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import { autorTelegram, setState } from '../src/db/queries'
import { registerBatch } from '../src/services/batch'
import { buildSindicTemplate, renderSindicMarkdown } from '../src/services/sindic'
import { routeUsingLocalOfficials } from '../src/services/router'
import { fechaHoraDeLaSede, leerBatchRegister, marcaDeLaSede } from '../src/services/recibo-sede'
import { creaPublicada } from './helpers/publicada'
import { botFalso, texto } from './helpers/bot-falso'

/**
 * El plazo corre desde la entrada en el registro de la sede, y el bot la apuntaba
 * cuando el moderador escribía /batch_register.
 *
 * El art. 21.3.b LPACAP cuenta el plazo «desde la fecha en que la solicitud haya
 * tenido entrada en el registro electrónico», y el recibo de la sede la trae:
 * los dos del 27-09-2026 dicen «Fecha de Registro 28/09/2026 0:00:01» y «Fecha de
 * Presentación 27/09/2026 8:32:55», en hora de Madrid (un domingo: el registro da
 * entrada el primer día hábil). `registered_at` era `datetime('now')` al escribir
 * la orden: la hora del moderador, antes o después de la de la sede según cuándo
 * se acordara. Y el CSV del recibo va en grupos de cuatro separados por espacios,
 * que la orden, al partir por espacios, tomaba por identificadores de queja.
 */

const antes = { TZ: process.env.TZ, ADMIN: process.env.ADMIN_USER_IDS }
afterEach(() => {
  vi.useRealTimers()
  if (antes.TZ === undefined) delete process.env.TZ
  else process.env.TZ = antes.TZ
  if (antes.ADMIN === undefined) delete process.env.ADMIN_USER_IDS
  else process.env.ADMIN_USER_IDS = antes.ADMIN
})

// El bot corre en Fly en UTC; sus pruebas, en un portátil de Madrid.
const DESFASE_EN_ENERO: Record<string, number> = { UTC: 0, 'Europe/Madrid': -60 }
function enCadaZona(prueba: () => void) {
  for (const [zona, desfase] of Object.entries(DESFASE_EN_ENERO)) {
    process.env.TZ = zona
    expect(new Date(2026, 0, 15, 12).getTimezoneOffset(), `no se aplicó ${zona}`).toBe(desfase)
    prueba()
  }
}

// El recibo real, tal como lo imprime la sede.
const RECIBO = '2026014913 HXEw sNTe lPQR niH7 ejiJ UWPa XkQ= 28/09/2026 0:00:01'
const CSV = 'HXEw sNTe lPQR niH7 ejiJ UWPa XkQ='
// El domingo 27-09-2026 a las 10:40 en Madrid, justo después de presentarlo.
const TRAS_PRESENTARLO = new Date('2026-09-27T08:40:00Z')

describe('la hora de la sede del recibo, en la forma del bot', () => {
  it('«28/09/2026 0:00:01» de Madrid es 2026-09-27 22:00:01 en UTC', () => {
    enCadaZona(() => {
      expect(marcaDeLaSede('28/09/2026', '0:00:01')).toBe('2026-09-27 22:00:01')
      // En invierno, una hora menos de diferencia.
      expect(marcaDeLaSede('15/01/2026', '11:00:00')).toBe('2026-01-15 10:00:00')
    })
  })

  it('una fecha u hora que no existe no se convierte en otra', () => {
    enCadaZona(() => {
      expect(marcaDeLaSede('31/02/2026', '10:00:00')).toBeNull()
      expect(marcaDeLaSede('28/09/2026', '24:00:00')).toBeNull()
      // El 29-03-2026 las 02:00 de Madrid saltan a las 03:00: las 2:30 no existieron.
      expect(marcaDeLaSede('29/03/2026', '2:30:00')).toBeNull()
    })
  })

  it('y de vuelta, como la escribe el recibo', () => {
    enCadaZona(() => {
      expect(fechaHoraDeLaSede('2026-09-27 22:00:01')).toBe('28/09/2026 0:00:01')
      expect(fechaHoraDeLaSede('2026-09-28 16:00:00')).toBe('28/09/2026 18:00:00')
    })
  })
})

describe('/batch_register lee el recibo', () => {
  it('el CSV con sus espacios y la fecha de registro, tal cual los imprime la sede', () => {
    expect(leerBatchRegister(RECIBO, TRAS_PRESENTARLO)).toEqual({
      ok: true,
      entry_number: '2026014913',
      csv: CSV,
      registered_at: '2026-09-27 22:00:01',
      ids: [],
    })
  })

  it('las quejas van detrás de la fecha', () => {
    const r = leerBatchRegister(`${RECIBO} Q-ABCD1234 q-efgh5678`, TRAS_PRESENTARLO)
    expect(r).toMatchObject({ ok: true, csv: CSV, ids: ['Q-ABCD1234', 'Q-EFGH5678'] })
  })

  it('sin la fecha de registro no hay registro: el plazo no se inventa', () => {
    const r = leerBatchRegister('2026014913 HXEwsNTelPQRniH7ejiJUWPaXkQ=', TRAS_PRESENTARLO)
    expect(r.ok).toBe(false)
    expect(r.ok ? '' : r.motivo).toMatch(/Fecha de Registro/)
  })

  it('una fecha lejos de hoy es una errata, no un registro', () => {
    // Un mes antes adelantaría un mes el silencio; un mes después lo retrasaría.
    const unMesAntes = leerBatchRegister(RECIBO.replace('28/09', '28/08'), TRAS_PRESENTARLO)
    const unMesDespues = leerBatchRegister(RECIBO.replace('28/09', '28/10'), TRAS_PRESENTARLO)
    expect(unMesAntes.ok).toBe(false)
    expect(unMesDespues.ok).toBe(false)
  })
})

describe('registerBatch guarda la fecha del recibo, no la de la orden', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  function verificadaDesde(creadaEl: string) {
    const q = creaPublicada(db, {
      autor: autorTelegram(1),
      category: 'via_publica',
      title: 'Bache',
      detail: 'Bache profundo en la Av. Primera',
      neighborhood: 'casco',
    })
    setState(db, q.id, 'apoyada_verificada')
    db.prepare('UPDATE quejas SET created_at = ? WHERE id = ?').run(creadaEl, q.id)
    return q
  }

  it('registered_at es la «Fecha de Registro» del recibo', () => {
    const q = verificadaDesde('2026-09-20 10:00:00')
    const r = registerBatch(db, {
      ids: [q.id],
      entry_number: '2026014913',
      csv: CSV,
      registered_at: '2026-09-27 22:00:01',
      moderator_user_id: 42,
    })
    expect(r.failed).toEqual([])
    expect(r.registered.map((x) => x.registered_at)).toEqual(['2026-09-27 22:00:01'])
  })

  it('una fecha de registro anterior a la queja no se acepta', () => {
    const q = verificadaDesde('2026-09-28 09:00:00')
    const r = registerBatch(db, {
      ids: [q.id],
      entry_number: '2026014913',
      csv: CSV,
      registered_at: '2026-09-27 22:00:01',
      moderator_user_id: 42,
    })
    expect(r.registered).toEqual([])
    expect(r.failed).toEqual([{ id: q.id, reason: expect.stringMatching(/anterior/) }])
  })
})

describe('la orden, de punta a punta', () => {
  const ADMIN = 9001
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
    process.env.ADMIN_USER_IDS = String(ADMIN)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(TRAS_PRESENTARLO)
  })

  function verificada() {
    const q = creaPublicada(db, {
      autor: autorTelegram(1),
      category: 'via_publica',
      title: 'Bache',
      detail: 'Bache profundo en la Av. Primera',
      neighborhood: 'casco',
    })
    setState(db, q.id, 'apoyada_verificada')
    db.prepare("UPDATE quejas SET created_at = '2026-09-20 10:00:00' WHERE id = ?").run(q.id)
    return q
  }

  it('pegado tal cual, registra con la fecha y el CSV del recibo, y lo repite', async () => {
    const q = verificada()
    const h = botFalso(db)
    await h.bot.handleUpdate(texto(ADMIN, `/batch_register ${RECIBO} ${q.id}`))
    const fila = db.prepare('SELECT * FROM quejas WHERE id = ?').get(q.id) as Record<string, string>
    expect(fila.state).toBe('registrada')
    expect(fila.registered_at).toBe('2026-09-27 22:00:01')
    expect(fila.registro_csv).toBe(CSV)
    expect(String(h.a(ADMIN).at(-1)?.cuerpo.text)).toContain('28/09/2026 0:00:01')
  })

  it('sin la fecha, no registra nada y pide la del recibo', async () => {
    const q = verificada()
    const h = botFalso(db)
    await h.bot.handleUpdate(texto(ADMIN, `/batch_register 2026014913 HXEw ${q.id}`))
    const fila = db.prepare('SELECT * FROM quejas WHERE id = ?').get(q.id) as Record<string, string>
    expect(fila.state).toBe('apoyada_verificada')
    expect(fila.registered_at).toBeNull()
    expect(String(h.a(ADMIN).at(-1)?.cuerpo.text)).toMatch(/Fecha de Registro/)
  })
})

describe('lo que el bot escribe de la fecha de registro', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  function registradaEl(marca: string) {
    const q = creaPublicada(db, {
      autor: autorTelegram(1),
      category: 'via_publica',
      title: 'Bache',
      detail: 'Bache profundo en la Av. Primera',
      neighborhood: 'casco',
    })
    setState(db, q.id, 'registrada', {
      entry_number: '2026014913',
      csv: CSV,
      registered_at: marca,
    })
    // Directa también: lo que se prueba aquí es cómo se ESCRIBE la marca, sea
    // quien sea quien la guardó.
    db.prepare('UPDATE quejas SET registered_at = ? WHERE id = ?').run(marca, q.id)
    return db.prepare('SELECT * FROM quejas WHERE id = ?').get(q.id) as typeof q
  }

  it('el escrito al Síndic da la fecha del recibo y cuenta en el calendario de la sede', () => {
    enCadaZona(() => {
      // 18:00 del 28-09 en Madrid; el escrito se prepara a las 10:00 del 29-12.
      const q = registradaEl('2026-09-28 16:00:00')
      const routing = routeUsingLocalOfficials({
        title: q.title,
        detail: q.detail,
        category: q.category as never,
      })
      const md = renderSindicMarkdown(
        buildSindicTemplate(q, routing, new Date('2026-12-29T09:00:00Z')),
      )
      expect(md).toContain('**Fecha de registro:** 28/09/2026 18:00:00')
      // Del 28 de septiembre al 29 de diciembre: 92 días. En tandas de 24 horas
      // desde las 18:00 salían 91, lo que dura el plazo entero.
      expect(md).toContain('han transcurrido **92 días**')
      expect(md).toContain('A fecha de hoy (29 de diciembre de 2026)')
    })
  })

  it('el «hoy» del escrito es el de Madrid también de noche', () => {
    enCadaZona(() => {
      const q = registradaEl('2026-09-27 22:00:01')
      const routing = routeUsingLocalOfficials({
        title: q.title,
        detail: q.detail,
        category: q.category as never,
      })
      // 00:30 del 29-12 en Madrid; en UTC todavía es el 28.
      const md = renderSindicMarkdown(
        buildSindicTemplate(q, routing, new Date('2026-12-28T23:30:00Z')),
      )
      expect(md).toContain('**Fecha de registro:** 28/09/2026 0:00:01')
      expect(md).toContain('A fecha de hoy (29 de diciembre de 2026)')
    })
  })

  it('/estado dice el día del recibo', async () => {
    const q = registradaEl('2026-09-27 22:00:01')
    for (const [zona, desfase] of Object.entries(DESFASE_EN_ENERO)) {
      process.env.TZ = zona
      expect(new Date(2026, 0, 15, 12).getTimezoneOffset(), `no se aplicó ${zona}`).toBe(desfase)
      const h = botFalso(db)
      await h.bot.handleUpdate(texto(1, `/estado ${q.id}`))
      const r = String(h.a(1).at(-1)?.cuerpo.text)
      expect(r, zona).toMatch(/Registrada:\*? 28 sept?\.? 2026/)
    }
  })
})
