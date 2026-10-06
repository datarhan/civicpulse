import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { INJECTIONS } from '../scripts/check-guards'

/**
 * Las inyecciones de `check:guards` para `check:veredictos`, contra la guarda
 * de verdad y contra el arnés de verdad, en cajas de arena.
 *
 * LOS DOS DEFECTOS (medidos el 04-10-2026):
 *
 *   1. La única inyección escrita para esta guarda corrompía
 *      `pleno-claims/index.json` («cobertura» → «coberturaRota»), y la guarda
 *      filtra ese fichero y no lo abre nunca: con la corrupción puesta salía 0.
 *      Una inyección MUDA, cuyo texto era el de `check:cobertura`. Lo que la
 *      guarda lee es otra cosa: los trozos (¿nombra corpus y trae evidencia
 *      cada veredicto fuerte?) y, desde #226, el overlay contra su base.
 *   2. El arnés juzgaba una inyección sólo por el código de salida CON ella
 *      puesta. Entre #226 y #228 esta guarda ya salía roja sin inyectarle nada,
 *      y cualquier inyección se habría leído FIRES.
 *
 * Y uno del arnés, no de esta guarda (06-10-2026): `--inject` escribe en el
 * árbol copias corrompidas de ficheros PUBLICADOS —desde #247, el overlay con
 * un `sin-datos` subido a `verificado`— y las deshace con `git checkout`. En el
 * checkout principal los agentes de launchd comitean y empujan por su cuenta,
 * así que un commit a media inyección publicaría la corrupción. Desde entonces
 * se niega a correr allí, y estas pruebas lo corren desde un worktree.
 *
 * Cada inyección se aplica en un proceso aparte con la caja por directorio,
 * como la aplicaría el arnés en el repositorio: lo que la corrupción resuelve
 * al importarse (la base, en la del overlay) es entonces lo de la caja.
 *
 * Las filas son de verdad (tests/fixtures/check-guards-veredictos_2026-10-05.json,
 * sacadas de lo publicado ese día): un `verificado` y un `parcial` servidos con
 * corpus y evidencia, un `sin-datos` de la base, y una entrada del motor de
 * veredictos en `sin-datos` sobre una base en `sin-datos`.
 */

interface Fixture {
  trozos: Record<string, unknown>
  indice: unknown
  base: unknown
  overlay: { entries: Record<string, { verification: { verdict: string } }> }
  publicado: unknown
}
const FIXTURE: Fixture = JSON.parse(
  readFileSync(resolve('tests/fixtures/check-guards-veredictos_2026-10-05.json'), 'utf8'),
)
const GUARDA = resolve('scripts/check-veredictos.ts')
const ARNES = resolve('scripts/check-guards.ts')
// tsx por su ruta: `npx` desde una caja de arena sin node_modules lo bajaría de la red.
const TSX = resolve('node_modules/.bin/tsx')

/** El `verificado` servido, con corpus y evidencia. */
const VERIFICADO = '15uvjew-148-afi-755647'
/** La entrada del motor en `sin-datos` sobre una base en `sin-datos`. */
const DEL_MOTOR = 'k4olcs-006-afi-462d5e'

// Git aislado de la configuración de quien corre la suite, como en
// tests/scripts/check-hooks.test.ts: el arnés llama a git.
const ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
}
for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'HUSKY'])
  delete ENV[k]
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, env: ENV, encoding: 'utf8' }).trim()

// Varios arranques de tsx y de npm por bloque; el tope de 5 s de vitest no da.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const cajas: string[] = []
afterAll(() => {
  for (const c of cajas) rmSync(c, { recursive: true, force: true })
})

/**
 * Lo que la guarda lee —los trozos, la base, el overlay y el sello de lo
 * publicado— y el índice, que no lee: está porque está en el directorio de
 * verdad, y la inyección vieja lo corrompía.
 */
