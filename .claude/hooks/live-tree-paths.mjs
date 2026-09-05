/**
 * Moving the working tree while something else is writing it.
 *
 * This repo is not checked out on a quiet machine. Five launchd agents —
 * `scrape-ci-blocked`, `hallazgos`, `press-lab`, `auto-curate-promises`,
 * `review-sweep` — run against THIS working tree on their own schedule, write
 * `public/data/`, and finish with their own `git commit` + `git push origin
 * main`. A tree-moving git command is therefore not a local operation here: it
 * is a write to something another process is holding open.
 *
 * ## The incident this encodes (2026-09-05)
 *
 * To A/B whether a new speaker map changed any published attribution, I ran
 * `git stash push -- pleno-speaker-map/1sqj7is.json`, checked, and popped. The
 * command timed out into the background, so the file sat at its HEAD version
 * from 09:43 to 09:54. At 09:47, inside that window, the `hallazgos` agent
 * started `extract:speaker-map 1sqj7is` — which RESUMES from the file on disk.
 * It read the stashed-away version and resumed from the wrong checkpoint:
 *
 *     lo que debía leer   655 segmentos · 4 filas · 20,9 % de cobertura
 *     lo que leyó (HEAD)  299 segmentos · 0 filas ·  6,5 %
 *
 * Two things were lost, and the second is the worse one. The extractor spent
 * its call budget redoing work. And the measurement itself was garbage: the
 * «before» and «after» runs straddled a live rewrite, so the numbers I reported
 * described the cron's progress, not the map's effect — I read a 9-claim
 * movement that a proper per-claim measurement then showed did not exist.
 *
 * ## What this hook is actually for
 *
 * Not «git stash is bad». It is a speed bump on the class of command whose
 * safety depends on something the operator cannot see — whether the fleet is
 * awake — carrying the question that would have caught it: **is anything
 * writing this tree right now, and does it resume from disk?**
 *
 * DERIVED, never a hand-kept list. It asks the process table which of this
 * repo's scripts are running, so a new agent is covered the day it is added and
 * a retired one stops firing on its own. A hand-written roster inside a control
 * against stale state goes stale itself, which is the joke this repo has
 * already told twice (see `build:prose-map`).
 *
 * And it fires ONLY while an agent is actually up. That is what keeps it from
 * becoming the reminder everybody switches off: on a quiet tree these commands
 * are exactly as safe as they look, and the hook says nothing.
 *
 * `ask`, never `deny`: every one of these is legitimate, and sometimes moving
 * the tree is precisely the job. The point is that the stakes are visible
 * before, not after.
 */
import { execFileSync } from 'node:child_process'

/** Sub-órdenes de git que MUEVEN el árbol de trabajo. */
export const MUEVEN_EL_ARBOL = [
  'stash',
  'checkout',
  'switch',
  'restore',
  'reset',
  'clean',
  'rebase',
  'merge',
  'pull',
  'cherry-pick',
  'revert',
]

/**
 * Y la que no mueve el árbol pero compite igual: los cinco agentes terminan en
 * `git push origin main`, así que empujar mientras uno corre es la carrera que
 * deja un non-fast-forward — y un rebase atascado se salta los cinco en
 * silencio sin que ninguna de las guardas del parte lo vea.
 */
export const COMPITE_AL_EMPUJAR = ['push']

/**
 * Los guiones de este repositorio que están corriendo AHORA.
 *
 * Se pregunta a la tabla de procesos, no a una lista. `pgrep` puede no existir
 * o fallar; si no se puede saber, se devuelve vacío y el gancho calla — una
 * guarda que no ha podido comprobar nada no debe inventarse una alarma, igual
 * que no debe inventarse un visto bueno.
 */
export function agentesEnMarcha(raiz = process.env.CLAUDE_PROJECT_DIR || process.cwd()) {
  let salida = ''
  try {
    salida = execFileSync('pgrep', ['-fl', `${raiz}/scripts/`], {
      encoding: 'utf8',
      timeout: 2000,
    })
  } catch {
    return [] // sin coincidencias (pgrep sale 1) o sin pgrep: no se juzga
  }
  const vistos = new Map()
  for (const linea of salida.split('\n')) {
    const m = linea.match(/([^/\s]+\.(?:sh|ts))\b/)
    if (!m) continue
    const pid = linea.trim().split(/\s+/)[0]
    if (!vistos.has(m[1])) vistos.set(m[1], pid)
  }
  return [...vistos].map(([script, pid]) => ({ script, pid }))
}

/** ¿Invoca este comando `git <sub>` en alguna de sus cláusulas? */
function invocaGit(command, subs) {
  return command
    .split(/[;&|\n]+/)
    .some((clause) => subs.some((s) => new RegExp(`\\bgit\\s+(-\\S+\\s+)*${s}\\b`).test(clause)))
}

export function decideLiveTreeBash(command, listar = agentesEnMarcha) {
  if (!command) return null
  const cmd = String(command)
  const mueve = invocaGit(cmd, MUEVEN_EL_ARBOL)
  const empuja = invocaGit(cmd, COMPITE_AL_EMPUJAR)
  if (!mueve && !empuja) return null

  // El proceso se consulta AL FINAL, que es lo que hace barato el caso normal:
  // con un comando que no toca el árbol no se paga ni un `pgrep`.
  const agentes = listar()
  if (agentes.length === 0) return null

  const quienes = agentes.map((a) => `  · ${a.script} (pid ${a.pid})`).join('\n')
  const cabecera =
    `Hay ${agentes.length} guion(es) de este repositorio corriendo AHORA sobre este mismo ` +
    `árbol de trabajo:\n${quienes}\n\n`

  if (mueve) {
    return {
      decision: 'ask',
      reason:
        cabecera +
        'Este comando MUEVE el árbol, y esos procesos escriben `public/data/` mientras tanto. ' +
        'El 5-09-2026 un `git stash` de doce minutos sobre un mapa de voces hizo que el ' +
        'extractor de esa misma sesión —que reanuda desde el fichero en disco— retomara ' +
        'desde 299 segmentos en vez de 655, y dejó la medición que justificaba el stash sin ' +
        'valor: las dos mitades del antes/después cayeron a lados distintos de una ' +
        'reescritura viva.\n\n' +
        'Para COMPARAR dos versiones no muevas el árbol:\n' +
        '  git show HEAD:<ruta> > /tmp/antes.json   # la comiteada\n' +
        '  cp <ruta> /tmp/ahora.json                # la del árbol\n\n' +
        'Si de verdad hay que mover el árbol, espera a que terminen o párales tú a ' +
        'sabiendas. Aprobar y seguir es correcto cuando el comando no toca nada que ellos ' +
        'escriban.',
    }
  }
  return {
    decision: 'ask',
    reason:
      cabecera +
      'Los agentes terminan en su propio `git push origin main`. Empujar ahora puede dejarles ' +
      'un non-fast-forward, y un rebase atascado se salta los cinco EN SILENCIO sin que las ' +
      'guardas del parte lo vean.\n\n' +
      'Suele bastar con esperar: comitean y empujan lo suyo solos.',
  }
}
