/**
 * Cajas de arena para probar una inyección de `check:guards` de punta a punta:
 * contra su guarda de verdad, y por el arnés de verdad en un repositorio de usar
 * y tirar.
 *
 * Lo comparten las pruebas de cada guarda inyectada (`check-guards-*.test.ts`):
 * cómo se aplica una inyección y desde dónde se corre el arnés tiene que ser lo
 * mismo para todas, o alguna estaría probando otra cosa.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { INJECTIONS } from '../scripts/check-guards'

export const ARNES = resolve('scripts/check-guards.ts')
// tsx por su ruta: `npx` desde una caja de arena sin node_modules lo bajaría de la red.
export const TSX = resolve('node_modules/.bin/tsx')

// Git aislado de la configuración de quien corre la suite, como en
// tests/scripts/check-hooks.test.ts: el arnés llama a git.
export const ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
}
for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'HUSKY'])
  delete ENV[k]
export const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, env: ENV, encoding: 'utf8' }).trim()

const cajas: string[] = []
/** Un directorio de usar y tirar; `limpiarCajas()` los borra todos. */
export function cajaVacia(prefijo: string): string {
  const raiz = mkdtempSync(join(tmpdir(), prefijo))
  cajas.push(raiz)
  return raiz
}
export function limpiarCajas(): void {
  for (const c of cajas.splice(0)) rmSync(c, { recursive: true, force: true })
}

const APLICAR = `
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const { INJECTIONS } = await import(process.env.TABLA_DE_INYECCIONES)
const inj = INJECTIONS[Number(process.argv[2])]
const ruta = resolve(inj.file)
writeFileSync(ruta, inj.corrupt(readFileSync(ruta, 'utf8')), 'utf8')
`
/**
 * Aplica la inyección `i` de la tabla en un proceso aparte con la caja por
 * directorio, como la aplicaría el arnés en el repositorio: lo que la
 * corrupción resuelve al importarse (la base, en la del overlay) es entonces lo
 * de la caja.
 */
export function aplicarInyeccion(raiz: string, i: number): void {
  const guion = join(raiz, 'aplicar-inyeccion.mts')
  writeFileSync(guion, APLICAR)
  const r = spawnSync(TSX, [guion, String(i)], {
    cwd: raiz,
    encoding: 'utf8',
    env: { ...ENV, TABLA_DE_INYECCIONES: pathToFileURL(ARNES).href },
  })
  if (r.status !== 0) throw new Error(`no se pudo aplicar «${INJECTIONS[i].describe}»: ${r.stderr}`)
}

/** El arnés de verdad, con `raiz` por directorio. */
export function correrArnes(raiz: string, ...args: string[]) {
  return spawnSync(TSX, [ARNES, ...args], {
    cwd: raiz,
    env: ENV,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
}

/**
 * Hace de una caja ya llena un repositorio de usar y tirar con estas guardas en
 * su package.json —así `--inject` sólo ejercita las inyecciones de ellas—, y le
 * añade un worktree hermano, que es desde donde se inyecta: en el checkout
 * principal el arnés se niega. Con git, porque el arnés se niega a inyectar en
 * un fichero sin comitear y restaura con `git checkout`.
 */
export function repoConWorktree(
  principal: string,
  scripts: Record<string, string>,
): { principal: string; worktree: string } {
  // callSites() lo lee; con un fichero dentro, porque git no rastrea un
  // directorio vacío y el worktree saldría sin él.
  mkdirSync(join(principal, 'scripts'))
  writeFileSync(join(principal, 'scripts', '.gitkeep'), '')
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
