/**
 * El arriendo de SearXNG: la corrida que necesita búsqueda web levanta el
 * contenedor y la última en salir lo baja. Docker, la red y el reloj son
 * simulados — ninguna prueba arranca un contenedor ni abre un socket. El
 * directorio de arriendos sí es real (temporal), porque esos ficheros SON el
 * protocolo entre corridas simultáneas y simularlos no probaría nada.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  acquireSearxng,
  SearxngUnavailableError,
  type SearxngDeps,
} from '../scripts/lib/searxng-lease'

interface Call {
  cmd: string
  args: string[]
}

interface Fake {
  deps: SearxngDeps
  calls: Call[]
  /** ¿Responde el contenedor? Lo cambian `compose up` / `down`. */
  state: { dockerReady: boolean; up: boolean; jsonOk: boolean }
  alive: Set<number>
  env: Record<string, string | undefined>
}

let root: string
let checkout: string
let leaseDir: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'searxng-lease-'))
  checkout = join(root, 'CivicPulse')
  mkdirSync(join(checkout, 'scripts/searxng'), { recursive: true })
  writeFileSync(join(checkout, 'scripts/searxng/docker-compose.yml'), 'services: {}\n')
  writeFileSync(join(checkout, 'scripts/searxng/settings.yml'), 'use_default_settings: true\n')
  leaseDir = join(root, 'leases')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function fake(
  opts: {
    pid?: number
    dockerReady?: boolean
    dockerReadyAfterOpen?: number
    up?: boolean
    comesUp?: boolean
    jsonOk?: boolean
    env?: Record<string, string | undefined>
    shared?: Fake
  } = {},
): Fake {
  const pid = opts.pid ?? 1000
  const state = opts.shared?.state ?? {
    dockerReady: opts.dockerReady ?? true,
    up: opts.up ?? false,
    jsonOk: opts.jsonOk ?? true,
  }
  const alive = opts.shared?.alive ?? new Set<number>()
  alive.add(pid)
  const calls: Call[] = opts.shared?.calls ?? []
  const env = opts.env ?? {}
  let clock = 0
  let infoPollsAfterOpen = -1

  const deps: SearxngDeps = {
    env,
    pid,
    platform: 'darwin',
    mainCheckout: () => checkout,
    leaseDir: () => leaseDir,
    isAlive: (p) => alive.has(p),
    now: () => clock,
    sleep: async (ms) => {
      clock += ms
    },
    sleepSync: (ms) => {
      clock += ms
    },
    run: (cmd, args) => {
      calls.push({ cmd, args })
      if (cmd === 'docker' && args[0] === 'info') {
        if (infoPollsAfterOpen >= 0 && opts.dockerReadyAfterOpen !== undefined) {
          infoPollsAfterOpen += 1
          if (infoPollsAfterOpen >= opts.dockerReadyAfterOpen) state.dockerReady = true
        }
        return { status: state.dockerReady ? 0 : 1, stdout: '', stderr: '' }
      }
      if (cmd === 'open') {
        infoPollsAfterOpen = 0
        return { status: 0, stdout: '', stderr: '' }
      }
      if (cmd === 'docker' && args[0] === 'compose') {
        if (args.includes('up')) state.up = opts.comesUp ?? true
        if (args.includes('down')) state.up = false
        return { status: 0, stdout: '', stderr: '' }
      }
      return { status: 127, stdout: '', stderr: `unexpected ${cmd}` }
    },
    stopDetached: (compose, lockPath) => {
      // Como el real: baja el contenedor y suelta el cerrojo él mismo.
      calls.push({ cmd: 'docker', args: ['compose', '-f', compose, 'down'] })
      state.up = false
      rmSync(lockPath, { recursive: true, force: true })
      return 4242
    },
    fetch: async (url) => {
      if (!state.up) throw new Error('ECONNREFUSED')
      if (url.includes('/healthz')) return { ok: true, status: 200, json: async () => ({}) }
      if (!state.jsonOk) return { ok: false, status: 403, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => ({ results: [] }) }
    },
    log: () => {},
  }
  return { deps, calls, state, alive, env }
}

const composeCalls = (f: Fake, verb: 'up' | 'down') =>
  f.calls.filter((c) => c.cmd === 'docker' && c.args[0] === 'compose' && c.args.includes(verb))

const leases = () =>
  existsSync(leaseDir) ? readdirSync(leaseDir).filter((n) => n.endsWith('.lease')) : []

