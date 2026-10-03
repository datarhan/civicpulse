/**
 * Los importes de un expediente de contratación, con su nombre, y el puente
 * entre el que imprime una fila de evidencia y el que cita quien habla.
 *
 * Un expediente trae varios importes a la vez —de licitación y de
 * adjudicación, con IVA y sin él, el valor estimado— y el emparejador de
 * claim-verifier.ts compara UNO por fila: el primero de `CAMPOS_DEL_EMPAREJADOR`
 * que la fila publique. La fila de evidencia imprime ese mismo, así que no
 * miente; pero puede no ser la magnitud que citó el concejal.
 *
 * El caso, visto el 30-09-2026 en /plenos/k4olcs: la cita «sistema de debate,
 * captura y grabación de vídeo y control del salón de plenos» lleva «81 K €» y
 * «Verificado», y su fila CONTRATO acaba en «70.158 €». El emparejador eligió
 * la fila de `tenders` —la licitación—, cuyo primer importe es el presupuesto
 * base sin IVA; los 80.666,66 € que se citaron son el importe de adjudicación
 * con IVA de la fila de `contracts` del mismo expediente, que no comparó. Dos
 * cifras ciertas y ninguna manera de cuadrarlas desde la página (skill
 * revisar-superficies, «Cuando las dos cifras son CIERTAS»).
 *
 * El puente se DERIVA del `tenders.json` servido y es CONDICIONAL: sale sólo
 * cuando lo impreso no es la cifra citada y otro importe del mismo expediente
 * sí lo es, y desaparece solo el día que eso deje de pasar. No toca el
 * veredicto ni la fila: dice qué es cada cifra.
 *
 * Puro —sin fs, sin red, sin Date— porque lo cargan el verificador y el
 * navegador: el orden de los campos tiene que ser uno, o la página nombraría
 * una magnitud distinta de la que el emparejador leyó.
 */

/**
 * Los campos de importe que el emparejador lee de una fila, en su orden, sin
 * IVA donde la fila lo trae. Gobierto proyecta `finalAmount` / `initialAmount`
 * (con sus `NoTaxes`) y TED `totalValueEur`; los tres últimos nombres no los
 * trae hoy ninguna fila y se leían antes que los buenos (ver `tenderAmount`).
 */
export const CAMPOS_DEL_EMPAREJADOR = [
  'finalAmountNoTaxes',
  'initialAmountNoTaxes',
  'finalAmount',
  'initialAmount',
  'totalValueEur',
  'award_amount_eur',
  'awarded_amount',
  'amount',
] as const

export type CampoDelEmparejador = (typeof CAMPOS_DEL_EMPAREJADOR)[number]

export interface ImporteLeido {
  campo: CampoDelEmparejador
  valor: number
}

/**
 * El importe que el emparejador lee de una fila, y de qué campo sale.
 *
 * Decide el PRIMER campo presente, como la cadena de `??` que sustituye: un
 * campo a 0 no deja pasar al siguiente, deja la fila sin importe. Es el
 * comportamiento de siempre y no se cambia aquí.
 */
export function importeDelEmparejador(fila: unknown): ImporteLeido | null {
  if (!fila || typeof fila !== 'object') return null
  const r = fila as Record<string, unknown>
  for (const campo of CAMPOS_DEL_EMPAREJADOR) {
    if (r[campo] == null) continue
    const valor = Number(r[campo])
    return Number.isFinite(valor) && valor > 0 ? { campo, valor } : null
  }
  return null
}

/** Qué es cada importe que una fila puede imprimir, dicho para el lector. */
const QUE_ES: Record<CampoDelEmparejador, string> = {
  finalAmountNoTaxes: 'el importe de adjudicación, sin IVA',
  initialAmountNoTaxes: 'el presupuesto base de licitación, sin IVA',
  finalAmount: 'el importe de adjudicación, con IVA',
  initialAmount: 'el presupuesto base de licitación, con IVA',
  totalValueEur: 'el valor total que publica TED',
  award_amount_eur: 'el importe que publica la fila',
  awarded_amount: 'el importe que publica la fila',
  amount: 'el importe que publica la fila',
}

/**
 * Los importes del expediente donde se busca la cifra citada, en el orden en
 * que se prefieren si hay varios iguales, y cómo se dice cada uno. El valor
 * estimado va aparte de los de la fila: es la magnitud legal del contrato
 * (prórrogas incluidas), y en la licitación Gobierto la llama `contractValue`.
 */
const MAGNITUDES = {
  finalAmount: (v: string) => `se adjudicó por ${v} con IVA`,
  finalAmountNoTaxes: (v: string) => `se adjudicó por ${v} sin IVA`,
  initialAmount: (v: string) => `salió a licitación por ${v} con IVA`,
  initialAmountNoTaxes: (v: string) => `salió a licitación por ${v} sin IVA`,
  estimatedValue: (v: string) => `tiene un valor estimado de ${v}`,
  contractValue: (v: string) => `tiene un valor estimado de ${v}`,
} as const

