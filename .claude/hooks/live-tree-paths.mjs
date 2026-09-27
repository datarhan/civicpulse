/**
 * Moving the working tree while something else is writing it.
 *
 * This repo is not checked out on a quiet machine. Five launchd agents —
 * `scrape-ci-blocked`, `hallazgos`, `press-lab`, `auto-curate-promises`,
 * `review-sweep` — run against THIS working tree on their own schedule. The
 * first four write `public/data/` and finish with their own `git commit` +
 * `git push origin main`; `review-sweep` is report-only and commits nothing,
 * but it builds and reads whatever the tree holds while it runs. A tree-moving
 * git command is therefore not a local operation here: it is a write to
 * something another process is holding open.
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
 * On macOS only. BSD `pgrep -fl` prints each match's full command line, which
 * is what the script-name regex in `agentesEnMarcha` reads. procps `pgrep` on
 * Linux prints only the process name under `-l` (`bash`, `node`; the full line
 * is `-a`, which on macOS means something else), so nothing matches and the
 * hook never fires there. The agents are launchd jobs, so today that costs
 * nothing — but on Linux its silence says nothing about the fleet.
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
import { realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { inicioDeOrden, nombreDe, ordenes, subordenGit } from './shell-tokens.mjs'

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
 * Y la que no mueve el árbol pero compite igual: cuatro de los cinco agentes
 * terminan en `git push origin main` (`review-sweep` no empuja), así que
 * empujar mientras uno corre es la carrera que deja un non-fast-forward — y un
 * rebase atascado se salta los cinco en silencio sin que ninguna de las guardas
 * del parte lo vea.
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

/**
 * Qué hace de verdad una sub-orden con el árbol: `mueve`, `empuja` o nada.
 *
 * No basta con el nombre. Reproducido sobre los transcritos (27-09-2026), con
 * la flota despierta esto habría preguntado 460 veces por mover el árbol y unas
 * 160 no movían nada: `git stash list` y `show` leen, y `git checkout -b nueva`
 * sin punto de partida crea la rama donde ya estás sin tocar un fichero. Con un
 * punto de partida (`-b nueva origin/main`) sí lo mueve.
 */
function efectoGit({ sub, resto }) {
  if (COMPITE_AL_EMPUJAR.includes(sub)) return 'empuja'
  if (!MUEVEN_EL_ARBOL.includes(sub)) return null
  if (sub === 'stash' && (resto[0] === 'list' || resto[0] === 'show')) return null
  const creaRama =
    (sub === 'checkout' && resto.some((a) => a === '-b' || a === '-B' || a === '--orphan')) ||
    (sub === 'switch' && resto.some((a) => /^(?:-c|-C|--create|--force-create)$/.test(a)))
  if (creaRama && resto.filter((a) => !a.startsWith('-')).length <= 1) return null
  return 'mueve'
}

/**
 * Las sub-órdenes de git que la orden EJECUTA — troceada, no leída con una
 * regex: así `git merge-base` no casa con `merge`, las opciones globales
 * (`git -C ruta stash`) no esconden la sub-orden, y el mensaje de un commit o el
 * cuerpo de un heredoc que dicen «git stash» son texto.
 *
 * Con `cwd`, dice además SOBRE QUÉ DIRECTORIO actúa cada una, siguiendo los
 * `cd` y el `-C` de la propia orden y las variables que ella misma asigna
 * (`M=/ruta; git -C "$M" …`). `dir: null` es «no se sabe».
 */