function caja(prefijo: string, ajustar?: (f: Fixture) => void): string {
  const raiz = mkdtempSync(join(tmpdir(), prefijo))
  cajas.push(raiz)
  const f = structuredClone(FIXTURE)
  ajustar?.(f)
  const data = join(raiz, 'public/data')
  mkdirSync(join(data, 'pleno-claims'), { recursive: true })
  const escribir = (ruta: string, valor: unknown) =>
    writeFileSync(join(data, ruta), JSON.stringify(valor, null, 2) + '\n')
  for (const [nombre, trozo] of Object.entries(f.trozos)) escribir(`pleno-claims/${nombre}`, trozo)
  escribir('pleno-claims/index.json', f.indice)
  escribir('pleno-claims-verified-base.json', f.base)
  escribir('pleno-claims-overlay.json', f.overlay)
  escribir('pleno-claims-verified.json', f.publicado)
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

const APLICAR = `
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const { INJECTIONS } = await import(process.env.TABLA_DE_INYECCIONES)
const inj = INJECTIONS[Number(process.argv[2])]
const ruta = resolve(inj.file)
writeFileSync(ruta, inj.corrupt(readFileSync(ruta, 'utf8')), 'utf8')
`
/** Aplica la inyección `i` de la tabla, en un proceso con la caja por directorio. */
function inyectar(raiz: string, i: number): void {
  const guion = join(raiz, 'aplicar-inyeccion.mts')
  writeFileSync(guion, APLICAR)
  const r = spawnSync(TSX, [guion, String(i)], {
    cwd: raiz,
    encoding: 'utf8',
    env: { ...ENV, TABLA_DE_INYECCIONES: pathToFileURL(ARNES).href },
  })
  if (r.status !== 0) throw new Error(`no se pudo aplicar «${INJECTIONS[i].describe}»: ${r.stderr}`)
}

const DE_VEREDICTOS = INJECTIONS.flatMap((inj, i) =>
  inj.guard === 'check:veredictos' ? [{ inj, i }] : [],
)

describe('check:veredictos — cada inyección, contra la guarda de verdad', () => {
  let sin: Corrida
  let con: Array<Corrida & { file: string; describe: string }>
  beforeAll(() => {
    sin = correrGuarda(caja('check-guards-veredictos-'))
    con = DE_VEREDICTOS.map(({ inj, i }) => {
      const raiz = caja('check-guards-veredictos-')
      inyectar(raiz, i)
      return { file: inj.file, describe: inj.describe, ...correrGuarda(raiz) }
    })
  })

  it('sin inyectar sale en verde: sin esa premisa ninguna inyección probaría nada', () => {
    expect(sin.status, sin.salida).toBe(0)
  })

  it('NINGUNA es muda: cada una pone roja la guarda que dice probar', () => {
    expect(con.length).toBeGreaterThan(0)
    expect(con.filter((c) => c.status === 0).map((c) => `${c.file}: ${c.describe}`)).toEqual([])
  })

  it('una deja sin corpus un veredicto fuerte servido, y la guarda lo nombra [sin-corpus]', () => {
    const marca = `✗ [sin-corpus] ${VERIFICADO}: verificado`
    expect(con.some((c) => c.status === 1 && c.salida.includes(marca))).toBe(true)
  })

  it('otra sube una entrada del overlay sobre su base sin que el validador proteste: [por-encima]', () => {
    const marca = `✗ [por-encima] ${DEL_MOTOR}: publica verificado y la base dice sin-datos`
    expect(con.some((c) => c.status === 1 && c.salida.includes(marca))).toBe(true)
  })
})

/**
 * Un repositorio de usar y tirar con UNA guarda en su package.json, así que
 * `--inject` sólo ejercita las inyecciones de check:veredictos; con git,
 * porque el arnés se niega a inyectar en un fichero sin comitear y restaura con
 * `git checkout`; y con un worktree, que es desde donde se inyecta: en el
 * checkout principal el arnés se niega.
 */
function repo(
  ajustar?: (f: Fixture) => void,
  guarda = `"${TSX}" "${GUARDA}"`,
): { principal: string; worktree: string } {
  const principal = caja('check-guards-arnes-', ajustar)
  // callSites() lo lee; con un fichero dentro, porque git no rastrea un
  // directorio vacío y el worktree saldría sin él.
  mkdirSync(join(principal, 'scripts'))
  writeFileSync(join(principal, 'scripts', '.gitkeep'), '')
  const scripts = { 'check:veredictos': guarda }
  writeFileSync(
    join(principal, 'package.json'),
    JSON.stringify({ name: 'caja', private: true, scripts }, null, 2) + '\n',
  )
  git(principal, 'init', '-q', '-b', 'main')
  git(principal, 'config', 'user.email', 'test@example.invalid')
  git(principal, 'config', 'user.name', 'check-guards test')
  git(principal, 'config', 'commit.gpgsign', 'false')
  git(principal, 'add', '-A')
  git(principal, 'commit', '-q', '-m', 'caja')
  const worktree = `${realpathSync(principal)}-worktree`
  cajas.push(worktree)
  git(principal, 'worktree', 'add', '-q', '--detach', worktree)
  return { principal, worktree }
}

interface FilaDelArnes {
  name: string
  verdict: { state: string }
  codigoSinInyeccion?: number | null
  injections?: Array<{ describe: string; fired: boolean | null }>
}
function correrArnes(raiz: string, ...args: string[]) {
  return spawnSync(TSX, [ARNES, ...args], {
    cwd: raiz,
    env: ENV,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
}
function arnes(raiz: string) {
  const r = correrArnes(raiz, '--inject', '--json')
  if (r.status !== 0) throw new Error(`el arnés salió ${r.status}: ${r.stderr}`)
  const j = JSON.parse(r.stdout) as { guards: FilaDelArnes[]; stats: Record<string, number> }
  return {
    guarda: j.guards.find((g) => g.name === 'check:veredictos')!,
    stats: j.stats,
    limpio: git(raiz, 'status', '--porcelain') === '',
  }
}

describe('check:guards --inject — el arnés de verdad, en un repositorio de usar y tirar', () => {
  it('desde un worktree y contra una guarda en verde, da por probadas sus inyecciones y deja el árbol como estaba', () => {
    const r = arnes(repo().worktree)
    expect(r.guarda.injections?.length).toBeGreaterThan(0)
    expect(r.guarda.injections!.filter((i) => i.fired !== true)).toEqual([])
    expect(r.guarda.verdict.state).toBe('proven')
    expect(r.limpio).toBe(true)
  })

  it('desde el checkout principal no inyecta: sale 3 sin correr la guarda ni reescribir un fichero', () => {
    // Allí comitean y empujan por su cuenta los agentes de launchd: un commit a
    // media inyección publicaría la corrupción. El `.git` de este repositorio
    // es el común, como el del principal. La «guarda» apunta cada corrida fuera
    // del repositorio y sale 0: si el arnés llegara a inyectar, la habría
    // corrido una vez sin inyección y otra por cada inyección.
    const fuera = mkdtempSync(join(tmpdir(), 'check-guards-corridas-'))
    cajas.push(fuera)
    const corridas = join(fuera, 'corridas.log')
    const { principal } = repo(undefined, `echo corrida >> "${corridas}"`)
    const inyectables = DE_VEREDICTOS.map(({ inj }) => join(principal, inj.file))
    const antes = inyectables.map((f) => statSync(f).mtimeMs)

    const r = correrArnes(principal, '--inject', '--json')
    expect(r.status, r.stdout + r.stderr).toBe(3)
    expect(existsSync(corridas)).toBe(false)
    expect(inyectables.map((f) => statSync(f).mtimeMs)).toEqual(antes)
    // Y dice cómo correrlo donde sí se puede.
    expect(r.stderr).toMatch(/git worktree add/)

    // La auditoría de cableado no escribe nada: ésa sí corre en el principal.
    const cableado = correrArnes(principal, '--json')
    expect(cableado.status, cableado.stderr).toBe(0)
    expect(JSON.parse(cableado.stdout).injected).toBe(false)
  })

  it('LA TRAMPA: contra una guarda que ya sale roja, ninguna inyección se da por probada', () => {
    // El estado entre #226 y #228: una entrada del overlay publicaba por
    // encima de lo que dice hoy su base, y la guarda salía 1 sin inyección.
    const r = arnes(
      repo((f) => {
        f.overlay.entries[DEL_MOTOR].verification.verdict = 'parcial'
      }).worktree,
    )
    expect(r.guarda.injections?.some((i) => i.fired === true)).toBe(false)
    expect(r.guarda.verdict.state).toBe('unproven')
    expect(r.guarda.codigoSinInyeccion).toBe(1)
    expect(r.stats.unproven).toBe(1)
    expect(r.limpio).toBe(true)
  })

  it('roja con la inyección pero sin la marca que espera: tampoco se da por probada', () => {
    // Una «guarda» que sale 0 con el árbol intacto y 1 en cuanto cambia
    // cualquier fichero, sin nombrar nada: la forma de una guarda que revienta
    // al cargar lo corrompido. Por el código de salida, las dos inyecciones
    // dispararían; por lo que imprime, no han probado nada.
    const r = arnes(repo(undefined, 'git diff --quiet').worktree)
    expect(r.guarda.codigoSinInyeccion).toBe(0)
    expect(r.guarda.injections?.some((i) => i.fired === true)).toBe(false)
    expect(r.guarda.verdict.state).toBe('unproven')
    expect(r.limpio).toBe(true)
  })

  it('a una guarda ya roja no le inyecta nada: la corre una vez, para todas sus inyecciones', () => {
    // Que el veredicto salga bien no basta: `juzgarInyeccion` mira la corrida
    // sin inyección, así que corromper igualmente daría el mismo «sin prueba».
    // Lo que no daría es lo mismo en el árbol: ficheros reescritos y la guarda
    // corrida de nuevo para nada. Esta «guarda» apunta cada corrida fuera del
    // repositorio y sale 1 siempre.
    const fuera = mkdtempSync(join(tmpdir(), 'check-guards-corridas-'))
    cajas.push(fuera)
    const corridas = join(fuera, 'corridas.log')
    const r = arnes(repo(undefined, `echo corrida >> "${corridas}"; exit 1`).worktree)
    expect(r.guarda.injections?.length).toBeGreaterThan(1)
    expect(readFileSync(corridas, 'utf8').trim().split('\n')).toHaveLength(1)
    expect(r.guarda.codigoSinInyeccion).toBe(1)
    expect(r.guarda.verdict.state).toBe('unproven')
  })
})
