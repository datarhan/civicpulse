/**
 * Pure helpers to chunk the monolithic pleno-claims-verified.json
 * (and pleno-claims-suggestions.json) into one JSON file per plenoId
 * plus a small manifest.
 *
 * Why: the monolith reached 4-7 MB which the SPA downloads on every
 * `/declaraciones` and `/departamentos/<slug>` page view. With per-
 * pleno chunks the browser can fetch only the plenos currently in
 * view (most-recent N by default) and lazy-load the rest as the user
 * paginates. The CLIs (promote-claim, auto-curate, verify-pleno-
 * claims) keep reading the monolith on the curator's laptop where
 * 7 MB is irrelevant.
 *
 * Layout:
 *   public/data/pleno-claims/
 *     index.json                    ← manifest (small, always loaded)
 *     <plenoId>.json                ← one file per pleno
 *
 * Manifest is the contract — schema below. Chunk shape mirrors the
 * monolith but trimmed to a single pleno.
 */

import type { PlenoClaim, ClaimType, ClaimTopic } from './pleno-claim'
import { corpusReales } from './claim-verdicts'
import { agruparPorClaseDocumental } from './clase-documental'

// The verifier emits items as { claim, verification } pairs. We keep
// that shape verbatim in the chunks so the SPA hook can stitch the
// shape it had before.
export interface VerifiedClaimItem {
  claim: PlenoClaim
  verification: {
    verdict: string
    confidence: number
    summary?: string
    evidence?: unknown[]
    /** Corpus consultados. Vacío = no se consultó nada, que NO es lo mismo
     *  que haber consultado y no encontrar. Estaba cayendo bajo el índice
     *  genérico de abajo, así que no se podía leer sin castear. */
    checkedAgainst?: unknown[]
    [k: string]: unknown
  }
  /** Public-ledger visibility, stamped by the build-time gate (claim-public-gate.ts). */
  visibility?: 'shown' | 'toggle' | 'hidden'
}

export interface VerifiedSnapshot {
  generatedAt: string
  source?: unknown
  stats?: unknown
  items: VerifiedClaimItem[]
}

export interface PlenoClaimsChunkManifest {
  generatedAt: string
  /** Schema version of the chunk layout. Bump when the file format changes. */
  version: '1'
  /**
   * Per-pleno descriptor — enough metadata for the SPA to filter,
   * sort, and decide which chunks to fetch without downloading the
   * actual claims.
   */
  plenos: Array<{
    plenoId: string
    plenoDate: string
    chunkPath: string
    itemCount: number
    /** Count of `toggle` (sin-datos non-accusation) items in this chunk. */
    toggleCount: number
    byVerdict: Record<string, number>
    byType: Partial<Record<ClaimType, number>>
    byTopic: Partial<Record<ClaimTopic, number>>
    /** Sum of all items, useful as a quick freshness check. */
    bytes: number
  }>
  /** Aggregate stats — same as the monolith's stats block. */
  totals: {
    items: number
    plenos: number
    byVerdict: Record<string, number>
    /**
     * topic → verdict → count over the exact item set written into the
     * chunks (post gateItemsForPublic). Lets /departamentos aggregate
     * per-department declaration counts from the ~12 KB manifest instead
     * of downloading every chunk; the topic→department mapping stays
     * client-side in src/lib/department-claim-topics.js.
     */
    byTopicVerdict: Record<string, Record<string, number>>
    /**
     * Cobertura de comprobación: de lo publicado, ¿contra qué se pudo cotejar?
     *
     * Va aquí y no en la página porque la regla de la casa es preferir un
     * escalar precomputado a enviar el corpus: `/departamentos` ya lee una
     * tabla cruzada de ~12 KB en vez de los trozos enteros. Esto son ~1 KB.
     *
     * `corpus` cuenta CONSULTAS, no filas: una declaración cotejada contra dos
     * corpus suma en los dos. Es lo que se quiere saber —con qué se cuenta—,
     * no cuántas filas hay.
     */
    cobertura: {
      porTipo: Record<string, { total: number; sinCorpus: number; comprobadoSinHallar: number }>
      porTema: Record<string, { total: number; sinCorpus: number; comprobadoSinHallar: number }>
      corpus: Record<string, number>
      /**
       * De las declaraciones SIN corpus, qué documento nombran.
       *
       * Es el material de una solicitud de acceso: «estas N dependen de un
       * informe técnico que no se publica». Léxico, nunca pronóstico — y lo que
       * no nombra ningún documento se cuenta aparte, sin repartirse, porque
       * repartirlo haría que cualquier clase pareciera mayor de lo que es.
       */
      porClaseDocumental: {
        porClase: Record<string, number>
        sinDocumento: number
        total: number
      }
    }
    /**
     * Por qué `sin-datos`, sobre lo PUBLICADO (post-puerta editorial).
     * `sinCorpus` = no se consultó ningún corpus; `comprobadoSinHallar` = se
     * consultaron y no hubo coincidencia. Las dos suman el `sin-datos` de
     * `byVerdict`. Ver `resumirSinDatos` en claim-verdicts.
     */
    sinDatosPorque: { sinCorpus: number; comprobadoSinHallar: number }
    /**
     * Lo que la puerta editorial RETIENE, por tipo.
     *
     * Sin esto, un tipo que se retiene entero desaparece de la tabla y el
     * lector concluye que no lo extraemos — que es peor que la verdad. La regla
     * 2 del laboratorio dice que la ausencia se publica como ausencia, y una
     * fila que no está no la publica.
     */
    retenidas: Record<string, number>
    /**
     * Retenidas porque su literal NO consta en ninguna transcripción nuestra.
     *
     * Aparte de `retenidas` —que reparte por tipo lo que la puerta editorial se
     * lleva por no estar fundado— porque el motivo es de otra clase: éstas no
     * es que no podamos comprobar lo que dicen, es que no podemos enseñar que
     * se dijeran. Y va contado porque, si no, la retirada sería invisible: la
     * comprobación de procedencia lee lo PUBLICADO, así que retirarlas la
     * dejaría en verde sin que nadie supiera cuántas hay. Un número que la
     * puerta baja y el parte nombra.
     */
    retenidasSinProcedencia: number
  }
}