function efectosDe(command, cwd) {
  const efectos = []
  const vars = new Map()
  let dir = cwd ?? null
  const expande = (texto) => {
    const t = String(texto)
      .replace(/^~(?=\/|$)/, process.env.HOME ?? '~')
      .replace(/\$\{?([A-Za-z_]\w*)\}?/g, (m, n) => (vars.has(n) ? vars.get(n) : m))
    return /[$`~]/.test(t) ? null : t
  }
  const bajo = (base, destino) => (base == null || destino == null ? null : resolve(base, destino))

  for (const o of ordenes(String(command))) {
    for (const t of o.palabras) {
      const m = !t.opaco && /^([A-Za-z_]\w*)=(.*)$/s.exec(t.texto)
      if (!m) break
      vars.set(m[1], m[2])
    }
    const i = inicioDeOrden(o.palabras)
    if (i < 0) continue
    const nombre = nombreDe(o.palabras[i])
    const args = o.palabras.slice(i + 1).map((t) => t.texto)
    if (nombre === 'cd') {
      const a = args.find((x) => !x.startsWith('-') || x === '-')
      dir = a === undefined ? (process.env.HOME ?? null) : a === '-' ? null : bajo(dir, expande(a))
      continue
    }
    if (nombre !== 'git') continue
    const g = subordenGit(args)
    const efecto = g && efectoGit(g)
    if (!efecto) continue
    efectos.push({ efecto, resto: g.resto, dir: g.dir == null ? dir : bajo(dir, expande(g.dir)) })
  }
  return efectos
}

/**
 * Los árboles de verdad: el checkout PRINCIPAL —el que tiene el `.git` común,
 * que es donde launchd lanza a los agentes— y, para un directorio, la raíz del
 * árbol de trabajo que lo contiene. Sólo se pregunta cuando ya hay un git que
 * mueve o empuja, así que el caso normal no paga ni un `git`.
 */
export function arbolesReales(cwd = process.cwd()) {
  const git = (dir, ...args) => {
    try {
      const out = execFileSync('git', ['-C', dir, ...args], {
        encoding: 'utf8',
        timeout: 2000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      return out ? realpathSync(out) : null
    } catch {
      return null
    }
  }
  const comun = git(cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir')
  return {
    principal: comun ? dirname(comun) : null,
    cwd,
    de: (abs) => git(abs, 'rev-parse', '--show-toplevel'),
  }
}

export function decideLiveTreeBash(command, listar = agentesEnMarcha, arboles = arbolesReales) {
  if (!command) return null
  // Barato primero: sin un git que mueva o empuje no se pregunta a nadie.
  if (efectosDe(command).length === 0) return null

  // Qué árbol toca cada una. Los agentes escriben el PRINCIPAL: mover un
  // worktree no les toca nada, y empujar una rama no compite con su
  // `git push origin main`. Lo que no se puede saber cuenta como que sí toca.
  const { principal, cwd, de } = arboles()
  const efectos = efectosDe(command, cwd)
  const tocaPrincipal = (e) => principal == null || e.dir == null || de(e.dir) === principal
  const mueve = efectos.some((e) => e.efecto === 'mueve' && tocaPrincipal(e))
  const empuja = efectos.some(
    (e) =>
      e.efecto === 'empuja' &&
      (tocaPrincipal(e) || e.resto.some((a) => /(?:^|[:/+])main$/.test(a))),
  )
  if (!mueve && !empuja) return null

  // El proceso se consulta AL FINAL, que es lo que hace barato el caso normal:
  // con un comando que no toca el árbol no se paga ni un `pgrep`. Y se busca en
  // el principal, no en `CLAUDE_PROJECT_DIR`: en una sesión de worktree ése es
  // el worktree, donde no corre ningún agente, y la guarda callaba siempre.
  const agentes = principal ? listar(principal) : listar()
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
      // La razón de un `ask` sólo la ve quien aprueba; la alternativa es para el modelo.
      context:
        `Scripts of this repository are running against its main checkout right now ` +
        `(${agentes.map((a) => a.script).join(', ')}). They write public/data/ and some resume ` +
        `from files on disk, so a git command that moves the tree changes files under them. ` +
        `Comparing two versions does not need the tree to move: ` +
        `git show HEAD:<path> > /tmp/before.json and cp <path> /tmp/after.json.`,
    }
  }
  return {
    decision: 'ask',
    reason:
      cabecera +
      'Los agentes que publican —todos menos `review-sweep`— terminan en su propio ' +
      '`git push origin main`. Empujar ahora puede dejarles ' +
      'un non-fast-forward, y un rebase atascado se salta los cinco EN SILENCIO sin que las ' +
      'guardas del parte lo vean.\n\n' +
      'Suele bastar con esperar: comitean y empujan lo suyo solos.',
    context:
      `Scripts of this repository are running right now ` +
      `(${agentes.map((a) => a.script).join(', ')}). The ones that publish end with their own ` +
      `git push origin main, so a push now can race them into a non-fast-forward.`,
  }
}
