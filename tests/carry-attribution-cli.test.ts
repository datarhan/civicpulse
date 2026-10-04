import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { oneSeatBlocsOf } from '../src/scraper/corporation-seats'

/**
 * `carry:attribution` de punta a punta: lo que lee del disco para decidir qué
 * NO devuelve, y lo que cuenta.
 *
 * Las reglas viven en src/scraper/claim-attribution-carry.ts y se prueban en
 * tests/claim-attribution-carry.test.ts. Aquí se prueba la costura: que la CLI
 * deriva los grupos de un escaño de officials.json —y se niega sin él—, que
 * coteja con el mapa de voces y la transcripción de verdad, y que el parte da
 * un número por motivo.
 *
 * La sesión es 11025xk, con su mapa y su transcripción reales. La declaración
 * que vuelve es una publicada de verdad con un grupo que el mapa sostiene; las
 * otras tres son de mentira y prueban cada una un motivo. Que un grupo de un
 * escaño no vuelva ni con el mapa a favor lo prueba la unitaria, con datos de
 * mentira: aquí no se empareja ninguna cita de verdad con uno.
 */

const SCRIPT = resolve('scripts/carry-attribution.ts')
// tsx por su ruta: `npx` desde una caja de arena sin node_modules lo bajaría de
// la red.
const TSX = resolve('node_modules/.bin/tsx')
const PLENO = '11025xk'

// Arranca el guion de verdad (~3 s con tsx; más del doble en el runner de la CI)
// dentro de `beforeAll`, dos veces, y un gancho tiene su propio tope de 10 s que
// `testTimeout` no cubre.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })

interface Declaracion {
  id: string
  plenoId: string
  speakerGroup: string | null
  verbatim: string
}

/** Una servida de 11025xk con grupo: el mapa de hoy lo sostiene (#218 dejó sólo ésas). */
const SOSTENIDA: Declaracion = JSON.parse(
  readFileSync(resolve(`public/data/pleno-claims/${PLENO}.json`), 'utf8'),
)
  .items.map((it: { claim: Declaracion }) => it.claim)
  .find((c: Declaracion) => c.speakerGroup)
const GRUPO = SOSTENIDA.speakerGroup as string
/** Un grupo de un escaño, derivado como lo deriva la CLI; nunca escrito aquí. */
const UNO = (oneSeatBlocsOf(
  JSON.parse(readFileSync(resolve('public/data/officials.json'), 'utf8')),
) ?? [])[0]

const PUBLICADAS: Declaracion[] = [
  SOSTENIDA,
  {
    id: `${PLENO}-901-cit-000001`,
    plenoId: PLENO,
    speakerGroup: GRUPO,
    verbatim: 'una frase que nadie pronunció en esta sesión y que el mapa no puede situar',
  },
  {
    id: 'sinmapa-902-cit-000002',
    plenoId: 'sinmapa',
    speakerGroup: GRUPO,
    verbatim: 'una sesión de la que no hay mapa de voces',
  },
  {
    // En otra sesión y con otro literal: el grupo de un escaño se descarta
    // antes de mirar el mapa, y una cita de verdad junto a ese grupo sería
    // justo el material que no se reproduce (ni en un fallo de la CI).
    id: 'otra-903-cit-000003',
    plenoId: 'otra',
    speakerGroup: UNO,
    verbatim: 'una declaración de mentira con un grupo de un escaño',
  },
]
const SUGERIDAS = PUBLICADAS.map((d) => ({ ...d, speakerGroup: null }))

const cajas: string[] = []
afterAll(() => {
  for (const c of cajas) rmSync(c, { recursive: true, force: true })
})

interface Corrida {
  status: number | null
  stdout: string
  stderr: string
  sugerenciasAntes: string
  sugerenciasDespues: string
}

