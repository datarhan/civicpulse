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
import type { MotivoDeRetirada } from './declaracion-retirada'
import type { MotivoDeRetencion } from './claim-public-gate'
import {
  CASILLA_DE_DESENLACE,
  desenlaceDeCotejo,
  marcasDePasada,
  type ResumenSinDatos,
} from './claim-verdicts'
import { agruparPorClaseDocumental, type FilaDocumental } from './clase-documental'
import { normalizarLiteral } from './normalize'

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
    /** La pasada que produjo el veredicto (fase 1b) y el canal de overlay por
     *  el que entró (#164): con cualquiera de los dos, una lista vacía ya no
     *  quiere decir «no había con qué» (`desenlaceDeCotejo`). */
    derivedBy?: unknown[]
    source?: string
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
    /**
     * Literales distintos por sesión entre los `items` servidos: pares
     * (pleno, literal normalizado con `normalizarLiteral`).
     *
     * `items` cuenta FILAS de extracción, y las ventanas del extractor se
     * solapan: su clave de deduplicado lleva el tipo y el tema, así que una
     * misma frase clasificada de dos maneras deja dos filas. El 19-10-2026, 291
     * de 5.112. No se re-identifica ni se borra ninguna —los ids son estables
     * y otras capas cuelgan de ellos—; se dice cuántas frases son.
     *
     * Ausente en un manifiesto anterior al 19-10-2026: entonces no consta.
     */
    literalesDistintos?: number
    plenos: number
    byVerdict: Record<string, number>
    /**
     * topic → verdict → count over the exact item set written into the
     * chunks (post gateItemsForPublic). Lets /departamentos aggregate
     * per-department declaration counts from the manifest instead
     * of downloading every chunk; the topic→department mapping stays
     * client-side in src/lib/department-claim-topics.js.
     */
    byTopicVerdict: Record<string, Record<string, number>>
    /**
     * Cobertura de comprobación: de lo publicado, ¿contra qué se pudo cotejar?
     *
     * Va aquí y no en la página porque la regla de la casa es preferir un
     * escalar precomputado a enviar el corpus: `/departamentos` ya lee una
     * tabla cruzada en vez de los trozos enteros.
     *
     * Cada celda reparte su `total` en los tres desenlaces de
     * `desenlaceDeCotejo`, con los nombres de `sinDatosPorque`: aquí
     * `comprobadoSinHallar` es «con corpus» y cuenta cualquier veredicto.
     *
     * `corpus` cuenta CONSULTAS, no filas: una declaración cotejada contra dos
     * corpus suma en los dos. Es lo que se quiere saber —con qué se cuenta—,
     * no cuántas filas hay.
     */
    cobertura: {
      porTipo: Record<string, CasillaDeCobertura>
      porTema: Record<string, CasillaDeCobertura>
      corpus: Record<string, number>
      /**
       * De las declaraciones a las que no se lanzó ningún comparador (casilla
       * `sinCorpus`), qué tipo de documento NOMBRAN.
       *
       * Es el material de una solicitud de acceso. Léxico, nunca pronóstico:
       * nombrar un tipo de documento no es depender de él, y la página lo dice
       * así. Lo que no nombra ningún documento se cuenta aparte, sin
       * repartirse, y lo que sólo nombra algo que no se le puede pedir a este
       * Ayuntamiento —un acta que ya publicamos, un informe de otro órgano—,
       * en `apartadas` (`clasesQueCuentan`, clase-documental.ts).
       *
       * La misma población que la casilla `sinCorpus`, y no la de «no consta»:
       * una fila que el motor juzgó sobre candidatos, o que un curador bajó
       * leyendo un contrato, tuvo algo delante, y que dependa de un documento
       * que no se publica no consta.
       */
      porClaseDocumental: {
        porClase: Record<string, number>
        sinDocumento: number
        /** Nombran algún documento, pero todo lo que nombran se apartó. */
        apartadas: number
        total: number
      }
      /**
       * Las marcas de pasada, contadas por FILAS y con la misma lectura que
       * decide «no consta» (`marcasDePasada`: lista, `derivedBy` y canal).
       *
       * `corpus` cuenta sólo lo que lleva `checkedAgainst`, y las píldoras de
       * pasadas lo leían: el 19-10-2026 sumaban 563 al lado de un «no consta» de
       * 871, porque 308 filas llevaban la marca del motor sólo en `derivedBy`.
       * Con esto la página puede decir el puente con cifras: de las filas con
       * marca, cuántas son de «no consta» y cuántas nombran además un corpus.
       */
      pasadas: ResumenDePasadas
    }
    /**
     * Por qué `sin-datos`, sobre lo PUBLICADO (post-puerta editorial).
     * `sinCorpus` = nada anotado: no se lanzó ningún comparador (el nombre de la
     * casilla es histórico; no dice que no haya corpus, ver `desenlaceDeCotejo`);
     * `comprobadoSinHallar` = se consultaron y no hubo coincidencia;
     * `noConsta` = una pasada sustituyó la lista, no consta qué se consultó.
     * Las tres suman el `sin-datos` de `byVerdict`. Ver `resumirSinDatos` en
     * claim-verdicts.
     */
    sinDatosPorque: ResumenSinDatos
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
     * Lo mismo que `retenidas`, repartido por el motivo de la puerta
     * (`motivoDeRetencion`). Las dos particiones suman lo mismo.
     *
     * /laboratorio/cobertura decía, escrito a mano, que la puerta retiene «por
     * dos motivos distintos», y no eran los que más pesaban. Ausente cuando
     * quien construye el manifiesto no lo pasa: un objeto vacío se leería como
     * «cero de cada motivo».
     */
    retenidasPorMotivo?: Record<MotivoDeRetencion, number>
    /**
     * Retenidas porque su literal NO consta en ninguna transcripción nuestra.
     *
     * Contadas TAMBIÉN dentro de `retenidas`, que reparte por tipo todo lo que
     * no se sirve, sea cual sea el motivo: quien quiera filas que sumen tiene
     * que restarlas (`resumenPlenos` lo hace; leerlas como aparte dio en /plenos
     * dos filas que se solapaban). Se nombran por separado porque el motivo es
     * de otra clase: éstas no es que no podamos comprobar lo que dicen, es que
     * no podemos enseñar que se dijeran. Y va contado porque, si no, la
     * retirada sería invisible: la comprobación de procedencia lee lo
     * PUBLICADO, así que retirarlas la dejaría en verde sin que nadie supiera
     * cuántas hay. Un número que la puerta baja y el parte nombra.
     */
    retenidasSinProcedencia: number
    /**
     * Las que retiró una persona tras escuchar la sesión, por motivo
     * (`declaracion-retirada.ts`): su literal consta en una transcripción, pero
     * no es lo que se dijo.
     *
     * Contadas TAMBIÉN dentro de `retenidas`, como las de arriba, y fuera de
     * `retenidasSinProcedencia`: una que tampoco consta en ninguna
     * transcripción se cuenta allí (`contarRetiradas`). Así `resumenPlenos`
     * resta las dos y las filas de la tarjeta suman lo extraído. Ausente en un
     * manifiesto anterior al 30-09-2026, que es lo mismo que ninguna.
     */
    retiradas: Partial<Record<MotivoDeRetirada, number>>
  }
}

