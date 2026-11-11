import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import { MIGRACIONES_DEL_ENSAYO, ACCIONES_BLOQUEO, migrar } from '../src/db/migraciones'
import { autorTelegram, countApoyos, createQueja, getQueja, idCiudadano } from '../src/db/queries'
import { bloqueosActivos, estaBloqueado } from '../src/db/bloqueos'
import { BLOQUEADA } from '../src/commands/bloquear'
import { CONTACTO } from '../src/services/contacto'
import { purgarCaducadas } from '../src/services/retencion'
import { creaPublicada } from './helpers/publicada'
import { botFalso, texto, boton } from './helpers/bot-falso'

/**
 * La lista de bloqueo: quien modera puede impedir que una cuenta envíe quejas,
 * las apoye o adjunte fotos, y deshacerlo. Una cuenta bloqueada conserva sus
 * derechos sobre sus datos —/olvidar, /mis, /borrar_mis_datos—, y bloquearla no
 * despublica nada de lo que ya escribió: eso es otra decisión de moderación.
 *
 * La tabla llega con la migración 4, en ensayo (bot/DEPLOY.md): estas pruebas
 * migran con la lista del ensayo, y una aparte comprueba que sin ella el bot
 * sigue funcionando y el administrador oye que aún no está activo.
 */
const ADMIN = 9001
const VECINA = 1001
const VECINO = 1002
const DESCONOCIDA = 1003

const conBloqueos = (): Db => {
  const db = openDb(':memory:')
  migrar(db, { ruta: ':memory:', migraciones: MIGRACIONES_DEL_ENSAYO, log: () => {} })
  return db
}

const queja = (db: Db, quien: number, publicada = false) => {
  const input = {
    autor: autorTelegram(quien),
    category: 'alumbrado',
    title: 'Farola apagada',
    detail: 'La farola de la plaza lleva apagada desde el lunes y la calle queda a oscuras.',
  }
  return publicada ? creaPublicada(db, input) : createQueja(db, input)
}

const registro = (db: Db) =>
  db.prepare('SELECT ciudadano_id, accion, por, motivo FROM bloqueos ORDER BY id').all() as Array<{
    ciudadano_id: number | null
    accion: string
    por: string
    motivo: string | null
  }>

const ultimo = (h: ReturnType<typeof botFalso>, chat: number) =>
  String(h.a(chat).at(-1)?.cuerpo.text ?? '')

let db: Db
beforeEach(() => {
  process.env.ADMIN_USER_IDS = String(ADMIN)
  db = conBloqueos()
})
afterEach(() => {
  delete process.env.ADMIN_USER_IDS
})

describe('la respuesta a una cuenta bloqueada', () => {
  it('es una sola frase neutra, con la dirección de contacto del aviso legal', () => {
    expect(BLOQUEADA).toBe(
      `Esta cuenta no puede enviar quejas. Si crees que es un error, escribe a ${CONTACTO}.`,
    )
  })

  it('las acciones del registro son las que exporta migraciones.ts', () => {
    expect([...ACCIONES_BLOQUEO]).toEqual(['bloquear', 'desbloquear'])
  })
})

