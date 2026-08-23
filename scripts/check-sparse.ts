#!/usr/bin/env tsx
/**
 * ¿Está este repositorio podado por un `sparse-checkout` que nadie pidió?
 *
 *   npm run check:sparse
 *   npm run check:sparse -- --fix       apaga el esparcido de ESTE worktree y
 *                                       devuelve sus ficheros
 *   npm run check:sparse -- --fix-all   lo mismo en TODOS los worktrees del
 *                                       repositorio, el principal incluido
 *
 * `--fix-all` existe porque cada worktree vive en su rama, y una rama vieja no
 * trae este script: ir a cada uno a ejecutarlo no sirve cuando el remedio acaba
 * de nacer en `main`. Desde el checkout principal, uno solo.
 *
 * Sale 1 cuando hay poda ACTIVA, que es cuando faltan ficheros del disco. Los
 * restos de un esparcido ya apagado se informan y no tiñen: no ocultan nada,
 * pero son la huella de que esto volvió a pasar.
 *
 * El porqué, el origen medido y la reproducción están en
 * `src/scraper/sparse-guard.ts`. En una línea: este proyecto se clona entero y
 * no usa sparse-checkout en ningún sitio, así que cualquier patrón es ajeno — y
 * uno de ellos se llevó `docs/` entero del disco sin que `git status` dijera
 * nada, porque para git no faltaba nada.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  clasificar,
  contarOcultos,
  esparcidoActivoEnConfig,
  patronesUtiles,
  raizDesdeGitdir,
  tine,
  type EstadoWorktree,
} from '../src/scraper/sparse-guard'

const git = (args: string[]): string => {
  try {
    return execFileSync('git', args, { encoding: 'utf8' })
  } catch {
    return ''
  }
}

const arreglarTodo = process.argv.includes('--fix-all')
const arreglar = process.argv.includes('--fix') || arreglarTodo
const out = (s = '') => process.stdout.write(`${s}\n`)

/**
 * Repara TODOS los worktrees del repositorio, no sólo aquel desde el que se
 * lanza esto.
 *
 * Hace falta porque los worktrees viven en ramas propias, y una rama vieja no
 * trae este script: ir a cada uno a ejecutarlo no es una opción cuando el
 * remedio acaba de nacer en `main`. Desde el checkout principal, uno solo.
 *
 * Tocar el árbol de otra sesión es seguro EN ESTA DIRECCIÓN y sólo en ésta:
 * `sparse-checkout disable` únicamente puede DEVOLVER ficheros. En el peor caso
 * materializa lo que estaba escondido, que es exactamente lo que se busca.
 */
function repararTodos(comun: string, git: (a: string[]) => string): number {
  const dirW = resolve(comun, 'worktrees')
  // El worktree principal no está en `worktrees/`: es el repositorio mismo, con
  // su patrón en `<gitdir común>/info/sparse-checkout`. Dejarlo fuera sería que
  // `--fix-all` no arreglase justamente donde más se trabaja.
  const objetivos: Array<{ nombre: string; raiz: string | null; patron: string }> = [
    {
      nombre: '(principal)',
      raiz: raizDesdeGitdir(`${comun}/.git`) ?? dirname(comun),
      patron: resolve(comun, 'info/sparse-checkout'),
    },
  ]
  if (existsSync(dirW)) {
    for (const n of readdirSync(dirW)) {
      const gd = resolve(dirW, n, 'gitdir')
      objetivos.push({
        nombre: n,
        raiz: existsSync(gd) ? raizDesdeGitdir(readFileSync(gd, 'utf8')) : null,
        patron: resolve(dirW, n, 'info/sparse-checkout'),
      })
    }
  }

  let malos = 0
  let tocados = 0
  for (const o of objetivos) {
    const hayPatron = existsSync(o.patron)
    // La bandera SIN patrón es el estado más dañado que existe, no el más
    // benigno: medido, un `reapply` así deja el árbol en un solo fichero,
    // porque en modo cono «sin patrones» es «no encaja nada». Mirar sólo el
    // fichero de patrones se saltaría justo al peor herido — lo enseñó el
    // tercer worktree del repo de pruebas, que quedó en ese estado al comprobar
    // el orden de la reparación.
    const bandera =
      o.raiz && existsSync(o.raiz)
        ? git(['-C', o.raiz, 'config', '--get', 'core.sparseCheckout']).trim() === 'true'
        : false
    if (!hayPatron && !bandera) continue
    tocados++
    if (!o.raiz || !existsSync(o.raiz)) {
      out(`  · ${o.nombre} — SALTADO: no encuentro su árbol en disco (${o.raiz ?? 'sin gitdir'})`)
      malos++
      continue
    }
    const antes = contarOcultos(git(['-C', o.raiz, 'ls-files', '-v']))
    // ORDEN, y está medido: apagar y LUEGO borrar. Ver ORDEN_REPARACION.
    git(['-C', o.raiz, 'sparse-checkout', 'disable'])
    rmSync(o.patron, { force: true })
    const despues = contarOcultos(git(['-C', o.raiz, 'ls-files', '-v']))
    if (despues === 0 && !existsSync(o.patron)) {
      out(`  · ${o.nombre} — limpio${antes > 0 ? ` · ${antes} fichero(s) devuelto(s)` : ''}`)
    } else {
      out(`  · ${o.nombre} — NO limpio: quedan ${despues} oculto(s). Míralo a mano.`)
      malos++
    }
  }
  if (tocados === 0) out('  no había ningún worktree con patrón ajeno.')
  return malos
}

