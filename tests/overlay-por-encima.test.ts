import { describe, it, expect, afterAll, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { pickCheckDiagnosis } from '../src/scraper/health-monitor'

/**
 * Una entrada del overlay que publica por encima de lo que dice hoy su base.
 *
 * El caso: 1sqj7is-053-pro-68944b. En junio la base decía `verificado` —el de
 * la pasada LLM, hoy retirada— y una revisión lo bajó a `parcial` conservando
 * su evidencia; la base determinista dice hoy `sin-datos`, y la composición
 * sigue publicando `parcial`. Ninguna guarda lo decía: `applyOverlayEntries`
 * mide la bajada al escribirla, `mergeVerified` la reaplica sin mirar, y
 * `check:veredictos` la contaba como `curado` y salía 0.
 *
 * Aquí corren los guiones de verdad, en una caja de arena: `check:veredictos`
 * con la fila (sale 1 y el parte la nombra) y sin ella, tras una bajada firmada
 * (sale 0); sin base en disco (SALTADO, nunca un visto bueno); y el rebuild,
 * que avisa y NO se niega: es un estado que ya estaba, no algo que haga él.
 */

// Arranca los guiones de verdad (~2 s con tsx); el tope de 5 s de vitest no da.
vi.setConfig({ testTimeout: 60_000 })

// tsx por su ruta: `npx` desde una caja de arena sin node_modules lo bajaría de
// la red.
const TSX = resolve('node_modules/.bin/tsx')
const CHECK = resolve('scripts/check-veredictos.ts')
const REBUILD = pathToFileURL(resolve('scripts/verified-rebuild.ts')).href

const SELLO = '2026-10-04T07:37:32.197Z'
const ID = 'p1-053-pro-aaaaaa'
const FUNDADA = 'p1-001-cit-bbbbbb'
const FANTASMA = 'p0-009-afi-cccccc'
const MOTIVO = 'los contratos derivados muestran que el mecanismo se usa, no lo que se afirma de él'
const EVIDENCIA = [
  {
    kind: 'tender',
    ref: 'https://contrataciondelestado.es/x',
    snippet: 'Contrato derivado del sistema dinámico de adquisición',
  },
]

const base = {
  generatedAt: SELLO,
  items: [
    {
      claim: { id: FUNDADA, type: 'cita_obra' },
      verification: {
        claimId: FUNDADA,
        verdict: 'parcial',
        summary: 's',
        evidence: EVIDENCIA,
        checkedAgainst: ['tenders'],
      },
    },
    {
      claim: { id: ID, type: 'promesa' },
      verification: {
        claimId: ID,
        verdict: 'sin-datos',
        summary: 'No se encontró registro que la sostenga.',
        evidence: [],
        checkedAgainst: ['promises'],
      },
    },
  ],
}

/** La que no tiene claim en la base: ni se aplica ni se publica. */
const fantasma = {
  verification: {
    claimId: FANTASMA,
    verdict: 'sin-datos',
    summary: MOTIVO,
    evidence: [],
    checkedAgainst: ['verdict-engine'],
  },
  source: 'verdict-engine',
  reason: MOTIVO,
  editor: 'modelo',
  appliedAt: '2026-08-02T00:00:00.000Z',
}

/** Hoy: la bajada de junio, juzgada contra un `verificado` que ya no está. */
const overlayConLaFila = {
  version: 1,
  generatedAt: SELLO,
  entries: {
    [ID]: {
      verification: {
        claimId: ID,
        verdict: 'parcial',
        summary: MOTIVO,
        evidence: EVIDENCIA,
        checkedAgainst: ['curator-downgrade'],
      },
      source: 'curator-downgrade',
      reason: MOTIVO,
      editor: 'ai-gold-review',
      appliedAt: '2026-06-24T07:18:12.464Z',
    },
    [FANTASMA]: fantasma,
  },
}

/** Tras la bajada firmada a sin-datos: la entrada iguala a su base. */
const overlayFirmado = {
  version: 1,
  generatedAt: SELLO,
  entries: {
    [ID]: {
      verification: {
        claimId: ID,
        verdict: 'sin-datos',
        summary: MOTIVO,
        evidence: [],
        checkedAgainst: ['curator-downgrade'],
      },
      source: 'curator-downgrade',
      reason: MOTIVO,
      editor: 'Nombre Apellido',
      appliedAt: '2026-10-05T00:00:00.000Z',
    },
    [FANTASMA]: fantasma,
  },
}

/** Lo que sirven los trozos en cada caso: la fundada y la de la bajada. */
function trozos(firmado: boolean) {
  return [
    {
      claim: { id: FUNDADA, type: 'cita_obra' },
      verification: { ...base.items[0].verification },
      visibility: 'shown',
    },
    {
      claim: { id: ID, type: 'promesa' },
      verification: firmado
        ? {
            claimId: ID,
            verdict: 'sin-datos',
            summary: MOTIVO,
            evidence: [],
            checkedAgainst: ['curator-downgrade'],
            source: 'curator-downgrade',
            downgradedBy: 'persona',
          }
        : {
            claimId: ID,
            verdict: 'parcial',
            summary: MOTIVO,
            evidence: EVIDENCIA,
            checkedAgainst: ['curator-downgrade'],
            source: 'curator-downgrade',
            downgradedBy: 'automatica',
          },
      visibility: firmado ? 'toggle' : 'shown',
    },
  ]
}

const cajas: string[] = []
afterAll(() => {
  for (const c of cajas) rmSync(c, { recursive: true, force: true })
})

function caja(opts: { overlay: unknown; conBase: boolean; firmado: boolean }): string {
  const dir = mkdtempSync(join(tmpdir(), 'overlay-por-encima-'))
  cajas.push(dir)
  const data = join(dir, 'public/data')
  mkdirSync(join(data, 'pleno-claims'), { recursive: true })
  const escribir = (ruta: string, valor: unknown) =>
    writeFileSync(join(data, ruta), JSON.stringify(valor, null, 2) + '\n')
  escribir('pleno-claims/p1.json', { plenoId: 'p1', items: trozos(opts.firmado) })
  escribir('pleno-claims/index.json', { plenos: [] })
  escribir('pleno-claims-overlay.json', opts.overlay)
  escribir('pleno-claims-verified.json', { generatedAt: SELLO, items: [] })
  if (opts.conBase) escribir('pleno-claims-verified-base.json', base)
  return dir
}

function correr(dir: string, args: string[]) {
  const r = spawnSync(TSX, args, {
    cwd: dir,
    encoding: 'utf8',
    // Un entorno limpio: una escotilla de las guardas exportada en el shell de
    // quien corre la prueba la dejaría sin objeto.
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR },
    timeout: 60_000,
  })
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, salida: r.stdout + r.stderr }
}

