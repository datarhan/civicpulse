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
  departmentForTender,
} from '../scraper/departments'
import { topicToDeptSlugs, promiseDeptSlug } from './department-claim-topics'
import { medibilidad } from './reloj-lpacap'

/** Los estados en que una queja ya no está abierta. */
export const ESTADOS_CERRADOS = new Set(['resuelta', 'cerrada_no_registrada'])

/**
 * La concejalía de una queja publicada.
 *
 * `quejas.json` es un GeoReport de Open311 (bot/src/services/snapshot.ts): la
 * categoría va en `service_code`. Se exporta porque la ficha del departamento
 * filtra su lista con la misma regla, y cuando la escribía por su cuenta leía
 * `category` —un nombre que ninguna instantánea publicada ha traído— y la lista
 * salía vacía con el contador de encima diciendo que había quejas. El
 * `category` de respaldo mantiene la forma antigua escrita a mano.
 */
export function departamentoDeQueja(q) {
  return canonicalizeDepartment(q?.service_code ?? q?.category)
}

/**
 * @typedef {Object} DepartmentStats
 * @property {string} slug
 * @property {string} labelEs
 * @property {string} labelCa
 * @property {object|null} responsableOfficial  first-matching concejal or null
 * @property {object} plenoVotes  { aprobado, rechazado, retirado, aplazado, plazosVencidos, total }
 * @property {object} plenoAgendas { total, sinVoto }
 * @property {object} promesas  { total, docs, enProgreso, plazosVencidos }
 * @property {object} quejas  { total, abiertas, silencios, medible, motivo }: abiertas y
 *   silencios son null, con su motivo, mientras ninguna queja del área esté registrada
 * @property {object} contratacion  { contratos, importeEur, anios } — awarded spend owned by this
 *   concejalía; `anios` es { desde, hasta } de SUS contratos con fecha, o null si no tiene ninguno
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
    quejas: { total: 0, abiertas: 0, silencios: 0, medible: true, motivo: null },
    /** Awarded public spending owned by this concejalía. Only contracts whose
     *  Gobierto category maps unambiguously to a department are counted, so the
     *  figure UNDER-states rather than mis-attributes. */
    contratacion: { contratos: 0, importeEur: 0, anios: null },
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
 * @param {any} [input.tenders]  contracts snapshot; awarded rows are attributed
 *   to the concejalía that owns their category (unambiguous ones only)
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
  tenders,
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
  // Counted independently of the department buckets. `department` is optional
  // on a curated vote and 16 of 19 records omit it, so anything summed from the
  // buckets alone silently drops those — including the ONLY vote in the file
  // that carries a `dueBy`. That is why the landing page published "0 plazos
  // vencidos" while a commitment approved with a verbatim deadline from the
  // acta was five months overdue: not because nothing was overdue, but because
  // the one overdue record had no bucket to land in.
  let unbucketedOverdueVotes = 0
  for (const v of voteList) {
    const slug = canonicalizeDepartment(v.department)
    if (!slug || !buckets[slug]) {
      if (v.outcome === 'aprobado' && isOverdue(v.dueBy, now)) unbucketedOverdueVotes += 1
    }
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
  //
  // quejas.json is an Open311 GeoReport payload (bot/src/services/snapshot.ts),
  // so the category is `service_code` and the lifecycle is `status`. This once
  // read `q.category` / `q.state` — names no published snapshot has ever
  // carried — so EVERY queja was skipped for EVERY department, while the unit
  // fixture used the same invented shape and stayed green. The fallbacks keep
  // the older hand-written shape working.
  const quejaList = quejas?.items ?? []
  const crudas = {}
  for (const q of quejaList) {
    const slug = departamentoDeQueja(q)
    if (!slug || !buckets[slug]) continue
    const status = q.status ?? q.state
    if (!crudas[slug]) crudas[slug] = { total: 0, abiertas: 0, silencios: 0 }
    crudas[slug].total += 1
    if (!ESTADOS_CERRADOS.has(status)) crudas[slug].abiertas += 1
    if (status === 'silencio_negativo') crudas[slug].silencios += 1
  }
  // Y se publican con la regla del registro, la misma que por cargo y por barrio
  // (`lib/reloj-lpacap`), que es donde vive y no se reescribe aquí. «Quejas
  // abiertas 1» junto al nombre de quien dirige el área afirma que el
  // ayuntamiento debe una respuesta, y sólo puede deberla desde que la queja
  // entra en su registro. Con la única queja publicada —capturada y sin
  // registrar— esta página decía justo eso. Cuántas se asignaron sí se da: es un
  // hecho del canal, no una nota sobre el ayuntamiento.
  //
  // Primero el listado ENTERO. Sin él ni un «0» es un dato: las quejas que faltan
  // podrían ser de un área que ahora no tiene ninguna listada.
  const listado = medibilidad(quejas, () => false).motivo
  const sinCifras = (motivo, total) => ({
    total,
    abiertas: null,
    silencios: null,
    medible: false,
    motivo,
  })
  for (const slug of ALLOWED_DEPARTMENT_SLUGS) {
    const c = crudas[slug] ?? { total: 0, abiertas: 0, silencios: 0 }
    if (listado === 'sinDatos' || listado === 'exportIncompleto') {
      buckets[slug].quejas = sinCifras(listado, null)
    } else if (c.total === 0) {
      buckets[slug].quejas = { ...c, medible: true, motivo: null }
    } else {
      const m = medibilidad(quejas, (q) => departamentoDeQueja(q) === slug)
      buckets[slug].quejas = m.medible
        ? { ...c, medible: true, motivo: null }
        : sinCifras(m.motivo, c.total)
    }
  }

  // Contratación. The largest money dataset had no owner at all: Gobierto
  // labels each contract with an English `categoryTitle`, which the Spanish
  // keyword rules never matched, so all 804 awarded contracts reached no
  // concejalía. Only awarded rows count — a tender still open has moved no
  // money — and only unambiguous categories, so the number under-states
  // instead of putting a wrong owner on a spending figure.
  for (const c of tenders?.contracts ?? []) {
    // Count a contract as spent money when it names a WINNER and was not
    // revoked — not when `status === 'awarded'`. Gobierto leaves status as
    // "unknown" on 413 of 804 rows that plainly are awarded (assignee,
    // awardDate and amount all present), so trusting that field reported
    // €15M of €138M attributable spend.
    if (!c.assignee || c.status === 'revoked') continue
    // Prefer the filed CPV codes over Gobierto's coarse category: the category
    // alone put 40 contracts under Salud that were never health spending.
    const slug = departmentForTender(c)
    if (!slug || !buckets[slug]) continue
    buckets[slug].contratacion.contratos += 1
    buckets[slug].contratacion.importeEur += Number(c.finalAmount || c.initialAmount || 0)
    // The span these euros cover, read from the rows we actually counted.
    // Without it the card shows a nine-year accumulation next to a one-year
    // municipal budget and invites the reader to compare them — the same
    // defect the landing page shipped with «Presup. 2025 €41,6M» beside
    // «Contratos adj. €68,0M». Computed, never typed: a hardcoded «2017-2026»
    // goes false on its own the next time the scraper runs.
    //
    // Y POR ÁREA, no uno para todas. Era un solo periodo global, el de todos los
    // contratos atribuidos, pegado a cada tarjeta: «Vivienda» decía 2017–2026 con
    // sus contratos entre 2018 y 2025, y la ficha de un cargo no tenía de dónde
    // sacar el de sus áreas. Un contrato sin fecha suma dinero, pero no estira el
    // periodo: no hay año que poner.
    const year = Number(String(c.awardDate ?? '').slice(0, 4))
    if (Number.isFinite(year) && year > 1990) {
      const anios = buckets[slug].contratacion.anios
      buckets[slug].contratacion.anios = anios
        ? { desde: Math.min(anios.desde, year), hasta: Math.max(anios.hasta, year) }
        : { desde: year, hasta: year }
    }
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
  let plazosVencidosCount = unbucketedOverdueVotes
  for (const b of list) {
    plazosVencidosCount += b.plenoVotes.plazosVencidos + b.promesas.plazosVencidos
  }

  return {
    bySlug: buckets,
    list,
    plazosVencidosCount,
    unbucketedOverdueVotes,
  }
}
