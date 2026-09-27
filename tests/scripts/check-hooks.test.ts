/**
 * `scripts/check-hooks.ts` contra un repositorio de verdad, con un worktree de
 * verdad, dispuesto como lo deja husky 9: `.husky/pre-commit` rastreado y
 * `.husky/_/` generado e IGNORADO, así que sólo existe en el checkout donde se
 * generó.
 *
 * Lo que se mide no es el texto del parte sino lo que hace git: el gancho de
 * prueba deja una marca en la raíz del árbol que comitea, y la marca está o no
 * está. Así lo que prueba esta suite es lo que el 27-09-2026 falló en el
 * portátil —un push desde un worktree que no ejecutó ningún gancho y no lo
 * dijo— y no una cadena de caracteres en `.git/config`.
 */
import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const RAIZ = join(__dirname, '..', '..')
const TSX = join(RAIZ, 'node_modules', '.bin', 'tsx')
const GUARDA = join(RAIZ, 'scripts', 'check-hooks.ts')

// Git aislado de la configuración de quien corre la suite: un core.hooksPath
// global, o un GIT_DIR heredado de un gancho, cambiarían lo que se mide.
const ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
}
for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'HUSKY'])
  delete ENV[k]

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, env: ENV, encoding: 'utf8' }).trim()
const guarda = (cwd: string, ...args: string[]) =>
  spawnSync(TSX, [GUARDA, ...args], { cwd, env: ENV, encoding: 'utf8' })
const valorComun = (main: string) =>
  spawnSync('git', ['config', '--local', '--get', 'core.hooksPath'], {
    cwd: main,
    env: ENV,
    encoding: 'utf8',
  })

/** El lanzador que husky 9 genera, byte a byte (sin salto final). */
const LANZADOR = '#!/usr/bin/env sh\n. "$(dirname "$0")/h"'

/**
 * El corredor `h`, reducido a su contrato: ejecutar `../<gancho>` con `sh -e`, y
 * salir 0 en silencio si no está. husky no es dependencia del proyecto, así
 * que en CI no hay uno de verdad que copiar.
 */
const CORREDOR = `#!/usr/bin/env sh
n=$(basename "$0")
s=$(dirname "$(dirname "$0")")/$n
[ ! -f "$s" ] && exit 0
sh -e "$s" "$@"
`

const sandboxes: string[] = []
afterAll(() => {
  for (const d of sandboxes) rmSync(d, { recursive: true, force: true })
})

/** Lo que deja husky al correr en un árbol: `.husky/_/` con el corredor y el lanzador. */
function generarHusky(arbol: string) {
  mkdirSync(join(arbol, '.husky', '_'))
  writeFileSync(join(arbol, '.husky', '_', 'h'), CORREDOR)
  writeFileSync(join(arbol, '.husky', '_', 'pre-commit'), LANZADOR)
  chmodSync(join(arbol, '.husky', '_', 'pre-commit'), 0o755)
}

/**
 * Un principal y un worktree hermano. Con `conGanchos`, el principal lleva
 * `.husky/_/` generado y `core.hooksPath = .husky/_` —relativo, como lo escribe
 * husky—; sin él, es un clon nuevo o un runner de CI.
 */
function repo({ conGanchos = true } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'check-hooks-')))
  sandboxes.push(base)
  const main = join(base, 'main')
  const wt = join(base, 'wt')
  mkdirSync(join(main, '.husky'), { recursive: true })
  writeFileSync(join(main, '.gitignore'), '.husky/_\n.gancho-corrio\n')
  // El gancho deja una marca en la raíz del árbol que comitea: así se VE si corrió.
  writeFileSync(join(main, '.husky', 'pre-commit'), 'echo corrio > .gancho-corrio\n')
  chmodSync(join(main, '.husky', 'pre-commit'), 0o755)
  git(base, 'init', '-q', '-b', 'main', main)
  git(main, 'config', 'user.email', 'test@example.invalid')
  git(main, 'config', 'user.name', 'check-hooks test')
  git(main, 'config', 'commit.gpgsign', 'false')
  git(main, 'add', '-A')
  git(main, 'commit', '-q', '-m', 'base')
  if (conGanchos) {
    generarHusky(main)
    git(main, 'config', 'core.hooksPath', '.husky/_')
  }
  git(main, 'worktree', 'add', '-q', wt, '-b', 'rama')
  return { base, main, wt }
}

