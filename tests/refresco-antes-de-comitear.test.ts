import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_GRAPH } from '../src/scraper/data-graph'

/**
 * Quien publica la salida de un nodo derivado, rederiva antes de comitear.
 *
 * `refresh` reconstruye los `derived`, pero sólo si alguien lo ejecuta. Una
 * tubería que reescribe la salida de un derivado y comitea sin rederivar
 * publica ese fichero sin su `builtFrom`, y el árbol queda en un estado que su
 * propia suite llama roto.
 *
 * Medido el 2026-09-03 sobre el historial: TODOS los commits de press-lab
 * dejan `press-trust.json` sin `builtFrom` —516a8985, 2be4ab02—, mientras que
 * los de cualquier otra procedencia lo llevan.
 *
 * Lo que lo hacía invisible es que nadie miraba. `e2e.yml` ignora
 * `public/data/**`, así que un commit de datos no dispara CI, y `npm test`
 * sólo corre en la nocturna — donde `scrape-all.sh` ejecuta `refresh` ANTES de
 * los tests y barre el estropicio. El rojo sólo lo veía quien trabajaba en
 * local, o quien abría un PR de código sobre un main envenenado. Y como la
 * puerta de salud de la nocturna bloquea el despliegue si `npm test` falla,
 * esto era un bloqueo de despliegue latente que otro guión venía tapando.
 *
 * La regla se calcula sobre el GRAFO, no sobre una lista escrita a mano: una
 * tubería nueva, o un nodo que cambie de tier, quedan cubiertos solos. Y
 * distingue las dos cosas que no son iguales:
 *
 *   escribe la SALIDA de un derivado  → tiene que rederivar (la publica ella)
 *   escribe una ENTRADA de un derivado → no; lo rederiva la nocturna, que es
 *                                        la división que `pull-quejas.yml`
 *                                        documenta al programarse a las 04:00
 *                                        «before the scrape cron at 04:30»
 *
 * Sin esa distinción la regla pediría a los dos `auto-curate` que rederivaran,
 * y eso sería peor: su pathspec es UN fichero a propósito —para no barrer el
 * trabajo de otros crons— así que `refresh` les dejaría los derivados
 * reconstruidos fuera del commit, sucios en el árbol.
 */
const ROOT = join(__dirname, '..')
const SCRIPTS = join(ROOT, 'scripts')

/** El ayudante de commit que comparten las tuberías de cron. */
const AYUDANTE = 'cron_git_commit_pathspec'

interface NodoDerivado {
  id: string
  script?: string
  command?: string
}
const DERIVADOS = DATA_GRAPH.filter((n) => n.tier === 'derived') as unknown as NodoDerivado[]

function rederiva(cuerpo: string): boolean {
  return /npm run refresh\b/.test(cuerpo)
}

/** Qué salidas de nodos derivados reescribe esta tubería. */
function derivadosQueEscribe(cuerpo: string): string[] {
  return DERIVADOS.filter((n) => {
    if (n.script && cuerpo.includes(n.script)) return true
    const alias = n.command?.replace(/^npm run /, '')
    return Boolean(alias && cuerpo.includes(alias))
  }).map((n) => n.id)
}

const tuberias = readdirSync(SCRIPTS)
  .filter((f) => f.endsWith('.sh'))
  .map((f) => ({ f, cuerpo: readFileSync(join(SCRIPTS, f), 'utf8') }))
  .filter(({ cuerpo }) => cuerpo.includes(AYUDANTE))
  .map(({ f, cuerpo }) => ({ f, cuerpo, escribe: derivadosQueEscribe(cuerpo) }))

describe('quien publica un derivado rederiva antes de comitear', () => {
  it('hay tuberías de las que hablar', () => {
    // Sin esto, un glob roto dejaría el bucle vacío y la prueba verde sin
    // haber mirado un solo guión: DATA_INTEGRITY §2.
    expect(tuberias.length).toBeGreaterThanOrEqual(4)
  })

  it('el clasificador separa los dos casos, no contesta lo mismo a todo', () => {
    // Un clasificador que dijera «escribe derivados» de todas las tuberías
    // haría la regla trivialmente exigente; uno que no lo dijera de ninguna la
    // haría vacía. Las dos formas de estar roto se ven aquí.
    const conDerivado = tuberias.filter((t) => t.escribe.length > 0)
    const sinDerivado = tuberias.filter((t) => t.escribe.length === 0)
    expect(conDerivado.length, 'ninguna tubería clasificada como productora').toBeGreaterThan(0)
    expect(sinDerivado.length, 'todas clasificadas como productoras').toBeGreaterThan(0)
  })

  it('el emparejador de refresh sabe decir que NO', () => {
    expect(rederiva('#!/usr/bin/env bash\nnpm run auto-curate\ngit commit -m x\n')).toBe(false)
    expect(rederiva('npm run refresh || true')).toBe(true)
  })

  for (const { f, cuerpo, escribe } of tuberias) {
    if (escribe.length === 0) continue
    it(`${f} rederiva (publica ${escribe.join(', ')})`, () => {
      expect(
        rederiva(cuerpo),
        `${f} reescribe y comitea la salida de ${escribe.join(', ')} sin ejecutar ` +
          `\`npm run refresh\`, así que la publica sin builtFrom. El rojo no aparece hasta ` +
          `que alguien corre npm test en local o la nocturna llega a su puerta de salud.`,
      ).toBe(true)
    })
  }
})
