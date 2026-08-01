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
import { topicToDeptSlugs, promiseDeptSlug } from './department-claim-topics'

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
 * @property {object} declaraciones  { total, verificado, parcial, contradicho, promesaRepetida, sinDatos, conEvidencia }
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
    /** Claims surfaced from the verifier (deterministic + LLM-second-pass).
     *  conEvidencia = verificado + parcial + contradicho — the editorially
     *  meaningful number. sinDatos is excluded; promesa-repetida tracked
     *  separately because it has its own UI affordance. */
    declaraciones: {
      total: 0,
      verificado: 0,
      parcial: 0,
      contradicho: 0,
      promesaRepetida: 0,
      sinDatos: 0,
      conEvidencia: 0,
    },
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
 * Add `count` claims with `verdict` into a dept bucket's declaraciones.
 * Shared by the items path and the manifest cross-tab path so the two
 * can never drift on verdict bucketing.
 */
function addDeclaraciones(d, verdict, count) {
  d.total += count
  if (verdict === 'verificado') {
    d.verificado += count
    d.conEvidencia += count
  } else if (verdict === 'parcial') {
    d.parcial += count
    d.conEvidencia += count
  } else if (verdict === 'contradicho') {
    d.contradicho += count
    d.conEvidencia += count
  } else if (verdict === 'promesa-repetida') {
    d.promesaRepetida += count
  } else if (verdict === 'sin-datos') {
    d.sinDatos += count
  }
}

/**
 * Main entry point. All inputs are tolerant of null/undefined — returns
 * an always-populated result with zero counts for absent data. Stable
 * deterministic output order = ALLOWED_DEPARTMENT_SLUGS order.
 * @param {Object} input
 * @param {any} [input.officials]
 * @param {any} [input.promises]
 * @param {any} [input.agendas]
 * @param {any} [input.votes]
 * @param {any} [input.quejas]
 * @param {any} [input.claims]
 * @param {any} [input.claimsSummary]  topic→verdict→count cross-tab (the chunk
 *   manifest's totals.byTopicVerdict); when present it is used INSTEAD of
 *   claims.items — same numbers, none of the corpus download
 * @param {Date} [input.now]
 */
export function computeDepartmentStats({
  officials,
  promises,
  agendas,
  votes,
  quejas,
  claims,
  claimsSummary,
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
    const slug = promiseDeptSlug(p)
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
    // quejas.json is an Open311 GeoReport payload (bot/src/services/snapshot.ts),
    // so the category is `service_code` and the lifecycle is `status`. This read
    // `q.category` / `q.state` — names no published snapshot has ever carried —
    // so canonicalizeDepartment(undefined) returned null and EVERY queja was
    // skipped for EVERY department. The unit fixture used the same invented
    // shape, so the suite stayed green while /departamentos showed zero citizen
    // complaints. The fallbacks keep the older hand-written shape working.
    const slug = canonicalizeDepartment(q.service_code ?? q.category)
    if (!slug || !buckets[slug]) continue
    const status = q.status ?? q.state
    buckets[slug].quejas.total += 1
    if (!CLOSED_STATES.has(status)) buckets[slug].quejas.abiertas += 1
    if (status === 'silencio_negativo') buckets[slug].quejas.silencios += 1
  }

  // Verified claims (deterministic + LLM second-pass). Each claim's topic
  // maps to one or more dept slugs via DEPT_TO_CLAIM_TOPICS — claims about
  // «vivienda» surface on both /departamentos/vivienda and /urbanismo,
  // matching how citizens think about responsibility. We count by verdict
  // and aggregate `conEvidencia = verificado + parcial + contradicho` as
  // the editorially-meaningful "claim has data backing it" total.
  if (claimsSummary && typeof claimsSummary === 'object') {
    // Cross-tab from the chunk manifest (totals.byTopicVerdict) — same
    // numbers as iterating the items, computed by the chunker over the
    // exact item set the chunks contain.
    for (const [topic, verdicts] of Object.entries(claimsSummary)) {
      const slugs = topicToDeptSlugs(topic)
      for (const [verdict, raw] of Object.entries(verdicts ?? {})) {
        const count = Number(raw) || 0
        if (count <= 0) continue
        for (const slug of slugs) {
          if (!buckets[slug]) continue
          addDeclaraciones(buckets[slug].declaraciones, verdict, count)
        }
      }
    }
  } else {
    const claimList = claims?.items ?? []
    for (const it of claimList) {
      const topic = it?.claim?.topic
      const verdict = it?.verification?.verdict
      if (!topic || !verdict) continue
      for (const slug of topicToDeptSlugs(topic)) {
        if (!buckets[slug]) continue
        addDeclaraciones(buckets[slug].declaraciones, verdict, 1)
      }
    }
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
