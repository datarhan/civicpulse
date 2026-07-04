import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../src/db/client'
import { createQueja, type NewQuejaInput } from '../src/db/queries'
import { processPhotos, pruneOrphanPhotos } from '../src/services/process-photos'

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
      detect: async () => [],
      anonymize: async (b) => Buffer.from(`ANON:${b.toString()}`),
      log: () => {},
    })

    expect(res.pruned).toEqual([`${forget.id.toLowerCase()}.jpg`])
    expect(existsSync(join(dir, `${forget.id.toLowerCase()}.jpg`))).toBe(false)
    expect(existsSync(join(dir, `${keep.id.toLowerCase()}.jpg`))).toBe(true)
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
