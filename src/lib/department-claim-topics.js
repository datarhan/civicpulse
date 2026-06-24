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

/**
 * Promise routing: a promise's `topic` (ALLOWED_TOPICS in scraper/promises.ts)
 * → the single concejalía that owns it. Used ONLY as a fallback when a curated
 * `departmentSlug` is absent, so curators can still override per record.
 *
 * One-to-one (unlike the claim-topic map) because a promise belongs to one
 * department. `participacion` routes to `transparencia` (Transparencia /
 * Gobierno Abierto / Participación are one área in this ayuntamiento); `other`
 * stays unrouted (null) — an honest "no department" rather than a guess.
 * Every target is a valid ALLOWED_DEPARTMENT_SLUGS entry.
 */
export const PROMISE_TOPIC_TO_DEPT = Object.freeze({
  fiscal: 'hacienda',
  vivienda: 'vivienda',
  movilidad: 'movilidad',
  'medio-ambiente': 'medio-ambiente',
  social: 'servicios-sociales',
  cultura: 'cultura',
  seguridad: 'seguridad',
  empleo: 'empleo-economia',
  urbanismo: 'urbanismo',
  salud: 'salud',
  participacion: 'transparencia',
  educacion: 'educacion',
  deporte: 'deportes',
  juventud: 'juventud',
  mayores: 'mayores',
  igualdad: 'igualdad',
  transparencia: 'transparencia',
  // 'other' → unrouted
})

/**
 * A promise's effective department slug: the curated `departmentSlug` wins;
 * otherwise route by `topic`; otherwise null (e.g. topic 'other'). Mirrors the
 * `departmentSlug || canonicalizeDepartment(...)` fallback used for agendas.
 */
export function promiseDeptSlug(p) {
  return p?.departmentSlug || PROMISE_TOPIC_TO_DEPT[p?.topic] || null
}
