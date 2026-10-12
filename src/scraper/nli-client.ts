/**
 * Node client for the local NLI sidecar (P1).
 *
 * Spawns the bootstrap venv's python ONCE, writes all `(premise, hypothesis)`
 * pairs as JSONL to stdin, and parses the JSONL scores back. No always-on
 * server, no ports — same batch-spawn model as transcribe-pleno.sh. The
 * support decision is local + $0; a missing venv fails loud (never silently
 * falls back to a metered LLM).
 *
 * El tope de un lote crece con sus pares (`topeParaPares`). Hasta el 12-10-2026
 * era fijo, 600 000 ms, y un lote es un tramo entero del runner —400
 * declaraciones, hasta 8 pares cada una—. Ese día, con el modelo en CPU y
 * `nice -n 10` en un portátil cargado, se midieron ~0,31 s por par (480 pares
 * reales en 149 s): el primer tramo, ~3 200 pares, pedía ~1 000 s y la corrida
 * murió en él sin juzgar ninguna. Un tope que no contesta lanza
 * `NliTimeoutError`, para que quien llama cuente sus pares como no puntuados
 * (regla 2 de docs/DATA_INTEGRITY.md) en vez de morir o, peor, de leerlos como
 * «sin respaldo».
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

export interface NliPair {
  id: string
  premise: string
  hypothesis: string
}

export interface NliScore {
  id: string
  entailment: number
  neutral: number
  contradiction: number
  label: 'entailment' | 'neutral' | 'contradiction'
}

/** Thrown when the NLI venv/model isn't bootstrapped — callers should abort. */
export class NliUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NliUnavailableError'
  }
}

/**
 * El modelo no contestó dentro del tope de su lote. No dice nada de los pares:
 * no se puntuó ninguno. Quien llama decide si sigue con el lote siguiente.
 */
export class NliTimeoutError extends Error {
  readonly pares: number
  readonly timeoutMs: number
  constructor(pares: number, timeoutMs: number) {
    super(`NLI scorer timed out after ${timeoutMs}ms (${pares} pairs)`)
    this.name = 'NliTimeoutError'
    this.pares = pares
    this.timeoutMs = timeoutMs
  }
}

/**
 * stdin (JSONL) + env → stdout (JSONL). Injectable so tests skip the spawn.
 * Recibe el tope del lote, ya calculado para sus pares.
 */
export type NliRunner = (
  stdin: string,
  env: Record<string, string>,
  timeoutMs: number,
) => Promise<string>

export interface ScoreNliOpts {
  model?: string
  venv?: string
  timeoutMs?: number
  runner?: NliRunner
}

const DEFAULT_VENV = resolve(homedir(), '.local/civicpulse-nli/venv')
const SCRIPT = resolve('scripts/nli/nli_score.py')

/** Lo que tarda el proceso en cargar el modelo antes del primer par (~6 s medidos). */
export const TOPE_ARRANQUE_MS = 180_000
/**
 * Lo que se le concede a cada par: ~3 veces los 0,31 s medidos en CPU con
 * `nice -n 10` y la máquina cargada. Un tramo de 3 200 pares queda en ~56 min:
 * holgura para una máquina el doble de lenta, no tanta como para esperar horas
 * a un proceso colgado.
 */
export const TOPE_MS_POR_PAR = 1_000

/** Un entero ≥ 0 del entorno; si falta o no es un número, el de serie. */
function msDelEntorno(nombre: string, deSerie: number): number {
  const crudo = process.env[nombre]
  if (crudo === undefined || crudo.trim() === '') return deSerie
  const n = Number(crudo)
  return Number.isFinite(n) && n >= 0 ? n : deSerie
}

/**
 * El tope de un lote de `pares` pares: arranque + ms por par. Se ajusta sin
 * tocar el código con `NLI_TOPE_ARRANQUE_MS` y `NLI_TOPE_MS_POR_PAR`.
 */
export function topeParaPares(pares: number): number {
  return (
    msDelEntorno('NLI_TOPE_ARRANQUE_MS', TOPE_ARRANQUE_MS) +
    pares * msDelEntorno('NLI_TOPE_MS_POR_PAR', TOPE_MS_POR_PAR)
  )
}

function defaultRunner(venv: string, pares: number): NliRunner {
  return (stdin, env, timeoutMs) =>
    new Promise<string>((res, rej) => {
      const py = resolve(venv, 'bin/python')
      if (!existsSync(py)) {
        rej(
          new NliUnavailableError(
            `NLI venv missing at ${venv} — run: bash scripts/bootstrap-nli.sh`,
          ),
        )
        return
      }
      const child = spawn(py, [SCRIPT], { env: { ...process.env, ...env } })
      let out = ''
      let err = ''
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        rej(new NliTimeoutError(pares, timeoutMs))
      }, timeoutMs)
      child.stdout.on('data', (d) => (out += d))
      child.stderr.on('data', (d) => (err += d))
      child.on('error', (e) => {
        clearTimeout(timer)
        rej(new NliUnavailableError(`NLI spawn failed: ${e.message}`))
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        if (code === 0) res(out)
        else rej(new Error(`NLI scorer exited ${code}: ${err.slice(0, 300)}`))
      })
      child.stdin.write(stdin)
      child.stdin.end()
    })
}

export async function scoreNliPairs(
  pairs: NliPair[],
  opts: ScoreNliOpts = {},
): Promise<Map<string, NliScore>> {
  const result = new Map<string, NliScore>()
  if (pairs.length === 0) return result

  const venv = opts.venv ?? DEFAULT_VENV
  const env: Record<string, string> = {}
  if (opts.model) env.NLI_MODEL = opts.model
  const runner = opts.runner ?? defaultRunner(venv, pairs.length)
  const timeoutMs = opts.timeoutMs ?? topeParaPares(pairs.length)

  const stdin = pairs.map((p) => JSON.stringify(p)).join('\n') + '\n'
  const stdout = await runner(stdin, env, timeoutMs)

  for (const line of stdout.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      const o = JSON.parse(t) as NliScore
      if (o && typeof o.id === 'string') result.set(o.id, o)
    } catch {
      // malformed line — skip, never abort the batch
    }
  }
  return result
}