describe('/bloquear y /desbloquear', () => {
  it('sólo un administrador: a cualquier otro no le hace nada', async () => {
    const q = queja(db, VECINA)
    const h = botFalso(db)
    await h.bot.handleUpdate(texto(VECINO, `/bloquear ${q.id} spam`))
    expect(ultimo(h, VECINO)).toMatch(/Sólo un administrador/)
    expect(registro(db)).toEqual([])
    expect(estaBloqueado(db, autorTelegram(VECINA))).toBe(false)
  })

  it('desde el id de una queja bloquea a quien la escribió, con quién, cuándo y por qué', async () => {
    const q = queja(db, VECINA)
    const h = botFalso(db)
    await h.bot.handleUpdate(texto(ADMIN, `/bloquear ${q.id} insultos repetidos`))
    expect(estaBloqueado(db, autorTelegram(VECINA))).toBe(true)
    const filas = db.prepare('SELECT * FROM bloqueos').all() as Array<Record<string, unknown>>
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      ciudadano_id: idCiudadano(db, autorTelegram(VECINA)),
      accion: 'bloquear',
      por: `admin:${ADMIN}`,
      motivo: 'insultos repetidos',
    })
    expect(String(filas[0].creado_at)).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
    const respuesta = ultimo(h, ADMIN)
    expect(respuesta).toContain(q.id)
    expect(respuesta).toMatch(/bloqueada/i)
    // Quien modera ve ids de queja, no de Telegram: la respuesta no se lo descubre.
    expect(respuesta).not.toContain(String(VECINA))
  })

  it('también con el id de Telegram, aunque esa cuenta no haya escrito nunca', async () => {
    const h = botFalso(db)
    await h.bot.handleUpdate(texto(ADMIN, `/bloquear ${DESCONOCIDA}`))
    expect(estaBloqueado(db, autorTelegram(DESCONOCIDA))).toBe(true)
    expect(registro(db)).toEqual([
      expect.objectContaining({ accion: 'bloquear', por: `admin:${ADMIN}`, motivo: null }),
    ])
  })

  it('un número de ocho cifras es un id de Telegram, no el sufijo de una queja', async () => {
    const h = botFalso(db)
    await h.bot.handleUpdate(texto(ADMIN, '/bloquear 12345678'))
    expect(estaBloqueado(db, autorTelegram(12345678))).toBe(true)
  })

  it('sin argumento, o con uno que no es ni una cosa ni otra, explica el uso', async () => {
    const h = botFalso(db)
    await h.bot.handleUpdate(texto(ADMIN, '/bloquear'))
    expect(ultimo(h, ADMIN)).toMatch(/Uso: \/bloquear/)
    await h.bot.handleUpdate(texto(ADMIN, '/desbloquear fulanito'))
    expect(ultimo(h, ADMIN)).toMatch(/Uso: \/desbloquear/)
    expect(registro(db)).toEqual([])
  })

  it('una queja que no existe, o retirada por su autor, no lleva a nadie', async () => {
    const q = queja(db, VECINA)
    const h = botFalso(db)
    await h.bot.handleUpdate(texto(ADMIN, '/bloquear Q-ZZZZZZZZ'))
    expect(ultimo(h, ADMIN)).toMatch(/No encuentro la queja Q-ZZZZZZZZ/)
    await h.bot.handleUpdate(texto(VECINA, `/olvidar ${q.id}`))
    await h.bot.handleUpdate(texto(ADMIN, `/bloquear ${q.id}`))
    expect(ultimo(h, ADMIN)).toMatch(/ya no consta quién la escribió/)
    expect(registro(db)).toEqual([])
  })

  it('a un administrador no se le bloquea', async () => {
    const h = botFalso(db)
    await h.bot.handleUpdate(texto(ADMIN, `/bloquear ${ADMIN}`))
    expect(ultimo(h, ADMIN)).toMatch(/administrador/)
    expect(registro(db)).toEqual([])
  })

  it('bloquear dos veces no apunta dos; desbloquear lo apunta y devuelve el permiso', async () => {
    const q = queja(db, VECINA)
    const h = botFalso(db)
    await h.bot.handleUpdate(texto(ADMIN, `/bloquear ${q.id}`))
    await h.bot.handleUpdate(texto(ADMIN, `/bloquear ${q.id}`))
    expect(ultimo(h, ADMIN)).toMatch(/ya estaba bloqueada/)
    await h.bot.handleUpdate(texto(ADMIN, `/desbloquear ${q.id} error mío`))
    expect(estaBloqueado(db, autorTelegram(VECINA))).toBe(false)
    await h.bot.handleUpdate(texto(ADMIN, `/desbloquear ${q.id}`))
    expect(ultimo(h, ADMIN)).toMatch(/no estaba bloqueada/)
    expect(registro(db).map((r) => [r.accion, r.motivo])).toEqual([
      ['bloquear', null],
      ['desbloquear', 'error mío'],
    ])
    await h.bot.handleUpdate(texto(VECINA, '/queja'))
    expect(h.botones(h.a(VECINA).at(-1))).toContain('cat:alumbrado')
  })

  it('bloquear no despublica lo que ya escribió', async () => {
    const q = queja(db, VECINA, true)
    const h = botFalso(db)
    await h.bot.handleUpdate(texto(ADMIN, `/bloquear ${q.id}`))
    expect(getQueja(db, q.id)?.moderacion).toBe('publicada')
    expect(getQueja(db, q.id)?.deleted_at).toBeNull()
  })
})