export interface PlenoClaimsChunk {
  generatedAt: string
  version: '1'
  plenoId: string
  plenoDate: string
  items: VerifiedClaimItem[]
}

/**
 * Group verified items by plenoId. Pure — no I/O.
 *
 * Returns a Map ordered by plenoDate descending (most recent first)
 * — this is the order the SPA will fetch chunks in by default, so
 * the on-disk write order matches user-perceived priority.
 */
export function groupItemsByPleno(items: VerifiedClaimItem[]): Map<string, VerifiedClaimItem[]> {
  const byPleno = new Map<string, VerifiedClaimItem[]>()
  for (const it of items) {
    const id = it.claim.plenoId
    if (!byPleno.has(id)) byPleno.set(id, [])
    byPleno.get(id)!.push(it)
  }
  // Sort each pleno's items by segmentIndex so the chunk read by the
  // SPA is in transcript order — no client-side sort needed for the
  // common case.
  for (const list of byPleno.values()) {
    list.sort((a, b) => a.claim.segmentIndex - b.claim.segmentIndex)
  }
  // Sort the Map by plenoDate descending.
  const ordered = new Map<string, VerifiedClaimItem[]>()
  const dateFor = (plenoId: string) => byPleno.get(plenoId)?.[0]?.claim.plenoDate ?? ''
  const sortedKeys = [...byPleno.keys()].sort((a, b) => dateFor(b).localeCompare(dateFor(a)))
  for (const k of sortedKeys) ordered.set(k, byPleno.get(k)!)
  return ordered
}

/**
 * Build a manifest descriptor + per-pleno chunk for one pleno's items.
 * The descriptor goes into the manifest's `plenos[]`; the chunk JSON
 * is written to `pleno-claims/<plenoId>.json`.
 */
export function buildChunkAndDescriptor(
  plenoId: string,
  items: VerifiedClaimItem[],
  generatedAt: string,
): {
  chunk: PlenoClaimsChunk
  descriptor: PlenoClaimsChunkManifest['plenos'][number]
} {
  const plenoDate = items[0]?.claim.plenoDate ?? ''
  const byVerdict: Record<string, number> = {}
  const byType: Partial<Record<ClaimType, number>> = {}
  const byTopic: Partial<Record<ClaimTopic, number>> = {}
  let toggleCount = 0
  for (const it of items) {
    const v = it.verification?.verdict
    if (typeof v === 'string') byVerdict[v] = (byVerdict[v] ?? 0) + 1
    byType[it.claim.type] = (byType[it.claim.type] ?? 0) + 1
    byTopic[it.claim.topic] = (byTopic[it.claim.topic] ?? 0) + 1
    if (it.visibility === 'toggle') toggleCount += 1
  }
  const chunk: PlenoClaimsChunk = {
    generatedAt,
    version: '1',
    plenoId,
    plenoDate,
    items,
  }
  const serialized = JSON.stringify(chunk, null, 2)
  return {
    chunk,
    descriptor: {
      plenoId,
      plenoDate,
      chunkPath: `pleno-claims/${plenoId}.json`,
      itemCount: items.length,
      toggleCount,
      byVerdict,
      byType,
      byTopic,
      bytes: Buffer.byteLength(serialized, 'utf8'),
    },
  }
}