/** Una celda de la tabla de cobertura: su total y sus tres desenlaces. */
export type CasillaDeCobertura = { total: number } & ResumenSinDatos

/** Las filas con marca de pasada, y cuántas de ellas son de «no consta». */
export interface ResumenDePasadas {
  /** Por marca: filas que la llevan, y de ellas las de «no consta». */
  porMarca: Record<string, { filas: number; noConsta: number }>
  /** Filas con alguna marca (una fila con dos cuenta una vez). */
  filas: number
  /** De ellas, las de «no consta». */
  noConsta: number
  /** Filas de «no consta» sin ninguna marca declarada: un nombre sin clasificar. */
  noConstaSinMarca: number
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
  retiradas: Partial<Record<MotivoDeRetirada, number>> = {},
  retenidasPorMotivo: Record<MotivoDeRetencion, number> | null = null,
  /**
   * Las fechas de las sesiones cuya acta publicamos (pleno-actas.json). `null`
   * si no se pudo leer: entonces no se aparta ninguna acta por publicada.
   */
  sesionesConActa: ReadonlySet<string> | null = null,
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
  const sinDatosPorque: ResumenSinDatos = { sinCorpus: 0, comprobadoSinHallar: 0, noConsta: 0 }
  const porTipo: Record<string, CasillaDeCobertura> = {}
  const porTema: Record<string, CasillaDeCobertura> = {}
  const corpus: Record<string, number> = {}
  // Las filas a las que no se lanzó ningún comparador, para agruparlas por el
  // documento que nombran.
  const sinCorpusFilas: FilaDocumental[] = []
  // (pleno, literal normalizado): cuántas frases son las filas.
  const literales = new Set<string>()
  const casilla = (tabla: Record<string, CasillaDeCobertura>, k: string) =>
    (tabla[k] ??= { total: 0, sinCorpus: 0, comprobadoSinHallar: 0, noConsta: 0 })
  const pasadas: ResumenDePasadas = { porMarca: {}, filas: 0, noConsta: 0, noConstaSinMarca: 0 }
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
      // paso y por nada más no está cotejada contra ningún dato. Y tampoco es
      // una fila sin nada que consultar: de ésa no consta contra qué se cotejó.
      const desenlace = desenlaceDeCotejo(it.verification)
      const campo = CASILLA_DE_DESENLACE[desenlace]
      // Las marcas, por fila y con la lectura de `desenlace`: así las píldoras
      // de pasadas y la casilla «no consta» cuentan las mismas filas.
      const marcas = marcasDePasada(it.verification)
      const enNoConsta = desenlace === 'no-consta' ? 1 : 0
      for (const m of marcas) {
        const p = (pasadas.porMarca[m] ??= { filas: 0, noConsta: 0 })
        p.filas += 1
        p.noConsta += enNoConsta
      }
      if (marcas.length > 0) {
        pasadas.filas += 1
        pasadas.noConsta += enNoConsta
      } else {
        pasadas.noConstaSinMarca += enNoConsta
      }
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
        cel[campo] += 1
      }
      const lit = it.claim?.verbatim
      if (typeof lit === 'string') {
        literales.add(`${it.claim.plenoId}\u0000${normalizarLiteral(lit)}`)
        if (desenlace === 'sin-corpus') {
          sinCorpusFilas.push({ verbatim: lit, plenoDate: it.claim.plenoDate })
        }
      }
      if (v === 'sin-datos') sinDatosPorque[campo] += 1
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
        literalesDistintos: literales.size,
        plenos: plenosOut.length,
        byVerdict: totalsByVerdict,
        byTopicVerdict,
        cobertura: {
          porTipo,
          porTema,
          corpus,
          porClaseDocumental: agruparPorClaseDocumental(sinCorpusFilas, { sesionesConActa }),
          pasadas,
        },
        retenidas,
        ...(retenidasPorMotivo ? { retenidasPorMotivo } : {}),
        retenidasSinProcedencia,
        retiradas,
        sinDatosPorque,
      },
    },
    chunks,
  }
}