describe('lo que una cuenta bloqueada no puede hacer', () => {
  const bloquear = async (h: ReturnType<typeof botFalso>, quien: number) => {
    await h.bot.handleUpdate(texto(ADMIN, `/bloquear ${quien}`))
    expect(estaBloqueado(db, autorTelegram(quien))).toBe(true) // el control
  }

  it('/queja: no empieza (ni categoría ni foto) y no guarda nada', async () => {
    const h = botFalso(db)
    await bloquear(h, VECINA)
    await h.bot.handleUpdate(texto(VECINA, '/queja'))
    expect(ultimo(h, VECINA)).toBe(BLOQUEADA)
    expect(h.botones(h.a(VECINA).at(-1))).toEqual([])
    expect(db.prepare('SELECT COUNT(*) AS n FROM quejas').get()).toEqual({ n: 0 })
  })

  it('/queja: un bloqueo que llega a mitad de una queja la para al guardarla', async () => {
    const h = botFalso(db)
    await h.bot.handleUpdate(texto(VECINA, '/queja'))
    await h.bot.handleUpdate(boton(VECINA, 'cat:alumbrado'))
    await h.bot.handleUpdate(texto(VECINA, 'Farola apagada en la plaza'))
    await h.bot.handleUpdate(
      texto(VECINA, 'La farola de la plaza lleva apagada desde el lunes y no se ve nada.'),
    )
    await h.bot.handleUpdate(texto(VECINA, 'saltar'))
    await bloquear(h, VECINA)
    await h.bot.handleUpdate(texto(VECINA, 'saltar'))
    expect(ultimo(h, VECINA)).toBe(BLOQUEADA)
    expect(db.prepare('SELECT COUNT(*) AS n FROM quejas').get()).toEqual({ n: 0 })
  })

  it('/apoyar, también por el atajo: no suma el apoyo', async () => {
    const q = queja(db, VECINO, true)
    const h = botFalso(db)
    await bloquear(h, VECINA)
    await h.bot.handleUpdate(texto(VECINA, `/apoyar ${q.id}`))
    expect(ultimo(h, VECINA)).toBe(BLOQUEADA)
    await h.bot.handleUpdate(texto(VECINA, `/apoyar_${q.id.slice(2).toLowerCase()}`))
    expect(ultimo(h, VECINA)).toBe(BLOQUEADA)
    expect(countApoyos(db, q.id)).toBe(0)
  })

  it('en un grupo no se dice a nadie que esa cuenta está bloqueada', async () => {
    const q = queja(db, VECINO, true)
    const h = botFalso(db)
    await bloquear(h, VECINA)
    const grupo = { id: -500, type: 'group', title: 'Vecinos' }
    await h.bot.handleUpdate(texto(VECINA, `/apoyar ${q.id}`, grupo as never))
    const enGrupo = h.a(-500).map((l) => String(l.cuerpo.text))
    expect(enGrupo).toHaveLength(1)
    expect(enGrupo[0]).not.toContain('no puede')
    expect(countApoyos(db, q.id)).toBe(0)
  })
})

describe('lo que una cuenta bloqueada sigue pudiendo hacer: sus derechos sobre sus datos', () => {
  it('/mis y /olvidar funcionan igual', async () => {
    const q = queja(db, VECINA, true)
    const h = botFalso(db)
    await h.bot.handleUpdate(texto(ADMIN, `/bloquear ${q.id}`))
    await h.bot.handleUpdate(texto(VECINA, '/mis'))
    expect(ultimo(h, VECINA)).toContain(q.id)
    await h.bot.handleUpdate(texto(VECINA, `/olvidar ${q.id}`))
    expect(ultimo(h, VECINA)).toMatch(/retirada/)
    expect(getQueja(db, q.id)?.deleted_at).not.toBeNull()
    // Retirar su queja no le quita el bloqueo: sigue siendo la misma cuenta.
    expect(estaBloqueado(db, autorTelegram(VECINA))).toBe(true)
  })

  it('/borrar_mis_datos lo borra todo, también la identidad del registro de bloqueos', async () => {
    const q = queja(db, VECINA, true)
    const h = botFalso(db)
    await h.bot.handleUpdate(texto(ADMIN, `/bloquear ${q.id} spam`))
    await h.bot.handleUpdate(texto(VECINA, '/borrar_mis_datos'))
    await h.bot.handleUpdate(boton(VECINA, 'borrar_mis_datos:si'))
    expect(ultimo(h, VECINA)).toMatch(/Tu identidad ya no está en el registro del bot/)
    expect(idCiudadano(db, autorTelegram(VECINA))).toBeNull()
    // La decisión queda —quién, cuándo, por qué—, sin a quién.
    expect(registro(db)).toEqual([
      { ciudadano_id: null, accion: 'bloquear', por: `admin:${ADMIN}`, motivo: 'spam' },
    ])
    expect(estaBloqueado(db, autorTelegram(VECINA))).toBe(false)
  })
})

