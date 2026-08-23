#!/usr/bin/env tsx
/**
 * ¿Está este repositorio podado por un `sparse-checkout` que nadie pidió?
 *
 *   npm run check:sparse
 *   npm run check:sparse -- --fix     apaga el esparcido y devuelve los ficheros
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
import { resolve } from 'node:path'
import {
  clasificar,
  contarOcultos,
  patronesUtiles,
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

const arreglar = process.argv.includes('--fix')
const out = (s = '') => process.stdout.write(`${s}\n`)

function main() {
  const gitDir = git(['rev-parse', '--git-dir']).trim()
  const comun = git(['rev-parse', '--git-common-dir']).trim()
  if (!gitDir) {
    out('[sparse] no estamos en un repositorio git — nada que mirar')
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
  const conRestos = existsSync(dirWorktrees)
    ? readdirSync(dirWorktrees).filter((w) =>
        existsSync(resolve(dirWorktrees, w, 'info/sparse-checkout')),
      )
    : []

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
    out(
      `  ⓘ ${conRestos.length} worktree(s) con fichero de patrones ajeno: ${conRestos.join(', ')}`,
    )
    out('      Apagado no es borrado: el patrón sigue ahí y puede volver a aplicarse.')
    out('      Se limpia con `--fix` DESDE cada uno: esto no toca el .git de otro worktree.')
    out('      Origen medido: la fuente `git-subdir` del plugin stripe (providers/claude/plugin).')
  }

  if (tine([estado])) process.exit(1)
}

main()