/** Comitea en vacío y dice si el gancho corrió en ese árbol. */
function corre(arbol: string): boolean {
  const marca = join(arbol, '.gancho-corrio')
  rmSync(marca, { force: true })
  git(arbol, 'commit', '-q', '--allow-empty', '-m', 'prueba')
  return existsSync(marca)
}

describe('check:hooks contra un repositorio de verdad', { timeout: 60_000 }, () => {
  it('el incidente: con el valor relativo el worktree no corre ganchos, y la guarda lo nombra', () => {
    const { main, wt } = repo()
    // La premisa, medida aquí mismo: el principal sí, el worktree no.
    expect(corre(main)).toBe(true)
    expect(corre(wt)).toBe(false)

    const r = guarda(main)
    expect(r.status).toBe(1)
    expect(r.stdout).toContain(wt)
  })

  it('--fix fija el valor absoluto: el worktree pasa a correr los ganchos y el principal los sigue corriendo', () => {
    const { main, wt } = repo()
    const r = guarda(main, '--fix')
    expect(r.status).toBe(0)
    expect(valorComun(main).stdout.trim()).toBe(join(main, '.husky', '_'))
    expect(corre(wt)).toBe(true)
    expect(corre(main)).toBe(true)
  })

  it('sin ganchos instalados (CI, clon nuevo): no tiñe, lo dice, y --fix no instala nada', () => {
    const { main } = repo({ conGanchos: false })
    const r = guarda(main, '--fix')
    expect(r.status).toBe(0)
    // Dice que no miró nada, en vez de callar como cuando todo está bien.
    expect(r.stdout.trim()).not.toBe('')
    // Y no puso ningún valor: git sigue con sus ganchos por defecto.
    expect(valorComun(main).status).toBe(1)
  })

  it('--fix no apunta al principal si husky nunca corrió allí: el worktree que tenía ganchos los conserva', () => {
    const { main, wt } = repo({ conGanchos: false })
    // husky corrió sólo dentro del worktree: `.husky/_` existe ahí y en el
    // principal no, y el valor compartido quedó relativo.
    generarHusky(wt)
    git(main, 'config', 'core.hooksPath', '.husky/_')
    expect(corre(wt)).toBe(true)

    const r = guarda(wt, '--desde-gancho')
    expect(r.status).toBe(0)
    expect(valorComun(main).stdout.trim()).toBe('.husky/_')
    expect(corre(wt)).toBe(true)
    // Y fuera del gancho sigue en rojo: el valor relativo no se ha arreglado.
    expect(guarda(main, '--fix').status).toBe(1)
  })

  it('desde un gancho repara lo compartido y no bloquea, aunque otro worktree siga roto', () => {
    const { base, main, wt } = repo()
    // Un worktree roto por su cuenta: fijado en su config.worktree a un
    // directorio que no existe. Eso --fix no lo toca.
    git(main, 'config', 'extensions.worktreeConfig', 'true')
    git(wt, 'config', '--worktree', 'core.hooksPath', join(base, 'no-existe'))

    const r = guarda(main, '--desde-gancho')
    expect(r.status).toBe(0)
    expect(r.stdout).toContain(wt)
    expect(valorComun(main).stdout.trim()).toBe(join(main, '.husky', '_'))

    // Fuera del gancho, el mismo estado sí tiñe: es otro worktree, pero no corre ganchos.
    expect(guarda(main).status).toBe(1)
  })

  it('desde un gancho, con todo en orden, no dice nada', () => {
    const { main } = repo()
    git(main, 'config', 'core.hooksPath', join(main, '.husky', '_'))
    const r = guarda(main, '--desde-gancho')
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('')
  })

  it('un directorio de ganchos que no pasa por husky tiñe: el guion correría sin sh -e', () => {
    const { main } = repo()
    // Lo que hace la app de escritorio con un worktree nuevo si core.hooksPath
    // no está puesto y existe `.husky/`.
    git(main, 'config', 'core.hooksPath', join(main, '.husky'))
    const r = guarda(main)
    expect(r.status).toBe(1)
    // Un 1 lo da también un script que revienta: el parte tiene que nombrar el gancho.
    expect(r.stdout).toContain('pre-commit')
  })
})