function main() {
  const gitDir = git(['rev-parse', '--git-dir']).trim()
  const comun = git(['rev-parse', '--git-common-dir']).trim()
  if (!gitDir) {
    out('[sparse] no estamos en un repositorio git — nada que mirar')
    return
  }

  if (arreglarTodo) {
    out('[sparse] reparando TODOS los worktrees de este repositorio')
    const malos = repararTodos(comun, git)
    if (malos > 0) process.exit(1)
    return
  }

  const activo = git(['config', '--get', 'core.sparseCheckout']).trim() === 'true'
  const fichero = resolve(gitDir, 'info/sparse-checkout')
  const patrones = existsSync(fichero) ? patronesUtiles(readFileSync(fichero, 'utf8')) : []
  const estado: EstadoWorktree = {
    ruta: git(['rev-parse', '--show-toplevel']).trim() || '.',
    activo,
    patrones,
    ocultos: activo ? contarOcultos(git(['ls-files', '-v'])) : 0,
  }

  const desenlace = clasificar(estado)

  // Los otros worktrees se miran sólo por sus RESTOS, sin ejecutar git dentro:
  // un fichero de patrones es evidencia suficiente y no hay que tocar el árbol
  // de nadie para verlo. Se calcula ANTES de decidir si callarse — la primera
  // versión salía antes de llegar aquí y enmudecía con dos worktrees todavía
  // marcados, que es la avería que esta guarda existe para no tener.
  const dirWorktrees = resolve(comun, 'worktrees')
  const otros = existsSync(dirWorktrees)
    ? readdirSync(dirWorktrees)
        .filter((w) => existsSync(resolve(dirWorktrees, w, 'info/sparse-checkout')))
        .map((w) => {
          const cfg = resolve(dirWorktrees, w, 'config.worktree')
          const cebado = existsSync(cfg) && esparcidoActivoEnConfig(readFileSync(cfg, 'utf8'))
          return { nombre: w, cebado }
        })
    : []
  const conRestos = otros.map((o) => o.nombre)
  const cebados = otros.filter((o) => o.cebado).map((o) => o.nombre)

  // Callada cuando no hay NADA que decir, aquí ni en ningún worktree.
  //
  // Va en el pre-commit, o sea en CADA commit. Un parte de dos líneas por
  // commit para decir «todo bien» es exactamente cómo una guarda se gana que
  // la dejen de leer — el mismo razonamiento del tope de 180 s del pre-push.
  // Habla cuando hay resto o poda, y el resto se calla en cuanto pasas `--fix`,
  // que borra el patrón además de apagarlo. Así el ruido tiene final.
  if (desenlace === 'limpio' && conRestos.length === 0 && !arreglar) return

  out(`[sparse] ${estado.ruta}`)
  out(
    `  ${desenlace}${estado.patrones.length ? ` · patrón ajeno: ${estado.patrones.join(', ')}` : ''}`,
  )

  if (desenlace === 'restos' && arreglar) {
    rmSync(fichero, { force: true })
    out('  → patrón borrado. Apagarlo no bastaba: seguía ahí, listo para reaplicarse.')
  }

  if (desenlace === 'podando') {
    // El número es el parte. «Esparcido: sí» no dice si falta un fichero o
    // cuatro mil, y esa diferencia es justo la que separa una curiosidad de una
    // pérdida de datos.
    out(`  ${estado.ocultos} fichero(s) rastreado(s) OCULTOS del árbol de trabajo.`)
    out('  `git status` no los echa en falta: para git no faltan.')
    if (arreglar) {
      git(['sparse-checkout', 'disable'])
      rmSync(fichero, { force: true })
      const quedan = contarOcultos(git(['ls-files', '-v']))
      out(`  → apagado y patrón borrado. Ocultos ahora: ${quedan}.`)
      if (quedan > 0) {
        out('  NO se recuperaron todos: revísalo a mano antes de seguir.')
        process.exit(1)
      }
      return
    }
    out('  Devuélvelos con: npm run check:sparse -- --fix')
  }

  if (conRestos.length > 0) {
    out('')
    out(`  ⓘ ${conRestos.length} worktree(s) con patrón ajeno: ${conRestos.join(', ')}`)
    // «Resto» y «cebado» no son lo mismo, y confundirlos ya costó un informe
    // equivocado: un cebado tiene la bandera PUESTA y sólo le falta que git
    // reaplique para podar. Se nombra aparte.
    if (cebados.length > 0) {
      out(`      De ésos, CEBADOS (sparseCheckout = true): ${cebados.join(', ')}`)
      out('      No están podados todavía; lo estarán en cuanto git reaplique ahí.')
    }
    out('      Apagado no es borrado: el patrón sigue ahí y puede volver a aplicarse.')
    out('      Se limpian TODOS de una vez con: npm run check:sparse -- --fix-all')
    out('      Origen medido: la fuente `git-subdir` del plugin stripe (providers/claude/plugin).')
  }

  if (tine([estado])) process.exit(1)
}

main()
