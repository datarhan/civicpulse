/**
 * Una licitación cuyo contrato gemelo publica un estado no aporta el suyo.
 *
 * `tenders.json` trae dos tablas de Gobierto: `contracts`, el estado del
 * contrato, y `tenders`, el de la licitación. Cuando hablan del mismo documento
 * de PLACSP comparten `permalink`, y sus estados pueden no casar: medido el
 * 2026-10-19, 109 licitaciones `revoked` tienen un contrato gemelo `awarded`
 * —55V/2024, la emergencia de pluviales tras la DANA adjudicada a Hidraqua el
 * 12-12-2024, es una— y otras llevan `abandoned` o `provisionally_awarded`
 * junto a un contrato adjudicado o formalizado.
 *
 * El verificador concatenaba las dos tablas y las leía como dos registros
 * distintos. Así, la rama «obra terminada» de `claim-verifier.ts` podía
 * devolver `contradicho` porque «el contrato aún figura como «revoked»» cuando
 * el contrato, en la misma base, figura adjudicado; y la lista corta, léxica y
 * semántica, enseñaba al modelo un expediente adjudicado y revocado a la vez
 * (tests/claim-verifier-gemelos-de-licitacion.test.ts cuenta cómo).
 *
 * CORREGIDO el mismo 19-10: esas licitaciones no estaban revocadas. Gobierto
 * escribe `revoked` en las que la Plataforma tiene «Adjudicada» (13 de 14
 * cotejadas), y el resto de su vocabulario de licitaciones está igual de
 * corrido; el parser lo traduce ahora (`estadoDeLicitacion`, tenders.ts). La
 * regla de este módulo sigue haciendo falta: la tabla de licitaciones y la de
 * contratos pueden seguir sin casar —una licitación que la Plataforma deja «en
 * evaluación» desde 2019 junto a su contrato adjudicado—, y el contrato manda.
 *
 * El registro del contrato manda. Tres decisiones, cada una con su porqué:
 *
 *   · Se QUITA el estado de la licitación; la fila se queda. Lo único que la
 *     licitación dice y el contrato no es su importe de licitación, que en un
 *     expediente con lotes es el total y no el de un lote (53/2022). Ése es el
 *     motivo por el que `embed-verifier-corpus.ts` ya deja entrar a las que no
 *     repiten a su contrato, y por el que la rama de importes debe poder seguir
 *     casándolas. Tampoco se le escribe el estado del contrato: la licitación no
 *     lo publicó, y el contrato ya está en la misma lista diciéndolo él. Es el
 *     trato que `sinVoidDeLicitacion` (src/lib/crosschecked-status.js) da al
 *     `void` de una licitación: no aporta nada, y el contrato sigue hablando.
 *
 *   · El gemelo se busca por ENLACE, no por `id`. Gobierto da a los contratos
 *     el id de su licitación, pero a los derivados de un sistema dinámico de
 *     adquisición el del SDA: el 2026-10-19, 7 licitaciones compartían id con
 *     un contrato de OTRO enlace, que es otro documento. El enlace se compara
 *     sin su codificación, porque el mismo registro llega como
 *     `deeplink:detalle_licitacion` y como `deeplink%3Adetalle_…`
 *     (`mismoEnlace` en subida-firmada.ts).
 *
 *   · Sólo cuenta un contrato que publica un estado. `unknown` es un centinela
 *     y no un valor (regla 3 de DATA_INTEGRITY): un contrato que «no sabe» no
 *     tiene nada que oponer, y quitarle el estado a su licitación callaría lo
 *     único que el registro dice. Qué es un estado lo decide `contract-status.js`,
 *     no una lista copiada aquí (regla 1).
 *
 * Lo que NO se toca: `revoked` sigue en `TENDER_NOT_DONE_STATUSES`. Una
 * licitación que de verdad se revocó y no dejó contrato sigue siendo evidencia.
 */
import { procurementStatusKind } from '../lib/contract-status.js'

/** El enlace de PLACSP sin su codificación, o `null` si la fila no trae uno. */
function enlaceLlano(u: unknown): string | null {
  if (typeof u !== 'string' || !u) return null
  try {
    return decodeURIComponent(u)
  } catch {
    return u
  }
}

/**
 * Las licitaciones de `tenders`, con el estado quitado a las que tienen un
 * contrato gemelo en `contracts` que publica uno. El resto, tal cual.
 */
export function sinEstadoSiLoDaSuContrato<T>(tenders: T[] | undefined, contracts: unknown): T[] {
  if (!tenders || tenders.length === 0) return []
  const conEstado = new Set<string>()
  for (const c of Array.isArray(contracts) ? contracts : []) {
    const fila = c as { permalink?: unknown; status?: unknown } | null
    const enlace = enlaceLlano(fila?.permalink)
    const estado = typeof fila?.status === 'string' ? fila.status : ''
    if (enlace && procurementStatusKind(estado) !== null) conEstado.add(enlace)
  }
  if (conEstado.size === 0) return tenders
  return tenders.map((t) => {
    const enlace = enlaceLlano((t as { permalink?: unknown } | null)?.permalink)
    return enlace && conEstado.has(enlace) ? { ...t, status: undefined } : t
  })
}
