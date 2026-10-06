/**
 * La línea con la que un contrato llega al modelo que coteja una declaración:
 * sus hechos delante, enteros, y su título detrás, que es lo único que se
 * recorta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ
 *
 * El 04-10-2026, la lectura de las 52 retractaciones que el motor «ya no
 * retractaría» (editorial/rederivacion-0410-52/INFORME.md, §4 b) encontró que el
 * modelo no había visto los 35.252,87 € de la cartelería digital
 * (k4olcs-018-afi-1077bc), que coincidían al céntimo, ni los 325.662,55 € del
 * carril bici (c8kr44-142-cit-b8c30e), ni que Hidraqua era la adjudicataria de
 * la concesión del agua (k4olcs-101-cit-ddd6c4). Su razonamiento lo decía: «los
 * extractos disponibles no muestran ningún importe». El corpus semántico
 * componía `título · €importe · estado` y lo cortaba a 230 caracteres, y en un
 * contrato de título largo el corte se comía el importe y el estado. La
 * adjudicataria no iba nunca.
 *
 * Y había dos constructores. La lista corta léxica componía el suyo con otro
 * importe —el del emparejador, sin IVA; el corpus, con IVA— y otro orden, así
 * que el mismo registro llegaba al modelo de dos maneras según qué mitad del
 * shortlist lo trajera: el lote de Garbialdi, con 17.383.956,74 € por una y
 * 15.803.597,04 € por la otra. Es la regla 1 de docs/DATA_INTEGRITY.md: uno, y
 * que lo usen los dos.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA FORMA
 *
 *     estado · expediente N · lote N · adjudicación: X € con IVA (Y € sin IVA)
 *     el DD-MM-AAAA a ADJUDICATARIA · formalización: DD-MM-AAAA · licitación:
 *     X € con IVA (Y € sin IVA) · objeto: TÍTULO…
 *
 * Cada parte sale sólo si la fila la trae. Los rótulos nombran el CAMPO, no
 * afirman nada: un contrato anulado que conserva su fecha de adjudicación dice
 * `void · adjudicación: el 19-08-2019`, no «adjudicado». El estado va tal cual lo
 * publica Gobierto, salvo `unknown` —y cualquier palabra que contract-status.js
 * no reconozca—, que no es un estado sino su ausencia (regla 3).
 *
 * Los importes van con sus céntimos, que es como los cita quien habla («por
 * importe de 35.252,87») y como los busca el anclaje de una cita. Con IVA y sin
 * él, y la licitación además de la adjudicación: el carril bici se citó por
 * «algo más de 330.000 euros», y lo que se acerca es lo licitado (325.662,55 €),
 * no lo adjudicado (296.195,90 €). El valor estimado no va: en la fila de un
 * lote es el del expediente entero —los dos lotes de 136/2025 llevan los
 * 16.632.795,30 € de la suma—, y junto a los 194.810 € de Auditesa se leería
 * como suyo.
 *
 * El título va detrás, tras `objeto: `, y es lo único que se recorta para caber
 * en SNIPPET_MAXIMO. Detrás también por quien corta por la cola —`toPublishedSnippet`
 * a 240, cuando la pasada NLI publica un candidato tal cual—: lo que se pierde
 * es el final del título. El tope no es el 230 de antes, porque sin el objeto el
 * modelo no sabe de qué contrato se trata. Medido el 06-10-2026 sobre las 1.242
 * filas, con los hechos enteros (mediana 155 caracteres, máximo 249): con 230,
 * 526 filas se quedaban con menos de 60 caracteres de título; con 300, 471
 * perdían parte del objeto —lo que va antes de «por procedimiento…»—, entre
 * ellas el carril bici, que perdía los «refugios climáticos» con los que el
 * modelo lo había casado; con 400, 143. Cuando los hechos no dejan ni
 * TITULO_MINIMO, el snippet se pasa del tope: los hechos no se cortan.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL OTRO LADO
 *
 * El motor ancla un respaldo en un VALOR del registro y no en su título
 * (claim-verifier-engine.ts, `dondeAncla`, #249), así que tiene que saber cuál es
 * el título. `partesDelSnippet` lo dice: lo que va tras la marca. Un snippet sin
 * marca —los de antes, en cachés y en pruebas, y los de BDNS y promesas, que aquí
 * no se tocan— lleva el título delante, como siempre. Por eso el compositor y el
 * lector viven en el mismo fichero, y `ROTULOS` con ellos: son palabras nuestras,
 * y una cita que sólo copie uno no ancla nada.
 */
import { procurementStatusKind } from '../lib/contract-status.js'
import { importeDelEmparejador } from './importe-de-contrato'

/** Cómo se juntan las partes de un snippet de candidato. */
export const SEPARADOR = ' · '

/** Lo que precede al título en el snippet de un contrato: lo que va detrás es el título. */
export const MARCA_DEL_OBJETO = 'objeto: '

/** El tope de un snippet de contrato, título incluido. */
export const SNIPPET_MAXIMO = 400

/** Lo menos que se deja del título cuando los hechos son largos. */
export const TITULO_MINIMO = 60

/**
 * Las palabras que pone este fichero, no el registro. Una cita que sólo copie
 * éstas no dice nada del contrato (`dondeAncla`).
 */
