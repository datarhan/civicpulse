import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { openDb, type Db } from '../src/db/client'
import { createQueja, fotosRetenidas, type NewQuejaInput } from '../src/db/queries'
import { processPhotos, pruneOrphanPhotos } from '../src/services/process-photos'

/**
 * Las pruebas de cableado usan bytes de mentira («file-A») para saber qué foto es
 * cuál; la normalización de verdad los rechazaría por no ser imágenes. Aquí pasa
 * tal cual. Lo que hace la de verdad se prueba abajo, con imágenes reales.
 */
const sinNormalizar = async (b: Buffer) => ({ data: b, ancho: 1, alto: 1 })

function sample(overrides: Partial<NewQuejaInput> = {}): NewQuejaInput {
  return {
    telegram_user_id: 7,
    telegram_username: 'ana',
    category: 'urbanismo',
    title: 'Foto adjunta',
    detail: 'Una queja con foto adjunta que hay que anonimizar antes de publicar.',
    lat: null,
    lng: null,
    neighborhood: 'casco',
    photo_file_id: null,
    concejalia_area: 'Urbanismo',
    concejal_slug: 'teresa-pozuelo-martin',
    ...overrides,
  }
}

describe('processPhotos — end-to-end wiring', () => {
  let db: Db
  let dir: string
  beforeEach(() => {
    db = openDb(':memory:')
    dir = mkdtempSync(join(tmpdir(), 'cp-quejas-photos-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('publishes clean photos, holds ones that fail detection, skips already-published', async () => {
    const a = createQueja(db, sample({ photo_file_id: 'file-A' }))
    const b = createQueja(db, sample({ photo_file_id: 'file-B' }))
    const c = createQueja(db, sample({ photo_file_id: 'file-C' }))

    // C is already published → must be skipped, its file left untouched.
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${c.id.toLowerCase()}.jpg`), 'OLD-C')

    const res = await processPhotos({
      db,
      token: 'x',
      photosDir: dir,
      env: { GEMINI_API_KEY: 'g' },
      fetchBytes: async (_t, fileId) => Buffer.from(fileId),
      normalizar: sinNormalizar,
      // B's bytes trip a detection failure → fail-closed HOLD.
      detect: async (buf) => {
        if (buf.toString() === 'file-B') throw new Error('vision quota exceeded')
        return []
      },
      anonymize: async (buf) => Buffer.from(`ANON:${buf.toString()}`),
      log: () => {},
    })

    expect(res.published).toEqual([a.id])
    expect(res.held).toEqual([b.id])
    expect(res.skipped).toBe(1)

    // A: anonymized image written from the anonymize() output.
    expect(readFileSync(join(dir, `${a.id.toLowerCase()}.jpg`), 'utf8')).toBe('ANON:file-A')
    // B: held → no file published (raw never written).
    expect(existsSync(join(dir, `${b.id.toLowerCase()}.jpg`))).toBe(false)
    // C: pre-existing publication untouched.
    expect(readFileSync(join(dir, `${c.id.toLowerCase()}.jpg`), 'utf8')).toBe('OLD-C')
  })

  it('prunes the photo of a forgotten queja (right-to-be-forgotten honored)', async () => {
    const keep = createQueja(db, sample({ photo_file_id: 'file-keep' }))
    const forget = createQueja(db, sample({ photo_file_id: 'file-forget' }))
    mkdirSync(dir, { recursive: true })
    // Both already published on disk...
    writeFileSync(join(dir, `${keep.id.toLowerCase()}.jpg`), 'IMG-keep')
    writeFileSync(join(dir, `${forget.id.toLowerCase()}.jpg`), 'IMG-forget')
    // ...then one is forgotten (soft-deleted → drops out of listQuejasWithPhoto).
    const { softDeleteQueja } = await import('../src/db/queries')
    softDeleteQueja(db, forget.id, 7)

    const res = await processPhotos({
      db,
      token: 'x',
      photosDir: dir,
      env: { GEMINI_API_KEY: 'g' },
      fetchBytes: async (_t, f) => Buffer.from(f),
      normalizar: sinNormalizar,
      detect: async () => [],
      anonymize: async (b) => Buffer.from(`ANON:${b.toString()}`),
      log: () => {},
    })

    expect(res.pruned).toEqual([`${forget.id.toLowerCase()}.jpg`])
    expect(existsSync(join(dir, `${forget.id.toLowerCase()}.jpg`))).toBe(false)
    expect(existsSync(join(dir, `${keep.id.toLowerCase()}.jpg`))).toBe(true)
  })
})

/**
 * El modelo tiene que ver EXACTAMENTE la imagen sobre la que luego se pinta el
 * mosaico. Con imágenes de verdad: una PNG y una JPEG con orientación EXIF 6.
 */
describe('processPhotos — el modelo ve el encuadre que se tapa', () => {
  let db: Db
  let dir: string
  beforeEach(() => {
    db = openDb(':memory:')
    dir = mkdtempSync(join(tmpdir(), 'cp-quejas-encuadre-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const liso = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: { r: 200, g: 60, b: 60 } } })

  it.each([
    ['una PNG', () => liso(160, 90).png().toBuffer()],
    [
      'una JPEG con orientación EXIF 6',
      () => liso(200, 100).jpeg().withMetadata({ orientation: 6 }).toBuffer(),
    ],
  ])(
    '%s llega al modelo como JPEG y con las dimensiones de la foto publicada',
    async (_n, hacer) => {
      const q = createQueja(db, sample({ photo_file_id: 'file-real' }))
      const bytes = await hacer()
      const vistos: Buffer[] = []
      const res = await processPhotos({
        db,
        token: 'x',
        photosDir: dir,
        env: { GEMINI_API_KEY: 'g' },
        fetchBytes: async () => bytes,
        detect: async (buf) => {
          vistos.push(buf)
          return [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2, label: 'face' }]
        },
        log: () => {},
      })
      expect(res.published).toEqual([q.id])
      expect(vistos).toHaveLength(1)
      const visto = await sharp(vistos[0]).metadata()
      const publicada = await sharp(readFileSync(join(dir, `${q.id.toLowerCase()}.jpg`))).metadata()
      expect(visto.format).toBe('jpeg')
      expect([visto.width, visto.height]).toEqual([publicada.width, publicada.height])
    },
  )

  it('lo que no es una imagen se RECHAZA: ni se publica ni cuenta como retenida por el modelo', async () => {
    const q = createQueja(db, sample({ photo_file_id: 'file-roto' }))
    let llamadas = 0
    const res = await processPhotos({
      db,
      token: 'x',
      photosDir: dir,
      env: { GEMINI_API_KEY: 'g' },
      fetchBytes: async () => Buffer.from('<html>no es una foto</html>'),
      detect: async () => {
        llamadas++
        return []
      },
      log: () => {},
    })
    expect(res.rechazadas).toEqual([q.id])
    expect(res.published).toEqual([])
    expect(res.held).toEqual([])
    expect(llamadas, 'unos bytes que no son una imagen no salen hacia el modelo').toBe(0)
    expect(existsSync(join(dir, `${q.id.toLowerCase()}.jpg`))).toBe(false)
  })
})

/**
 * Una foto retenida se reintentaba cada hora PARA SIEMPRE, sin que nadie lo
 * supiera: la queja salía sin foto y el vecino que la mandó no se enteraba. Ahora
 * se anota desde cuándo está retenida, y al pasar un día se pide avisar UNA vez.
 */
describe('processPhotos — lo que lleva un día retenido se avisa una vez', () => {
  let db: Db
  let dir: string
  beforeEach(() => {
    db = openDb(':memory:')
    dir = mkdtempSync(join(tmpdir(), 'cp-quejas-retenidas-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const T0 = new Date('2026-09-27T10:00:00Z')
  const mas = (h: number) => new Date(T0.getTime() + h * 3600_000)

  const pasar = (ahora: Date, falla: boolean) =>
    processPhotos({
      db,
      token: 'x',
      photosDir: dir,
      env: { GEMINI_API_KEY: 'g' },
      fetchBytes: async (_t, f) => Buffer.from(f),
      normalizar: sinNormalizar,
      detect: async () => {
        if (falla) throw new Error('vision HTTP 503')
        return []
      },
      anonymize: async (b) => b,
      ahora: () => ahora,
      log: () => {},
    })

  it('anota la primera retención, la pide avisar al pasar un día, y la olvida al publicarse', async () => {
    const q = createQueja(db, sample({ photo_file_id: 'file-lenta' }))

    const r1 = await pasar(T0, true)
    expect(r1.held).toEqual([q.id])
    expect(r1.paraAvisar).toEqual([])
    const [fila] = fotosRetenidas(db)
    expect(fila).toMatchObject({ queja_id: q.id, desde: T0.toISOString(), intentos: 1 })
    expect(fila.motivo).toMatch(/503/)

    // Veinte horas después sigue fallando: aún no toca avisar, y el «desde» no se mueve.
    const r2 = await pasar(mas(20), true)
    expect(r2.paraAvisar).toEqual([])
    expect(fotosRetenidas(db)[0]).toMatchObject({ desde: T0.toISOString(), intentos: 2 })

    // Pasado el día, se pide avisar de ella.
    const r3 = await pasar(mas(25), true)
    expect(r3.paraAvisar.map((f) => f.queja_id)).toEqual([q.id])

    // Al publicarse, deja de estar retenida.
    const r4 = await pasar(mas(26), false)
    expect(r4.published).toEqual([q.id])
    expect(fotosRetenidas(db)).toEqual([])
  })

  // El motivo se guarda y viaja en el aviso a los administradores. Un fallo de red
  // de Telegram trae la URL entera, con el token del bot dentro: control total del
  // bot. No puede quedarse en la base ni salir en un mensaje.
  it('el motivo guardado no lleva el token del bot aunque el error lo traiga', async () => {
    const TOKEN = '123456:TOKEN-DEL-BOT-DE-PRUEBA'
    createQueja(db, sample({ photo_file_id: 'file-red' }))
    await processPhotos({
      db,
      token: TOKEN,
      photosDir: dir,
      env: { GEMINI_API_KEY: 'g' },
      fetchBytes: async () => {
        throw new Error(`fetch failed: https://api.telegram.org/bot${TOKEN}/getFile?file_id=x`)
      },
      ahora: () => T0,
      log: () => {},
    })
    const [fila] = fotosRetenidas(db)
    expect(fila.motivo).toContain('api.telegram.org') // el control: es el error de verdad
    expect(fila.motivo).not.toContain(TOKEN)
  })
})

describe('pruneOrphanPhotos', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cp-prune-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('deletes .jpg files not backing a publishable queja, ignoring other files', () => {
    for (const f of ['q-a.jpg', 'q-b.jpg', 'q-c.jpg', 'notes.txt']) {
      writeFileSync(join(dir, f), 'x')
    }
    const pruned = pruneOrphanPhotos(dir, new Set(['q-a', 'q-c']))
    expect(pruned.sort()).toEqual(['q-b.jpg'])
    expect(existsSync(join(dir, 'q-b.jpg'))).toBe(false)
    expect(existsSync(join(dir, 'q-a.jpg'))).toBe(true)
    expect(existsSync(join(dir, 'notes.txt'))).toBe(true)
  })

  it('is a no-op when the directory does not exist', () => {
    expect(pruneOrphanPhotos(join(dir, 'nope'), new Set())).toEqual([])
  })
})
