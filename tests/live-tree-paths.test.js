import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  decideLiveTreeBash,
  agentesEnMarcha,
  MUEVEN_EL_ARBOL,
  COMPITE_AL_EMPUJAR,
} from '../.claude/hooks/live-tree-paths.mjs'

const HOOK = resolve(__dirname, '../.claude/hooks/guard-curated-writes.mjs')
const run = (payload) => {
  const out = execFileSync('node', [HOOK], { input: JSON.stringify(payload), encoding: 'utf8' })
  return out.trim() ? JSON.parse(out).hookSpecificOutput : null
}

/** La flota, inyectada: una prueba no puede depender de qué corra hoy. */
const conAgentes = () => [{ script: 'hallazgos-pipeline.sh', pid: '4270' }]
const sinAgentes = () => []

/**
 * Y los árboles, inyectados: el principal —donde corren los agentes de
 * launchd— y un worktree. Una prueba no puede depender de dónde se ejecute.
 */
const ARBOL = {
  principal: '/repo',
  cwd: '/repo/.claude/worktrees/wt',
  de: (abs) =>
    abs?.startsWith('/repo/.claude/worktrees/wt')
      ? '/repo/.claude/worktrees/wt'
      : abs?.startsWith('/repo')
        ? '/repo'
        : null,
}
const desdeWorktree = () => ARBOL
const enPrincipal = () => ({ ...ARBOL, cwd: '/repo' })

describe('guard: mover el árbol mientras otro lo escribe', () => {
  // 5-09-2026: `git stash push -- pleno-speaker-map/1sqj7is.json` durante doce
  // minutos hizo que el extractor de esa sesión —que reanuda desde disco—
  // retomara desde 299 segmentos en vez de 655, y dejó sin valor la medición
  // que el stash servía: el antes y el después cayeron a lados distintos de una
  // reescritura viva.
  it('pregunta por el comando exacto del incidente', () => {
    const v = decideLiveTreeBash(
      'git stash push -- pleno-speaker-map/1sqj7is.json',
      conAgentes,
      enPrincipal,
    )
    expect(v?.decision).toBe('ask')
    expect(v.reason).toContain('hallazgos-pipeline.sh')
    expect(v.reason).toContain('git show HEAD:<ruta>')
  })

  /**
   * EL CONTROL, y sin él todo lo de arriba pasaría con un gancho que dijera
   * «ask» siempre. En un árbol quieto estos comandos son exactamente tan
   * seguros como parecen, y una guarda que grita cuando no pasa nada acaba
   * apagada — que es la lección que este repositorio ya se cobró con
   * `remind-stale-copy`.
   */
  it('con la flota dormida no dice nada, ni siquiera del mismo comando', () => {
    expect(
      decideLiveTreeBash('git stash push -- public/data/x.json', sinAgentes, enPrincipal),
    ).toBeNull()
    for (const sub of MUEVEN_EL_ARBOL) {
      expect(decideLiveTreeBash(`git ${sub}`, sinAgentes, enPrincipal), sub).toBeNull()
    }
  })

  it('cubre todas las sub-órdenes que mueven el árbol', () => {
    for (const sub of MUEVEN_EL_ARBOL) {
      expect(decideLiveTreeBash(`git ${sub} algo`, conAgentes, enPrincipal)?.decision, sub).toBe(
        'ask',
      )
    }
  })

  /** Leer nunca mueve nada: si esto disparara, el gancho sería inservible. */
  it('deja pasar lo que sólo lee', () => {
    for (const cmd of [
      'git status --short',
      'git diff --stat',
      'git log --oneline -5',
      'git show HEAD:public/data/x.json',
      'npm test',
      'cp public/data/x.json /tmp/antes.json',
    ]) {
      expect(decideLiveTreeBash(cmd, conAgentes, enPrincipal), cmd).toBeNull()
    }
  })

  it('empujar avisa por OTRO motivo: los agentes empujan lo suyo', () => {
    const v = decideLiveTreeBash('git push origin main', conAgentes, enPrincipal)
    expect(v?.decision).toBe('ask')
    expect(v.reason).toContain('non-fast-forward')
    // Y no se le cuela el consejo del caso de mover el árbol.
    expect(v.reason).not.toContain('git show HEAD:<ruta>')
    expect(COMPITE_AL_EMPUJAR).toContain('push')
  })

  it('lo pilla dentro de una cadena de comandos', () => {
    expect(
      decideLiveTreeBash('npm test && git checkout main', conAgentes, enPrincipal)?.decision,
    ).toBe('ask')
    // y un `cd` fuera del repositorio ya no es este árbol: ahí git ni siquiera arranca
    expect(decideLiveTreeBash('cd /tmp && git checkout main', conAgentes, enPrincipal)).toBeNull()
  })

  /**
   * Si no se puede saber quién corre, se calla. Una guarda que no ha podido
   * comprobar nada no debe inventarse una alarma — ni un visto bueno.
   */
  it('sin poder mirar la tabla de procesos, no inventa', () => {
    expect(agentesEnMarcha('/definitivamente/no/existe')).toEqual([])
    expect(decideLiveTreeBash('git stash', () => agentesEnMarcha('/no/existe'))).toBeNull()
  })

  it('llega hasta el runner, que es quien lo ejecuta de verdad', () => {
    // Sin agentes vivos el runner calla; con ellos, el veredicto sale por él.
    // Se comprueba la vía, no el veredicto de hoy: `run` no puede inyectar.
    const v = run({ tool_name: 'Bash', tool_input: { command: 'git status' } })
    expect(v === null || v.permissionDecision !== undefined).toBe(true)
  })
})