describe('check:veredictos · una entrada del overlay por encima de su base', () => {
  it('con la fila: sale 1, y el parte de la salud la nombra con cómo se sirve', () => {
    const r = correr(caja({ overlay: overlayConLaFila, conBase: true, firmado: false }), [CHECK])
    expect(r.status, r.salida).toBe(1)
    // Lo que llega al móvil: `monitor:health` se queda con este renglón.
    const parte = pickCheckDiagnosis(r.salida)
    expect(parte).toMatch(/^\[por-encima\]×1 — /)
    expect(parte).toContain(ID)
    expect(parte).toContain('shown')
  })

  it('con la fila, en --json: la entrada con su base, lo que publica y cómo se sirve; la fantasma aparte', () => {
    const r = correr(caja({ overlay: overlayConLaFila, conBase: true, firmado: false }), [
      CHECK,
      '--json',
    ])
    expect(r.status, r.salida).toBe(1)
    const doc = JSON.parse(r.stdout)
    expect(doc.base.porEncima).toEqual([
      {
        id: ID,
        base: 'sin-datos',
        publica: 'parcial',
        source: 'curator-downgrade',
        servida: 'shown',
      },
    ])
    expect(doc.base.sinClaim).toEqual([FANTASMA])
    expect(doc.base.entradas).toBe(2)
  })

  it('una rota de hoy junto a la fila por encima: el parte nombra las dos clases', () => {
    // La huella de `monitor:health` (`alertFingerprint`) sale de los códigos
    // entre corchetes. Con la fila sin firmar el aviso ya está dado; si la rota
    // no llevara código, la huella no cambiaría y el aviso nuevo se descartaría
    // por repetido.
    const dir = caja({ overlay: overlayConLaFila, conBase: true, firmado: false })
    const rota = {
      claim: { id: 'p1-200-afi-dddddd', type: 'afirmacion_numerica' },
      verification: { verdict: 'verificado', checkedAgainst: ['nli-grounding'], evidence: [] },
      visibility: 'shown',
    }
    writeFileSync(
      join(dir, 'public/data/pleno-claims/p2.json'),
      JSON.stringify({ plenoId: 'p2', items: [rota] }),
    )
    const r = correr(dir, [CHECK])
    expect(r.status, r.salida).toBe(1)
    const parte = pickCheckDiagnosis(r.salida)
    expect(parte).toMatch(/\[sin-corpus\]×1/)
    expect(parte).toMatch(/\[por-encima\]×1/)
  })

  it('sin la fila, tras la bajada firmada a sin-datos: sale 0', () => {
    const r = correr(caja({ overlay: overlayFirmado, conBase: true, firmado: true }), [CHECK])
    expect(r.status, r.salida).toBe(0)
    expect(r.salida).not.toMatch(/✗/)
  })

  it('sin base en disco: sale 0 y dice SALTADO, sin un recuento como si hubiera cotejado', () => {
    const r = correr(caja({ overlay: overlayConLaFila, conBase: false, firmado: false }), [CHECK])
    expect(r.status, r.salida).toBe(0)
    expect(r.salida).toMatch(/cotejo con la base: SALTADO/)
    expect(r.salida).not.toMatch(/\d+ por encima/)
  })
})

