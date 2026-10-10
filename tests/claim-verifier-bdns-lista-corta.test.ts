import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { shortlistCandidates } from '../src/scraper/claim-verifier'
import type { BdnsItem } from '../src/scraper/bdns'
import { buildBdnsRows } from '../scripts/embed-verifier-corpus'

/**
 * La lista corta léxica no veía NINGUNA subvención.
 *
 * `shortlistCandidates` arma los candidatos que leen el verificador LLM, la
 * pasada NLI y el motor. Su tramo de BDNS saltaba toda fila sin `titulo` y leía
 * `url`, `convocatoriaId` y `organo`; las filas de `bdns.json` traen
 * `description`, `organ`, `sourceUrl` y `bdnsCode` (`BdnsItem`, src/scraper/bdns.ts).
 * Medido el 06-10-2026: ninguna de las 178 trae `titulo`, así que la mitad léxica
 * no proponía una sola convocatoria y la BDNS sólo llegaba al modelo por el
 * corpus semántico. Es la clase nº 2 de docs/DATA_INTEGRITY.md («nombre de campo
 * desalineado») y, aguas abajo, la nº 13: el modelo «no encuentra nada» porque la
 * recuperación no le dio candidatos.
 *
 * El caso: otxq2c-019-cit-ef251a, del pleno del 06-10-2025, habla de «las
 * antiguas bases reguladoras» de las ayudas económicas de emergencia, que son la
 * convocatoria BDNS 659857. La fixture congela la declaración y las 178 filas de
 * ese día; el barrido de abajo cuenta las filas que evaluó, para que ninguna
 * prueba salga verde por no haber leído nada.
 */
const FX = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/bdns_lista_corta_2026-10-06.json'), 'utf8'),
) as { claim: never; bdns: BdnsItem[] }

const FICHA_659857 = 'https://www.pap.hacienda.gob.es/bdnstrans/GE/es/convocatoria/659857'

/** Como mucho, dos convocatorias por lista corta (el tope, al final del fichero). */
const TOPE = 2

const bdnsDe = (lista: ReturnType<typeof shortlistCandidates>) =>
  lista.filter((c) => c.kind === 'bdns')

/** Una declaración que dice, palabra por palabra, la descripción de la fila. */
const deSuDescripcion = (f: BdnsItem) =>
  ({
    id: `barrido-${f.bdnsCode}`,
    type: 'cita_obra',
    verbatim: f.description,
    context: '',
    entities: {},
  }) as never

/** El candidato que la lista corta léxica hace de la fila, sola, buscada por su descripción. */
const aSolasDe = (f: BdnsItem) =>
  bdnsDe(shortlistCandidates({ claim: deSuDescripcion(f), bdns: { items: [f] } }))[0]

/**
 * Cada fila, buscada con su propia descripción entre todas: ¿la trae la lista
 * corta? Con el tope de dos, una fila puede quedarse fuera por empate —la
 * subvención nominativa de València la Vella se repite cada año casi con las
 * mismas palabras— y eso no es perderla. Perdida es la que no se lee sola, o la
 * que se queda fuera habiendo dentro una convocatoria que puntúa MENOS que ella.
 */
function barrido(filas: BdnsItem[]) {
  let evaluadas = 0
  let fueraPorEmpate = 0
  const perdidas: string[] = []
  for (const f of filas) {
    evaluadas++
    const sola = aSolasDe(f)
    if (!sola) {
      perdidas.push(f.bdnsCode)
      continue
    }
    const dentro = bdnsDe(
      shortlistCandidates({ claim: deSuDescripcion(f), bdns: { items: filas } }),
    )
    if (dentro.some((c) => c.ref === f.sourceUrl)) continue
    if (dentro.length === TOPE && dentro.every((c) => c.similarity >= sola.similarity)) {
      fueraPorEmpate++
    } else perdidas.push(f.bdnsCode)
  }
  return { evaluadas, fueraPorEmpate, perdidas }
}

