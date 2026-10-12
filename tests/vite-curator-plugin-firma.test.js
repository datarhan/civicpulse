// @vitest-environment node
/**
 * Una petición sin firma no llega a la CLI que firma.
 *
 * El panel local /curator lanza `promote-area-fit` a través de
 * `POST /api/curator/run` (vite-curator-plugin.js). Hasta el 12-10-2026 su
 * esquema dejaba `curator` opcional también al publicar y al retirar, y
 * `buildArgv` componía entonces `[..., '--curator', undefined]`. `execFile`
 * convierte ese `undefined` en la cadena «undefined»; la guarda del hueco
 * (`rechazoDeMarcador`, PR #288) no la reconocía y el validador del encaje sólo
 * pide que `curatedBy` no esté vacío: la fila habría salido en /cargos/:slug
 * firmada «undefined». La interfaz que trae el panel ya exigía la firma
 * (area-fit-queue.jsx), pero el punto final se fiaba del cliente.
 *
 * Aquí se lanza el middleware de verdad con `execFile` de mentira, para probar
 * lo que importa: que la petición se para con un 400 ANTES de llegar a
 * `execFile`, no sólo que el esquema la rechace.
 */
import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const execFile = vi.fn((_cmd, _argv, _opts, cb) => {
  cb(null, '', '')
  return new EventEmitter()
})
vi.mock('node:child_process', () => ({ execFile, spawn: vi.fn() }))

const { viteCuratorPlugin, __test } = await import('../vite-curator-plugin.js')
const { ActionSchemas, buildArgv } = __test

/** El manejador que el plugin monta en `/api/curator/run`. */
function manejadorDeRun() {
  const montados = new Map()
  viteCuratorPlugin({ cwd: '/tmp' }).configureServer({
    middlewares: { use: (ruta, fn) => montados.set(ruta, fn) },
  })
  const fn = montados.get('/api/curator/run')
  expect(fn).toBeTypeOf('function')
  return fn
}

/** POST de `body` al manejador; resuelve con el estado y el cuerpo de la respuesta. */
function post(body) {
  const fn = manejadorDeRun()
  return new Promise((resolve) => {
    const req = new EventEmitter()
    req.method = 'POST'
    req.url = '/'
    req.headers = { origin: 'http://localhost:5173' }
    const res = {
      statusCode: 0,
      setHeader: () => {},
      end: (texto) => resolve({ status: res.statusCode, body: JSON.parse(texto) }),
    }
    fn(req, res, () => resolve({ status: 404, body: null }))
    process.nextTick(() => {
      req.emit('data', Buffer.from(JSON.stringify(body)))
      req.emit('end')
    })
  })
}

const FILA = { official: 'teresa-pozuelo-martin', area: 'Urbanismo' }

/** Lo que no firma nada: la clave ausente y los valores que deja un programa. */
const SIN_FIRMA = [
  ['sin la clave', {}],
  ['vacía', { curator: '' }],
  ['en blanco', { curator: '   ' }],
  ['«undefined»', { curator: 'undefined' }],
  ['«null»', { curator: 'null' }],
]
const FIRMAS = ['María de la Fuente Llorens', 'civicpulse-curator']

beforeEach(() => {
  execFile.mockClear()
})

describe('POST /api/curator/run · promote-area-fit sin firma', () => {
  for (const action of ['publish', 'retract']) {
    it.each(SIN_FIRMA)(`${action}, firma %s: 400 y no llega a execFile`, async (_, firma) => {
      const r = await post({ action: 'promote-area-fit', args: { ...FILA, action, ...firma } })
      expect(r.status).toBe(400)
      expect(r.body.error).toBe('invalid args')
      expect(execFile).not.toHaveBeenCalled()
    })

    it.each(FIRMAS)(`${action}, firmada «%s»: llega a execFile con esa firma`, async (firma) => {
      const r = await post({
        action: 'promote-area-fit',
        args: { ...FILA, action, curator: firma },
      })
      expect(r.status).toBe(200)
      expect(execFile).toHaveBeenCalledTimes(1)
      const argv = execFile.mock.calls[0][1]
      expect(argv[argv.indexOf('--curator') + 1]).toBe(firma)
      expect(argv.every((x) => typeof x === 'string' && x !== '')).toBe(true)
    })
  }

  it('reject sin firma sigue pasando: rechazar no publica nada', async () => {
    const r = await post({ action: 'promote-area-fit', args: { ...FILA, action: 'reject' } })
    expect(r.status).toBe(200)
    expect(execFile).toHaveBeenCalledTimes(1)
    expect(execFile.mock.calls[0][1]).not.toContain('--curator')
  })
})

describe('esquemas que firman', () => {
  it.each(['undefined', 'null', 'NaN', ''])(
    'override-speaker-assignment rechaza `by: «%s»`',
    (by) => {
      expect(
        ActionSchemas['override-speaker-assignment'].safeParse({
          plenoId: 'pleno20250728',
          speaker: 'SPEAKER_03',
          mode: 'clear',
          by,
        }).success,
      ).toBe(false)
    },
  )

  it('override-speaker-assignment sigue aceptando una firma y su ausencia', () => {
    const base = { plenoId: 'pleno20250728', speaker: 'SPEAKER_03', mode: 'clear' }
    const s = ActionSchemas['override-speaker-assignment']
    expect(s.safeParse(base).success).toBe(true)
    expect(s.safeParse({ ...base, by: 'civicpulse-curator' }).success).toBe(true)
  })
})

describe('buildArgv no compone una bandera sin valor', () => {
  // Por si alguien la llama sin pasar por el esquema: falla en voz alta, no
  // entrega «undefined» a la CLI.
  it.each(['publish', 'retract'])('promote-area-fit %s sin curator lanza', (action) => {
    expect(() => buildArgv('promote-area-fit', { ...FILA, action })).toThrow(/--curator/)
  })

  it.each([null, ''])('promote-area-fit publish con curator %j lanza', (curator) => {
    expect(() => buildArgv('promote-area-fit', { ...FILA, action: 'publish', curator })).toThrow(
      /--curator/,
    )
  })

  it('ninguna acción entrega un elemento que no sea texto', () => {
    // promote-claim con el título ausente: antes salía `'--title', undefined`.
    expect(() =>
      buildArgv('promote-claim', { claimIds: ['c-1'], summary: 'Resumen de prueba' }),
    ).toThrow(/--title/)
  })
})
