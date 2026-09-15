import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { openDb, type Db } from '../src/db/client'
import { createQueja, softDeleteQueja, type NewQuejaInput } from '../src/db/queries'
import { sirveFotoExportada } from '../src/services/foto-exportada'
import { directorioFotos } from '../src/services/snapshot'
import { retirarQueja } from '../src/commands/olvidar'

/**
 * Las fotos anonimizadas viven ahora en el volumen del bot, y la actualización diaria
 * (o la que pide /olvidar) las trae por HTTP para publicarlas. Este endpoint es el
 * único camino de salida, así que se prueba lo que NO debe servir: nada sin el token,
 * nada con el token en la URL —acabaría en los logs de quien lo pida—, nada de una
 * queja retirada aunque su fichero siga en el disco y nada fuera de la carpeta.
 */

const TOKEN = 'token-del-export-de-prueba'
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
const AUTOR = 7

function sample(overrides: Partial<NewQuejaInput> = {}): NewQuejaInput {
  return {
    telegram_user_id: AUTOR,
    telegram_username: 'ana',
    category: 'urbanismo',
    title: 'Foto adjunta',
    detail: 'Una queja con foto adjunta que ya se ha anonimizado en el servidor del bot.',
    lat: null,
    lng: null,
    neighborhood: 'casco',
    photo_file_id: 'file-A',
    concejalia_area: 'Urbanismo',
    concejal_slug: 'teresa-pozuelo-martin',
    ...overrides,
  }
}

function peticion(url: string, { auth, method = 'GET' }: { auth?: string; method?: string } = {}) {
  return {
    method,
    url,
    headers: { host: 'bot.test', ...(auth ? { authorization: auth } : {}) },
  } as unknown as IncomingMessage
}

function respuesta() {
  const r = {
    statusCode: 200,
    cabeceras: {} as Record<string, string>,
    cuerpo: undefined as unknown,
    setHeader(k: string, v: string) {
      r.cabeceras[k.toLowerCase()] = v
    },
    end(b?: unknown) {
      r.cuerpo = b
    },
  }
  return r
}

describe('GET /export/quejas-photos/<id>.jpg', () => {
  let db: Db
  let dir: string
  let id: string

  beforeEach(() => {
    db = openDb(':memory:')
    dir = mkdtempSync(join(tmpdir(), 'cp-fotos-export-'))
    id = createQueja(db, sample()).id.toLowerCase()
    writeFileSync(join(dir, `${id}.jpg`), JPEG)
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  function sirve(req: IncomingMessage, exportToken = TOKEN) {
    const res = respuesta()
    const manejada = sirveFotoExportada(req, res as unknown as ServerResponse, {
      db,
      photosDir: dir,
      exportToken,
    })
    return { manejada, res }
  }

  it('con el token, sirve la foto de una queja viva y sin caché (el control)', () => {
    const { manejada, res } = sirve(
      peticion(`/export/quejas-photos/${id}.jpg`, { auth: `Bearer ${TOKEN}` }),
    )
    expect(manejada).toBe(true)
    expect(res.statusCode).toBe(200)
    expect(res.cabeceras['content-type']).toBe('image/jpeg')
    expect(res.cabeceras['cache-control']).toBe('no-store')
    expect(Buffer.compare(res.cuerpo as Buffer, JPEG)).toBe(0)
  })

  it('sin el token, 401', () => {
    const { manejada, res } = sirve(peticion(`/export/quejas-photos/${id}.jpg`))
    expect(manejada).toBe(true)
    expect(res.statusCode).toBe(401)
    expect(res.cuerpo).not.toBeInstanceOf(Buffer)
  })

  it('el token en la URL no vale: acabaría en los logs de quien la pida', () => {
    const { res } = sirve(peticion(`/export/quejas-photos/${id}.jpg?token=${TOKEN}`))
    expect(res.statusCode).toBe(401)
  })

  it('sin token configurado en el bot no se sirve nada, en vez de servirla abierta', () => {
    expect(sirve(peticion(`/export/quejas-photos/${id}.jpg`), '').res.statusCode).toBe(401)
    expect(
      sirve(peticion(`/export/quejas-photos/${id}.jpg`, { auth: 'Bearer ' }), '').res.statusCode,
    ).toBe(401)
  })

  it('la foto de una queja retirada da 404 aunque el fichero siga en el disco', () => {
    expect(softDeleteQueja(db, id.toUpperCase(), AUTOR)).toBe(true)
    expect(existsSync(join(dir, `${id}.jpg`)), 'la prueba necesita el fichero en su sitio').toBe(
      true,
    )
    const { res } = sirve(peticion(`/export/quejas-photos/${id}.jpg`, { auth: `Bearer ${TOKEN}` }))
    expect(res.statusCode).toBe(404)
  })

  it('una queja viva sin fichero da 404', () => {
    const otra = createQueja(db, sample({ photo_file_id: 'file-B' })).id.toLowerCase()
    const { res } = sirve(
      peticion(`/export/quejas-photos/${otra}.jpg`, { auth: `Bearer ${TOKEN}` }),
    )
    expect(res.statusCode).toBe(404)
  })

  it('nada fuera de la carpeta: un nombre que no es el de una queja da 404', () => {
    for (const ruta of [
      '/export/quejas-photos/..%2Fbot.db',
      '/export/quejas-photos/..%2F..%2Fdata%2Fbot.db.jpg',
      '/export/quejas-photos/q-abc.jpg',
      `/export/quejas-photos/${id}.png`,
    ]) {
      expect(sirve(peticion(ruta, { auth: `Bearer ${TOKEN}` })).res.statusCode, ruta).toBe(404)
    }
  })

  it('otra ruta no la toca: devuelve false y deja la respuesta sin escribir', () => {
    const { manejada, res } = sirve(peticion('/export/quejas.json', { auth: `Bearer ${TOKEN}` }))
    expect(manejada).toBe(false)
    expect(res.cuerpo).toBeUndefined()
  })
})

describe('/olvidar borra en el acto la foto del disco del bot', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cp-fotos-olvidar-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('la retirada de su autor borra el fichero; la petición de otra persona no (el control)', () => {
    const db = openDb(':memory:')
    const q = createQueja(db, sample())
    const fichero = join(dir, `${q.id.toLowerCase()}.jpg`)
    writeFileSync(fichero, JPEG)

    expect(retirarQueja(db, q.id, AUTOR + 1, dir)).toBe(false)
    expect(existsSync(fichero), 'borró la foto de una queja que no retiró nadie').toBe(true)

    expect(retirarQueja(db, q.id, AUTOR, dir)).toBe(true)
    expect(existsSync(fichero)).toBe(false)
  })
})

describe('dónde viven las fotos', () => {
  it('con QUEJAS_PHOTOS_DIR, en el volumen', () => {
    expect(directorioFotos({ QUEJAS_PHOTOS_DIR: '/data/quejas-photos' })).toBe(
      '/data/quejas-photos',
    )
  })

  it('sin ella, junto al quejas.json exportado, como hasta ahora', () => {
    expect(directorioFotos({ QUEJAS_JSON_OUT: '/tmp/cp-x/quejas.json' })).toBe(
      '/tmp/cp-x/quejas-photos',
    )
  })
})