describe('el rebuild · avisa de lo que queda por encima de su base, y no se niega', () => {
  const rebuild = [
    '-e',
    `import(${JSON.stringify(REBUILD)}).then((m) => m.rebuildVerified({ refreshChunks: false }))`,
  ]

  it('con la fila: publica lo de siempre y lo dice por stderr', () => {
    const dir = caja({ overlay: overlayConLaFila, conBase: true, firmado: false })
    const r = correr(dir, rebuild)
    expect(r.status, r.salida).toBe(0)
    expect(r.stderr).toMatch(new RegExp(`overlay de ${ID}: POR ENCIMA de su base`))
    // No bloquea: lo publicado sale compuesto, con la entrada aplicada.
    const publicado = JSON.parse(
      readFileSync(join(dir, 'public/data/pleno-claims-verified.json'), 'utf8'),
    )
    const fila = publicado.items.find((it: { claim: { id: string } }) => it.claim.id === ID)
    expect(fila.verification.verdict).toBe('parcial')
  })

  it('sin la fila, tras la bajada firmada: no avisa de nada', () => {
    const dir = caja({ overlay: overlayFirmado, conBase: true, firmado: true })
    const r = correr(dir, rebuild)
    expect(r.status, r.salida).toBe(0)
    expect(r.stderr).not.toMatch(/POR ENCIMA/)
    // Y compuso de verdad: la caja traía un publicado vacío.
    const publicado = JSON.parse(
      readFileSync(join(dir, 'public/data/pleno-claims-verified.json'), 'utf8'),
    )
    const fila = publicado.items.find((it: { claim: { id: string } }) => it.claim.id === ID)
    expect(fila.verification.verdict).toBe('sin-datos')
  })
})
