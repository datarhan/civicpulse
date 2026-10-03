/**
 * Declaraciones retiradas por una persona: el literal, escuchada la sesión, no
 * es lo que se dijo.
 *
 * La puerta pública (`claim-public-gate.ts`) hace dos preguntas. La primera
 * —¿está fundada?— la contesta el verificador. La segunda —¿se dijo?— la
 * contestaba sólo el texto: una declaración cuyo literal no consta en ninguna
 * transcripción se retiene (`sinProcedencia`). Eso caza lo que el extractor
 * inventa o suelda. No caza lo que el motor de transcripción oyó mal, porque
 * ahí el literal SÍ consta: en la transcripción que lo oyó mal.
 *
 * El caso que lo trajo, el 30-09-2026: `19gax3o-132-cit-35c4f5` se publicaba en
 * /plenos/19gax3o y /departamentos/urbanismo diciendo que el complejo de La
 * Malla se presupuestó «en el año 2006». El dosier de escucha del 29-09 —audio,
 * transcripción vigente y una segunda pasada de Whisper— oyó importes: el motor
 * sustituido convirtió una cifra en un año. `check:claim-provenance` la daba por
 * `vigente` porque su emparejador desliza una ventana de ocho palabras y la cola
 * del literal sí está en la vigente; la cabeza, con el año, sólo en la
 * sustituida (medido: cobertura 0,58 en la vigente, 0,96 en la sustituida). Y
 * midiendo el literal entero saldría `solo-superseded`, que no retiene: la
 * procedencia existe. Ningún cálculo sobre los textos distingue un importe mal
 * oído de una frase bien oída; sólo escuchar.
 *
 * Ninguna vía que ya existía dejaba de publicarla:
 *
 *   · bajarla a `sin-datos` la deja IMPRESA: `ClaimLedger` pinta también las
 *     `toggle` en /plenos/:id y /departamentos/:slug, al final de la lista. Y
 *     «sin datos» habla del contraste, no de si se dijo;
 *   · `reanchor-claim` se niega —la ventana de ocho palabras dice que «ya
 *     consta»— y, sin esa negativa, cambiaría lo que la declaración afirma —de
 *     una fecha a un sobrecoste— bajo un veredicto contrastado sobre la frase
 *     equivocada; esa misma cifra la retiene la puerta en la declaración de al
 *     lado, que es una acusación;
 *   · `reclassify-claim` sólo aleja de la acusación, y aquí el tipo está bien.
 *
 * Así que la retira una persona, con su nombre y un motivo, por la CLI que
 * escribe las decisiones de curador (`downgrade-verdict --literal-no-dicho`,
 * que construye la entrada con `retirarDeclaracion` en verified-merge.ts). La
 * entrada deja el veredicto en `sin-datos` —el que había se contrastó sobre una
 * frase que no se dijo— y lleva esta marca, que la puerta lee. Sólo baja: no
 * hay vía que la deshaga, y ninguna escritura del overlay la pisa.
 *
 * Por qué un campo de la entrada del overlay y no un conjunto que sólo conozca
 * el troceador, como `sinProcedencia`: la puerta la consultan también el
 * auto-curador, el cotejo de relaciones y la procedencia de las citas de
 * /hallazgos, y todos le pasan el item YA fusionado. Un conjunto del troceador
 * les dejaría ver fundada una declaración que la página ya no enseña.
 *
 * Sin dependencias de ejecución a propósito: la puerta la importa, y la puerta
 * corre también en el navegador.
 */
import type { OverlaySource } from './verified-merge'

/**
 * Por qué se retira. Uno solo hoy; se exporta para que el manifiesto, la
 * tarjeta de /plenos y las pruebas lo lean de aquí y un segundo motivo no se
 * quede sin contar ni sin rótulo (docs/DATA_INTEGRITY.md, regla 1).
 */
export const MOTIVOS_DE_RETIRADA = ['literal-no-dicho'] as const

export type MotivoDeRetirada = (typeof MOTIVOS_DE_RETIRADA)[number]

/** Lo que lleva la entrada del overlay, y la verificación publicada que sale de ella. */
export interface RetiradaDeDeclaracion {
  motivo: MotivoDeRetirada
  /**
   * La huella del literal que se escuchó, nunca su texto: el overlay se sirve,
   * y guardar el literal lo volvería a publicar. Quien audite rehace la huella
   * con el texto que guarda el historial del repositorio.
   */
  literal: string
}

/** La forma de la huella: `literal retirado · sha256:<12 hex>`. */
export const HUELLA_DE_LITERAL_RETIRADO_RE = /^literal retirado · sha256:[0-9a-f]{12}$/

/**
 * El canal por el que firma una persona. Tipado contra el enum del overlay,
 * como en la puerta: un renombre deja de compilar en vez de dejar de casar.
 */
const CANAL_DE_LA_PERSONA: OverlaySource = 'curator-downgrade'

/**
 * El motivo por el que una persona retiró esta declaración, o `null`.
 *
 * Lee lo que `mergeVerified` estampa desde la ENTRADA del overlay —la que
 * valida `validateOverlay`—, y sólo por el canal del curador: una pasada que
 * trajera la marca no retira nada. Un motivo que el enum no conoce tampoco: así
 * la puerta y el recuento del manifiesto no pueden discrepar.
 */
export function motivoDeRetirada(
  item: { verification?: { source?: unknown; retirada?: unknown } | null } | null | undefined,
): MotivoDeRetirada | null {
  const v = item?.verification
  if (v?.source !== CANAL_DE_LA_PERSONA) return null
  const motivo = (v.retirada as { motivo?: unknown } | null | undefined)?.motivo
  return (MOTIVOS_DE_RETIRADA as readonly unknown[]).includes(motivo)
    ? (motivo as MotivoDeRetirada)
    : null
}
