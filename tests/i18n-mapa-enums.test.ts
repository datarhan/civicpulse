/**
 * Los rótulos de los enums del mapa, en los dos idiomas.
 *
 * Un estado de contrato, una causa de incendio o una clase de lugar se pintan
 * pasando su valor por el catálogo (`contrato.estado.<valor>`…). Si falta la
 * clave en valencià el catálogo cae al castellano sin romper nada, y si falta en
 * los dos el componente enseña el token crudo o nada: ninguna de las dos cosas
 * falla sola. Así que esta prueba lee cada enum de su DUEÑO —el export del
 * scraper, la tabla de la capa o el snapshot publicado— y exige su clave en los
 * dos idiomas. Es la regla 1 de docs/DATA_INTEGRITY.md: el enum se importa, no
 * se recita aquí.
 *
 * Y cada familia tiene que medir algo. Un enum que deja de exportarse vale cero
 * valores, y cero valores sin clave no es una familia cubierta: es una prueba en
 * verde por no haber mirado nada.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { CATALOGUE } from '../src/i18n'
import { CONTRACT_STATUS, TENDER_STATUS } from '../src/scraper/tenders'
import { CAUSAS } from '../src/scraper/incendios'
import { PLACE_KINDS } from '../src/scraper/place-resolver'

const IDIOMAS = ['es', 'ca'] as const
const tabla = CATALOGUE as unknown as Record<(typeof IDIOMAS)[number], Record<string, string>>

type Fila = { contractType?: unknown; processType?: unknown }
const snapshot = JSON.parse(readFileSync(resolve('public/data/tenders.json'), 'utf8')) as {
  contracts?: Fila[]
  tenders?: Fila[]
}
/** Contratos Y licitaciones, como `tender-status-labels`: lo publicado entero. */
const FILAS: Fila[] = [...(snapshot.contracts ?? []), ...(snapshot.tenders ?? [])]

/** Los valores de un campo que el snapshot publicado trae de verdad. */
const publicados = (campo: keyof Fila) => [
  ...new Set(
    FILAS.map((f) => f[campo]).filter((v): v is string => typeof v === 'string' && v !== ''),
  ),
]

/** Un enum que no se exporta vale cero valores y la familia lo dice, en vez de
 *  romper la carga del fichero y callar a todas las demás. */
const lista = (xs: Iterable<string> | null | undefined): string[] => [...(xs ?? [])]

/** Las claves que faltan, o están vacías, en algún idioma. */
const sinRotulo = (claves: string[]) =>
  claves.flatMap((clave) =>
    IDIOMAS.filter((l) => !tabla[l][clave]?.trim()).map((l) => `${l} · ${clave}`),
  )

const FAMILIAS = [
  {
    familia: 'estados de contrato (CONTRACT_STATUS ∪ TENDER_STATUS)',
    prefijo: 'contrato.estado.',
    valores: lista(new Set([...lista(CONTRACT_STATUS), ...lista(TENDER_STATUS)])),
  },
  {
    familia: 'tipos de contrato publicados en tenders.json',
    prefijo: 'contrato.tipo.',
    valores: publicados('contractType'),
  },
  {
    familia: 'procedimientos publicados en tenders.json',
    prefijo: 'contrato.procedimiento.',
    valores: publicados('processType'),
  },
  {
    familia: 'causas de incendio (CAUSAS)',
    prefijo: 'map.incendio.causa.',
    valores: lista(CAUSAS),
  },
  { familia: 'clases de lugar (PLACE_KINDS)', prefijo: 'map.lugar.', valores: lista(PLACE_KINDS) },
]

describe('los enums del mapa tienen rótulo en los dos idiomas', () => {
  it.each(FAMILIAS)('$familia', ({ prefijo, valores }) => {
    expect(valores.length, 'la familia no mide ningún valor').toBeGreaterThan(0)
    expect(sinRotulo(valores.map((v) => `${prefijo}${v}`))).toEqual([])
  })
})
