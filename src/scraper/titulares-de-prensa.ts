/**
 * Lo que dos lectores de titulares comparten — puro, sin E/S, sin dependencias.
 *
 * Vivía en press-analytics.ts, que el navegador no puede importar: arrastra
 * press.ts → hash.ts → node:crypto. /cambios agrupa su prensa por noticia
 * (`prensa-por-noticia.ts`) con la misma regla que /laboratorio, así que la
 * regla vive aquí una vez y press-analytics.ts la importa (y reexporta lo que
 * ya exportaba). Movido sin cambiar una línea de lo que hace.
 */

/** The outlet is the publisher host; with no host, the name is all there is. */
export function claveDeMedio(a: { sourceHost: string | null; source: string }): string {
  return a.sourceHost ?? `name:${a.source}`
}

// Two headlines describe "the same story" when their significant-token sets
// (>4 chars, see `tokenise`) overlap strongly. The upstream feed is deduped by
// exact-title fingerprint (press.ts), so cross-outlet coverage ALWAYS arrives
// as distinct fingerprints — clustering must key on similarity, not the hash.
// Tuned for precision (a false cross-outlet cluster misleads readers): require
// both a floor of shared distinctive tokens AND a Jaccard threshold.
const TRIANGULATION_MIN_SHARED_TOKENS = 2
const TRIANGULATION_MIN_JACCARD = 0.34

export function titlesSameStory(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false
  let shared = 0
  for (const t of a) if (b.has(t)) shared += 1
  if (shared < TRIANGULATION_MIN_SHARED_TOKENS) return false
  const union = a.size + b.size - shared
  return union > 0 && shared / union >= TRIANGULATION_MIN_JACCARD
}

/**
 * The same test on two headlines, for a caller that pairs them itself:
 * /cambios (`prensa-por-noticia.ts`) adds a date and an outlet condition, so it
 * cannot reuse the components `clusterArticlesByStory` builds.
 */
export function titularesDeLaMismaHistoria(a: string, b: string): boolean {
  return titlesSameStory(new Set(tokenise(a)), new Set(tokenise(b)))
}

export function tokenise(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4)
}

/**
 * Lo que no es contenido, ya sin tildes: el nombre del pueblo, palabras vacías de
 * más de cuatro letras, y las fórmulas de trámite y de nota de prensa que salen en
 * cualquier punto del pleno o en cualquier titular. «cuenta» NO está: sola no basta
 * (hacen falta dos), y con «general» es la Cuenta General, que sí es noticia; el
 * «Dar cuenta de las Resoluciones» que casaba por ella es un trámite y ya no entra.
 */
const NO_CONTENIDO: ReadonlySet<string> = new Set([
  // El municipio y la comunidad: salen en casi todos los titulares.
  'ribarroja',
  'turia',
  'valencia',
  'valenciana',
  'comunitat',
  // Vacías, castellano y valenciano.
  'sobre',
  'desde',
  'entre',
  'hasta',
  'hacia',
  'contra',
  'durante',
  'segun',
  'donde',
  'cuando',
  'porque',
  'aunque',
  'mientras',
  'ademas',
  'tambien',
  'todos',
  'todas',
  'otros',
  'otras',
  'mismo',
  'misma',
  'antes',
  'despues',
  'siendo',
  'estos',
  'estas',
  'nuestro',
  'nuestra',
  'puede',
  'pueden',
  'tiene',
  'tienen',
  'durant',
  'despres',
  'abans',
  'segons',
  'perque',
  'totes',
  'altres',
  'aquest',
  'aquesta',
  'aquests',
  'aquestes',
  'nostre',
  'nostra',
  'mentre',
  'sense',
  // Fórmulas de trámite y de nota de prensa.
  'acuerdo',
  'acord',
  'aprobacion',
  'aprueba',
  'aprobado',
  'aprobada',
  'aprovacio',
  'aprova',
  'inicio',
  'inicia',
  'expediente',
  'expedient',
  'proyecto',
  'proyectos',
  'projecte',
  'nuevo',
  'nueva',
  'nuevos',
  'nuevas',
  'servicio',
  'servicios',
  'servei',
  'serveis',
  'suministro',
  'subministrament',
  'contrato',
  'contratos',
  'contracte',
  'contratacion',
  'contractacio',
  'licitacion',
  'licitacio',
  'procedimiento',
  'procediment',
  'adjudicacion',
  'adjudicacio',
  'municipal',
  'municipales',
  'municipals',
  'municipio',
  'municipi',
  'ayuntamiento',
  'ajuntament',
  'pleno',
  'mocion',
  'mocio',
  'grupo',
  'grupos',
  'grups',
  'asunto',
  'asuntos',
  'urgencia',
  'modificacion',
  'modificacio',
  'relativo',
  'relativa',
  'correspondiente',
  'propuesta',
  'proposta',
  'dictamen',
  'euros',
  'millones',
  'milions',
])

const sinTildes = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '')

/**
 * Las palabras de contenido de un título, en su orden y sin repetir: en minúsculas
 * y sin tildes («césped» y «cesped» son la misma), de más de cuatro letras, con
 * alguna letra (un número de expediente no es contenido) y fuera de `NO_CONTENIDO`.
 */
export function palabrasDeContenido(titulo: string): string[] {
  const out: string[] = []
  for (const w of sinTildes(titulo.toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)) {
    if (w.length <= 4 || !/\p{L}/u.test(w) || NO_CONTENIDO.has(w) || out.includes(w)) continue
    out.push(w)
  }
  return out
}
