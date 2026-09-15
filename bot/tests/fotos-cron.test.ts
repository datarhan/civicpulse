import { describe, expect, it, vi } from 'vitest'
import { openDb } from '../src/db/client'
import { pasadaDeFotos, startFotosCron } from '../src/services/fotos-cron'
import type { ProcessDeps, ProcessResult } from '../src/services/process-photos'

/**
 * La pasada que anonimiza las fotos corre en el servidor del bot, cada hora, contra la
 * base de producción. Hasta ahora sólo existía como `npm run process-photos` a mano, y
 * a mano no la lanzaba nadie; en el portátil, además, leía una copia de la base de
 * agosto. Aquí se prueba lo que hace cada tic y cuándo se arma.
 */

const NADA: ProcessResult = { published: [], held: [], skipped: 0, pruned: [] }
const TOKEN = '123456:TOKEN-DEL-BOT-DE-PRUEBA'

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
      skipped: 4,
      pruned: ['q-ida00004.jpg'],
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