/**
 * Build the full manifest from grouped items. Pure — caller writes
 * the manifest + chunks to disk.
 */
export function buildManifest(
  itemsByPleno: Map<string, VerifiedClaimItem[]>,
  generatedAt: string,
  retenidas: Record<string, number> = {},
  retenidasSinProcedencia = 0,
): {
  manifest: PlenoClaimsChunkManifest
  chunks: Map<string, PlenoClaimsChunk>
} {
  const plenosOut: PlenoClaimsChunkManifest['plenos'] = []
  const chunks = new Map<string, PlenoClaimsChunk>()
  const totalsByVerdict: Record<string, number> = {}
  const byTopicVerdict: Record<string, Record<string, number>> = {}
  // El desglose de `sin-datos` se acumula sobre los items YA pasados por la
  // puerta editorial: describe lo que se publica, no el corpus interno. Es la
  // diferencia entre «de lo que enseñamos, esto no pudimos comprobarlo» y una
  // cifra sobre acusaciones que a propósito no se enseñan.
  const sinDatosPorque = { sinCorpus: 0, comprobadoSinHallar: 0 }
  const porTipo: Record<string, { total: number; sinCorpus: number; comprobadoSinHallar: number }> =
    {}
  const porTema: Record<string, { total: number; sinCorpus: number; comprobadoSinHallar: number }> =
    {}
  const corpus: Record<string, number> = {}
  // Los literales de las filas SIN corpus real, para agruparlos por el
  // documento que nombran.
  const sinCorpusVerbatims: string[] = []
  const casilla = (
    tabla: Record<string, { total: number; sinCorpus: number; comprobadoSinHallar: number }>,
    k: string,
  ) => (tabla[k] ??= { total: 0, sinCorpus: 0, comprobadoSinHallar: 0 })
  let totalItems = 0
  for (const [plenoId, items] of itemsByPleno) {
    const { chunk, descriptor } = buildChunkAndDescriptor(plenoId, items, generatedAt)
    plenosOut.push(descriptor)
    chunks.set(plenoId, chunk)
    totalItems += descriptor.itemCount
    for (const [k, v] of Object.entries(descriptor.byVerdict)) {
      totalsByVerdict[k] = (totalsByVerdict[k] ?? 0) + v
    }
    for (const it of items) {
      const t = it.claim?.topic
      const v = it.verification?.verdict
      const listados = it.verification?.checkedAgainst ?? []
      for (const c of listados) {
        if (typeof c === 'string') corpus[c] = (corpus[c] ?? 0) + 1
      }
      // Los CORPUS, sin las marcas de pasada: una fila revisada por el segundo
      // paso y por nada más no está cotejada contra ningún dato.
      const consultados = corpusReales(listados)
      // La cobertura mira TODAS las filas, no sólo las `sin-datos`: la pregunta
      // es «¿contra qué se pudo cotejar?», y una fila verificada también
      // contesta a eso.
      for (const [tabla, clave] of [
        [porTipo, it.claim?.type],
        [porTema, it.claim?.topic],
      ] as const) {
        if (typeof clave !== 'string') continue
        const cel = casilla(tabla, clave)
        cel.total += 1
        if (consultados.length === 0) cel.sinCorpus += 1
        else cel.comprobadoSinHallar += 1
      }
      if (consultados.length === 0) {
        const lit = it.claim?.verbatim
        if (typeof lit === 'string') sinCorpusVerbatims.push(lit)
      }
      if (v === 'sin-datos') {
        if (consultados.length === 0) sinDatosPorque.sinCorpus += 1
        else sinDatosPorque.comprobadoSinHallar += 1
      }
      if (typeof t !== 'string' || typeof v !== 'string') continue
      const row = (byTopicVerdict[t] ??= {})
      row[v] = (row[v] ?? 0) + 1
    }
  }
  // Most recent pleno first (mirror groupItemsByPleno order).
  plenosOut.sort((a, b) => b.plenoDate.localeCompare(a.plenoDate))
  return {
    manifest: {
      generatedAt,
      version: '1',
      plenos: plenosOut,
      totals: {
        items: totalItems,
        plenos: plenosOut.length,
        byVerdict: totalsByVerdict,
        byTopicVerdict,
        cobertura: {
          porTipo,
          porTema,
          corpus,
          porClaseDocumental: agruparPorClaseDocumental(sinCorpusVerbatims),
        },
        retenidas,
        retenidasSinProcedencia,
        sinDatosPorque,
      },
    },
    chunks,
  }
}