describe('el reproductor se da', () => {
  it('las filas son las de la fuente: description/sourceUrl, ningún titulo/url', () => {
    expect(FX.bdns).toHaveLength(178)
    for (const f of FX.bdns as unknown as Record<string, unknown>[]) {
      expect(typeof f.description).toBe('string')
      expect(typeof f.sourceUrl).toBe('string')
      expect(f.titulo).toBeUndefined()
      expect(f.url).toBeUndefined()
    }
  })

  it('la convocatoria 659857 está en la fixture', () => {
    expect(FX.bdns.find((f) => f.sourceUrl === FICHA_659857)?.description).toMatch(
      /^BASES REGULADORAS DE LAS AYUDAS ECONÓMICAS DE EMERGENCIA SOCIAL/,
    )
  })
})

describe('una declaración sobre una convocatoria recibe la convocatoria', () => {
  it('otxq2c-019-cit-ef251a trae la 659857 por la mitad léxica', () => {
    const lista = shortlistCandidates({ claim: FX.claim, bdns: { items: FX.bdns } })
    expect(bdnsDe(lista).map((c) => c.ref)).toContain(FICHA_659857)
  })
})

describe('cada fila es alcanzable por su propia descripción', () => {
  it('en la fixture congelada: evaluadas 178, perdidas ninguna', () => {
    const { evaluadas, fueraPorEmpate, perdidas } = barrido(FX.bdns)
    expect(evaluadas).toBe(178)
    expect(perdidas).toEqual([])
    // 477563: su descripción está entera en las de 625223, 567783 y 535256, que
    // también puntúan 1 y van antes en el fichero.
    expect(fueraPorEmpate).toBe(1)
  })

  it('en el snapshot publicado: evaluadas = stats.total > 0, perdidas ninguna', () => {
    const ruta = resolve('public/data/bdns.json')
    expect(existsSync(ruta), 'no hay bdns.json que barrer').toBe(true)
    const d = JSON.parse(readFileSync(ruta, 'utf8')) as {
      stats: { total: number }
      items: BdnsItem[]
    }
    const { evaluadas, perdidas } = barrido(d.items)
    expect(evaluadas).toBeGreaterThan(0)
    expect(evaluadas).toBe(d.stats.total)
    expect(perdidas).toEqual([])
  })
})

/**
 * Una convocatoria llega al modelo igual, la traiga la mitad que la traiga.
 *
 * `mergeShortlists` junta la mitad semántica y la léxica por tipo, enlace y
 * snippet. Con dos compositores, el mismo registro llegaría al modelo dos veces,
 * una por mitad (con la fusión por `ref` de antes, de una de dos maneras según qué
 * mitad ganara): el defecto que snippet-de-contrato.ts arregló para los contratos. El del corpus es la referencia: el 06-10-2026 las
 * 178 filas `bdns` de `.embed-cache/verifier-corpus.jsonl` del checkout principal
 * traían el snippet y el enlace que compone `buildBdnsRows`, sin excepción.
 */
