import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { shortlistCandidates } from '../src/scraper/claim-verifier'
import type { BdnsItem } from '../src/scraper/bdns'

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

const bdnsDe = (lista: ReturnType<typeof shortlistCandidates>) =>
  lista.filter((c) => c.kind === 'bdns')

/** Cada fila, buscada con su propia descripción: ¿la trae la lista corta? */
function barrido(filas: BdnsItem[]) {
  let evaluadas = 0
  const perdidas: string[] = []
  for (const f of filas) {
    evaluadas++
    const claim = {
      id: `barrido-${f.bdnsCode}`,
      type: 'cita_obra',
      verbatim: f.description,
      context: '',
      entities: {},
    } as never
    const refs = bdnsDe(shortlistCandidates({ claim, bdns: { items: filas } })).map((c) => c.ref)
    if (!refs.includes(f.sourceUrl)) perdidas.push(f.bdnsCode)
  }
  return { evaluadas, perdidas }
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
    const { evaluadas, perdidas } = barrido(FX.bdns)
    expect(evaluadas).toBe(178)
    expect(perdidas).toEqual([])
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
