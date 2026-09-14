import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'js-yaml'

/**
 * ¿Puede la nocturna comitear un árbol que nadie ha rederivado?
 *
 * El 14-09-2026 sí, y costó el despliegue del día. La cadena, medida y no
 * supuesta:
 *
 *   1. El paso «Run scraper(s)» agotó su tope de 22 minutos
 *      (`##[error]The action 'Run scraper(s)' has timed out after 22 minutes`,
 *      ejecución 34831225509). El mensaje del commit lo deja por escrito:
 *      «Scrape rc: step-timeout».
 *   2. `scrape-all.sh` llama a `npm run refresh` AL FINAL —es su última línea
 *      antes de que el árbol se comitee, a propósito—, así que el hacha cayó
 *      antes: en todo el registro de esa ejecución no aparece ni un
 *      «[scrape-all] running: refresh» ni el «[scrape-all] summary».
 *   3. El raspado ya había reescrito `plenos-agendas.json` entero a las
 *      10:26:22, 107 segundos antes del tope, y ese fichero lo escriben TRES
 *      pasos: el raspado, `compute:dept-stats` (`plazosVencidosCount`,
 *      `deptCoverage`) y `refresh` (`builtFrom`). Quedó con uno de los tres.
 *   4. El paso que comitea lleva `always()` —y tiene que llevarlo, que es lo
 *      que fija `nightly-budget.test.js`: un trabajo cancelado que se salta el
 *      commit tira la noche entera—. Así que comiteó y empujó a main el hueco.
 *   5. `npm test` se puso rojo por su propia guarda
 *      (`tests/data-graph-frescura.test.ts`, 6 fallos), la puerta de salud
 *      rojeó la ejecución y el despliegue a Vercel se SALTÓ. main en rojo y el
 *      sitio sirviendo los datos de ayer hasta que una persona rederivara.
 *
 * Lo que faltaba no era el `refresh`: estaba, y en el sitio correcto para una
 * ejecución que termina. Faltaba en el ÚNICO paso que sobrevive al hacha. Un
 * `always()` que comitea sin rederivar publica el trabajo a medias de quien no
 * llegó al final.
 *
 * Y la suposición estaba escrita en otro sitio, de donde este defecto se cayó:
 * la cabecera de `scripts/check-derivados.ts` dice que `npm test` hace esta
 * misma pregunta pero «en la nocturna corre DESPUÉS de `scrape-all.sh`, que ya
 * ha ejecutado `refresh` y ha curado el destrozo antes de que nadie mire». Un
 * `step-timeout` es exactamente el caso en que scrape-all NO llega a curar
 * nada.
 *
 * Barato: `npm run refresh` sólo reconstruye lo que sus entradas hayan movido y
 * es idempotente. Medido en este repositorio con los cinco nodos rancios de ese
 * día: 2,6 s. Por eso la regla no pide un tope más alto — no hay de dónde
 * sacarlo, el presupuesto de la nocturna sólo tiene 3 minutos de holgura.
 */
const WF = join(__dirname, '..', '.github', 'workflows', 'nightly-scrape.yml')
const doc = load(readFileSync(WF, 'utf8'))
const pasos = doc.jobs.scrape.steps

const paso = (nombre) => {
  const p = pasos.find((s) => s.name === nombre)
  if (!p) throw new Error(`la nocturna ya no tiene un paso llamado «${nombre}»`)
  return p
}

/**
 * El guion sin sus comentarios.
 *
 * `tests/prepush-range.test.js` ya paga esta lección: el comentario que explica
 * la regla cita la forma MALA, así que un emparejamiento sobre el texto crudo
 * se cree cumplida una regla que el código no cumple. Aquí es peor todavía,
 * porque el comentario de abajo nombra `npm run refresh` para explicar por qué
 * hay que llamarlo.
 */
const sinComentarios = (guion) =>
  String(guion ?? '')
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n')

describe('la nocturna rederiva lo que comitea', () => {
  const commit = paso('Commit refreshed JSON')
  const guion = sinComentarios(commit.run)

  // Anti-hueco. Las dos reglas de abajo se miden localizando `git add
  // public/data` dentro del guion; si ese comando se renombra o se mueve a otro
  // paso, `search()` devuelve -1 y una comparación con -1 puede pasar por
  // motivos que no tienen nada que ver. Que falle aquí y diga por qué.
  it('mide algo: el paso sigue existiendo y sigue estacando public/data', () => {
    expect(
      guion,
      'este fichero da por hecho que «Commit refreshed JSON» estaca public/data; si eso se ha movido, las dos reglas de abajo no están midiendo lo que dicen',
    ).toMatch(/git add public\/data/)
  })

  it('rederiva ANTES de estacar los datos', () => {
    const iRefresh = guion.search(/npm run refresh/)
    const iAdd = guion.search(/git add public\/data/)
    expect(
      iRefresh,
      'el paso que comitea no rederiva: si el raspado muere en su tope de 22 min, `scrape-all.sh` no llega a su `npm run refresh` final y este `always()` empuja a main un árbol con los snapshots reescritos y los nodos derivados sin reconstruir — 14-09-2026, ejecución 34831225509',
    ).toBeGreaterThanOrEqual(0)
    expect(
      iRefresh,
      'rederivar DESPUÉS de `git add public/data` no sirve: lo que se comitea es el índice, así que los ficheros reconstruidos se quedarían fuera del commit',
    ).toBeLessThan(iAdd)
  })

  // El commit tiene que seguir ocurriendo aunque el rederivado falle. La
  // alternativa —abortar— tira la noche entera de datos por no poder
  // reconstruir un derivado, que es justo el daño que `always()` existe para
  // evitar: `tests/data-graph-frescura.test.ts` ya rojea si lo comiteado no
  // cuadra, y un dato fresco sin sellar se arregla en un minuto, mientras que
  // una noche perdida no se recupera.
  it('un rederivado que falla no cancela el commit', () => {
    const linea = guion.split('\n').find((l) => /npm run refresh/.test(l)) ?? ''
    expect(
      linea,
      'el `npm run refresh` del paso que comitea tiene que ser tolerante (`|| true`, `|| echo …`): con `set -e` fuera y un fallo sin absorber, un derivado roto se llevaría por delante el commit de toda la noche',
    ).toMatch(/\|\|/)
  })
})
