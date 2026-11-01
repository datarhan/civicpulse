import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { selloDePasada } from '../src/scraper/plenos'
import { DEFAULT_EXPECTATIONS } from '../src/scraper/snapshot-cadence'

/**
 * ¿Puede `scrape:plenos` fallar sin parar la nocturna y sin esconderse?
 *
 * El certificado de regmeet.com caducó el 31-10-2026 a las 23:59:59 GMT. Es de
 * ellos, y fallar es lo correcto: no se relaja TLS. Pero `scrape:plenos` era el
 * único adaptador de regmeet que seguía siendo crítico, así que una caducidad
 * ajena teñía la nocturna y le quitaba su despliegue noche tras noche.
 *
 * Pasarlo a blando sin más lo habría dejado invisible: escribía un `generatedAt`
 * nuevo aunque no hubiera leído nada, y `check:cadence` mide justo eso. Un fallo
 * blando sólo es aceptable si cuesta frescura y la frescura se ve, así que las
 * dos mitades van juntas. El motivo tampoco lo decía: «fetch failed» es lo mismo
 * que se lee cuando regmeet bloquea al runner, y son averías distintas.
 *
 * Se corre el guion de verdad en un árbol temporal, con `fetch` sustituido: una
 * pasada fallida no puede tocar `public/data`.
 */
const GUION = resolve('scripts/scrape-plenos.ts')
const TSX = resolve('node_modules/.bin/tsx')
const SELLO_VIEJO = '2026-10-31T10:43:00.000Z'

let dir: string

function previas() {
  return {
    generatedAt: SELLO_VIEJO,
    source: {},
    stats: { total: 1 },
    items: [{ id: 'abc123', date: '2026-07-27', title: 'Pleno ordinario', url: 'https://x/' }],
  }
}

function pasada(cuerpoDelFetch: string) {
  const stub = join(dir, 'stub.mjs')
  writeFileSync(stub, `globalThis.fetch = async () => { ${cuerpoDelFetch} }\n`)
  const r = spawnSync(TSX, ['--import', stub, join(dir, 'scripts/scrape-plenos.ts')], {
    encoding: 'utf8',
    timeout: 60_000,
  })
  return {
    rc: r.status,
    salida: `${r.stdout}\n${r.stderr}`,
    fichero: JSON.parse(readFileSync(join(dir, 'public/data/plenos.json'), 'utf8')),
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plenos-pasada-'))
  mkdirSync(join(dir, 'scripts'))
  mkdirSync(join(dir, 'public/data'), { recursive: true })
  copyFileSync(GUION, join(dir, 'scripts/scrape-plenos.ts'))
  symlinkSync(resolve('src'), join(dir, 'src'))
  symlinkSync(resolve('node_modules'), join(dir, 'node_modules'))
  writeFileSync(join(dir, 'public/data/plenos.json'), JSON.stringify(previas()))
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('selloDePasada', () => {
  const ahora = new Date('2026-11-01T10:30:00.000Z')

  it('una pasada que leyó algo sella con la hora de ahora', () => {
    expect(selloDePasada(SELLO_VIEJO, 3, ahora)).toBe('2026-11-01T10:30:00.000Z')
  })

  it('una pasada que no leyó nada conserva el sello de la última que leyó', () => {
    expect(selloDePasada(SELLO_VIEJO, 0, ahora)).toBe(SELLO_VIEJO)
  })

  it('sin sello previo, sella: no hay nada que conservar', () => {
    expect(selloDePasada(undefined, 0, ahora)).toBe('2026-11-01T10:30:00.000Z')
  })
})

describe('scrape:plenos con regmeet caído', () => {
  const caducado = `
    const causa = Object.assign(new Error('certificate has expired'), { code: 'CERT_HAS_EXPIRED' })
    throw new TypeError('fetch failed', { cause: causa })`

  it('sale 1, conserva lo publicado y no mueve el sello', () => {
    const r = pasada(caducado)
    expect(r.rc).toBe(1)
    expect(r.fichero.generatedAt).toBe(SELLO_VIEJO)
    expect(r.fichero.items).toHaveLength(1)
    expect(r.fichero.stats.aniosFallidos).toBe(4)
    expect(r.fichero.stats.sesionesRefrescadas).toBe(0)
  })

  it('nombra la causa, no sólo «fetch failed»', () => {
    expect(pasada(caducado).salida).toContain('CERT_HAS_EXPIRED')
  })

  it('un 200 sin sesiones tampoco sella', () => {
    const r = pasada(`return new Response('<html><body></body></html>', { status: 200 })`)
    expect(r.rc).toBe(1)
    expect(r.fichero.generatedAt).toBe(SELLO_VIEJO)
  })
})

describe('scrape:plenos es blando porque su frescura se vigila', () => {
  const guion = readFileSync(resolve('scripts/scrape-all.sh'), 'utf8')
  const bloque = guion.match(/^BEST_EFFORT=\(\n([\s\S]*?)\n\)$/m)?.[1] ?? ''
  const blandos = bloque
    .split('\n')
    .map((l) => l.replace(/#.*/, '').trim())
    .filter(Boolean)

  it('mide algo: encuentra la lista de blandos', () => {
    expect(blandos.length).toBeGreaterThan(5)
  })

  it('está en la lista', () => {
    expect(blandos).toContain('scrape:plenos')
  })

  // DATA_INTEGRITY §3.6: blando y sin plazo sería decadencia silenciosa.
  it('check:cadence lo espera a diario, con su plazo de tres días', () => {
    const fila = DEFAULT_EXPECTATIONS.find((d) => d.file === 'plenos.json')
    expect(fila?.cls).toBe('nightly')
    expect(fila?.maxAgeDays).toBeLessThanOrEqual(3)
  })
})
