import { describe, it, expect, afterAll, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  scoreNliPairs,
  topeParaPares,
  NliUnavailableError,
  NliTimeoutError,
  TOPE_ARRANQUE_MS,
  TOPE_MS_POR_PAR,
  type NliPair,
} from '../../src/scraper/nli-client'

describe('scoreNliPairs', () => {
  it('serializes pairs to JSONL stdin and parses JSONL stdout into a Map', async () => {
    let seenStdin = ''
    const runner = async (stdin: string) => {
      seenStdin = stdin
      return (
        stdin
          .trim()
          .split('\n')
          .map((l) => {
            const o = JSON.parse(l)
            return JSON.stringify({
              id: o.id,
              entailment: 0.9,
              neutral: 0.08,
              contradiction: 0.02,
              label: 'entailment',
            })
          })
          .join('\n') + '\n'
      )
    }
    const pairs: NliPair[] = [
      { id: 'a', premise: 'p', hypothesis: 'h' },
      { id: 'b', premise: 'p2', hypothesis: 'h2' },
    ]
    const m = await scoreNliPairs(pairs, { runner })
    expect(seenStdin.trim().split('\n')).toHaveLength(2)
    expect(m.size).toBe(2)
    expect(m.get('a')!.entailment).toBeCloseTo(0.9)
    expect(m.get('b')!.label).toBe('entailment')
  })

  it('skips malformed output lines', async () => {
    const runner = async () =>
      'not json\n{"id":"a","entailment":0.5,"neutral":0.3,"contradiction":0.2,"label":"neutral"}\n'
    const m = await scoreNliPairs([{ id: 'a', premise: 'p', hypothesis: 'h' }], { runner })
    expect(m.size).toBe(1)
    expect(m.get('a')!.label).toBe('neutral')
  })

  it('returns an empty map for no pairs without invoking the runner', async () => {
    let called = false
    const runner = async () => {
      called = true
      return ''
    }
    const m = await scoreNliPairs([], { runner })
    expect(m.size).toBe(0)
    expect(called).toBe(false)
  })

  it('throws NliUnavailableError when the venv is missing (default runner)', async () => {
    await expect(
      scoreNliPairs([{ id: 'a', premise: 'p', hypothesis: 'h' }], { venv: '/nonexistent/venv' }),
    ).rejects.toBeInstanceOf(NliUnavailableError)
  })
})

/**
 * El tope de un lote crece con sus pares.
 *
 * Hasta el 12-10-2026 era fijo, 600 000 ms por lote, y el lote es un tramo de
 * declaraciones con hasta 8 pares cada una. Medido ese día con el modelo en CPU
 * y `nice -n 10` en un portátil cargado: ~0,31 s por par (480 pares en 149 s).
 * Un tramo de 400 declaraciones son ~3 200 pares, ~1 000 s: la corrida murió en
 * el primer tramo, sin juzgar ninguna.
 */
const pares = (n: number): NliPair[] =>
  Array.from({ length: n }, (_, i) => ({ id: String(i), premise: 'p', hypothesis: 'h' }))

describe('el tope de un lote', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('es el arranque del modelo más un tanto por par', () => {
    expect(topeParaPares(0)).toBe(TOPE_ARRANQUE_MS)
    expect(topeParaPares(3200)).toBe(TOPE_ARRANQUE_MS + 3200 * TOPE_MS_POR_PAR)
  })

  it('deja margen sobre lo medido: un tramo de 3 200 pares a 0,31 s/par cabe con holgura', () => {
    // Lo que tardó de verdad, por tres: lo bastante para una máquina el doble de
    // cargada, no tanto como para esperar horas a un proceso colgado.
    expect(topeParaPares(3200)).toBeGreaterThan(3 * 3200 * 310)
    expect(topeParaPares(3200)).toBeLessThan(2 * 60 * 60 * 1000)
  })

  it('se ajusta por entorno sin tocar el código', () => {
    vi.stubEnv('NLI_TOPE_ARRANQUE_MS', '5000')
    vi.stubEnv('NLI_TOPE_MS_POR_PAR', '20')
    expect(topeParaPares(100)).toBe(5000 + 100 * 20)
  })

  it('un valor de entorno que no es un número no vale cero: se usa el de serie', () => {
    vi.stubEnv('NLI_TOPE_MS_POR_PAR', 'mucho')
    vi.stubEnv('NLI_TOPE_ARRANQUE_MS', '')
    expect(topeParaPares(10)).toBe(TOPE_ARRANQUE_MS + 10 * TOPE_MS_POR_PAR)
  })

  it('el ejecutor recibe el tope del lote, que crece con sus pares', async () => {
    const vistos: number[] = []
    const runner = async (_stdin: string, _env: Record<string, string>, timeoutMs: number) => {
      vistos.push(timeoutMs)
      return ''
    }
    await scoreNliPairs(pares(10), { runner })
    await scoreNliPairs(pares(3200), { runner })
    expect(vistos).toEqual([topeParaPares(10), topeParaPares(3200)])
    expect(vistos[1]).toBeGreaterThan(600_000)
  })

  it('un tope explícito manda sobre el calculado', async () => {
    let visto = 0
    await scoreNliPairs(pares(3200), {
      timeoutMs: 1234,
      runner: async (_s, _e, t) => {
        visto = t
        return ''
      },
    })
    expect(visto).toBe(1234)
  })
})

describe('el ejecutor de serie cuando el modelo no contesta a tiempo', () => {
  const cajas: string[] = []
  afterAll(() => {
    for (const c of cajas) rmSync(c, { recursive: true, force: true })
  })

  /** Un `python` en el sitio del venv que lee la entrada y no contesta nunca. */
  function venvDormido(): string {
    const caja = mkdtempSync(join(tmpdir(), 'nli-client-tope-'))
    cajas.push(caja)
    const bin = join(caja, 'venv/bin')
    mkdirSync(bin, { recursive: true })
    writeFileSync(
      join(bin, 'python'),
      `#!/usr/bin/env node
process.stdin.resume()
setTimeout(() => {}, 60_000)
`,
      { mode: 0o755 },
    )
    return join(caja, 'venv')
  }

  it('rechaza con NliTimeoutError, que dice cuántos pares y qué tope', async () => {
    const t0 = Date.now()
    const err = await scoreNliPairs(pares(3), { venv: venvDormido(), timeoutMs: 300 }).catch(
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(NliTimeoutError)
    expect((err as NliTimeoutError).pares).toBe(3)
    expect((err as NliTimeoutError).timeoutMs).toBe(300)
    // Ni la indisponibilidad del venv (que aborta la corrida) ni un error suelto.
    expect(err).not.toBeInstanceOf(NliUnavailableError)
    // Y lo mató a su hora, sin esperar al minuto del falso.
    expect(Date.now() - t0).toBeLessThan(10_000)
  })
})
