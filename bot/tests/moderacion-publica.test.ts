import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { openDb, type Db } from '../src/db/client'
import {
  addApoyo,
  autorTelegram,
  createQueja,
  decidirModeracion,
  findMatchingQuejas,
  listByNeighborhood,
  listRecentQuejas,
  reconcileApoyadas,
  softDeleteQueja,
} from '../src/db/queries'
import { buildSnapshot } from '../src/services/snapshot'
import { computeRanking } from '../src/commands/ranking'
import { computeDigest } from '../src/commands/digest'
import { selectBatch } from '../src/services/batch'
import { checkSilencio } from '../src/services/cron'
import { sirveFotoExportada } from '../src/services/foto-exportada'
import { sirveSindic } from '../src/services/sindic'
import { botFalso, texto, CANAL_MUDO } from './helpers/bot-falso'

/**
 * Lo que ve el público es lo PUBLICADO, en todos los lectores a la vez.
 *
 * Una queja pendiente de revisión, una descartada o una retirada de la
 * publicación no pueden salir por ningún lado: ni en el export y sus cifras, ni
 * en /estado o /apoyar para quien no la escribió, ni en /barrio, /ranking o
 * /digest, ni en el lote que se presenta en el Registro, ni en el silencio, ni
 * en la foto o el documento del Síndic. Basta un lector olvidado para que la
 * revisión sea decorativa, así que se prueban todos juntos, con una sola
 * publicada como control, y además se barre el código: un lector nuevo que
 * filtre sólo por `deleted_at` no pasa.
 */
const VECINA = 1001
const OTRO = 1002
const ADMIN = 9001
const BARRIO = 'el-molinet'

let db: Db
let ids: Record<'publicada' | 'pendiente' | 'descartada' | 'retirada' | 'olvidada', string>
let dir: string

