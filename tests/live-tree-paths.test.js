import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
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

describe('guard: mover el árbol mientras otro lo escribe', () => {
  // 5-09-2026: `git stash push -- pleno-speaker-map/1sqj7is.json` durante doce
  // minutos hizo que el extractor de esa sesión —que reanuda desde disco—
  // retomara desde 299 segmentos en vez de 655, y dejó sin valor la medición
  // que el stash servía: el antes y el después cayeron a lados distintos de una
  // reescritura viva.
  it('pregunta por el comando exacto del incidente', () => {
    const v = decideLiveTreeBash('git stash push -- pleno-speaker-map/1sqj7is.json', conAgentes)
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
    expect(decideLiveTreeBash('git stash push -- public/data/x.json', sinAgentes)).toBeNull()
    for (const sub of MUEVEN_EL_ARBOL) {
      expect(decideLiveTreeBash(`git ${sub}`, sinAgentes), sub).toBeNull()
    }
  })

  it('cubre todas las sub-órdenes que mueven el árbol', () => {
    for (const sub of MUEVEN_EL_ARBOL) {
      expect(decideLiveTreeBash(`git ${sub} algo`, conAgentes)?.decision, sub).toBe('ask')
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
      expect(decideLiveTreeBash(cmd, conAgentes), cmd).toBeNull()
    }
  })

  it('empujar avisa por OTRO motivo: los agentes empujan lo suyo', () => {
    const v = decideLiveTreeBash('git push origin main', conAgentes)
    expect(v?.decision).toBe('ask')
    expect(v.reason).toContain('non-fast-forward')
    // Y no se le cuela el consejo del caso de mover el árbol.
    expect(v.reason).not.toContain('git show HEAD:<ruta>')
    expect(COMPITE_AL_EMPUJAR).toContain('push')
  })

  it('lo pilla dentro de una cadena de comandos', () => {
    expect(decideLiveTreeBash('cd /tmp && git checkout main', conAgentes)?.decision).toBe('ask')
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
