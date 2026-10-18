/**
 * Arriendo de SearXNG: la corrida que necesita búsqueda web lo levanta, y la
 * última corrida que lo usaba lo baja.
 *
 *   const url = await searxngForThisRun('[journalist:run]')
 *
 * Por qué existe. El contenedor llevaba `restart: unless-stopped` y se
 * arrancaba a mano. El 18-10-2026 no arrancó: lo habían creado desde el
 * worktree `campana-bios`, el worktree se borró, y Docker, al no encontrar el
 * `settings.yml` que montaba, creó en su lugar un DIRECTORIO vacío con ese
 * nombre y se negó a montarlo sobre un fichero. Por eso aquí:
 *
 *   • El compose sale SIEMPRE del checkout principal (el padre del directorio
 *     común de git), nunca del worktree desde el que se corre: un worktree se
 *     borra y el contenedor seguiría apuntando a él.
 *   • Se baja sólo lo que levantó una corrida (marca `iniciado-por-arriendo`):
 *     uno arrancado a mano con `npm run searxng:up` nunca se para solo.
 *   • Varias sesiones corren a la vez desde worktrees distintos. Cada corrida
 *     deja `<pid>.lease` en el directorio común de git (compartido por todos
 *     los worktrees, fuera del árbol), y quien libera barre los de procesos
 *     muertos. Un cerrojo (mkdir) serializa el «¿está? → arranco» y el
 *     «¿queda alguien? → bajo», para que una corrida no lo pare mientras otra
 *     se está sumando.
 *   • Si no llega a responder, la corrida falla ANTES de empezar, nombrando el
 *     paso. Seguir sin búsqueda web daría una biografía más pobre que dice
 *     haber terminado.
 *
 * Una corrida muerta sin poder limpiar (SIGKILL, cuota agotada) deja el
 * contenedor arriba hasta que la siguiente salga: ésa barre su arriendo y lo
 * baja, y un cerrojo cuyo dueño murió se toma.
 *
 * Una instancia que no es esta máquina en el 8888 (el puerto que publica el
 * compose) no se toca: sólo se comprueba que responde.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULT_URL = 'http://127.0.0.1:8888'
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])
const COMPOSE_REL = 'scripts/searxng/docker-compose.yml'
const SETTINGS_REL = 'scripts/searxng/settings.yml'
const MARK = 'iniciado-por-arriendo'
const LOCK = 'cerrojo'

const DOCKER_WAIT_MS = 180_000
const HEALTH_WAIT_MS = 120_000
const LOCK_WAIT_MS = DOCKER_WAIT_MS + HEALTH_WAIT_MS + 60_000
const POLL_DOCKER_MS = 3_000
const POLL_HEALTH_MS = 2_000
const POLL_LOCK_MS = 250

export type SearxngStep = 'checkout' | 'docker' | 'compose' | 'health' | 'remote'

export class SearxngUnavailableError extends Error {
  constructor(
    readonly step: SearxngStep,
    message: string,
  ) {
    super(message)
    this.name = 'SearxngUnavailableError'
  }
}

interface RunResult {
  status: number | null
  stdout: string
  stderr: string
}

interface FetchResult {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

export interface SearxngDeps {
  env: Record<string, string | undefined>
  pid: number
  platform: string
  mainCheckout(): string
  leaseDir(): string
  isAlive(pid: number): boolean
  now(): number
  sleep(ms: number): Promise<void>
  sleepSync(ms: number): void
  run(cmd: string, args: string[]): RunResult
  /**
   * Lanza «compose down» en un proceso aparte que sobrevive a éste y que
   * borra `lockPath` al terminar; devuelve su pid, o `undefined` si no pudo.
   */
  stopDetached(compose: string, lockPath: string): number | undefined
  fetch(url: string): Promise<FetchResult>
  log(line: string): void
}

export interface SearxngLease {
  url: string
  /** Síncrono e idempotente: se llama desde el manejador de `exit`. */
  release(): void
}

