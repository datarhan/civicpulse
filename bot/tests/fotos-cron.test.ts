import { describe, expect, it, vi } from 'vitest'
import { openDb } from '../src/db/client'
import {
  createQueja,
  fotosRetenidas,
  registrarFotoRetenida,
  type NewQuejaInput,
} from '../src/db/queries'
import { pasadaDeFotos, startFotosCron } from '../src/services/fotos-cron'
import { MAX_MENSAJE } from '../src/util/telegram'
import type { ProcessDeps, ProcessResult } from '../src/services/process-photos'

/**
 * La pasada que anonimiza las fotos corre en el servidor del bot, cada hora, contra la
 * base de producción. Hasta ahora sólo existía como `npm run process-photos` a mano, y
 * a mano no la lanzaba nadie; en el portátil, además, leía una copia de la base de
 * agosto. Aquí se prueba lo que hace cada tic y cuándo se arma.
 */

const NADA: ProcessResult = {
  published: [],
  held: [],
  rechazadas: [],
  skipped: 0,
  pruned: [],
  paraAvisar: [],
}
const TOKEN = '123456:TOKEN-DEL-BOT-DE-PRUEBA'

/** Media pareja de un carácter de dos unidades (un emoji partido): alto sin bajo, o bajo sin alto. */
const SUSTITUTO_SUELTO = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

const procesarQueDevuelve = (r: ProcessResult = NADA) => vi.fn(async (_deps: ProcessDeps) => r)

function registro() {
  const lineas: string[] = []
  return { lineas, log: (l: string) => void lineas.push(l) }
}

describe('una pasada de fotos', () => {
  it('llama a processPhotos con la carpeta del volumen y cuenta lo que hizo', async () => {
    const db = openDb(':memory:')
    const { lineas, log } = registro()
    const hecho: ProcessResult = {
      published: ['Q-UNO00001'],
      held: ['Q-DOS00002', 'Q-TRES0003'],
      rechazadas: ['Q-CINCO005'],
      skipped: 4,
      pruned: ['q-ida00004.jpg'],
      paraAvisar: [],
    }
    const procesar = procesarQueDevuelve(hecho)
    const r = await pasadaDeFotos({
      db,
      token: TOKEN,
      photosDir: '/data/quejas-photos',
      procesar,
      log,
    })
    expect(procesar).toHaveBeenCalledTimes(1)
    const deps = procesar.mock.calls[0][0]
    expect(deps.db).toBe(db)
    expect(deps.token).toBe(TOKEN)
    expect(deps.photosDir).toBe('/data/quejas-photos')
    expect(r).toEqual(hecho)
    const resumen = lineas.join('\n')
    expect(resumen).toMatch(/publicadas=1\b/)
    expect(resumen).toMatch(/retenidas=2\b/)
    expect(resumen).toMatch(/rechazadas=1\b/)
    expect(resumen).toMatch(/podadas=1\b/)
  })

  it('sin BOT_TOKEN no descarga nada, y lo dice', async () => {
    const { lineas, log } = registro()
    const procesar = procesarQueDevuelve()
    expect(
      await pasadaDeFotos({ db: openDb(':memory:'), token: '', photosDir: '/x', procesar, log }),
    ).toBeNull()
    expect(procesar).not.toHaveBeenCalled()
    expect(lineas.join('\n')).toMatch(/BOT_TOKEN/)
  })

  it('una pasada sin nada que hacer no escribe un renglón cada hora', async () => {
    const { lineas, log } = registro()
    const procesar = procesarQueDevuelve({ ...NADA, skipped: 3 })
    await pasadaDeFotos({ db: openDb(':memory:'), token: TOKEN, photosDir: '/x', procesar, log })
    expect(procesar).toHaveBeenCalledTimes(1)
    expect(lineas).toEqual([])
  })

  it('si la pasada revienta, lo registra y devuelve null en vez de tumbar el bot', async () => {
    const { lineas, log } = registro()
    const procesar = vi.fn(async (_deps: ProcessDeps): Promise<ProcessResult> => {
      throw new Error('disco lleno')
    })
    expect(
      await pasadaDeFotos({ db: openDb(':memory:'), token: TOKEN, photosDir: '/x', procesar, log }),
    ).toBeNull()
    expect(lineas.join('\n')).toMatch(/disco lleno/)
  })

  it('el token del bot no sale en el log, aunque un error lo traiga en la URL de Telegram', async () => {
    const { lineas, log } = registro()
    const procesar = vi.fn(async (deps: ProcessDeps): Promise<ProcessResult> => {
      deps.log?.(`[photos] HELD Q-UNO00001 — https://api.telegram.org/bot${TOKEN}/getFile falló`)
      throw new Error(`https://api.telegram.org/file/bot${TOKEN}/photos/x.jpg: ECONNRESET`)
    })
    await pasadaDeFotos({ db: openDb(':memory:'), token: TOKEN, photosDir: '/x', procesar, log })
    expect(lineas.length, 'no escribió nada que comprobar').toBeGreaterThanOrEqual(2)
    for (const l of lineas) expect(l).not.toContain(TOKEN)
  })
})

