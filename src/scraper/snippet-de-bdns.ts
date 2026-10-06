/**
 * Cómo lee el verificador una fila de `bdns.json`: con qué texto se empareja, a
 * dónde cita y qué línea de ella llega al modelo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ UN FICHERO
 *
 * Tres sitios leían las filas de BDNS, cada uno con sus nombres de campo: el
 * tramo determinista de claim-verifier.ts, la lista corta léxica del mismo
 * fichero y el corpus semántico (scripts/embed-verifier-corpus.ts). El 21-09-2026
 * se arregló el primero (`url` y `convocatoriaId`, que la fuente no emite), el
 * corpus ya leía `description`, y la lista corta siguió leyendo `titulo`: hasta el
 * 06-10-2026 no propuso una sola convocatoria, y la BDNS sólo llegaba al modelo por
 * la mitad semántica (tests/claim-verifier-bdns-lista-corta.test.ts). Es la clase
 * nº 2 de docs/DATA_INTEGRITY.md, arreglada dos veces y a medias. Los nombres
 * viven aquí, y `BdnsRow` los toma de `BdnsItem` (bdns.ts): si el raspador cambia
 * uno, `npm run typecheck` lo dice antes que una pasada que no encuentra nada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL SNIPPET
 *
 * `snippetDeBdns` es el que componía el corpus, byte a byte: objeto, importe si
 * lo hay, órgano, recortado a SNIPPET_MAXIMO. `mergeShortlists` funde las dos
 * mitades por `ref` y se queda con la de más similitud, así que con dos
 * compositores la misma convocatoria llegaba al modelo de dos maneras según qué
 * mitad ganara; la 732847, cuyo `organ` acaba en espacios, ya salía distinta. No
 * se le ha añadido nada —fecha, sentido de la subvención, «importe no
 * publicado»—: cambiar lo que el modelo lee se mide con llamadas reales antes de
 * fusionar (la lección de snippet-de-contrato.ts), y que el snippet no cambie es
 * también lo que deja quieta la huella de las listas que ya traían la fila por la
 * mitad semántica (verifier-runner.ts, `huellaDeCandidatos`).
 */
import type { BdnsItem } from './bdns'

/** El tope del snippet de una convocatoria, el mismo que tenía el corpus. */
export const SNIPPET_MAXIMO = 230

/**
 * Una fila de `bdns.json`.
 *
 * Los nombres de ARRIBA son los que el snapshot publica hoy (`src/scraper/bdns.ts`):
 * medido el 21-09-2026, las 177 filas traen `bdnsCode`, `description`, `organ` y
 * `sourceUrl`, y NINGUNA trae importe. Los de abajo son los que este verificador
 * leía — un esquema que no es el de la fuente—, y se conservan por si una fila
 * vieja o un fixture los usa. Es la clase nº 2 de docs/DATA_INTEGRITY.md («nombre
 * de campo desalineado»): leer `url` y `convocatoriaId` en filas que no los tienen
 * dejaba TODA cita de BDNS en `bdns:`, vacía, y nadie lo veía porque seguía siendo
 * una cadena.
 */
export type BdnsRow = Partial<
  Pick<BdnsItem, 'bdnsCode' | 'description' | 'organ' | 'sourceUrl'>
> & {
  convocatoriaId?: string
  titulo?: string
  organo?: string
  importe?: number
  amount?: number
  fechaInicio?: string
  fecha?: string
  url?: string
}

/**
 * BDNS convocatorias in this snapshot carry NO amount: the scraper writes
 * {bdnsCode, date, description, direction, id, level1, level2, organ,
 * sourceUrl} and nothing else. `importe` and `amount` are absent on all 172
 * rows, so amount-based grant matching cannot work and never could. Kept for
 * the day the scraper starts capturing the figure; until then it honestly
 * returns null and the caller falls back to text matching.
 */
export function bdnsAmount(r: BdnsRow): number | null {
  const v = r.importe ?? r.amount
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Searchable text for a grant row — `titulo`/`organo` are not its field names. */
export function bdnsText(r: BdnsRow): string {
  return [r.description, r.organ, r.titulo, r.organo].filter(Boolean).join(' · ')
}

/**
 * La cita de una fila de BDNS: su ficha pública, o su código. Nunca `bdns:` a
 * secas — una cita que no lleva a ningún sitio no es una cita, y
 * `check:citations` no puede resolver lo que no nombra nada.
 */
export function bdnsRef(r: BdnsRow): string {
  return r.sourceUrl ?? r.url ?? `bdns:${r.bdnsCode ?? r.convocatoriaId ?? ''}`
}

/**
 * La línea con la que una convocatoria llega al modelo, la traiga la mitad
 * léxica o la semántica: `objeto · €importe · órgano`, sin los espacios con que
 * la fuente abre o cierra un campo.
 */
export function snippetDeBdns(r: BdnsRow): string {
  const objeto = String(r.description ?? r.titulo ?? '').trim()
  const organo = String(r.organ ?? r.organo ?? '').trim()
  const importe = bdnsAmount(r)
  let snippet = objeto
  if (importe != null) snippet += ` · €${importe.toLocaleString('es-ES')}`
  if (organo) snippet += ` · ${organo}`
  return snippet.slice(0, SNIPPET_MAXIMO)
}
