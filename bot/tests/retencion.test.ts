import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  utimesSync,
  readdirSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../src/db/client'
import { addApoyo, autorTelegram, createQueja } from '../src/db/queries'
import { purgarCaducadas } from '../src/services/retencion'
import {
  CONSERVACION_COPIAS_DIAS,
  CONSERVACION_QUEJAS_ANIOS,
} from '../../src/scraper/plazos-retencion'

/**
 * El plazo de conservación, cumplido por código.
 *
 * El aviso legal, `/start` y la respuesta a `/olvidar` prometían que el registro
 * interno de una queja se destruye a los cinco años de su resolución o de su
 * última actualización, y ningún código lo hacía. Tampoco caducaban las copias
 * de seguridad de la base, que llevan los mismos datos personales, ni la copia
 * de un ensayo de migración interrumpido. La cifra se lee de un solo sitio
 * (src/scraper/plazos-retencion.ts), el mismo que imprimen las páginas.
 */
const DIA = 24 * 3600 * 1000
const AHORA = new Date('2032-06-01T12:00:00Z')
const haceAnios = (n: number, masDias = 0) => {
  const d = new Date(AHORA)
  d.setUTCFullYear(d.getUTCFullYear() - n)
  return new Date(d.getTime() + masDias * DIA)
}
const sqlite = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19)

let db: Db
let dir: string
let fotos: string
let copias: string
beforeEach(() => {
  db = openDb(':memory:')
  dir = mkdtempSync(join(tmpdir(), 'cp-retencion-'))
  fotos = join(dir, 'fotos')
  copias = join(dir, 'backups')
  mkdirSync(fotos)
  mkdirSync(copias)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function queja(fechas: { updated: Date; resolved?: Date }): string {
  const id = createQueja(db, {
    autor: autorTelegram(1001),
    category: 'ruido',
    title: 'Ruido nocturno',
    detail: 'Ruido de madrugada todos los fines de semana en la calle del mercado.',
  }).id
  db.prepare('UPDATE quejas SET updated_at = ?, resolved_at = ? WHERE id = ?').run(
    sqlite(fechas.updated),
    fechas.resolved ? sqlite(fechas.resolved) : null,
    id,
  )
  writeFileSync(join(fotos, `${id.toLowerCase()}.jpg`), 'x')
  return id
}

const existe = (id: string) => db.prepare('SELECT 1 FROM quejas WHERE id = ?').get(id) !== undefined
const opciones = () => ({ ahora: AHORA, photosDir: fotos, dirCopias: copias, dirBase: dir })

describe('purgarCaducadas', () => {
  it('destruye la queja un día después del plazo, y no un día antes', () => {
    const vieja = queja({ updated: haceAnios(CONSERVACION_QUEJAS_ANIOS, -1) })
    const casi = queja({ updated: haceAnios(CONSERVACION_QUEJAS_ANIOS, +1) })
    const r = purgarCaducadas(db, opciones())
    expect(existe(vieja)).toBe(false)
    expect(existe(casi)).toBe(true)
    expect(r.quejas).toEqual({ revisadas: 2, borradas: 1 })
    expect(r.fotos).toBe(1)
    expect(existsSync(join(fotos, `${vieja.toLowerCase()}.jpg`))).toBe(false)
    expect(existsSync(join(fotos, `${casi.toLowerCase()}.jpg`))).toBe(true)
  })

  it('el plazo corre desde lo último que le pasó: una resuelta hace años que se movió ayer sigue', () => {
    const movida = queja({
      resolved: haceAnios(CONSERVACION_QUEJAS_ANIOS + 1),
      updated: new Date(AHORA.getTime() - DIA),
    })
    const resuelta = queja({
      resolved: haceAnios(CONSERVACION_QUEJAS_ANIOS, -1),
      updated: haceAnios(CONSERVACION_QUEJAS_ANIOS, -1),
    })
    purgarCaducadas(db, opciones())
    expect(existe(movida)).toBe(true)
    expect(existe(resuelta)).toBe(false)
  })

  it('con la queja se van sus eventos, sus apoyos, y quien ya no tiene nada', () => {
    const vieja = queja({ updated: haceAnios(CONSERVACION_QUEJAS_ANIOS + 1) })
    addApoyo(db, vieja, autorTelegram(1002))
    // Quien la escribió y quien la apoyó no tienen otra cosa en la base.
    db.prepare("UPDATE ciudadanos SET creado_at = '2026-01-01 00:00:00'").run()
    const r = purgarCaducadas(db, opciones())
    expect(db.prepare('SELECT COUNT(*) AS n FROM events WHERE queja_id = ?').get(vieja)).toEqual({
      n: 0,
    })
    expect(db.prepare('SELECT COUNT(*) AS n FROM apoyos').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM ciudadanos').get()).toEqual({ n: 0 })
    expect(r.ciudadanos).toBe(2)
  })

  it('las copias de seguridad caducan a su plazo, y la copia de un ensayo interrumpido, al día', () => {
    const vieja = join(copias, 'bot-v0-vieja.db')
    const nueva = join(copias, 'bot-v0-nueva.db')
    const ensayo = join(dir, '.ensayo-migracion-x.db')
    const ensayoReciente = join(dir, '.ensayo-migracion-y.db')
    for (const f of [vieja, nueva, ensayo, ensayoReciente]) writeFileSync(f, 'x')
    const hace = (dias: number) => new Date(AHORA.getTime() - dias * DIA)
    utimesSync(vieja, hace(CONSERVACION_COPIAS_DIAS + 1), hace(CONSERVACION_COPIAS_DIAS + 1))
    utimesSync(nueva, hace(CONSERVACION_COPIAS_DIAS - 1), hace(CONSERVACION_COPIAS_DIAS - 1))
    utimesSync(ensayo, hace(2), hace(2))
    utimesSync(ensayoReciente, hace(0), hace(0))
    const r = purgarCaducadas(db, opciones())
    expect(readdirSync(copias)).toEqual(['bot-v0-nueva.db'])
    expect(existsSync(ensayo)).toBe(false)
    expect(existsSync(ensayoReciente)).toBe(true)
    expect(r.copias).toEqual({ revisadas: 2, borradas: 1 })
    expect(r.ensayos).toBe(1)
  })

  it('sin nada caducado, lo dice con ceros que se han mirado', () => {
    queja({ updated: AHORA })
    const r = purgarCaducadas(db, opciones())
    expect(r.quejas).toEqual({ revisadas: 1, borradas: 0 })
    expect(r.copias).toEqual({ revisadas: 0, borradas: 0 })
  })
})