/**
 * Una foto que lleva un día retenida se avisa por Telegram a los administradores,
 * UNA vez. Hasta el 27-09-2026 se reintentaba cada hora para siempre y no lo sabía
 * nadie: la queja salía sin foto y quien la mandó no se enteraba.
 */
describe('el aviso de las fotos retenidas', () => {
  const T0 = new Date('2026-09-27T10:00:00Z')
  const ahora = new Date(T0.getTime() + 25 * 3600_000)

  function conUnaRetenida() {
    const db = openDb(':memory:')
    const entrada: NewQuejaInput = {
      telegram_user_id: 7,
      telegram_username: null,
      category: 'limpieza',
      title: 'Contenedor <roto> & sucio',
      detail: 'Una queja con una foto que el análisis no consigue leer desde ayer.',
      lat: null,
      lng: null,
      neighborhood: null,
      photo_file_id: 'file-x',
      concejalia_area: null,
      concejal_slug: null,
    }
    const q = createQueja(db, entrada)
    registrarFotoRetenida(db, q.id, 'gemini vision HTTP 503', T0)
    const [fila] = fotosRetenidas(db)
    return { db, q, fila }
  }

  it('manda un DM a cada administrador y la marca avisada', async () => {
    const { db, q, fila } = conUnaRetenida()
    const enviados: Array<{ a: number; texto: string }> = []
    await pasadaDeFotos({
      db,
      token: TOKEN,
      photosDir: '/x',
      procesar: procesarQueDevuelve({ ...NADA, held: [q.id], paraAvisar: [fila] }),
      admins: () => [1, 2],
      sendDm: async (a, texto) => void enviados.push({ a, texto }),
      ahora: () => ahora,
      log: () => {},
    })
    expect(enviados.map((e) => e.a)).toEqual([1, 2])
    expect(enviados[0].texto).toContain(q.id)
    expect(enviados[0].texto).toMatch(/503/)
    // El título lo escribió un vecino: va escapado, o un «<» o un «&» tumban el mensaje.
    expect(enviados[0].texto).toContain('Contenedor &lt;roto&gt; &amp; sucio')
    expect(fotosRetenidas(db)[0].avisada_at).toBe(ahora.toISOString())
  })

  it('si no le llega a nadie, no la marca: se volverá a intentar', async () => {
    const { db, q, fila } = conUnaRetenida()
    await pasadaDeFotos({
      db,
      token: TOKEN,
      photosDir: '/x',
      procesar: procesarQueDevuelve({ ...NADA, held: [q.id], paraAvisar: [fila] }),
      admins: () => [1],
      sendDm: async () => {
        throw new Error('400: can’t parse entities')
      },
      ahora: () => ahora,
      log: () => {},
    })
    expect(fotosRetenidas(db)[0].avisada_at).toBeNull()
  })

  // El aviso existe para la caída larga —Gemini sin cuota, un modelo retirado—, y
  // es justo cuando más filas lleva. Sin partir, pasaba de 4096 caracteres,
  // Telegram lo rechazaba, no se marcaba nada y el mismo mensaje, cada vez más
  // largo, se volvía a intentar cada hora sin llegar nunca.
  it('con muchas retenidas se parte en mensajes que caben, y las marca todas', async () => {
    const db = openDb(':memory:')
    const entrada: NewQuejaInput = {
      telegram_user_id: 7,
      telegram_username: null,
      category: 'limpieza',
      title: '🗑️ Contenedores desbordados en la calle Mayor 😡 '.repeat(4),
      detail: 'Una queja con una foto que el análisis no consigue leer desde ayer.',
      lat: null,
      lng: null,
      neighborhood: null,
      photo_file_id: 'file-x',
      concejalia_area: null,
      concejal_slug: null,
    }
    const motivo = `gemini vision HTTP 429: ${'{"error":{"code":429,"message":"Quota exceeded"}} '.repeat(8)}`
    for (let i = 0; i < 20; i++) {
      const q = createQueja(db, entrada)
      registrarFotoRetenida(db, q.id, motivo, T0)
    }
    const filas = fotosRetenidas(db)
    const mensajes: string[] = []
    await pasadaDeFotos({
      db,
      token: TOKEN,
      photosDir: '/x',
      procesar: procesarQueDevuelve({ ...NADA, paraAvisar: filas }),
      admins: () => [1],
      sendDm: async (_a, texto) => void mensajes.push(texto),
      ahora: () => ahora,
      log: () => {},
    })
    expect(mensajes.length, 'no hizo falta partir: la prueba no mide nada').toBeGreaterThan(1)
    // El control del detector: un emoji cortado por la mitad sí lo ve.
    expect('😡'.slice(0, 1)).toMatch(SUSTITUTO_SUELTO)
    expect('😡').not.toMatch(SUSTITUTO_SUELTO)
    for (const m of mensajes) {
      expect(m.length).toBeLessThanOrEqual(MAX_MENSAJE)
      // Ni un emoji partido por la mitad: un sustituto suelto puede tumbar el mensaje.
      expect(m).not.toMatch(SUSTITUTO_SUELTO)
    }
    expect(fotosRetenidas(db).every((f) => f.avisada_at === ahora.toISOString())).toBe(true)
  })

  it('sin administradores lo dice en el log en vez de callar', async () => {
    const { db, q, fila } = conUnaRetenida()
    const { lineas, log } = registro()
    await pasadaDeFotos({
      db,
      token: TOKEN,
      photosDir: '/x',
      procesar: procesarQueDevuelve({ ...NADA, held: [q.id], paraAvisar: [fila] }),
      admins: () => [],
      sendDm: async () => {},
      ahora: () => ahora,
      log,
    })
    expect(lineas.join('\n')).toMatch(/ADMIN_USER_IDS/)
    expect(fotosRetenidas(db)[0].avisada_at).toBeNull()
  })
})

