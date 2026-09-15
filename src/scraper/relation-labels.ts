/**
 * Las etiquetas de una relación queja ↔ contrato, sin el motor que las calcula.
 *
 * Viven aparte porque las pinta la tarjeta de contrato del mapa de la portada, y
 * `queja-contract-relations.ts` arrastra el cruce con CPV del LLM: importar el motor
 * para rotular una pastilla lo metería entero en el bundle. El motor las reexporta,
 * así que su dueño sigue siendo él.
 */

// NOTE: a 'mismo expediente' tier is deferred to the deliverable that adds the
// pleno-agenda bridge (queja dept ↔ agenda item expediente ↔ contract).
export const RELATION_LABELS = [
  'misma zona y materia',
  'misma zona',
  /**
   * Department + temporal proximity. Plain 'misma materia' (department alone)
   * was retired: it linked one queja to 37% of every contract the town has
   * signed, which made the review queue unusable.
   */
  'misma materia y fechas próximas',
] as const

export type RelationLabel = (typeof RELATION_LABELS)[number]

/**
 * La clave de catálogo de cada etiqueta (`contrato.relacion.<clave>`): el valor lleva
 * espacios y no sirve de clave. Hasta #38 la tarjeta pintaba el valor tal cual, y
 * decía «misma zona» también en la portada valenciana.
 */
export const CLAVE_RELACION: Record<RelationLabel, string> = {
  'misma zona y materia': 'zonaYMateria',
  'misma zona': 'zona',
  'misma materia y fechas próximas': 'materiaYFechas',
}
