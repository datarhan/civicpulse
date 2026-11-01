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
import { classifyAgendaRun, selloDeAgendas } from '../src/scraper/pleno-agenda'
import { DEFAULT_EXPECTATIONS } from '../src/scraper/snapshot-cadence'

/**
 * ¿Deja `plenos-agendas.json` de decir «leído hoy» cuando hoy no lo leyó nadie?
 *
 * El certificado de regmeet.com caducó el 31-10-2026. La nocturna del 01-11 sacó
 * 0 sesiones del origen y 1 del archivo, y aun así escribió `generatedAt` de ese
 * día: `check:cadence` dio 58 de 58 al día y `/datos` publicó esa fecha como la
 * de la última actualización. Con el sello moviéndose en cada pasada, una caída
 * no envejece nunca este fichero, y un fallo blando sólo es aceptable si cuesta
 * frescura y la frescura se ve. Es el agujero que `selloDePasada` cerró en
 * `plenos.json`.
 *
 * Se corre el guion de verdad en un árbol temporal, con `fetch` sustituido, y el
 * desenlace se comprueba en cada caso: un sello que no se mueve porque la pasada
 * murió antes de escribir también pasaría esta prueba.
 */
const GUION = resolve('scripts/scrape-pleno-agendas.ts')
const FETCH_CON_COOKIES = resolve('scripts/lib/regmeet-fetch.ts')
const TSX = resolve('node_modules/.bin/tsx')
const FIXTURE = resolve('tests/fixtures/regmeet_sesion_2026-04-20.html')
const SELLO_VIEJO = '2026-10-31T11:45:00.000Z'
const HTML = JSON.stringify(readFileSync(FIXTURE, 'utf8'))

const CAIDO = `throw new TypeError('fetch failed')`
const SIN_ARCHIVO = `if (String(url).includes('archive.org')) ${CAIDO}`

let dir: string

const sesion = (n: number) => ({
  id: `s${n}`,
  title: `Sesión ${n}`,
  date: `2026-0${9 - n}-01`,
  kind: 'ordinario',
  link: `https://regmeet.com/aytoribarroja/participaciones/s${n}`,
})

function arbol(sesiones: number, sinOrdenDelDia: number[] = []) {
  const indice = Array.from({ length: sesiones }, (_, i) => sesion(i + 1))
  writeFileSync(join(dir, 'public/data/plenos.json'), JSON.stringify({ items: indice }))
  const plenos = indice.map((p, i) => {
    const agenda = sinOrdenDelDia.includes(i + 1)
      ? []
      : [{ number: 1, title: 'Aprobación del acta anterior', section: 'resolutiva' }]
    return { ...p, agenda, agendaCount: agenda.length, departments: [], hasRuegos: false }
  })
  writeFileSync(
    join(dir, 'public/data/plenos-agendas.json'),
    JSON.stringify({ generatedAt: SELLO_VIEJO, stats: {}, plenos }),
  )
}