/** Lo que el compose puede levantar: esta máquina, en el puerto que publica. */
function isManaged(url: URL): boolean {
  return LOCAL_HOSTS.has(url.hostname) && (url.port || '80') === '8888'
}

function dockerReady(d: SearxngDeps): boolean {
  return d.run('docker', ['info']).status === 0
}

async function answers(d: SearxngDeps, base: string): Promise<boolean> {
  try {
    return (await d.fetch(`${base}/healthz`)).ok
  } catch {
    return false
  }
}

/**
 * La prueba de verdad es una búsqueda JSON: `/healthz` responde aunque
 * `search.formats` no incluya `json`, y entonces el agente recibiría 403.
 */
async function jsonProblem(d: SearxngDeps, base: string): Promise<string | null> {
  try {
    const res = await d.fetch(`${base}/search?q=Riba-roja&format=json`)
    if (!res.ok) return `la búsqueda JSON respondió HTTP ${res.status}`
    const body = (await res.json()) as { results?: unknown }
    return Array.isArray(body.results) ? null : 'la búsqueda JSON no trae `results`'
  } catch (err) {
    return `la búsqueda JSON falló (${(err as Error).message})`
  }
}

// ── Cerrojo y arriendos ────────────────────────────────────────────────────

function lockOwner(dir: string): { pid: number } | null {
  try {
    return JSON.parse(readFileSync(join(dir, LOCK, 'dueño.json'), 'utf8'))
  } catch {
    return null
  }
}

function tryLock(d: SearxngDeps, dir: string, waitedMs: number): boolean {
  try {
    mkdirSync(join(dir, LOCK))
    writeFileSync(join(dir, LOCK, 'dueño.json'), JSON.stringify({ pid: d.pid }))
    return true
  } catch {
    // Dueño muerto, o espera más larga que cualquier arranque: el cerrojo es
    // de una corrida que murió dentro de él.
    const owner = lockOwner(dir)
    if ((owner && !d.isAlive(owner.pid)) || waitedMs >= LOCK_WAIT_MS) {
      rmSync(join(dir, LOCK), { recursive: true, force: true })
    }
    return false
  }
}

async function lock(d: SearxngDeps, dir: string): Promise<void> {
  for (let waited = 0; !tryLock(d, dir, waited); waited += POLL_LOCK_MS) {
    await d.sleep(POLL_LOCK_MS)
  }
}

function lockSync(d: SearxngDeps, dir: string): void {
  for (let waited = 0; !tryLock(d, dir, waited); waited += POLL_LOCK_MS) {
    d.sleepSync(POLL_LOCK_MS)
  }
}

function unlock(dir: string): void {
  rmSync(join(dir, LOCK), { recursive: true, force: true })
}

/** Quita el arriendo propio y los de procesos muertos; devuelve cuántos quedan vivos. */
function dropLease(d: SearxngDeps, dir: string): number {
  rmSync(join(dir, `${d.pid}.lease`), { force: true })
  let live = 0
  for (const name of readdirSync(dir)) {
    const m = /^(\d+)\.lease$/.exec(name)
    if (!m) continue
    if (d.isAlive(Number(m[1]))) live += 1
    else rmSync(join(dir, name), { force: true })
  }
  return live
}

/**
 * Con el cerrojo tomado. Baja el contenedor si lo levantó un arriendo y ya no
 * queda nadie. Devuelve `true` si el cerrojo pasó al proceso que lo baja: el
 * llamante NO debe soltarlo.
 *
 * «compose down» no corre aquí sino en un proceso aparte. `npm run` llega por
 * `npx tsx`, y con Ctrl+C `npx` reenvía la señal: `tsx` la recibe dos veces,
 * lo toma por «forzar», y mata al hijo con SIGKILL en mitad de la bajada
 * (medido el 18-10: contenedor arriba, cerrojo y marca huérfanos). El proceso
 * aparte se queda el cerrojo hasta que el contenedor está abajo, para que una
 * corrida nueva no se sume a uno que se está parando.
 */