export const ROTULOS = [
  'adjudicación:',
  'formalización:',
  'licitación:',
  'importe:',
  MARCA_DEL_OBJETO.trim(),
  'con IVA',
  'sin IVA',
] as const

/** Una fila de `tenders.json` —de `contracts` o de `tenders`—, con los campos que se leen. */
interface FilaDeContrato {
  title?: unknown
  status?: unknown
  documentNumber?: unknown
  batchNumber?: unknown
  assignee?: unknown
  awardDate?: unknown
  formalizedDate?: unknown
  finalAmount?: unknown
  finalAmountNoTaxes?: unknown
  initialAmount?: unknown
  initialAmountNoTaxes?: unknown
}

/** Los espacios dobles del registro —«HIDRAQUA GESTIÓN  INTEGRAL»— no pasan al snippet. */
const espacios = (s: unknown) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()

const positivo = (v: unknown): number | null => {
  const n = Number(v)
  return v != null && Number.isFinite(n) && n > 0 ? n : null
}

/** `2024-05-29` o `2024-05-29T00:00:00.000Z` → `29-05-2024`, sin pasar por `Date`. */
function dia(iso: unknown): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''))
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

const euros = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

/** Un importe con y sin IVA; una sola cifra si son la misma (una concesión no la distingue). */
function importe(conIva: number | null, sinIva: number | null): string | null {
  if (conIva && sinIva) {
    return Math.abs(conIva - sinIva) < 0.005
      ? euros(conIva)
      : `${euros(conIva)} con IVA (${euros(sinIva)} sin IVA)`
  }
  if (conIva) return `${euros(conIva)} con IVA`
  if (sinIva) return `${euros(sinIva)} sin IVA`
  return null
}

/** Los hechos de una fila, en el orden en que se leen, cada uno entero. */
function hechosDelContrato(r: FilaDeContrato): string[] {
  const hechos: string[] = []
  const estado = espacios(r.status)
  if (procurementStatusKind(estado) !== null) hechos.push(estado)
  const expediente = espacios(r.documentNumber)
  if (expediente) hechos.push(`expediente ${expediente}`)
  const lote = positivo(r.batchNumber)
  if (lote) hechos.push(`lote ${lote}`)

  const adjudicado = importe(positivo(r.finalAmount), positivo(r.finalAmountNoTaxes))
  const fecha = dia(r.awardDate)
  const adjudicataria = espacios(r.assignee)
  const adjudicacion = [
    adjudicado,
    fecha ? `el ${fecha}` : null,
    adjudicataria ? `a ${adjudicataria}` : null,
  ].filter(Boolean)
  if (adjudicacion.length) hechos.push(`adjudicación: ${adjudicacion.join(' ')}`)
  const formalizado = dia(r.formalizedDate)
  if (formalizado) hechos.push(`formalización: ${formalizado}`)

  const licitado = importe(positivo(r.initialAmount), positivo(r.initialAmountNoTaxes))
  if (licitado) hechos.push(`licitación: ${licitado}`)

  // Una fila sin ninguno de los importes de Gobierto —un anuncio de TED, una
  // forma vieja— enseña el que lee el emparejador, sin decir qué magnitud es.
  if (!adjudicado && !licitado) {
    const leido = importeDelEmparejador(r)
    if (leido) hechos.push(`importe: ${euros(leido.valor)}`)
  }
  return hechos
}

/**
 * El snippet de un contrato en la lista corta del verificador, y en el corpus
 * semántico: los hechos de la fila delante y enteros, el título detrás, cortado
 * con «…» si no cabe.
 *
 * @param fila  una fila de `tenders.json` (`contracts` o `tenders`).
 */
export function snippetDeContrato(fila: unknown): string {
  const r = (fila && typeof fila === 'object' ? fila : {}) as FilaDeContrato
  const hechos = hechosDelContrato(r)
  const delante = hechos.length ? hechos.join(SEPARADOR) + SEPARADOR : ''
  const titulo = espacios(r.title)
  const cabe = Math.max(TITULO_MINIMO, SNIPPET_MAXIMO - delante.length - MARCA_DEL_OBJETO.length)
  const visible = titulo.length <= cabe ? titulo : `${titulo.slice(0, cabe - 1).trimEnd()}…`
  return `${delante}${MARCA_DEL_OBJETO}${visible}`
}

/**
 * Qué parte de un snippet de candidato es el título y cuáles son valores del
 * registro.
 *
 * El de un contrato lleva el título tras `MARCA_DEL_OBJETO`, al final: todo lo
 * que sigue a la marca es título, aunque un título trajera un ` · ` dentro. Uno
 * sin marca —los snippets de antes, y los de BDNS y promesas— lleva el título
 * delante: `título · valor · valor`.
 */
export function partesDelSnippet(snippet: string): { titulo: string; valores: string[] } {
  const partes = snippet.split(SEPARADOR)
  const i = partes.findIndex((p) => p.startsWith(MARCA_DEL_OBJETO))
  if (i < 0) {
    const [titulo = '', ...valores] = partes
    return { titulo, valores }
  }
  return {
    titulo: partes.slice(i).join(SEPARADOR).slice(MARCA_DEL_OBJETO.length),
    valores: partes.slice(0, i),
  }
}