/**
 * Lo que la reproducción sobre los transcritos encontró (27-09-2026): con la
 * flota despierta, esta guarda habría preguntado 460 veces por «mover el
 * árbol», y unas 160 no movían nada. `git merge-base` (46) casaba con `merge`
 * porque `\b` corta en el guion; `git stash list` y `show` (28) leen; y
 * `git checkout -b nueva` (85) crea una rama donde ya estás sin tocar un
 * fichero. Encima leía ÓRDENES dentro del TEXTO: el mensaje de un commit que
 * dijera «git stash» preguntaba igual.
 */
describe('guard: sólo pregunta por lo que de verdad mueve el árbol', () => {
  it('no pregunta por sub-órdenes que sólo leen', () => {
    for (const cmd of [
      'git merge-base HEAD origin/main',
      'git merge-base --is-ancestor bb31e06c main && echo sí',
      'git stash list | head -3',
      'git stash show -p stash@{0}',
    ]) {
      expect(decideLiveTreeBash(cmd, conAgentes, enPrincipal), cmd).toBeNull()
    }
  })

  it('crear una rama donde ya estás no mueve nada; crearla en otro sitio, sí', () => {
    expect(decideLiveTreeBash('git checkout -b nueva', conAgentes, enPrincipal)).toBeNull()
    expect(decideLiveTreeBash('git switch -c nueva', conAgentes, enPrincipal)).toBeNull()
    expect(
      decideLiveTreeBash('git checkout -b nueva origin/main', conAgentes, enPrincipal)?.decision,
    ).toBe('ask')
    expect(
      decideLiveTreeBash('git switch -c nueva origin/main', conAgentes, enPrincipal)?.decision,
    ).toBe('ask')
  })

  it('el TEXTO que nombra una orden no es la orden', () => {
    for (const cmd of [
      'git commit -m "para comparar, no hagas git stash"',
      "git commit -F - <<'EOF'\ngit stash pop\nEOF",
      'echo "git checkout main"',
    ]) {
      expect(decideLiveTreeBash(cmd, conAgentes, enPrincipal), cmd).toBeNull()
    }
  })

  it('las opciones globales no esconden la sub-orden', () => {
    expect(decideLiveTreeBash('git -C /repo stash', conAgentes, desdeWorktree)?.decision).toBe(
      'ask',
    )
    expect(
      decideLiveTreeBash('git -c core.pager=cat checkout main', conAgentes, enPrincipal)?.decision,
    ).toBe('ask')
  })

  it('le da al MODELO la alternativa, que la razón de un ask no le llega', () => {
    const v = decideLiveTreeBash('git stash push -- public/data/x.json', conAgentes, enPrincipal)
    expect(v.context).toContain('git show HEAD:')
    expect(v.context).toContain('hallazgos-pipeline.sh')
  })
})

/**
 * El árbol que la orden mueve, no el de la sesión.
 *
 * Los agentes corren en el checkout PRINCIPAL. La guarda los buscaba bajo
 * `CLAUDE_PROJECT_DIR`, que en una sesión de worktree es el worktree, donde no
 * corre ninguno: así que desde un worktree nunca preguntaba, ni siquiera por
 * `git -C "$MAIN" merge --ff-only origin/main`, que mueve el principal debajo
 * de la flota. La reproducción encontró una docena de órdenes así, varias
 * precedidas de un `pgrep` a mano porque la sesión sabía que la guarda no
 * miraba. Y al revés: un `git rebase` DENTRO del worktree no toca nada que los
 * agentes escriban, y no debe preguntar.
 */