function releaseLocked(d: SearxngDeps, dir: string, compose: string): boolean {
  if (dropLease(d, dir) > 0 || !existsSync(join(dir, MARK))) return false
  rmSync(join(dir, MARK), { force: true })
  d.log('SearXNG: nadie más lo usa; lo bajo')
  const pid = d.stopDetached(compose, join(dir, LOCK))
  if (pid === undefined) {
    d.log('SearXNG: no pude lanzar «compose down»; sigue arriba (npm run searxng:down)')
    return false
  }
  try {
    writeFileSync(join(dir, LOCK, 'dueño.json'), JSON.stringify({ pid }))
  } catch {
    // Ya terminó y borró el cerrojo.
  }
  return true
}

// ── Arranque ───────────────────────────────────────────────────────────────

async function waitFor(
  d: SearxngDeps,
  limitMs: number,
  pollMs: number,
  ok: () => boolean | Promise<boolean>,
): Promise<boolean> {
  const start = d.now()
  while (!(await ok())) {
    if (d.now() - start >= limitMs) return false
    await d.sleep(pollMs)
  }
  return true
}

async function start(d: SearxngDeps, base: string, compose: string, dir: string): Promise<void> {
  if (!dockerReady(d)) {
    if (d.platform !== 'darwin') {
      throw new SearxngUnavailableError('docker', 'Docker no está en marcha; arráncalo')
    }
    d.log('SearXNG: Docker no está en marcha; abro Docker Desktop y espero')
    d.run('open', ['-a', 'Docker'])
    if (!(await waitFor(d, DOCKER_WAIT_MS, POLL_DOCKER_MS, () => dockerReady(d)))) {
      throw new SearxngUnavailableError(
        'docker',
        `Docker no respondió en ${DOCKER_WAIT_MS / 1000} s tras abrir Docker Desktop`,
      )
    }
  }
  // La marca va ANTES de «compose up»: si el arranque falla a medias, la
  // limpieza baja lo que haya quedado. Antes de que Docker responda no hay
  // nada que bajar.
  writeFileSync(join(dir, MARK), `${d.pid}\n`)
  d.log(`SearXNG: lo levanto con ${compose}`)
  const up = d.run('docker', ['compose', '-f', compose, 'up', '-d'])
  if (up.status !== 0) {
    throw new SearxngUnavailableError('compose', `«compose up» falló: ${up.stderr.trim()}`)
  }
  if (!(await waitFor(d, HEALTH_WAIT_MS, POLL_HEALTH_MS, () => answers(d, base)))) {
    throw new SearxngUnavailableError(
      'health',
      `el contenedor no respondió en ${base}/healthz en ${HEALTH_WAIT_MS / 1000} s`,
    )
  }
}

export async function acquireSearxng(d: SearxngDeps): Promise<SearxngLease> {
  if (!d.env.SEARXNG_URL?.trim()) d.env.SEARXNG_URL = DEFAULT_URL
  const base = d.env.SEARXNG_URL!.trim().replace(/\/+$/, '')
  const parsed = new URL(base)

  if (!isManaged(parsed)) {
    const problem = (await answers(d, base))
      ? await jsonProblem(d, base)
      : `no responde en ${base}/healthz`
    if (problem) {
      throw new SearxngUnavailableError(
        'remote',
        `SEARXNG_URL=${base} no es este equipo en el 8888, así que no lo arranco; ${problem}`,
      )
    }
    return { url: base, release: () => {} }
  }

  const checkout = d.mainCheckout()
  const compose = join(checkout, COMPOSE_REL)
  for (const f of [compose, join(checkout, SETTINGS_REL)]) {
    if (!existsSync(f)) {
      throw new SearxngUnavailableError('checkout', `falta ${f} en el checkout principal`)
    }
  }

  const dir = d.leaseDir()
  mkdirSync(dir, { recursive: true })
  await lock(d, dir)
  let handedOff = false
  try {
    writeFileSync(join(dir, `${d.pid}.lease`), `${d.now()}\n`)
    try {
      if (!(await answers(d, base))) await start(d, base, compose, dir)
      const problem = await jsonProblem(d, base)
      if (problem) throw new SearxngUnavailableError('health', problem)
    } catch (err) {
      handedOff = releaseLocked(d, dir, compose)
      throw err
    }
  } finally {
    if (!handedOff) unlock(dir)
  }

  let released = false
  return {
    url: base,
    release() {
      if (released) return
      released = true
      lockSync(d, dir)
      let handed = false
      try {
        handed = releaseLocked(d, dir, compose)
      } finally {
        if (!handed) unlock(dir)
      }
    },
  }
}