describe('el cron de las fotos', () => {
  it('sin QUEJAS_PHOTOS_DIR no se arma: fuera del volumen podaría contra una copia de la base', () => {
    const { lineas, log } = registro()
    const procesar = procesarQueDevuelve()
    const programar = vi.fn()
    expect(
      startFotosCron({ db: openDb(':memory:'), token: TOKEN, env: {}, procesar, log, programar }),
    ).toBe(false)
    expect(procesar).not.toHaveBeenCalled()
    expect(programar).not.toHaveBeenCalled()
    expect(lineas.join('\n')).toMatch(/QUEJAS_PHOTOS_DIR/)
  })

  it('con la carpeta se arma cada hora, pasa ya una vez y dice que no hay clave de visión', () => {
    const { lineas, log } = registro()
    const procesar = procesarQueDevuelve()
    const programar = vi.fn()
    const env = { QUEJAS_PHOTOS_DIR: '/data/quejas-photos' }
    expect(
      startFotosCron({ db: openDb(':memory:'), token: TOKEN, env, procesar, log, programar }),
    ).toBe(true)
    expect(programar).toHaveBeenCalledWith(expect.any(Function), 60 * 60 * 1000)
    expect(procesar).toHaveBeenCalledTimes(1)
    expect(procesar.mock.calls[0][0].photosDir).toBe('/data/quejas-photos')
    expect(lineas.join('\n')).toMatch(/sin GEMINI_API_KEY/)
  })

  it('con la clave de Gemini el arranque lo dice, y los dos casos se distinguen', () => {
    const { lineas, log } = registro()
    const env = { QUEJAS_PHOTOS_DIR: '/data/quejas-photos', GEMINI_API_KEY: 'k' }
    startFotosCron({
      db: openDb(':memory:'),
      token: TOKEN,
      env,
      procesar: procesarQueDevuelve(),
      log,
      programar: vi.fn(),
    })
    expect(lineas.join('\n')).toMatch(/Gemini/)
    expect(lineas.join('\n')).not.toMatch(/sin GEMINI_API_KEY/)
  })

  it('un tic no se solapa con el anterior mientras éste sigue en marcha', async () => {
    let suelta: () => void = () => {}
    const procesar = vi.fn(
      (_deps: ProcessDeps) =>
        new Promise<ProcessResult>((r) => {
          suelta = () => r(NADA)
        }),
    )
    const programar = vi.fn()
    const { log } = registro()
    const env = { QUEJAS_PHOTOS_DIR: '/d' }
    startFotosCron({ db: openDb(':memory:'), token: TOKEN, env, procesar, log, programar })
    const tic = programar.mock.calls[0][0] as () => void
    tic()
    expect(procesar, 'arrancó otra pasada con la primera sin terminar').toHaveBeenCalledTimes(1)
    suelta()
    await new Promise((r) => setTimeout(r, 0))
    tic()
    expect(procesar).toHaveBeenCalledTimes(2)
  })
})