describe('guard: el árbol que se mueve es el que decide', () => {
  it('dentro de un worktree, mover el worktree no toca a la flota', () => {
    expect(decideLiveTreeBash('git stash', conAgentes, desdeWorktree)).toBeNull()
    expect(decideLiveTreeBash('git rebase origin/main', conAgentes, desdeWorktree)).toBeNull()
  })

  it('desde un worktree, mover el PRINCIPAL sí pregunta', () => {
    for (const cmd of [
      'git -C /repo merge --ff-only origin/main',
      'M=/repo; git -C "$M" pull --ff-only origin main',
      'cd /repo && git stash',
    ]) {
      expect(decideLiveTreeBash(cmd, conAgentes, desdeWorktree)?.decision, cmd).toBe('ask')
    }
  })

  it('si no puede saber qué árbol es, pregunta', () => {
    expect(decideLiveTreeBash('git -C "$OTRO" stash', conAgentes, desdeWorktree)?.decision).toBe(
      'ask',
    )
  })

  it('empujar una rama desde un worktree no compite; empujar main, sí', () => {
    expect(decideLiveTreeBash('git push -u origin claude/x', conAgentes, desdeWorktree)).toBeNull()
    expect(decideLiveTreeBash('git push origin main', conAgentes, desdeWorktree)?.decision).toBe(
      'ask',
    )
    expect(
      decideLiveTreeBash('git push origin HEAD:main', conAgentes, desdeWorktree)?.decision,
    ).toBe('ask')
    expect(
      decideLiveTreeBash('git push origin +refs/heads/main', conAgentes, desdeWorktree)?.decision,
    ).toBe('ask')
  })

  it('en el principal, como siempre', () => {
    expect(decideLiveTreeBash('git stash', conAgentes, enPrincipal)?.decision).toBe('ask')
  })

  it('busca a los agentes en el checkout principal, no en el de la sesión', () => {
    let visto = null
    decideLiveTreeBash(
      'git -C /repo stash',
      (raiz) => ((visto = raiz), conAgentes()),
      desdeWorktree,
    )
    expect(visto).toBe('/repo')
  })
})

/**
 * Y que el runner los ejecute a TODOS.
 *
 * Un gancho que existe y nadie importa es exactamente el defecto que este
 * repositorio se encontró tres veces el 12-08-2026 —tres guardas escritas, sin
 * invocar— y no había nada que lo mirara para `.claude/hooks/`: `guard-audit`
 * audita las guardas que cuelgan de un script de npm, no éstas. Esta guarda
 * habría sido la cuarta.
 *
 * Se DERIVA de los dos lados: los ficheros que hay en la carpeta contra lo que
 * los runners registrados en settings.json llegan a importar. Nada que recitar.
 */
describe('todos los ganchos están enchufados', () => {
  const HOOKS = resolve(__dirname, '../.claude/hooks')
  const raiz = resolve(__dirname, '..')
  const settings = JSON.parse(readFileSync(resolve(raiz, '.claude/settings.json'), 'utf8'))

  /** Los .mjs que settings.json manda ejecutar, sea en el evento que sea. */
  const runners = [...JSON.stringify(settings).matchAll(/([\w-]+\.mjs)/g)].map((m) => m[1])

  /** Lo que un runner alcanza, siguiendo sus imports dentro de la carpeta. */
  const alcanzados = new Set()
  const seguir = (fichero) => {
    if (alcanzados.has(fichero)) return
    alcanzados.add(fichero)
    const src = readFileSync(resolve(HOOKS, fichero), 'utf8')
    for (const m of src.matchAll(/from\s+'\.\/([\w-]+\.mjs)'/g)) seguir(m[1])
  }

  it('mide algo: settings.json registra al menos un runner', () => {
    expect(runners.length).toBeGreaterThan(0)
    for (const r of runners) seguir(r)
  })

  it('ningún .mjs de .claude/hooks/ se queda sin ejecutar por nadie', () => {
    for (const r of runners) seguir(r)
    const enDisco = readdirSync(HOOKS).filter((f) => f.endsWith('.mjs'))
    const huerfanos = enDisco.filter((f) => !alcanzados.has(f))
    expect(huerfanos, `ganchos que nadie invoca: ${huerfanos.join(', ')}`).toEqual([])
  })

  it('ningún gancho corre sin techo de tiempo', () => {
    // Sin `timeout`, un gancho colgado espera el máximo de Claude Code — diez
    // minutos — delante de CADA escritura y cada orden de la sesión.
    const sinTecho = Object.entries(settings.hooks).flatMap(([evento, grupos]) =>
      grupos.flatMap((g) => g.hooks.filter((h) => !(h.timeout > 0)).map(() => evento)),
    )
    expect(sinTecho).toEqual([])
  })

  it('y éste en concreto llega desde el runner', () => {
    for (const r of runners) seguir(r)
    expect(alcanzados.has('live-tree-paths.mjs')).toBe(true)
  })
})