// ── Cableado real ──────────────────────────────────────────────────────────

function gitCommonDir(): string {
  const res = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    encoding: 'utf8',
  })
  if (res.status !== 0) {
    throw new SearxngUnavailableError('checkout', 'no estoy dentro del repositorio')
  }
  return res.stdout.trim()
}

function defaultDeps(tag: string): SearxngDeps {
  const sab = new Int32Array(new SharedArrayBuffer(4))
  return {
    env: process.env,
    pid: process.pid,
    platform: process.platform,
    mainCheckout: () => dirname(gitCommonDir()),
    leaseDir: () => join(gitCommonDir(), 'searxng-arriendos'),
    isAlive: (pid) => {
      try {
        process.kill(pid, 0)
        return true
      } catch (err) {
        return (err as NodeJS.ErrnoException).code === 'EPERM'
      }
    },
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    sleepSync: (ms) => void Atomics.wait(sab, 0, 0, ms),
    run: (cmd, args) => {
      const r = spawnSync(cmd, args, { encoding: 'utf8' })
      return {
        status: r.status,
        stdout: r.stdout ?? '',
        stderr: r.stderr ?? r.error?.message ?? '',
      }
    },
    stopDetached: (compose, lockPath) => {
      try {
        const child = spawn(
          'sh',
          [
            '-c',
            'printf \'{"pid":%s}\' $$ > "$2/dueño.json"; docker compose -f "$1" down >/dev/null 2>&1; rm -rf "$2"',
            'searxng-down',
            compose,
            lockPath,
          ],
          { detached: true, stdio: 'ignore' },
        )
        child.unref()
        return child.pid
      } catch {
        return undefined
      }
    },
    fetch: (url) => fetch(url, { signal: AbortSignal.timeout(10_000) }),
    log: (line) => process.stderr.write(`${tag} ${line}\n`),
  }
}

/**
 * Para los CLIs: deja SearXNG listo y `SEARXNG_URL` puesto, y lo libera al
 * salir — también con `process.exit`, un error o Ctrl+C. Si no llega a estar
 * listo, termina el proceso con código 1 diciendo en qué paso falló.
 */
export async function searxngForThisRun(tag: string): Promise<string> {
  let lease: SearxngLease
  try {
    lease = await acquireSearxng(defaultDeps(tag))
  } catch (err) {
    const step = err instanceof SearxngUnavailableError ? err.step : 'checkout'
    process.stderr.write(
      `${tag} SearXNG no disponible (paso: ${step}): ${(err as Error).message}\n`,
    )
    process.exit(1)
  }
  process.once('exit', () => lease.release())
  // `on`, no `once`: Ctrl+C llega al grupo entero y los envoltorios la
  // reenvían, así que puede llegar más de una vez; con `once` la segunda caía
  // en el manejador por defecto. Lo que `tsx` mata con SIGKILL no pasa por
  // aquí: para eso la bajada corre aparte (ver `releaseLocked`).
  let leaving = false
  for (const [sig, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
    ['SIGHUP', 129],
  ] as const) {
    process.on(sig, () => {
      if (leaving) return
      leaving = true
      lease.release()
      process.exit(code)
    })
  }
  return lease.url
}