describe('una convocatoria llega al modelo igual, la traiga la mitad que la traiga', () => {
  function cotejo(filas: BdnsItem[]) {
    const delCorpus = new Map(buildBdnsRows({ items: filas }).map((r) => [r.ref, r.snippet]))
    let comparadas = 0
    const distintas: string[] = []
    for (const f of filas) {
      comparadas++
      const c = aSolasDe(f)
      if (!c || delCorpus.get(c.ref) !== c.snippet) distintas.push(f.bdnsCode)
    }
    return { comparadas, distintas }
  }
  const fila = (code: string) => FX.bdns.find((f) => f.bdnsCode === code)!

  it('las 178 filas reales: mismo enlace y mismo snippet en las dos mitades', () => {
    const { comparadas, distintas } = cotejo(FX.bdns)
    expect(comparadas).toBe(178)
    expect(distintas).toEqual([])
  })

  it('y una fila con importe (SINTÉTICA: ninguna fila publicada lo trae hoy)', () => {
    const conImporte = { ...fila('659857'), importe: 70000 } as BdnsItem
    expect(cotejo([conImporte])).toEqual({ comparadas: 1, distintas: [] })
  })

  it('el snippet es objeto · órgano, como en el corpus de hoy', () => {
    expect(aSolasDe(fila('659857'))?.snippet).toBe(
      'BASES REGULADORAS DE LAS AYUDAS ECONÓMICAS DE EMERGENCIA SOCIAL DEL AYUNTAMIENTO DE RIBA-ROJA DE TÚRIA EJERCICIOS 2022-2025 · LOCAL · RIBA-ROJA DE TÚRIA · AYUNTAMIENTO DE RIBA-ROJA DE TÚRIA',
    )
  })

  it('sin los espacios con los que la fuente cierra algún órgano (732847)', () => {
    // La fila es de Riba-roja d'Ebre, otro municipio: eso es otro defecto, del
    // raspador. Aquí cuenta que es la única cuyo `organ` acaba en espacios.
    expect(fila('732847').organ).toMatch(/\s$/)
    expect(aSolasDe(fila('732847'))?.snippet).toBe(
      "Primera distribución del Fondo de Transición Nuclear 2023 PENTA I Riba-roja d'Ebre · AUTONOMICA · CATALUÑA · DEPARTAMENT D'EMPRESA I TREBALL",
    )
  })
})

/**
 * El tope: una declaración que no habla de subvenciones no se llena de
 * convocatorias.
 *
 * Leídas las filas, la mitad léxica empareja también por las palabras de oficio
 * de una convocatoria —«acuerdo», «junta de gobierno local», «ejercicio 2025»—.
 * Medido el 06-10-2026 sobre las 7.564 declaraciones de
 * pleno-claims-verified.json, sin llamadas: 1.325 (17,5 %) ganan alguna
 * convocatoria en su lista de 8, y 145 (1,9 %) pierden a cambio algún contrato o
 * promesa; en 41 las ocho plazas eran convocatorias. Con dos por lista como
 * mucho, las que pierden algo bajan a 90 (1,2 %) y ninguna pierde más de dos.
 * 1tgd1h4-130-afi-a4b594, sobre el calendario laboral de 2025, es una de esas 41.
 */
const FX_TOPE = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/bdns_tope_2026-10-06.json'), 'utf8'),
) as { claim: never; tenders: unknown }

describe('el tope: como mucho dos convocatorias por lista, las de más puntuación', () => {
  const aSolas = (f: BdnsItem) =>
    bdnsDe(shortlistCandidates({ claim: FX_TOPE.claim, bdns: { items: [f] } }))[0]
  const pasan = FX.bdns.map(aSolas).filter(Boolean)
  const lista = shortlistCandidates({
    claim: FX_TOPE.claim,
    tenders: FX_TOPE.tenders,
    bdns: { items: FX.bdns },
  })

  it('precondición: de las 178 evaluadas, más de dos pasan el suelo por sí solas', () => {
    expect(FX.bdns).toHaveLength(178)
    expect(pasan.length).toBeGreaterThan(TOPE)
  })

  it('la lista lleva dos convocatorias, no ocho', () => {
    expect(bdnsDe(lista)).toHaveLength(TOPE)
  })

  it('las de más puntuación: ninguna de las que se quedan fuera puntúa más', () => {
    const dentro = bdnsDe(lista)
    const suelo = Math.min(...dentro.map((c) => c.similarity))
    const fuera = pasan.filter((c) => !dentro.some((d) => d.ref === c.ref))
    expect(fuera).toHaveLength(pasan.length - TOPE)
    expect(fuera.filter((c) => c.similarity > suelo)).toEqual([])
  })

  it('y los contratos vuelven a los huecos que las convocatorias ocupaban', () => {
    const sinBdns = shortlistCandidates({
      claim: FX_TOPE.claim,
      tenders: FX_TOPE.tenders,
      bdns: null,
    })
    expect(sinBdns).toHaveLength(8)
    expect(lista.filter((c) => c.kind === 'tender')).toEqual(sinBdns.slice(0, 8 - TOPE))
  })
})
