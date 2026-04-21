// @ts-check
/**
 * Pure aggregator — reduces the five-source snapshot (officials, promises,
 * pleno-agendas, pleno-votes, quejas) to per-department stats keyed by
 * canonical DepartmentSlug. No fetch, no React — so both the hook and the
 * LiveTicker build-time scalar can share this logic, and it's trivially
 * unit-testable.
 *
 * Libel-critical rule: an agenda item only counts as a "commitment" when a
 * matching pleno-vote exists (joined on plenoId + itemNumber). Agenda items
 * without a matching vote surface as `sinVoto` — they were debated, not
 * committed to. Counting them as overdue would be defamatory.
 */

import {
  ALLOWED_DEPARTMENT_SLUGS,
  DEPARTMENT_LABEL,
  canonicalizeDepartment,
  resolveResponsibleOfficial,
} from '../scraper/departments'

/**
 * @typedef {Object} DepartmentStats
 * @property {string} slug
 * @property {string} labelEs
 * @property {string} labelCa
 * @property {object|null} responsableOfficial  first-matching concejal or null
 * @property {object} plenoVotes  { aprobado, rechazado, retirado, aplazado, plazosVencidos, total }
 * @property {object} plenoAgendas { total, sinVoto }
 * @property {object} promesas  { total, docs, enProgreso, plazosVencidos }
 * @property {object} quejas  { abiertas, silencios, total }
 */

function emptyBucket(slug) {
  return {
    slug,
    labelEs: DEPARTMENT_LABEL[slug].es,
    labelCa: DEPARTMENT_LABEL[slug].ca,
    responsableOfficial: null,
    plenoVotes: {
      aprobado: 0,
      rechazado: 0,
      retirado: 0,
      aplazado: 0,
      plazosVencidos: 0,
      total: 0,
    },
    plenoAgendas: { total: 0, sinVoto: 0 },
    promesas: { total: 0, docs: 0, enProgreso: 0, plazosVencidos: 0 },
    quejas: { abiertas: 0, silencios: 0, total: 0 },
  }
}

function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

function isOverdue(dueBy, now = new Date()) {
  if (!dueBy || typeof dueBy !== 'string') return false
  return dueBy < todayIso(now)
}

/**
 * Extract the flat list of agenda items from the nested plenos-agendas
 * snapshot. The snapshot stores items under plenos[].agenda[].
 */
function flattenAgendas(agendasSnapshot) {
  if (!agendasSnapshot?.plenos) return []
  const out = []
  for (const p of agendasSnapshot.plenos) {
    for (const it of p.agenda || []) {
      out.push({ plenoId: p.id, plenoDate: p.date, ...it })
    }
  }
  return out
}

/**
 * Main entry point. All inputs are tolerant of null/undefined — returns
 * an always-populated result with zero counts for absent data. Stable
 * deterministic output order = ALLOWED_DEPARTMENT_SLUGS order.
 */
export function computeDepartmentStats({
  officials,
  promises,
  agendas,
  votes,
  quejas,
  now = new Date(),
}) {
  /** @type {Record<string, DepartmentStats>} */
  const buckets = {}
  for (const slug of ALLOWED_DEPARTMENT_SLUGS) buckets[slug] = emptyBucket(slug)

  // Responsible official per dept
  const officialList = officials?.officials ?? officials?.items ?? []
  for (const slug of ALLOWED_DEPARTMENT_SLUGS) {
    buckets[slug].responsableOfficial = resolveResponsibleOfficial(slug, officialList) ?? null
  }

  // Pleno votes (primary commitment source)
  const voteList = votes?.items ?? []
  const voteIndex = new Map() // plenoId + itemNumber → vote (for join with agendas)
  for (const v of voteList) {
    const slug = canonicalizeDepartment(v.department)
    if (slug && buckets[slug]) {
      const bucket = buckets[slug].plenoVotes
      bucket.total += 1
      if (v.outcome in bucket) bucket[v.outcome] += 1
      if (v.outcome === 'aprobado' && isOverdue(v.dueBy, now)) {
        bucket.plazosVencidos += 1
      }
    }
    voteIndex.set(`${v.plenoId}|${v.itemNumber}`, v)
  }

  // Pleno agendas (secondary — debated items, only commitments when a
  // matching vote exists)
  const agendaList = flattenAgendas(agendas)
  for (const it of agendaList) {
    const slug = it.departmentSlug || canonicalizeDepartment(it.department)
    if (!slug || !buckets[slug]) continue
    buckets[slug].plenoAgendas.total += 1
    if (!voteIndex.has(`${it.plenoId}|${it.number}`)) {
      buckets[slug].plenoAgendas.sinVoto += 1
    }
  }

  // Promises
  const promiseList = promises?.items ?? []
  for (const p of promiseList) {
    const slug = p.departmentSlug
    if (!slug || !buckets[slug]) continue
    buckets[slug].promesas.total += 1
    if (p.status === 'documentada') buckets[slug].promesas.docs += 1
    if (p.status === 'en-progreso' || p.status === 'en-verificacion') {
      buckets[slug].promesas.enProgreso += 1
    }
    // Soft flag — the V1 gate still controls publishable status. This counts
    // how many hand-curated promesas have a past dueBy and no later
    // "cumplida/parcial" status on the record.
    if (isOverdue(p.dueBy, now) && p.status !== 'cumplida' && p.status !== 'parcial') {
      buckets[slug].promesas.plazosVencidos += 1
    }
  }

  // Quejas (optional, read-only)
  const quejaList = quejas?.items ?? []
  const CLOSED_STATES = new Set(['resuelta', 'cerrada_no_registrada'])
  for (const q of quejaList) {
    // Quejas are categorized by `category` (snake_case) which canonicalizes
    // directly via departments.ts rules.
    const slug = canonicalizeDepartment(q.category)
    if (!slug || !buckets[slug]) continue
    buckets[slug].quejas.total += 1
    if (!CLOSED_STATES.has(q.state)) buckets[slug].quejas.abiertas += 1
    if (q.state === 'silencio_negativo') buckets[slug].quejas.silencios += 1
  }

  // Return as both a map (for detail pages) and an ordered list (for the
  // index grid). Keep order = ALLOWED_DEPARTMENT_SLUGS for stability.
  const list = ALLOWED_DEPARTMENT_SLUGS.map((s) => buckets[s])

  // Top-level scalar: total plazos vencidos across all dept + source.
  let plazosVencidosCount = 0
  for (const b of list) {
    plazosVencidosCount += b.plenoVotes.plazosVencidos + b.promesas.plazosVencidos
  }

  return { bySlug: buckets, list, plazosVencidosCount }
}