function correr(args: string[], { conOfficials = true } = {}): Corrida {
  const caja = mkdtempSync(join(tmpdir(), 'carry-attribution-'))
  cajas.push(caja)
  const data = join(caja, 'public/data')
  mkdirSync(join(data, 'pleno-transcripts'), { recursive: true })
  mkdirSync(join(caja, 'pleno-speaker-map'))
  const escribir = (ruta: string, valor: unknown) =>
    writeFileSync(join(data, ruta), JSON.stringify(valor, null, 2) + '\n')
  escribir('pleno-claims-verified.json', {
    items: PUBLICADAS.map((claim) => ({ claim, verification: { verdict: 'sin-datos' } })),
  })
  escribir('pleno-claims-suggestions.json', { items: SUGERIDAS })
  if (conOfficials)
    copyFileSync(resolve('public/data/officials.json'), join(data, 'officials.json'))
  copyFileSync(
    resolve(`public/data/pleno-transcripts/${PLENO}.txt`),
    join(data, 'pleno-transcripts', `${PLENO}.txt`),
  )
  copyFileSync(
    resolve(`pleno-speaker-map/${PLENO}.json`),
    join(caja, 'pleno-speaker-map', `${PLENO}.json`),
  )
  const sugerencias = join(data, 'pleno-claims-suggestions.json')
  const sugerenciasAntes = readFileSync(sugerencias, 'utf8')

  const res = spawnSync(TSX, [SCRIPT, ...args], {
    cwd: caja,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR },
    timeout: 120_000,
  })
  return {
    status: res.status,
    stdout: res.stdout,
    stderr: res.stderr,
    sugerenciasAntes,
    sugerenciasDespues: readFileSync(sugerencias, 'utf8'),
  }
}

const grupoDe = (r: Corrida, id: string) =>
  JSON.parse(r.sugerenciasDespues).items.find((d: Declaracion) => d.id === id).speakerGroup

/** El número de una línea «descartadas por <motivo> (…): N» del parte. */
const descartadas = (r: Corrida, motivo: string): number | null => {
  const m = r.stdout.match(new RegExp(`descartadas por ${motivo}\\b[^\\n]*: (\\d+)`))
  return m ? Number(m[1]) : null
}

describe('las filas de la caja de arena', () => {
  it('hay una servida con grupo en la sesión, y un grupo de un escaño que probar', () => {
    // Sin esto, «no vuelve ninguna» se cumpliría con una caja vacía.
    expect(SOSTENIDA?.speakerGroup).toBeTruthy()
    expect(UNO).toBeTruthy()
    expect(GRUPO).not.toBe(UNO)
  })
})

describe('carry:attribution sin officials.json', () => {
  let r: Corrida
  beforeAll(() => {
    r = correr(['--write'], { conOfficials: false })
  })

  it('se niega: sin la composición no sabe qué grupo nombra a una persona', () => {
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(1)
    expect(r.stderr).toMatch(/officials\.json/)
  })

  it('y no escribe nada', () => {
    expect(r.sugerenciasDespues).toBe(r.sugerenciasAntes)
  })
})

describe('carry:attribution con el mapa y la transcripción de 11025xk', () => {
  let ensayo: Corrida
  let escrito: Corrida
  beforeAll(() => {
    ensayo = correr([])
    escrito = correr(['--write'])
  })

  it('el ensayo no escribe nada', () => {
    expect(ensayo.status, `${ensayo.stdout}${ensayo.stderr}`).toBe(0)
    expect(ensayo.sugerenciasDespues).toBe(ensayo.sugerenciasAntes)
  })

  it('el parte da un número por motivo: vuelve una y cada una de las otras tres por lo suyo', () => {
    expect(ensayo.stdout).toMatch(/publicadas con bloc: 4 · arrastradas: 1\b/)
    expect(descartadas(ensayo, 'grupo-de-un-escano')).toBe(1)
    expect(descartadas(ensayo, 'sin-mapa')).toBe(1)
    expect(descartadas(ensayo, 'sin-sosten')).toBe(1)
    expect(descartadas(ensayo, 'partido-distinto')).toBe(0)
  })

  it('con --write vuelve sólo la que el mapa sostiene', () => {
    expect(escrito.status, `${escrito.stdout}${escrito.stderr}`).toBe(0)
    expect(grupoDe(escrito, SOSTENIDA.id)).toBe(GRUPO)
    for (const d of PUBLICADAS.slice(1)) expect(grupoDe(escrito, d.id), d.id).toBeNull()
  })
})
