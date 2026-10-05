/**
 * La subida firmada: una persona sube el veredicto de una declaración, con el
 * registro que la sostiene y un resumen que escribe ella.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ
 *
 * Hasta el 04-10-2026 un veredicto del registro de declaraciones sólo bajaba.
 * El overlay lo imponía a toda escritura —«lo que bajó una retractación sólo lo
 * vuelve a subir una persona, por una vía que lo firme»— y esa vía no existía:
 * el anclaje NLI sólo propone, `downgrade-verdict` sólo baja. La lectura de ese
 * día de las 52 declaraciones que el motor «ya no retractaría»
 * (editorial/rederivacion-0410-52/INFORME.md) encontró ocho cuyo registro
 * citado sí establece lo dicho, y que seguían publicadas como `sin-datos`.
 *
 * Y no bastaba con aceptar lo que dijo una máquina: en dos de las ocho las
 * anotaciones de evidencia del motor contradecían al registro («el extracto no
 * muestra el importe…»), y en 36 de las 52 su propio razonamiento concluía que
 * no había respaldo mientras la extracción decía `parcial`. Por eso aquí la
 * evidencia la elige la persona —un enlace que exista en el corpus— y la fila
 * la escribe el registro; el resumen lo escribe ella, y nunca es el de una
 * máquina tal cual.
 *
 * Diseño y decisiones del operador:
 * docs/superpowers/specs/2026-10-04-subida-firmada-design.md.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE NO DEJA ESCRIBIR
 *
 *  · Una firma que no es de una persona (`rechazoDeFirma`): ni la cuenta de rol,
 *    ni un modelo, ni el hueco de una orden sin rellenar.
 *  · Una acusación pública: subirla es materia legal y sigue las reglas de
 *    /hallazgos. Lo comprueba también la composición (`subidasSobreAcusaciones`).
 *  · Lo que no es una subida: sólo de un veredicto al que volver sería una bajada
 *    (`isDowngrade(nuevo, desde)`) —de `sin-datos` a `parcial` o `verificado`,
 *    de `parcial` a `verificado`—; nunca `contradicho`.
 *  · Un registro que no está en el corpus, un enlace de varios lotes sin decir
 *    cuál, o un contrato que no está adjudicado ni formalizado: la fila diría
 *    «adjudicado» de algo que no lo está.
 *  · Un resumen de menos de 20 caracteres, con charla de la tarea de un modelo, o
 *    que es el de una máquina tal cual.
 *  · Sin evidencia: el suelo vale también para una persona.
 *
 * Y la salida, `retirarSubida`, BAJA a lo que había: borrar la entrada
 * devolvería la declaración a la base, que puede estar por encima de lo que se
 * publicaba antes de subirla.
 *
 * Puro: sin disco y sin reloj. La CLI (scripts/subir-veredicto.ts) lee los
 * ficheros y pasa la fecha.
 */
import { isCommittedContract } from '../lib/contract-status.js'
import { charlaDeTarea } from './charla-de-tarea'
import {
  corpusDeEvidencia,
  esResumenCasi,
  esResumenSinRegistro,
  type ClaimVerdict,
} from './claim-verdicts'
import type { ClaimEvidence, ClaimVerification } from './claim-verifier'
import { rechazoDeFirma } from './firma-de-persona'
import { TRINQUETE } from './trinquete'
import {
  applyOverlayEntries,
  isDowngrade,
  verificacionDeBajada,
  type Overlay,
  type VerifiedItem,
} from './verified-merge'

/** El canal de la subida firmada en el overlay. */
export const CANAL_DE_LA_SUBIDA = 'curator-upgrade' as const

// ─── La evidencia: la elige la persona, la escribe el registro ──────────────

/** Los dos ficheros del corpus de los que esta vía cita registros, tal cual. */
export interface CorpusCitable {
  /** `public/data/tenders.json`: `contracts` (adjudicaciones) y `tenders` (licitaciones). */
  tenders: unknown
  /** `public/data/bdns.json`. */
  bdns: unknown
}

