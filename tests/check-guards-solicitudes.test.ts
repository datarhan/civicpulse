import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { INJECTIONS } from '../scripts/check-guards'
import {
  ENV,
  TSX,
  aplicarInyeccion,
  cajaVacia,
  correrArnes,
  git,
  limpiarCajas,
  repoConWorktree,
} from './check-guards-cajas.ts'

/**
 * La inyección de `check:guards` para `check:solicitudes`, contra la guarda de
 * verdad y por el arnés de verdad, en cajas de arena.
 *
 * EL DEFECTO (medido el 05-10-2026 con `npm run check:guards -- --inject` sobre
 * los datos reales): la inyección renombra `porClaseDocumental` en el manifiesto
 * de declaraciones, y la guarda leía un manifiesto sin ese bloque como SALTADO
 * —«0 clase(s) · SALTADO», sale 0—. La inyección no podía disparar nunca: salía
 * «⚠ SILENT», y por ella `--inject` salía 1. Lo era desde que nacieron las dos,
 * en el mismo commit, el 27-08-2026.
 *
 * El lado equivocado era la guarda. El manifiesto tiene un solo escritor
 * (`buildManifest`, en pleno-claims-chunks.ts), que escribe el cruce siempre;
 * ninguna otra guarda lo lee; y sin él /laboratorio/cobertura pinta un 0 en cada
 * clase. Que falte no es un manifiesto viejo que haya que esperar: es una avería.
 *
 * Las filas son de verdad (tests/fixtures/check-guards-solicitudes_2026-10-05.json):
 * el manifiesto publicado esa noche y el registro de solicitudes, vacío.
 */

interface Fixture {
  indice: { totals: { cobertura: { porClaseDocumental?: unknown } } }
  registro: unknown
}
const FIXTURE: Fixture = JSON.parse(
  readFileSync(resolve('tests/fixtures/check-guards-solicitudes_2026-10-05.json'), 'utf8'),
)
const GUARDA = resolve('scripts/check-solicitudes.ts')

// Varios arranques de tsx y de npm por bloque; el tope de 5 s de vitest no da.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

afterAll(limpiarCajas)

/** Lo que la guarda lee: el registro de solicitudes y el manifiesto. */
function caja(prefijo: string, ajustar?: (f: Fixture) => void, conManifiesto = true): string {
  const raiz = cajaVacia(prefijo)
  const f = structuredClone(FIXTURE)
  ajustar?.(f)
  const data = join(raiz, 'public/data')
  mkdirSync(join(data, 'pleno-claims'), { recursive: true })
  const escribir = (ruta: string, valor: unknown) =>
    writeFileSync(join(data, ruta), JSON.stringify(valor, null, 2) + '\n')
  escribir('solicitudes-acceso.json', f.registro)
  if (conManifiesto) escribir('pleno-claims/index.json', f.indice)
  return raiz
}

interface Corrida {
  status: number | null
  salida: string
}
function correrGuarda(raiz: string): Corrida {
  const r = spawnSync(TSX, [GUARDA], { cwd: raiz, env: ENV, encoding: 'utf8' })
  return { status: r.status, salida: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

const DE_SOLICITUDES = INJECTIONS.flatMap((inj, i) =>
  inj.guard === 'check:solicitudes' ? [{ inj, i }] : [],
)

describe('check:solicitudes — su inyección, contra la guarda de verdad', () => {
  let sin: Corrida
  let con: Array<Corrida & { describe: string; espera?: RegExp }>
  beforeAll(() => {
    sin = correrGuarda(caja('check-guards-solicitudes-'))
    con = DE_SOLICITUDES.map(({ inj, i }) => {
      const raiz = caja('check-guards-solicitudes-')
      aplicarInyeccion(raiz, i)
      return { describe: inj.describe, espera: inj.espera, ...correrGuarda(raiz) }
    })
  })

  it('sin inyectar sale en verde y evalúa clases: sin esa premisa la inyección no probaría nada', () => {
    expect(sin.status, sin.salida).toBe(0)
    expect(sin.salida).toMatch(/\[check-solicitudes\] [1-9]\d* clase\(s\) evaluada\(s\)/)
  })

  it('cada inyección dice qué marca espera: sin ella, un rojo por cualquier otra cosa contaría', () => {
    expect(con.length).toBeGreaterThan(0)
    expect(con.filter((c) => !(c.espera instanceof RegExp)).map((c) => c.describe)).toEqual([])
  })

  it('NINGUNA es muda: cada una pone roja la guarda, y por lo inyectado', () => {
    expect(con.length).toBeGreaterThan(0)
    for (const c of con) {
      expect(c.status, `${c.describe}\n${c.salida}`).toBe(1)
      expect(c.salida).toMatch(c.espera!)
    }
  })
})

describe('check:solicitudes — un manifiesto sin el cruce por clase documental', () => {
  it('sale 1 y lo nombra [sin-cruce-documental]: su único escritor lo escribe siempre', () => {
    const r = correrGuarda(
      caja('check-guards-solicitudes-', (f) => {
        delete f.indice.totals.cobertura.porClaseDocumental
      }),
    )
    expect(r.status, r.salida).toBe(1)
    expect(r.salida).toContain('✗ [sin-cruce-documental]')
    expect(r.salida).not.toContain('SALTADO')
  })

  it('sin manifiesto sigue SALTADO y sale 0: eso ya lo da en rojo check:cobertura', () => {
    const r = correrGuarda(caja('check-guards-solicitudes-', undefined, false))
    expect(r.status, r.salida).toBe(0)
    expect(r.salida).toContain('0 clase(s) · SALTADO')
  })
})

interface FilaDelArnes {
  name: string
  verdict: { state: string }
  injections?: Array<{ describe: string; fired: boolean | null }>
}

describe('check:guards --inject — la de check:solicitudes, por el arnés de verdad', () => {
  it('desde un worktree la da por probada, no por muda, y deja el árbol como estaba', () => {
    const { worktree } = repoConWorktree(caja('check-guards-arnes-'), {
      'check:solicitudes': `"${TSX}" "${GUARDA}"`,
    })
    const r = correrArnes(worktree, '--inject', '--json')
    expect(r.status, r.stderr).toBe(0)
    const fila = (JSON.parse(r.stdout) as { guards: FilaDelArnes[] }).guards.find(
      (g) => g.name === 'check:solicitudes',
    )!
    expect(fila.injections?.length).toBeGreaterThan(0)
    expect(fila.injections!.filter((i) => i.fired !== true)).toEqual([])
    expect(fila.verdict.state).toBe('proven')
    expect(git(worktree, 'status', '--porcelain')).toBe('')
  })
})
