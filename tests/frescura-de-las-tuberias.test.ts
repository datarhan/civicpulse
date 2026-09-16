import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_GRAPH, stalenessInputs } from '../src/scraper/data-graph'

/**
 * Quien comitea la ENTRADA de un derivado publica también lo que esa entrada
 * obliga a rederivar.
 *
 * `tests/refresco-antes-de-comitear.test.ts` cubre la otra mitad —quien escribe
 * la SALIDA de un derivado tiene que ejecutar `refresh`— y deja dicho que a
 * quien escribe una ENTRADA «lo rederiva la nocturna». Eso abre una ventana en
 * la que `main` incumple su propia puerta, y la ventana no la medía nadie.
 *
 * Medida el 16-09-2026, sacando `public/data` de cada commit y corriendo
 * `tests/data-graph-frescura.test.ts` contra él:
 *
 *   280dd311  07:37Z  merge de la PR #44           16 de 16 verdes
 *   38d3ee59  08:29Z  refresco de press-lab         1 FALLO
 *   bc812d8e  08:59Z  instantánea de quejas         3 FALLOS
 *   94359907  09:07Z  tubería de /hallazgos         2 FALLOS
 *   40ad3e4f  09:49Z  refresco nocturno            16 de 16 verdes
 *
 * Ochenta minutos en rojo, y la CI de la PR #45 cayó dentro: se puso roja por
 * algo que esa rama no tocaba. No lo ve nadie porque un commit de sólo datos no
 * dispara la suite en `main`; sólo lo sufre la PR que esté construyendo.
 *
 * La regla se calcula sobre el GRAFO, no sobre una lista escrita a mano: una
 * tubería nueva o un nodo que cambie de tier quedan cubiertos solos.
 */
const ROOT = join(__dirname, '..')

/**
 * Cómo se pide a `refresh` que diga QUÉ acaba de rederivar: la bandera, o el
 * ayudante de `scripts/lib/cron-git.sh` que la llama y filtra su salida a rutas
 * que existen (un pathspec con una palabra que no es ruta apaga la red de
 * seguridad del commit entera — lo midió `tests/scripts/cron-git-safety.test.ts`).
 */
const MARCA = /--rebuilt-paths|cron_rutas_rederivadas/

const DERIVADOS = DATA_GRAPH.filter((n) => n.tier === 'derived')
const ENTRADAS_DE_DERIVADOS = new Set(DERIVADOS.flatMap((n) => stalenessInputs(n)))

/**
 * Qué entradas de algún derivado nombra esta tubería en sus rutas.
 *
 * Se leen las rutas LITERALES (`public/data/x.json`), que es lo que acaba en un
 * pathspec, y no los comandos del grafo: `press-lab-pipeline.sh` ejecuta
 * `verify:press-claims` y comitea `public/data/press-claims-verified.json`
 * —entrada de `press-trust.json`— sin que ese fichero sea un NODO del grafo, así
 * que preguntando por comandos se queda fuera justo la tubería que se midió
 * rompiendo la puerta. Y `pull-quejas.yml` no ejecuta ningún comando del grafo:
 * baja el fichero con curl.
 */
function entradasDeDerivadoQueEscribe(cuerpo: string): string[] {
  const nombradas = new Set<string>()
  for (const m of cuerpo.matchAll(/public\/data\/([A-Za-z0-9._-]+(?:\/)?)/g)) {
    nombradas.add(m[1])
  }
  return [...nombradas].filter((f) => ENTRADAS_DE_DERIVADOS.has(f)).sort()
}

/**
 * Sin comentarios, y por el mismo motivo que `tests/prepush-range.test.js`: el
 * comentario que EXPLICA la bandera la cita, así que un guión al que se le
 * quitara la llamada seguiría pareciendo arreglado por su propia explicación.
 * Medido: la primera ablación de esta guarda salió verde por eso.
 */
const sinComentarios = (cuerpo: string) => cuerpo.replace(/^\s*#.*$/gm, '')

const comitea = (cuerpo: string) =>
  /cron_git_commit_pathspec|git commit|git-auto-commit/.test(cuerpo)

const ficheros = (dir: string, ext: RegExp) =>
  readdirSync(dir)
    .filter((f) => ext.test(f))
    .map((f) => ({ f, cuerpo: readFileSync(join(dir, f), 'utf8') }))

const tuberias = [
  ...ficheros(join(ROOT, 'scripts'), /\.sh$/),
  ...ficheros(join(ROOT, '.github/workflows'), /\.ya?ml$/),
]
  .filter(({ cuerpo }) => comitea(cuerpo))
  .map(({ f, cuerpo }) => ({ f, cuerpo, entradas: entradasDeDerivadoQueEscribe(cuerpo) }))

describe('quien comitea una entrada de un derivado publica lo rederivado', () => {
  it('mide algo: hay tuberías que comitean y el grafo declara entradas de derivados', () => {
    // Las dos formas de quedarse verde sin medir: un glob roto que no lee
    // guiones, y un grafo del que no sale ninguna entrada que vigilar.
    expect(tuberias.length, 'no ha leído ninguna tubería que comitee').toBeGreaterThanOrEqual(5)
    expect(ENTRADAS_DE_DERIVADOS.size, 'el grafo no declara entradas de derivados').toBeGreaterThan(
      0,
    )
  })

  it('la criba de comentarios quita la explicación pero no la llamada', () => {
    expect(MARCA.test(sinComentarios('  # usa --rebuilt-paths\nnpm run x\n'))).toBe(false)
    expect(MARCA.test(sinComentarios('R="$(cron_rutas_rederivadas)"'))).toBe(true)
  })

  it('el clasificador separa los dos casos, no contesta lo mismo a todo', () => {
    const conEntrada = tuberias.filter((t) => t.entradas.length > 0)
    const sinEntrada = tuberias.filter((t) => t.entradas.length === 0)
    expect(conEntrada.length, 'ninguna tubería escribe entradas de derivados').toBeGreaterThan(0)
    expect(sinEntrada.length, 'todas clasificadas como escritoras de entradas').toBeGreaterThan(0)
  })

  for (const { f, cuerpo, entradas } of tuberias) {
    if (entradas.length === 0) continue
    it(`${f} publica lo que su escritura de ${entradas.join(', ')} obliga a rederivar`, () => {
      expect(
        MARCA.test(sinComentarios(cuerpo)),
        `${f} comitea ${entradas.join(', ')}, que es entrada de un nodo derivado, y no añade ` +
          `a su pathspec lo que \`npm run refresh -- ${MARCA}\` acaba de reconstruir. Entre su ` +
          `commit y el refresco nocturno, \`main\` incumple tests/data-graph-frescura.test.ts, y ` +
          `la CI de cualquier PR que construya en esa ventana sale roja por esto.`,
      ).toBe(true)
    })
  }
})