function pasada(cuerpoDelFetch: string) {
  const stub = join(dir, 'stub.mjs')
  // La pausa de cortesía entre páginas no prueba nada y son 1,5 s por sesión.
  writeFileSync(
    stub,
    `const espera = globalThis.setTimeout
     globalThis.setTimeout = (f, ms, ...r) => espera(f, ms === 1500 ? 0 : ms, ...r)
     globalThis.fetch = async (url) => { ${cuerpoDelFetch} }\n`,
  )
  const r = spawnSync(TSX, ['--import', stub, join(dir, 'scripts/scrape-pleno-agendas.ts')], {
    encoding: 'utf8',
    timeout: 60_000,
  })
  return {
    rc: r.status,
    salida: `${r.stdout}\n${r.stderr}`,
    fichero: JSON.parse(readFileSync(join(dir, 'public/data/plenos-agendas.json'), 'utf8')),
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agendas-pasada-'))
  mkdirSync(join(dir, 'scripts/lib'), { recursive: true })
  mkdirSync(join(dir, 'public/data'), { recursive: true })
  copyFileSync(GUION, join(dir, 'scripts/scrape-pleno-agendas.ts'))
  copyFileSync(FETCH_CON_COOKIES, join(dir, 'scripts/lib/regmeet-fetch.ts'))
  symlinkSync(resolve('src'), join(dir, 'src'))
  symlinkSync(resolve('node_modules'), join(dir, 'node_modules'))
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('selloDeAgendas', () => {
  const ahora = new Date('2026-11-01T11:45:21.118Z')
  const sello = (tally: Parameters<typeof classifyAgendaRun>[0], recientesSinLeer: number) =>
    selloDeAgendas(
      SELLO_VIEJO,
      { outcome: classifyAgendaRun(tally).outcome, recientesSinLeer },
      ahora,
    )

  it('el origen sirvió las recientes: sella con la hora de ahora', () => {
    expect(sello({ attempted: 6, fromLive: 6, fromArchive: 0 }, 0)).toBe(ahora.toISOString())
  })

  it('sólo el archivo: conserva el sello, aunque la cobertura crezca', () => {
    expect(sello({ attempted: 6, fromLive: 0, fromArchive: 1 }, 6)).toBe(SELLO_VIEJO)
  })

  it('sin avance: conserva el sello', () => {
    expect(sello({ attempted: 6, fromLive: 0, fromArchive: 0 }, 0)).toBe(SELLO_VIEJO)
  })

  it('nada intentado: conserva el sello, porque nadie leyó nada', () => {
    expect(sello({ attempted: 0, fromLive: 0, fromArchive: 0 }, 0)).toBe(SELLO_VIEJO)
  })

  // Lo que un «cero leído» no ve: lo nuevo aparece en las recientes, y las demás
  // responden aunque ellas no.
  it('una reciente sin leer conserva el sello aunque el desenlace sea ok', () => {
    expect(sello({ attempted: 6, fromLive: 5, fromArchive: 0 }, 1)).toBe(SELLO_VIEJO)
  })

  it('sin sello previo, sella: no hay nada que conservar', () => {
    const { outcome } = classifyAgendaRun({ attempted: 6, fromLive: 0, fromArchive: 0 })
    expect(selloDeAgendas(undefined, { outcome, recientesSinLeer: 6 }, ahora)).toBe(
      ahora.toISOString(),
    )
  })
})

describe('scrape:pleno-agendas con regmeet caído', () => {
  it('sin origen ni archivo sale 1 y no mueve el sello', () => {
    arbol(2)
    const r = pasada(CAIDO)
    expect(r.rc).toBe(1)
    expect(r.salida).toContain('sin-avance')
    expect(r.fichero.generatedAt).toBe(SELLO_VIEJO)
    expect(r.fichero.plenos).toHaveLength(2)
  })

  // La noche del 01-11, tal cual.
  it('con sólo el archivo funde lo rescatado y tampoco sella', () => {
    arbol(2, [1])
    const r = pasada(`
      const u = String(url)
      if (u.includes('/cdx/')) return new Response('20260801000000 ' + u.split('url=')[1], { status: 200 })
      if (u.includes('archive.org')) return new Response(${HTML}, { status: 200 })
      ${CAIDO}`)
    expect(r.rc).toBe(1)
    expect(r.salida).toContain('solo-archivo')
    expect(r.fichero.stats.recoveredFromArchive).toBeGreaterThan(0)
    expect(r.fichero.stats.recoveredFromLive).toBe(0)
    expect(r.fichero.generatedAt).toBe(SELLO_VIEJO)
    expect(r.fichero.plenos.find((p: { id: string }) => p.id === 's1').agendaCount).toBeGreaterThan(
      1,
    )
  })

  it('un 200 sin puntos tampoco sella', () => {
    arbol(2)
    const r = pasada(`${SIN_ARCHIVO}
      return new Response('<html><body></body></html>', { status: 200 })`)
    expect(r.rc).toBe(1)
    expect(r.salida).toContain('sin-avance')
    expect(r.fichero.generatedAt).toBe(SELLO_VIEJO)
  })

  it('con la más reciente sin leer no sella, y dice por qué', () => {
    arbol(2)
    const r = pasada(`${SIN_ARCHIVO}
      if (String(url).endsWith('/s1')) ${CAIDO}
      return new Response(${HTML}, { status: 200 })`)
    expect(r.rc).toBe(0)
    expect(r.fichero.stats.recoveredFromLive).toBe(1)
    expect(r.fichero.stats.recientesSinLeer).toBe(1)
    expect(r.fichero.generatedAt).toBe(SELLO_VIEJO)
    expect(r.salida).toContain(`sello retenido en ${SELLO_VIEJO}`)
  })
})

// La otra cara: una guarda que no dejara sellar nunca también lo vería todo
// rancio, y `check:cadence` gritaría por un adaptador sano.
describe('scrape:pleno-agendas con el origen sano', () => {
  it('una pasada entera sella', () => {
    arbol(2)
    const r = pasada(`${SIN_ARCHIVO}
      return new Response(${HTML}, { status: 200 })`)
    expect(r.rc).toBe(0)
    expect(r.salida).not.toContain('sello retenido')
    expect(r.fichero.stats.recientesSinLeer).toBe(0)
    expect(r.fichero.generatedAt).not.toBe(SELLO_VIEJO)
  })

  // Una sesión vieja cuya página ya no existe se reintenta cada noche: si contara,
  // fijaría el sello para siempre y el aviso sería falso.
  it('una sesión antigua sin orden del día y sin página no retiene el sello', () => {
    arbol(7, [7])
    const r = pasada(`${SIN_ARCHIVO}
      if (String(url).endsWith('/s7')) ${CAIDO}
      return new Response(${HTML}, { status: 200 })`)
    expect(r.rc).toBe(0)
    expect(r.salida).toContain('1/7 session pages unavailable')
    expect(r.fichero.stats.recientesSinLeer).toBe(0)
    expect(r.fichero.generatedAt).not.toBe(SELLO_VIEJO)
  })
})

describe('el plazo de las agendas', () => {
  it('check:cadence las vigila, así que retener el sello se acaba viendo', () => {
    const fila = DEFAULT_EXPECTATIONS.find((d) => d.file === 'plenos-agendas.json')
    expect(fila?.maxAgeDays).toBeLessThanOrEqual(8)
  })
})