beforeEach(() => {
  db = openDb(':memory:')
  dir = mkdtempSync(join(tmpdir(), 'cp-mod-'))
  const nueva = (titulo: string) =>
    createQueja(db, {
      autor: autorTelegram(VECINA),
      category: 'alumbrado',
      title: titulo,
      detail: `${titulo}: la farola de la plaza lleva apagada desde el lunes.`,
      neighborhood: BARRIO,
      concejal_slug: 'concejal-x',
      concejalia_area: 'Obras',
    }).id
  ids = {
    publicada: nueva('Publicada'),
    pendiente: nueva('Pendiente'),
    descartada: nueva('Descartada'),
    retirada: nueva('Retirada'),
    olvidada: nueva('Olvidada'),
  }
  const por = `admin:${ADMIN}`
  decidirModeracion(db, ids.publicada, 'publicar', por)
  decidirModeracion(db, ids.descartada, 'descartar', por)
  decidirModeracion(db, ids.retirada, 'publicar', por)
  decidirModeracion(db, ids.retirada, 'retirar', por)
  decidirModeracion(db, ids.olvidada, 'publicar', por)
  softDeleteQueja(db, ids.olvidada, autorTelegram(VECINA))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const soloLaPublicada = (encontradas: string[]) => expect(encontradas).toEqual([ids.publicada])

function peticion(ruta: string, token: string) {
  const req = {
    url: ruta,
    method: 'GET',
    headers: { host: 'bot', authorization: `Bearer ${token}` },
  } as unknown as IncomingMessage
  const res: {
    statusCode: number
    cuerpo: unknown
    setHeader: () => void
    end: (b?: unknown) => void
  } = { statusCode: 200, cuerpo: null, setHeader: () => {}, end: (b) => (res.cuerpo = b) }
  return { req, res: res as unknown as ServerResponse & { cuerpo: unknown } }
}

describe('sólo lo publicado sale', () => {
  it('el export: sus quejas y sus cifras, del mismo conjunto', () => {
    const snap = buildSnapshot(db, 1000, { photoUrlFor: () => null })
    soloLaPublicada(snap.items.map((i) => i.service_request_id))
    expect(snap.stats.total).toBe(snap.items.length)
    expect(snap.stats.byNeighborhood[BARRIO]).toBe(1)
    expect(snap.stats.byConcejal['concejal-x'].total).toBe(1)
  })

  it('el export publica el detalle entero, sin cortarlo a escondidas', () => {
    const larga = createQueja(db, {
      autor: autorTelegram(VECINA),
      category: 'otros',
      title: 'Larga',
      detail: 'palabra '.repeat(200).trim(),
    }).id
    decidirModeracion(db, larga, 'publicar', `admin:${ADMIN}`)
    const item = buildSnapshot(db, 1000, { photoUrlFor: () => null }).items.find(
      (i) => i.service_request_id === larga,
    )!
    expect(item.description.length).toBeGreaterThan(500)
  })

  it('los listados, el ranking, el resumen y los boletines', () => {
    soloLaPublicada(listRecentQuejas(db, 50).map((q) => q.id))
    soloLaPublicada(listByNeighborhood(db, BARRIO).map((q) => q.id))
    expect(computeRanking(db).find((r) => r.neighborhood === BARRIO)?.total).toBe(1)
    expect(computeDigest(db, 7).nuevas).toBe(1)
    soloLaPublicada(findMatchingQuejas(db, 'barrio', BARRIO, 7).map((q) => q.id))
  })

  it('el lote que se presenta en el Registro', () => {
    db.prepare("UPDATE quejas SET state = 'apoyada_verificada'").run()
    soloLaPublicada(selectBatch(db, 50).map((b) => b.queja.id))
  })

  it('el silencio administrativo', () => {
    db.prepare(
      "UPDATE quejas SET state = 'registrada', registered_at = '2025-01-01 00:00:00', registro_entry_number = 'RE-1'",
    ).run()
    const r = checkSilencio(db, CANAL_MUDO, new Date('2026-09-27T12:00:00Z'), 0)
    soloLaPublicada(r.transitioned.map((q) => q.id))
  })

  it('una pendiente con los apoyos no se promueve', () => {
    for (let u = 0; u < 12; u++) addApoyo(db, ids.pendiente, autorTelegram(5000 + u))
    db.prepare("UPDATE quejas SET state = 'capturada' WHERE id = ?").run(ids.pendiente)
    reconcileApoyadas(db)
    const fila = db.prepare('SELECT state FROM quejas WHERE id = ?').get(ids.pendiente) as {
      state: string
    }
    expect(fila.state).toBe('capturada')
  })

  it('la foto y el documento del Síndic, por HTTP', () => {
    for (const id of Object.values(ids)) writeFileSync(join(dir, `${id.toLowerCase()}.jpg`), 'x')
    const vistas: string[] = []
    const documentos: string[] = []
    for (const id of Object.values(ids)) {
      const f = peticion(`/export/quejas-photos/${id.toLowerCase()}.jpg`, 't')
      sirveFotoExportada(f.req, f.res, { db, photosDir: dir, exportToken: 't' })
      if (f.res.statusCode === 200) vistas.push(id)
      const s = peticion(`/sindic/${id.toLowerCase()}.md`, 't')
      expect(sirveSindic(s.req, s.res, { db, exportToken: 't' })).toBe(true)
      if (s.res.statusCode === 200) documentos.push(id)
    }
    soloLaPublicada(vistas)
    soloLaPublicada(documentos)
  })

  it('/estado y /apoyar para quien no la escribió', async () => {
    const h = botFalso(db)
    for (const id of Object.values(ids)) {
      await h.bot.handleUpdate(texto(OTRO, `/estado ${id}`))
      const r = String(h.a(OTRO).at(-1)?.cuerpo.text)
      if (id === ids.publicada) expect(r).toContain('Publicada')
      else expect(r, id).toMatch(/No encuentro/)
    }
    await h.bot.handleUpdate(texto(OTRO, `/apoyar ${ids.pendiente}`))
    expect(String(h.a(OTRO).at(-1)?.cuerpo.text)).toMatch(/No encuentro/)
  })

  it('el control: la autora sí ve la suya en revisión, en /mis y en /estado', async () => {
    const h = botFalso(db)
    await h.bot.handleUpdate(texto(VECINA, '/mis'))
    const bloques = String(h.a(VECINA).at(-1)?.cuerpo.text).split('\n\n')
    expect(bloques.find((b) => b.includes(ids.pendiente))).toMatch(/revisi/i)
    await h.bot.handleUpdate(texto(VECINA, `/estado ${ids.pendiente}`))
    expect(String(h.a(VECINA).at(-1)?.cuerpo.text)).toMatch(/revisi/i)
  })
})

/**
 * Y el barrido del código. `deleted_at IS NULL` a secas era la definición de
 * «público» en diecinueve sitios; ahora lo es `SQL_PUBLICA`. Quien necesite ver
 * también lo que no se ha publicado —el autor lo suyo, la pasada de fotos, la
 * retención, el recálculo de barrios— está en esta lista, con su motivo, y
 * nadie más.
 */
const NO_PUBLICOS: Record<string, string> = {
  'db/queries.ts:getQuejaViva': 'el autor y los administradores ven lo que no está publicado',
  'db/queries.ts:listQuejasWithPhoto': 'la foto se anonimiza antes de publicar; servirla va aparte',
  'db/queries.ts:decidirModeracion': 'detecta la retirada del autor antes de decidir',
  'db/queries.ts:SQL_PUBLICA': 'la definición',
  'services/rebarrio.ts:planearRebarrio': 'corrige datos internos, publicados o no',
  'services/rebarrio.ts:aplicarRebarrio': 'corrige datos internos, publicados o no',
  'services/ciudadano.ts:olvidarTodo': 'lo suyo, de quien pide borrarlo',
}

describe('ningún lector nuevo filtra sólo por deleted_at', () => {
  it('cada `deleted_at IS NULL` del código está en la lista de lectores no públicos', () => {
    const src = join(__dirname, '..', 'src')
    const ficheros = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? ficheros(join(d, e.name))
          : e.name.endsWith('.ts')
            ? [join(d, e.name)]
            : [],
      )
    const vistos: string[] = []
    for (const f of ficheros(src)) {
      if (f.endsWith('migraciones.ts')) continue
      const lineas = readFileSync(f, 'utf8').split('\n')
      lineas.forEach((l, i) => {
        if (!/deleted_at IS NULL/.test(l) || /^\s*(\/\/|\*)/.test(l)) return
        // La función (o constante) que la contiene: la última declaración de arriba.
        let nombre = '?'
        for (let j = i; j >= 0; j--) {
          const m = /^export (?:async )?(?:function|const) (\w+)/.exec(lineas[j])
          if (m) {
            nombre = m[1]
            break
          }
        }
        vistos.push(`${relative(src, f)}:${nombre}`)
      })
    }
    expect(vistos.length, 'el barrido no encuentra nada que mirar').toBeGreaterThan(3)
    expect([...new Set(vistos)].filter((v) => !(v in NO_PUBLICOS))).toEqual([])
  })
})
