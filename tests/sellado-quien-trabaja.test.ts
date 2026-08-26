import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_GRAPH } from '../src/scraper/data-graph'

/**
 * ¿Puede alguien sellar los nodos que `refresh` no reconstruye?
 *
 * `refresh` ejecuta los `derived` y nunca los `llm` ni los `curated` — ése es
 * el contrato entero: nada automático reescribe prosa publicada. La
 * consecuencia es que su procedencia la tiene que sellar QUIEN HIZO EL TRABAJO,
 * y si nadie lo hace el nodo reporta «built before provenance was recorded»
 * para siempre.
 *
 * Los dos que hay llevaban meses así, y ninguna prueba se ponía roja:
 * `data-graph-frescura` sólo vigila los `derived`. El motivo tampoco era que se
 * hubiera movido una entrada, era `no-builtFrom` — nunca lo habían sellado.
 *
 *   pleno-claims-suggestions.json  el `--stamp` vivía DENTRO de la rama del
 *                                  mapa de voces: hacía falta un mapa nuevo Y
 *                                  una re-extracción buena. Una extracción
 *                                  normal hacía el trabajo y no sellaba.
 *   pleno-findings.json            `promote-claim` no sellaba nunca.
 *
 * Y el docblock de `refresh --stamp` ya decía cómo tenía que ser: «lo sella
 * quien hizo el trabajo… un nodo permanentemente viejo que nadie puede limpiar
 * es ruido, y el ruido entrena a la gente a dejar de leer el parte». Esta
 * prueba es lo que hace que esa frase signifique algo.
 */
const ROOT = join(__dirname, '..')
const leer = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : '')

/** Ficheros donde puede vivir un sellador. */
const SELLADORES = ['scripts/hallazgos-pipeline.sh', 'scripts/promote-claim.ts']

describe('todo nodo que refresh no reconstruye tiene quien lo selle', () => {
  const noAutomaticos = DATA_GRAPH.filter((n) => n.tier !== 'derived')

  it('hay nodos de los que hablar (el control de la prueba de abajo)', () => {
    // Sin esto, borrar los dos nodos dejaría el bucle vacío y la prueba verde
    // sin haber comprobado nada: el defecto que documenta DATA_INTEGRITY §2.
    expect(noAutomaticos.length).toBeGreaterThan(0)
  })

  for (const nodo of noAutomaticos) {
    it(`${nodo.id} (${nodo.tier}) lo sella alguien`, () => {
      const quien = SELLADORES.filter((f) => {
        const t = leer(f)
        // Las dos formas: el CLI (`--stamp <id>`) y la función compartida.
        return t.includes(`--stamp ${nodo.id}`) || (t.includes('sellar(') && t.includes(nodo.id))
      })
      expect(
        quien,
        `nadie sella ${nodo.id}: reportará "built before provenance was recorded" ` +
          'para siempre, y un nodo que nadie puede limpiar es ruido en el parte',
      ).not.toEqual([])
    })
  }
})

describe('dónde va el sello dentro de la tubería', () => {
  const sh = leer('scripts/hallazgos-pipeline.sh')

  it('el fichero existe y trae el sello', () => {
    expect(sh).not.toBe('')
    expect(sh).toContain('--stamp pleno-claims-suggestions.json')
  })

  it('NO cuelga de la rama del mapa de voces', () => {
    // La avería exacta. `extract:pleno-claims` se invoca en dos sitios: el
    // corriente (el backlog de transcripciones) y el de después de un mapa
    // nuevo. El sello estaba sólo en el segundo, así que la pasada normal hacía
    // el trabajo y no lo sellaba — y un nodo que sólo necesita su PRIMER sello
    // no lo recibía jamás.
    const mapa = sh.indexOf('re-extracted with map attribution')
    const sello = sh.indexOf('--stamp pleno-claims-suggestions.json')
    expect(mapa).toBeGreaterThan(-1)
    expect(sello).toBeGreaterThan(-1)
    expect(sello, 'el sello vuelve a estar dentro de la rama del mapa de voces').toBeGreaterThan(
      mapa,
    )
    // Y concretamente: dentro del bloque que se dispara con CUALQUIER
    // extracción buena, que es lo que `NEW` cuenta.
    const bloque = sh.indexOf('if [ "$NEW" -gt 0 ]; then')
    expect(bloque).toBeGreaterThan(-1)
    expect(sello).toBeGreaterThan(bloque)
  })

  it('sigue sin sellar cuando no hubo trabajo', () => {
    // La otra mitad del contrato, y la que impide que esto se convierta en un
    // sello automático: una pasada sin extracciones no ha hecho nada que
    // sellar, y decir lo contrario sería peor que no sellar.
    const bloque = sh.slice(
      sh.indexOf('if [ "$NEW" -gt 0 ]; then'),
      sh.indexOf('no new extractions — skipping verify'),
    )
    expect(bloque).toContain('--stamp pleno-claims-suggestions.json')
  })

  it('promote-claim sella DESPUÉS de escribir, y no muere si no puede', () => {
    const ts = leer('scripts/promote-claim.ts')
    const write = ts.lastIndexOf('writeFileSync(FINDINGS')
    const sello = ts.indexOf('sellar(nodo)')
    expect(write).toBeGreaterThan(-1)
    expect(sello).toBeGreaterThan(-1)
    // Antes del write, el propio write borraría el sello.
    expect(sello).toBeGreaterThan(write)
    // Y no fatal: la promoción ya está en disco y validada.
    expect(ts).toMatch(/no se pudo sellar/)
  })
})