describe('el registro de bloqueos es append-only', () => {
  it('no se borra ni se cambia una fila; sólo pierde la identidad', () => {
    const cid = idCiudadano(db, autorTelegram(VECINA), { crear: true })
    db.prepare(
      "INSERT INTO bloqueos (ciudadano_id, accion, por, motivo) VALUES (?, 'bloquear', 'admin:1', 'x')",
    ).run(cid)
    expect(() => db.prepare('DELETE FROM bloqueos').run()).toThrow(/append-only/)
    expect(() => db.prepare("UPDATE bloqueos SET accion = 'desbloquear'").run()).toThrow(
      /append-only/,
    )
    expect(() => db.prepare("UPDATE bloqueos SET motivo = 'otro'").run()).toThrow(/append-only/)
    db.prepare('UPDATE bloqueos SET ciudadano_id = NULL').run()
    expect(registro(db)).toEqual([
      { ciudadano_id: null, accion: 'bloquear', por: 'admin:1', motivo: 'x' },
    ])
  })

  it('la acción y quién la tomó no pueden quedar vacías', () => {
    const ins = (accion: string, por: string, motivo: string | null) =>
      db
        .prepare('INSERT INTO bloqueos (ciudadano_id, accion, por, motivo) VALUES (NULL, ?, ?, ?)')
        .run(accion, por, motivo)
    expect(() => ins('borrar', 'admin:1', null)).toThrow()
    expect(() => ins('bloquear', '', null)).toThrow()
    expect(() => ins('bloquear', 'admin:1', '')).toThrow()
  })

  it('la purga de ciudadanos sin nada no se lleva un bloqueo vigente', () => {
    const viejo = new Date(Date.now() + 3 * 24 * 3600 * 1000)
    const bloqueado = idCiudadano(db, autorTelegram(VECINA), { crear: true })
    const libre = idCiudadano(db, autorTelegram(VECINO), { crear: true })
    db.prepare(
      "INSERT INTO bloqueos (ciudadano_id, accion, por) VALUES (?, 'bloquear', 'admin:1')",
    ).run(bloqueado)
    db.prepare(
      "INSERT INTO bloqueos (ciudadano_id, accion, por) VALUES (?, 'bloquear', 'admin:1')",
    ).run(libre)
    db.prepare(
      "INSERT INTO bloqueos (ciudadano_id, accion, por) VALUES (?, 'desbloquear', 'admin:1')",
    ).run(libre)
    const r = purgarCaducadas(db, { ahora: viejo, photosDir: '/nonexistent' })
    expect(r.ciudadanos).toBe(1)
    expect(estaBloqueado(db, autorTelegram(VECINA))).toBe(true)
    expect(idCiudadano(db, autorTelegram(VECINO))).toBeNull()
  })
})

describe('mientras la migración 4 está en ensayo', () => {
  it('sin la tabla, el bot sigue: nadie está bloqueado y quien modera oye que aún no está activo', async () => {
    const sin = openDb(':memory:')
    expect(bloqueosActivos(sin)).toBe(false)
    expect(bloqueosActivos(db)).toBe(true) // el control
    const q = queja(sin, VECINA)
    const h = botFalso(sin)
    await h.bot.handleUpdate(texto(ADMIN, `/bloquear ${q.id}`))
    expect(ultimo(h, ADMIN)).toMatch(/aún no está activo/)
    expect(estaBloqueado(sin, autorTelegram(VECINA))).toBe(false)
    await h.bot.handleUpdate(texto(VECINA, '/queja'))
    expect(h.botones(h.a(VECINA).at(-1))).toContain('cat:alumbrado')
    const r = purgarCaducadas(sin, { ahora: new Date(), photosDir: '/nonexistent' })
    expect(r.quejas.revisadas).toBe(1)
  })
})
