/**
 * Los rótulos de los enums del mapa y de la portada, en los dos idiomas.
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
import { POI_CATEGORIES } from '../src/lib/civic-poi'
import { TONOS_RECENCIA } from '../src/lib/incendios'
import { KIND_ICON } from '../src/hooks/useParticipa'
import { PLENO_TONE } from '../src/hooks/usePlenos'
import { CLAVE_RELACION, RELATION_LABELS } from '../src/scraper/queja-contract-relations'
import { NIVELES_AEMET } from '../src/scraper/spain-ticker'

const IDIOMAS = ['es', 'ca'] as const
const tabla = CATALOGUE as unknown as Record<(typeof IDIOMAS)[number], Record<string, string>>

type Fila = { contractType?: unknown; processType?: unknown; categoryTitle?: unknown }
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

/** Las clases de aviso que participa.ribarroja.es publica hoy. */
const participa = JSON.parse(readFileSync(resolve('public/data/participa.json'), 'utf8')) as {
  items?: { kind?: unknown }[]
}
const clasesPublicadas = [
  ...new Set(
    (participa.items ?? [])
      .map((i) => i.kind)
      .filter((v): v is string => typeof v === 'string' && v !== ''),
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
    familia: 'categorías de Gobierto publicadas en tenders.json',
    prefijo: 'contrato.categoria.',
    valores: publicados('categoryTitle'),
  },
  {
    familia: 'causas de incendio (CAUSAS)',
    prefijo: 'map.incendio.causa.',
    valores: lista(CAUSAS),
  },
  { familia: 'clases de lugar (PLACE_KINDS)', prefijo: 'map.lugar.', valores: lista(PLACE_KINDS) },
  {
    familia: 'clases de aviso de participa (KIND_ICON)',
    prefijo: 'participa.tipo.',
    valores: lista(Object.keys(KIND_ICON ?? {})),
  },
  {
    familia: 'clases de aviso publicadas en participa.json',
    prefijo: 'participa.tipo.',
    valores: clasesPublicadas,
  },
  {
    familia: 'relaciones entre una queja y un contrato (RELATION_LABELS → CLAVE_RELACION)',
    prefijo: 'contrato.relacion.',
    // La clave no puede ser el valor: «misma zona y materia» lleva espacios. Un valor
    // que CLAVE_RELACION no nombra se queda sin clave, y así lo dice la lista.
    valores: lista(RELATION_LABELS).map(
      (valor) =>
        (CLAVE_RELACION as Record<string, string> | undefined)?.[valor] ?? `sin-clave·${valor}`,
    ),
  },
  {
    familia: 'niveles de aviso de AEMET (NIVELES_AEMET)',
    prefijo: 'liveTicker.aemet.nivel.',
    valores: lista(NIVELES_AEMET),
  },
  {
    familia: 'clases de sesión plenaria (PLENO_TONE)',
    prefijo: 'pleno.tipo.',
    valores: lista(Object.keys(PLENO_TONE ?? {})),
  },
]

describe('los enums del mapa y de la portada tienen rótulo en los dos idiomas', () => {
  it.each(FAMILIAS)('$familia', ({ prefijo, valores }) => {
    expect(valores.length, 'la familia no mide ningún valor').toBeGreaterThan(0)
    expect(sinRotulo(valores.map((v) => `${prefijo}${v}`))).toEqual([])
  })
})

/**
 * Las dos tablas que pintan las leyendas no guardan el rótulo sino su clave: las
 * categorías de equipamiento y los tres tonos de antigüedad de un incendio. Cada
 * fila tiene que traer una, y la clave existir en los dos idiomas.
 */
const TABLAS_CON_CLAVE = [
  {
    tabla: 'categorías de equipamiento (POI_CATEGORIES)',
    claves: Object.values(POI_CATEGORIES).map((c) => (c as { labelKey?: unknown }).labelKey),
  },
  {
    tabla: 'tonos de antigüedad de los incendios (TONOS_RECENCIA)',
    claves: TONOS_RECENCIA.map((t) => (t as { claveCorta?: unknown }).claveCorta),
  },
]

describe('las tablas de las leyendas guardan claves con rótulo en los dos idiomas', () => {
  it.each(TABLAS_CON_CLAVE)('$tabla', ({ claves }) => {
    expect(claves.length, 'la tabla no tiene filas').toBeGreaterThan(0)
    const sinClave = claves.filter((k) => typeof k !== 'string' || k === '')
    expect(sinClave.length, 'hay filas sin clave de rótulo').toBe(0)
    expect(sinRotulo(claves as string[])).toEqual([])
  })
})