/** Un registro pedido por su enlace público y, si el enlace lleva a varios lotes, el lote. */
export interface EvidenciaPedida {
  enlace: string
  lote: number | null
}

interface FilaContrato {
  id?: string
  permalink?: string
  title?: string
  status?: string
  assignee?: string | null
  awardDate?: string | null
  finalAmount?: number | null
  finalAmountNoTaxes?: number | null
  batchNumber?: number | null
}

interface FilaLicitacion {
  permalink?: string
  documentNumber?: string | null
}

interface FilaBdns {
  bdnsCode?: string | number
  description?: string
  date?: string
  sourceUrl?: string
  url?: string
}

/**
 * El tope de un snippet publicado: el de `toPublishedSnippet` (claim-verifier.ts)
 * y los esquemas de hallazgos. Una fila que cabe pasa por ellos sin recortar.
 */
const SNIPPET_MAXIMO = 240

const lista = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : [])

/** Los espacios dobles del registro —«HIDRAQUA GESTIÓN  INTEGRAL»— no pasan a la fila. */
const espacios = (s: unknown) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()

/** `2024-05-29` o `2024-04-04T00:00:00.000Z` → `29-05-2024`, sin pasar por `Date`. */
function dia(iso: unknown): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''))
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

const positivo = (v: unknown): number | null => {
  const n = Number(v)
  return v != null && Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Con céntimos y la magnitud dicha: así la fila no se presta a un «puente» de
 * importes (`importeImpreso` no la lee) y no hay dos cifras que cuadrar, porque
 * la fila ya dice cuál es la suya. Espacio de no separación ante el «€», como en
 * `textoDelPuente`.
 */
const NBSP = '\u00a0'
const euros = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${NBSP}€`

/** El título y una cola que no se corta nunca: si no caben, se recorta el título. */
function conTitulo(titulo: string, cola: string): string {
  const entero = `${titulo} · ${cola}`
  if (entero.length <= SNIPPET_MAXIMO) return entero
  const cabe = SNIPPET_MAXIMO - cola.length - ' · '.length - '…'.length
  return `${titulo.slice(0, Math.max(0, cabe)).trimEnd()}… · ${cola}`
}

/** Lo que un contrato adjudicado dice de sí mismo: lote, expediente, adjudicataria, importe, fecha. */
function filaDeContrato(f: FilaContrato, variosLotes: boolean, expediente: string | null): string {
  const partes: string[] = []
  const lote = positivo(f.batchNumber)
  if (variosLotes && lote) {
    partes.push(expediente ? `lote ${lote} del expediente ${expediente}` : `lote ${lote}`)
  } else if (expediente) {
    partes.push(`expediente ${expediente}`)
  }
  let adjudicado = 'adjudicado'
  const adjudicataria = espacios(f.assignee)
  if (adjudicataria) adjudicado += ` a ${adjudicataria}`
  const conIva = positivo(f.finalAmount)
  const sinIva = positivo(f.finalAmountNoTaxes)
  if (conIva) adjudicado += ` por ${euros(conIva)} con IVA`
  else if (sinIva) adjudicado += ` por ${euros(sinIva)} sin IVA`
  const fecha = dia(f.awardDate)
  if (fecha) adjudicado += ` el ${fecha}`
  partes.push(adjudicado)
  return conTitulo(espacios(f.title), partes.join(' · '))
}

/** Una línea por lote, para que quien firma elija el suyo. */
function lineaDeLote(f: FilaContrato): string {
  const importe = positivo(f.finalAmount)
  return (
    `  · lote ${f.batchNumber ?? '¿?'} · ${espacios(f.assignee) || 'sin adjudicataria'}` +
    `${importe ? ` · ${euros(importe)} con IVA` : ''} · estado ${f.status ?? 'desconocido'}`
  )
}

/**
 * La fila de evidencia del registro que nombra `enlace`, escrita desde el
 * registro. Lanza, con el porqué, si el registro no se puede citar por esta vía.
 *
 * El `snippet` nunca lo teclea quien firma: un resumen puede equivocarse, y
 * entonces lo dice su firma; una fila que dijera del registro lo que el registro
 * no dice sería otra cosa.
 */
export function evidenciaDelRegistro(
  pedida: EvidenciaPedida,
  corpus: CorpusCitable,
): ClaimEvidence {
  const enlace = (pedida.enlace ?? '').trim()
  const lotePedido = pedida.lote
  if (!/^https?:\/\//.test(enlace)) {
    throw new Error(`«${enlace}» no es un enlace: el registro se nombra por su enlace público`)
  }

  const bdns = corpus.bdns as { items?: unknown } | null
  const convocatoria = lista<FilaBdns>(bdns?.items).find(
    (r) => r?.sourceUrl === enlace || r?.url === enlace,
  )
  if (convocatoria) {
    if (lotePedido != null) {
      throw new Error(`--lote ${lotePedido}, pero ${enlace} es una convocatoria de la BDNS`)
    }
    const fecha = dia(convocatoria.date)
    const cola = `convocatoria BDNS ${convocatoria.bdnsCode ?? '¿?'}${fecha ? ` del ${fecha}` : ''}`
    return {
      kind: 'bdns',
      ref: enlace,
      snippet: conTitulo(espacios(convocatoria.description), cola),
      stance: 'checked',
    }
  }

  const tenders = corpus.tenders as { contracts?: unknown; tenders?: unknown } | null
  const contratos = lista<FilaContrato>(tenders?.contracts).filter((r) => r?.permalink === enlace)
  const licitaciones = lista<FilaLicitacion>(tenders?.tenders).filter(
    (r) => r?.permalink === enlace,
  )
  const expediente = espacios(licitaciones.find((l) => l?.documentNumber)?.documentNumber) || null

  if (contratos.length === 0) {
    if (licitaciones.length > 0) {
      throw new Error(
        `${enlace} es una licitación${expediente ? ` (${expediente})` : ''} sin contrato ` +
          'adjudicado ni formalizado en tenders.json: esta vía cita un contrato adjudicado o una ' +
          'convocatoria de la BDNS',
      )
    }
    throw new Error(
      `${enlace} no está en tenders.json ni en bdns.json: esta vía sólo cita registros del corpus publicado`,
    )
  }

  let fila: FilaContrato
  if (contratos.length > 1) {
    if (lotePedido == null) {
      throw new Error(
        `${enlace} lleva a ${contratos.length} contratos, uno por lote, y el enlace solo no dice ` +
          `cuál citas: elígelo con --lote <n>.\n${contratos.map(lineaDeLote).join('\n')}`,
      )
    }
    const elegidos = contratos.filter((r) => Number(r?.batchNumber) === lotePedido)
    if (elegidos.length !== 1) {
      throw new Error(
        `${enlace} no tiene un lote ${lotePedido}; los que tiene:\n${contratos.map(lineaDeLote).join('\n')}`,
      )
    }
    fila = elegidos[0]
  } else {
    if (lotePedido != null) {
      throw new Error(`--lote ${lotePedido}, pero ${enlace} lleva a un solo contrato`)
    }
    fila = contratos[0]
  }

  if (!isCommittedContract(fila)) {
    throw new Error(
      `${enlace}${contratos.length > 1 ? ` (lote ${lotePedido})` : ''}: el contrato no está ` +
        `adjudicado ni formalizado (estado ${fila.status ?? 'desconocido'}), y la fila diría ` +
        '«adjudicado» de algo que no lo está',
    )
  }
  return {
    kind: 'tender',
    ref: enlace,
    snippet: filaDeContrato(fila, contratos.length > 1, expediente),
    stance: 'checked',
  }
}

// ─── La subida ──────────────────────────────────────────────────────────────

/** Lo que pide una orden `subir-veredicto`. */
export interface SubidaPedida {
  claimId: string
  /** `parcial` o `verificado`. */
  veredicto: ClaimVerdict
  /** Las filas que escribió `evidenciaDelRegistro`, una por registro citado. */
  evidencia: ClaimEvidence[]
  /** Lo que la tarjeta imprimirá bajo la cita. Lo escribe la persona. */
  resumen: string
  /** Una persona, con su nombre. */
  editor: string
}

/** Lo que se publica hoy de la declaración, que la subida corrige. */
export interface Observado {
  /** El tipo publicado, reclasificación incluida. */
  tipo: string
  /** El veredicto publicado: será `desde`. */
  publicado: ClaimVerdict
  /**
   * Textos de una máquina sobre esta declaración —el resumen de la base, el del
   * motor, la propuesta de NLI…— que la persona no puede firmar como suyos.
   */
  resumenesDeMaquina: readonly string[]
}

/** Lo que se firma se escribe sin espacios de más: la tarjeta lo imprime en un párrafo. */
const enUnaLinea = (s: unknown) => espacios(s)
const llano = (s: string) => espacios(s.normalize('NFC')).toLowerCase()

/** Por debajo de esto, que un texto contenga a otro no dice nada: lo comparte cualquiera. */
const COPIA_MINIMA = 40

/**
 * ¿Es esto el texto de una máquina? Igual a uno de los que se le pasan —sin
 * distinguir mayúsculas ni espacios—, o conteniéndolo entero si es largo, o de
 * la familia del «no se encontró registro» del verificador, que no hace falta
 * pasar.
 */
function esDeMaquina(resumen: string, deMaquina: readonly string[]): boolean {
  if (esResumenSinRegistro(resumen) || esResumenCasi(resumen)) return true
  const r = llano(resumen)
  return deMaquina.some((t) => {
    if (typeof t !== 'string' || t.trim() === '') return false
    const m = llano(t)
    return m === r || (m.length >= COPIA_MINIMA && r.includes(m))
  })
}

/**
 * La entrada de una subida firmada, escrita en el overlay por la vía de
 * siempre (`applyOverlayEntries`), que vuelve a mirar la firma, el suelo, el
 * `desde` y la entrada que sustituye. Puro: devuelve un overlay nuevo.
 */
export function subirVeredicto(
  overlay: Overlay,
  pedida: SubidaPedida,
  observado: Observado,
  stampIso: string,
): Overlay {
  const { claimId } = pedida
  const donde = `[subida] ${claimId}`
  const rechazo = rechazoDeFirma(pedida.editor)
  if (rechazo) throw new Error(`${donde}: la sube una persona, con su nombre: ${rechazo}`)
  if (observado.tipo === 'acusacion_publica') {
    throw new Error(
      `${donde}: es una acusación pública. Subir su veredicto es materia legal y sigue las ` +
        'reglas de /hallazgos —una ficha con sus documentos cotejados, sus referencias de ' +
        'contradicción y el derecho de réplica del grupo aludido—, no esta vía.',
    )
  }
  const puede = TRINQUETE[CANAL_DE_LA_SUBIDA].puedeEmitir
  if (!puede.includes(pedida.veredicto)) {
    throw new Error(`${donde}: esta vía sube a ${puede.join(' o ')}, no a ${pedida.veredicto}`)
  }
  if (!isDowngrade(pedida.veredicto, observado.publicado)) {
    throw new Error(
      `${donde}: publica ${observado.publicado}, y ${observado.publicado} → ${pedida.veredicto} ` +
        'no es una subida: esta vía sólo sube',
    )
  }
  const resumen = enUnaLinea(pedida.resumen)
  if (resumen.length < 20) {
    throw new Error(`${donde}: el resumen tiene que tener ≥20 caracteres`)
  }
  const charla = charlaDeTarea(resumen)
  if (charla) {
    throw new Error(
      `${donde}: el resumen habla de la tarea de un modelo (${charla}), no de la declaración`,
    )
  }
  if (esDeMaquina(resumen, observado.resumenesDeMaquina)) {
    throw new Error(
      `${donde}: el resumen es el de una máquina tal cual. Lo escribe quien firma, desde el ` +
        'registro que cita: la verificación del motor ha llegado a contradecir al registro.',
    )
  }
  const verification: ClaimVerification = {
    claimId,
    verdict: pedida.veredicto,
    summary: resumen,
    evidence: pedida.evidencia,
    checkedAgainst: corpusDeEvidencia(pedida.evidencia),
    derivedBy: [CANAL_DE_LA_SUBIDA],
  }
  return applyOverlayEntries(
    overlay,
    [
      {
        claimId,
        verification,
        source: CANAL_DE_LA_SUBIDA,
        reason: resumen,
        editor: enUnaLinea(pedida.editor.normalize('NFC')),
        desde: observado.publicado,
      },
    ],
    stampIso,
    new Map([[claimId, observado.publicado]]),
  )
}

// ─── La salida ──────────────────────────────────────────────────────────────

/** Lo que pide una orden `subir-veredicto --retirar`. */
export interface RetiradaDeSubida {
  claimId: string
  /** Por qué se retira (≥20 caracteres). Es el resumen de la bajada. */
  motivo: string
  /** Una persona, con su nombre. */
  editor: string
}

/**
 * Deshace una subida firmada BAJANDO la declaración al `desde` que guardó, con
 * una bajada de curador firmada por una persona y su motivo como resumen.
 *
 * No borra la entrada. Borrarla devolvería la declaración a la base, y la base
 * puede estar por encima de lo que se publicaba antes de subirla: si el motor la
 * había retractado, borrar la subida republicaría lo que el motor bajó sin que
 * nadie lo firmara. Puro: devuelve un overlay nuevo.
 */
export function retirarSubida(
  overlay: Overlay,
  pedida: RetiradaDeSubida,
  stampIso: string,
): Overlay {
  const { claimId } = pedida
  const donde = `[subida] ${claimId}`
  const rechazo = rechazoDeFirma(pedida.editor)
  if (rechazo) {
    throw new Error(`${donde}: retirar una subida lo firma una persona, con su nombre: ${rechazo}`)
  }
  const e = overlay?.entries?.[claimId]
  if (!e || e.source !== CANAL_DE_LA_SUBIDA || !e.desde) {
    throw new Error(
      `${donde}: no hay ninguna subida firmada que retirar (la entrada es ` +
        `${e ? `de ${e.source}` : 'ninguna'})`,
    )
  }
  const motivo = enUnaLinea(pedida.motivo)
  if (motivo.length < 20) {
    throw new Error(`${donde}: el motivo de la retirada tiene que tener ≥20 caracteres`)
  }
  const charla = charlaDeTarea(motivo)
  if (charla) {
    throw new Error(`${donde}: el motivo habla de la tarea de un modelo (${charla})`)
  }
  return applyOverlayEntries(
    overlay,
    [
      {
        claimId,
        verification: verificacionDeBajada(claimId, e.verification, e.desde, motivo),
        source: 'curator-downgrade',
        reason: motivo,
        editor: enUnaLinea(pedida.editor.normalize('NFC')),
      },
    ],
    stampIso,
    new Map([[claimId, e.verification.verdict]]),
  )
}

// ─── Al componer ────────────────────────────────────────────────────────────

/**
 * Las subidas firmadas que caen sobre una acusación en lo compuesto. La CLI
 * nunca escribe una —mira el tipo publicado—, así que una aquí es un overlay
 * editado a mano o un tipo que cambió debajo, y componer se niega.
 */
export function subidasSobreAcusaciones(
  overlay: Overlay,
  items: readonly VerifiedItem[],
): string[] {
  const tipo = new Map(items.map((it) => [it.claim.id, it.claim.type]))
  return Object.entries(overlay?.entries ?? {})
    .filter(([id, e]) => e?.source === CANAL_DE_LA_SUBIDA && tipo.get(id) === 'acusacion_publica')
    .map(([id]) => id)
}
