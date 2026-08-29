import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { DATA_GRAPH, stalenessInputs } from '../src/scraper/data-graph'
import { hashOf, resolveInput, ABSENT } from '../src/scraper/built-from'

/**
 * Una entrada de frescura tiene que estar versionada. Si git no la ve, las dos
 * máquinas que escriben `builtFrom` no pueden estar de acuerdo NUNCA.
 *
 * `builtFrom` publica el hash de cada entrada para poder afirmar «esto ya no
 * sale de lo que tiene al lado». La afirmación se sostiene sobre una premisa
 * que nadie comprobaba: que el portátil y CI están mirando el mismo fichero.
 * Con una entrada en .gitignore no lo están — cada uno la regenera por su
 * cuenta, gana quien comitea el último, y la otra máquina lee «rancio» a
 * diario. `npm run refresh` tampoco lo arregla: lo voltea hasta la siguiente
 * nocturna.
 *
 * Pasó con `finding-quote-provenance.json`, que declaraba
 * `pleno-claims-verified-base.json` (9,4 MB, .gitignore:39). Era la ÚNICA de
 * las veintidós entradas de frescura del grafo sin versionar, y salía roja en
 * `check:derivados` todos los días. Se caza aquí una vez, y no una vez al día.
 *
 * La resolución de rutas es la de `hashOf` a propósito: lo que hay que
 * comprobar es el fichero que el hash LEE, no uno parecido.
 */

const raiz = resolve(__dirname, '..')

function versionaAlgo(ruta: string): boolean {
  const salida = execFileSync('git', ['ls-files', '--', ruta], {
    cwd: raiz,
    encoding: 'utf8',
  })
  return salida.trim().length > 0
}

/**
 * ¿Está versionado? Un directorio cuenta si tiene algo versionado dentro.
 *
 * La ruta la da `resolveInput`, no una copia de su lógica. La primera versión
 * de esta prueba SÍ la copiaba, y se desincronizó en el mismo commit en que se
 * arregló la resolución: preguntaba por `public/data/pleno-speaker-map` cuando
 * el fichero vive en la raíz. Una prueba que recita la forma en vez de
 * importarla es la regla 1 de CLAUDE.md, y aquí volvió a morder.
 */
function versionado(entrada: string): boolean {
  const ruta = resolveInput(entrada)
  if (!ruta) return false
  return versionaAlgo(ruta)
}

const entradasDeFrescura = [...new Set(DATA_GRAPH.flatMap((n) => stalenessInputs(n)))].sort()

describe('las entradas de frescura del grafo', () => {
  // Anti-hueco. Un «todas versionadas» sobre una lista vacía es el gate que no
  // mide nada, que es el defecto que este repositorio ya ha pagado dos veces.
  it('son varias, no cero', () => {
    expect(entradasDeFrescura.length).toBeGreaterThan(10)
  })

  it('están TODAS versionadas', () => {
    const sinVersionar = entradasDeFrescura.filter((e) => !versionado(e))
    expect(
      sinVersionar,
      'estas entradas fechan un builtFrom y git no las ve, así que el portátil y CI ' +
        'no pueden coincidir nunca. O se versionan, o se declaran en el ' +
        '`noComparables` de su nodo con el motivo: ' +
        sinVersionar.join(', '),
    ).toEqual([])
  })

  // El par de la anterior, y la que de verdad cazó algo. Si git versiona la
  // entrada, está en el disco; que `hashOf` devuelva ABSENT sólo puede
  // significar que la resuelve mal. Y un ABSENT permanente no es un dato
  // ausente: es una dependencia que no puede dispararse jamás, porque se
  // compara consigo misma y siempre coincide.
  //
  // `pleno-speaker-map/` llevaba así quién sabe cuánto: publicada como
  // «absent» en `pleno-claims-suggestions.json` mientras el directorio existía
  // en la raíz con los mapas dentro.
  it('las resuelve TODAS a algo real, ninguna a ABSENT', () => {
    const noResueltas = entradasDeFrescura.filter((e) => hashOf(e) === ABSENT)
    expect(
      noResueltas,
      'git versiona estas entradas y aun así hashOf no las encuentra: es un fallo ' +
        'de resolución, y mientras dure el nodo que las lee no puede salir rancio: ' +
        noResueltas.join(', '),
    ).toEqual([])
  })
})

describe('la escotilla `noComparables`', () => {
  const declaradas = DATA_GRAPH.flatMap((n) =>
    (n.noComparables ?? []).map((entrada) => ({ nodo: n.id, entrada })),
  )

  // La escotilla existe para lo que git no puede ver. Si alguien mete ahí una
  // entrada versionada, deja de vigilarse una dependencia real y esto se
  // convierte en el sitio donde se esconde el rancio de verdad.
  it('sólo cubre entradas SIN versionar', () => {
    const escondidas = declaradas.filter((d) => versionado(d.entrada))
    expect(
      escondidas.map((d) => d.nodo + ' → ' + d.entrada),
      'una entrada versionada SÍ se puede comparar: sácala de noComparables',
    ).toEqual([])
  })

  it('sólo nombra entradas que el nodo declara en `reads`', () => {
    for (const nodo of DATA_GRAPH) {
      for (const entrada of nodo.noComparables ?? []) {
        expect(nodo.reads, nodo.id + ': noComparables nombra algo que no lee').toContain(entrada)
      }
    }
  })
})