describe('acquireSearxng', () => {
  it('uses a running instance it did not start, and never stops it', async () => {
    const f = fake({ up: true })
    const lease = await acquireSearxng(f.deps)
    expect(lease.url).toBe('http://127.0.0.1:8888')
    expect(composeCalls(f, 'up')).toHaveLength(0)
    expect(leases()).toEqual(['1000.lease'])
    lease.release()
    expect(composeCalls(f, 'down')).toHaveLength(0)
    expect(f.state.up).toBe(true)
    expect(leases()).toEqual([])
  })

  it('sets SEARXNG_URL when unset, and keeps one that is set', async () => {
    const f = fake({ up: true })
    await acquireSearxng(f.deps)
    expect(f.env.SEARXNG_URL).toBe('http://127.0.0.1:8888')

    const g = fake({ up: true, env: { SEARXNG_URL: 'http://localhost:8888/' } })
    const lease = await acquireSearxng(g.deps)
    expect(g.env.SEARXNG_URL).toBe('http://localhost:8888/')
    expect(lease.url).toBe('http://localhost:8888')
  })

  it("starts it from the MAIN checkout's compose file and stops it on release", async () => {
    const f = fake()
    const lease = await acquireSearxng(f.deps)
    const up = composeCalls(f, 'up')
    expect(up).toHaveLength(1)
    expect(up[0].args).toContain(join(checkout, 'scripts/searxng/docker-compose.yml'))
    lease.release()
    const down = composeCalls(f, 'down')
    expect(down).toHaveLength(1)
    expect(down[0].args).toContain(join(checkout, 'scripts/searxng/docker-compose.yml'))
    expect(f.state.up).toBe(false)
    expect(leases()).toEqual([])
  })

  it('release is idempotent', async () => {
    const f = fake()
    const lease = await acquireSearxng(f.deps)
    lease.release()
    lease.release()
    expect(composeCalls(f, 'down')).toHaveLength(1)
  })

  it('the last of two overlapping runs is the one that stops it', async () => {
    const a = fake({ pid: 1 })
    const b = fake({ pid: 2, shared: a })
    const la = await acquireSearxng(a.deps)
    const lb = await acquireSearxng(b.deps)
    expect(composeCalls(a, 'up')).toHaveLength(1) // b se sumó, no lo relanzó
    la.release()
    expect(composeCalls(a, 'down')).toHaveLength(0)
    expect(a.state.up).toBe(true)
    lb.release()
    expect(composeCalls(a, 'down')).toHaveLength(1)
  })

  it('a lease left by a dead process does not keep it up', async () => {
    const a = fake({ pid: 1 })
    const b = fake({ pid: 2, shared: a })
    await acquireSearxng(a.deps) // nunca libera: lo mataron
    const lb = await acquireSearxng(b.deps)
    a.alive.delete(1)
    lb.release()
    expect(composeCalls(a, 'down')).toHaveLength(1)
    expect(leases()).toEqual([])
  })

  it('opens Docker Desktop when the daemon is down, and waits for it', async () => {
    const f = fake({ dockerReady: false, dockerReadyAfterOpen: 3 })
    const lease = await acquireSearxng(f.deps)
    expect(f.calls.some((c) => c.cmd === 'open' && c.args.join(' ') === '-a Docker')).toBe(true)
    expect(composeCalls(f, 'up')).toHaveLength(1)
    lease.release()
  })

  it('fails at the docker step when Docker never becomes ready, leaving no lease', async () => {
    const f = fake({ dockerReady: false })
    const err = await acquireSearxng(f.deps).catch((e) => e)
    expect(err).toBeInstanceOf(SearxngUnavailableError)
    expect((err as SearxngUnavailableError).step).toBe('docker')
    expect(composeCalls(f, 'up')).toHaveLength(0)
    expect(composeCalls(f, 'down')).toHaveLength(0)
    expect(leases()).toEqual([])
  })

  it('fails at the health step when the container never answers, and takes it down', async () => {
    const f = fake({ comesUp: false })
    const err = await acquireSearxng(f.deps).catch((e) => e)
    expect((err as SearxngUnavailableError).step).toBe('health')
    expect(composeCalls(f, 'down')).toHaveLength(1)
    expect(leases()).toEqual([])
  })

  it('fails at the health step when the JSON format is refused', async () => {
    const f = fake({ jsonOk: false })
    const err = await acquireSearxng(f.deps).catch((e) => e)
    expect((err as SearxngUnavailableError).step).toBe('health')
    expect((err as Error).message).toMatch(/403/)
  })

  it('never touches Docker for an instance that is not this machine on 8888', async () => {
    const f = fake({ env: { SEARXNG_URL: 'http://searxng.internal:8080' } })
    const err = await acquireSearxng(f.deps).catch((e) => e)
    expect((err as SearxngUnavailableError).step).toBe('remote')
    expect(f.calls.filter((c) => c.cmd === 'docker' || c.cmd === 'open')).toEqual([])
    expect(leases()).toEqual([])

    const g = fake({ up: true, env: { SEARXNG_URL: 'http://searxng.internal:8080' } })
    const lease = await acquireSearxng(g.deps)
    lease.release()
    expect(g.calls.filter((c) => c.cmd === 'docker' || c.cmd === 'open')).toEqual([])
  })

  it('takes over a lock whose owner died inside it', async () => {
    mkdirSync(join(leaseDir, 'cerrojo'), { recursive: true })
    writeFileSync(join(leaseDir, 'cerrojo', 'dueño.json'), JSON.stringify({ pid: 999 }))
    const f = fake({ up: true })
    const lease = await acquireSearxng(f.deps)
    lease.release()
    expect(existsSync(join(leaseDir, 'cerrojo'))).toBe(false)
  })

  it('releases the lock and leaves it up when the detached stop cannot launch', async () => {
    const f = fake()
    f.deps.stopDetached = () => undefined
    const lease = await acquireSearxng(f.deps)
    lease.release()
    expect(f.state.up).toBe(true)
    expect(existsSync(join(leaseDir, 'cerrojo'))).toBe(false)
    expect(leases()).toEqual([])
  })

  it('fails at the checkout step when the compose file is missing', async () => {
    rmSync(join(checkout, 'scripts/searxng/settings.yml'))
    const f = fake()
    const err = await acquireSearxng(f.deps).catch((e) => e)
    expect((err as SearxngUnavailableError).step).toBe('checkout')
    expect(composeCalls(f, 'up')).toHaveLength(0)
  })
})