export type Magnitud = keyof typeof MAGNITUDES

export interface Puente {
  cifra: number
  impreso: ImporteLeido
  citado: { campo: Magnitud; valor: number; lote: { numero: number | null } | null }
}

interface Evidencia {
  kind?: unknown
  ref?: unknown
  snippet?: unknown
}

/**
 * El importe que la fila imprime, en euros enteros: el último «N €» de su
 * texto, que es donde lo pone el verificador. `null` si no imprime ninguno
 * —«importe no publicado», «estado: …»— o lo imprime con otra forma: sin saber
 * qué se imprimió no se puede tender un puente desde ahí.
 */
export function importeImpreso(snippet: unknown): number | null {
  const m = [...String(snippet ?? '').matchAll(/(?<![\d.,])(\d+(?:\.\d{3})*) €/g)]
  if (m.length === 0) return null
  return Number(m[m.length - 1][1].replace(/\./g, ''))
}

/** A menos de un euro: la cita trae euros enteros y el expediente, céntimos. */
const esLaCifra = (valor: number, cifra: number) => Math.abs(valor - cifra) < 1

/**
 * ¿Hay dos cifras que cuadrar en esta fila? Una fila CONTRATO con enlace, bajo
 * una cita con cifra, que imprime otra. Sin esto no hace falta mirar el
 * expediente, y la página no descarga `tenders.json` para nada.
 */
export function necesitaPuente(cifra: unknown, evidencia: Evidencia | null | undefined): boolean {
  if (evidencia?.kind !== 'tender' || typeof evidencia.ref !== 'string' || !evidencia.ref)
    return false
  if (typeof cifra !== 'number' || !(cifra > 0)) return false
  const impreso = importeImpreso(evidencia.snippet)
  return impreso != null && !esLaCifra(impreso, cifra)
}

const lista = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x : [])

/**
 * El puente entre lo que imprime la fila y la cifra citada, o `null`.
 *
 * Lo impreso se identifica con el orden del emparejador en las filas del mismo
 * expediente —las que comparten su enlace—, y la cifra se busca en todos sus
 * importes con nombre. Si lo impreso no se reconoce, o ningún importe es la
 * cifra, no hay puente: un puente adivinado sería una tercera cifra sin padre.
 *
 * @param snapshot  el `tenders.json` servido, entero.
 */
export function puenteDeImporte(
  cifra: unknown,
  evidencia: Evidencia | null | undefined,
  snapshot: unknown,
): Puente | null {
  if (!necesitaPuente(cifra, evidencia)) return null
  const n = cifra as number
  const impreso = importeImpreso(evidencia!.snippet)
  const ref = evidencia!.ref
  const datos = (snapshot ?? {}) as { contracts?: unknown; tenders?: unknown }
  const contratos = lista(datos.contracts).filter((r) => r?.permalink === ref)
  const filas = [...contratos, ...lista(datos.tenders).filter((r) => r?.permalink === ref)]
  const leido = filas
    .map(importeDelEmparejador)
    .find((i): i is ImporteLeido => i != null && Math.round(i.valor) === impreso)
  if (!leido) return null
  for (const campo of Object.keys(MAGNITUDES) as Magnitud[]) {
    for (const f of filas) {
      const valor = Number(f[campo])
      if (!Number.isFinite(valor) || !(valor > 0) || !esLaCifra(valor, n)) continue
      // Gobierto da una fila de `contracts` por lote, con el enlace del
      // expediente entero (src/lib/tender-lotes.js): si hay varias, la cifra es
      // de un lote, y decir «el expediente» sería decir de más.
      const lote =
        contratos.includes(f) && contratos.length > 1
          ? { numero: Number(f.batchNumber) > 0 ? Number(f.batchNumber) : null }
          : null
      return { cifra: n, impreso: leido, citado: { campo, valor, lote } }
    }
  }
  return null
}

// Espacio de no separación ante el «€»: en la línea de 68 caracteres de la
// tarjeta, «80.666,66» se quedaba al final de un renglón y su «€» al principio
// del siguiente.
const NBSP = ' '
const entero = (v: number) => `${Math.round(v).toLocaleString('es-ES')}${NBSP}€`
const conCentimos = (v: number) =>
  `${v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${NBSP}€`

/** El puente, dicho para el lector: qué es la cifra de la fila, y dónde está la citada. */
export function textoDelPuente(p: Puente): string {
  const sujeto = !p.citado.lote
    ? 'El mismo expediente'
    : p.citado.lote.numero != null
      ? `El lote ${p.citado.lote.numero} del mismo expediente`
      : 'Un lote del mismo expediente'
  return (
    `${entero(p.impreso.valor)} es ${QUE_ES[p.impreso.campo]}. ` +
    `${sujeto} ${MAGNITUDES[p.citado.campo](conCentimos(p.citado.valor))}: ` +
    `la cifra citada (${entero(p.cifra)}).`
  )
}
