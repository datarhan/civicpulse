// @ts-check
/**
 * Map a canonical DepartmentSlug to the set of ClaimTopic values whose
 * verified claims should surface on that department's pages.
 *
 * One-to-many on purpose — a claim tagged «vivienda» is editorially
 * relevant to both /departamentos/vivienda and /departamentos/urbanismo
 * readers. Mirrors how citizens think about responsibility, not the
 * exact ayuntamiento org chart.
 *
 * Shared between the index (Departamentos.jsx, via department-stats.js
 * aggregation) and the detail (DepartamentoDetalle.jsx, via the topic
 * filter on ClaimLedger). Keeping a single map prevents drift.
 */
export const DEPT_TO_CLAIM_TOPICS = Object.freeze({
  alcaldia: ['other'],
  urbanismo: ['urbanismo', 'vivienda'],
  'obras-publicas': ['urbanismo', 'movilidad'],
  'medio-ambiente': ['medio-ambiente'],
  movilidad: ['movilidad'],
  deportes: ['cultura'],
  educacion: ['educacion'],
  cultura: ['cultura'],
  fiestas: ['cultura'],
  juventud: ['social'],
  mayores: ['social'],
  'servicios-sociales': ['social'],
  salud: ['salud'],
  igualdad: ['social'],
  transparencia: ['transparencia'],
  hacienda: ['fiscal'],
  contratacion: ['fiscal'],
  seguridad: ['seguridad'],
  'empleo-economia': ['empleo', 'fiscal'],
  comercio: ['empleo'],
  agricultura: ['medio-ambiente'],
  turismo: ['cultura', 'empleo'],
  vivienda: ['vivienda'],
  'recursos-humanos': ['fiscal'],
  'servicios-generales': ['transparencia'],
  'bienestar-animal': ['medio-ambiente'],
  innovacion: ['other'],
  comunicacion: ['transparencia'],
})

/** Returns a Set of topics for a given dept slug (or empty Set if unknown). */
export function deptSlugToClaimTopics(slug) {
  return new Set(DEPT_TO_CLAIM_TOPICS[slug] ?? [])
}

/** Inverse map: topic → list of dept slugs that should surface this topic. */
export function topicToDeptSlugs(topic) {
  const out = []
  for (const [slug, topics] of Object.entries(DEPT_TO_CLAIM_TOPICS)) {
    if (topics.includes(topic)) out.push(slug)
  }
  return out
}
