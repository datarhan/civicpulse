/**
 * Node client for the local NLI sidecar (P1).
 *
 * Spawns the bootstrap venv's python ONCE, writes all `(premise, hypothesis)`
 * pairs as JSONL to stdin, and parses the JSONL scores back. No always-on
 * server, no ports — same batch-spawn model as transcribe-pleno.sh. The
 * support decision is local + $0; a missing venv fails loud (never silently
 * falls back to a metered LLM).
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

/** stdin (JSONL) + env → stdout (JSONL). Injectable so tests skip the spawn. */
export type NliRunner = (stdin: string, env: Record<string, string>) => Promise<string>

export interface ScoreNliOpts {
  model?: string
  venv?: string
  timeoutMs?: number
  runner?: NliRunner
}

const DEFAULT_VENV = resolve(homedir(), '.local/civicpulse-nli/venv')
const SCRIPT = resolve('scripts/nli/nli_score.py')

function defaultRunner(venv: string, timeoutMs: number): NliRunner {
  return (stdin, env) =>
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
        rej(new Error(`NLI scorer timed out after ${timeoutMs}ms`))
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
  const runner = opts.runner ?? defaultRunner(venv, opts.timeoutMs ?? 600_000)

  const stdin = pairs.map((p) => JSON.stringify(p)).join('\n') + '\n'
  const stdout = await runner(stdin, env)

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
