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
 *  · Desde el 10-10-2026, también un punto del orden del día de un pleno
 *    (`plenos-agendas.json`): una declaración sobre lo que se llevó a un pleno
 *    sólo la sostiene un orden del día o un acta, y de actas no hay corpus. La
 *    sesión se nombra por su enlace y el punto con `--punto`; la fila dice la
 *    sesión, su fecha, su parte y el título entero, y nunca que se aprobara. Un
 *    orden del día posterior a la declaración no la sostiene, y sin un registro
 *    que diga un importe una declaración con cifra no llega a `verificado`
 *    (`comprobarRegistrosConLaDeclaracion`). Diseño:
 *    docs/superpowers/specs/2026-10-10-orden-del-dia-evidencia-design.md.
 *  · Y la licitación de un sistema dinámico de adquisición, que no tiene
 *    contrato propio: sus contratos son los derivados, y para lo que se dice del
 *    SDA la licitación es el registro. La fila dice el título entero, el
 *    expediente y la fecha de apertura; nunca el estado, el importe estimado ni
 *    «adjudicado». La fecha y el importe, como en el orden del día. Diseño:
 *    docs/superpowers/specs/2026-10-10-licitacion-sda-design.md.
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
import type { PlenoSection } from './pleno-agenda'
import { corpusDeEvidencia, esTextoDeMaquina, type ClaimVerdict } from './claim-verdicts'
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

/** Los ficheros del corpus de los que esta vía cita registros, tal cual. */
export interface CorpusCitable {
  /** `public/data/tenders.json`: `contracts` (adjudicaciones) y `tenders` (licitaciones). */
  tenders: unknown
  /** `public/data/bdns.json`. */
  bdns: unknown
  /**
   * `public/data/plenos-agendas.json`, los órdenes del día de los plenos. Sin él,
   * una sesión no está en el corpus.
   */
  agendas?: unknown
}

/**
 * Un registro pedido por su enlace público y, si el enlace lleva a varios lotes,
 * el lote; si lleva a una sesión del pleno, el punto de su orden del día.
 */
export interface EvidenciaPedida {
  enlace: string
  lote: number | null
  punto?: number | null
}

/**
 * Un registro citado: su fila, y lo que de él hace falta para saber qué puede
 * sostener de una declaración (`comprobarRegistrosConLaDeclaracion`).
 */
export interface RegistroDeLaSubida {
  fila: ClaimEvidence
  /**
   * La fecha que acota lo que el registro puede sostener: la de la sesión de un
   * orden del día, o la apertura de la licitación de un SDA. `null` en un
   * contrato o una convocatoria, que esta vía nunca acotó por fecha.
   */
  fecha: string | null
  /** ¿Dice la fila un importe? Sólo un contrato con el suyo. */
  diceImporte: boolean
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
  title?: string
  openProposalsDate?: string | null
}

/**
 * Un enlace de PLACSP comparado sin su codificación: el mismo registro llega a
 * tenders.json como `deeplink:detalle_licitacion` y como `deeplink%3Adetalle_…`
 * (ESDA1/2025, dos filas). Sólo para reconocer la licitación de un SDA: los
 * contratos se siguen buscando por su enlace tal cual.
 */
function mismoEnlace(a: unknown, b: string): boolean {
  if (typeof a !== 'string') return false
  const llano = (u: string) => {
    try {
      return decodeURIComponent(u)
    } catch {
      return u
    }
  }
  return llano(a) === llano(b)
}

/** Sin tildes ni mayúsculas ni espacios de más, para comparar el comienzo de un título. */
const sinTildes = (s: unknown) =>
  espacios(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/**
 * ¿Es la licitación de un sistema dinámico de adquisición? Por el comienzo de su
 * título, que es como las publica el Ayuntamiento (12 en tenders.json el
 * 06-10-2026). La de un contrato derivado empieza por «Contrato…» aunque nombre
 * el SDA, y no lo es: ésa tiene su contrato. Un SDA titulado de otro modo no se
 * reconoce y se niega, que es el lado seguro.
 */
const esLicitacionDeSda = (l: FilaLicitacion) =>
  sinTildes(l.title).startsWith('sistema dinamico de adquisicion')

/**
 * La fila de la licitación de un SDA: el título entero, el expediente y la fecha
 * de apertura de ofertas. Nunca el estado —en un SDA no dice nada: ESDA2/2022
 * está «abandoned» con 45 contratos derivados, y las dos filas de ESDA1/2025
 * dicen «abandoned» y «provisionally_awarded»—, nunca el importe —es un techo
 * estimado para toda la vida del SDA, no dinero gastado— y nunca «adjudicado».
 */
function registroDeLicitacionDeSda(
  filas: FilaLicitacion[],
  enlace: string,
  lotePedido: number | null,
): RegistroDeLaSubida {
  if (lotePedido != null) {
    throw new Error(
      `--lote ${lotePedido}, pero ${enlace} es la licitación de un sistema dinámico de ` +
        'adquisición, que no tiene lotes que elegir',
    )
  }
  const firma = (l: FilaLicitacion) =>
    JSON.stringify([
      espacios(l.title),
      espacios(l.documentNumber),
      String(l.openProposalsDate ?? '').slice(0, 10),
    ])
  if (new Set(filas.map(firma)).size > 1) {
    throw new Error(
      `${enlace}: las ${filas.length} filas de este registro en tenders.json no dicen lo mismo ` +
        '(título, expediente o fecha de apertura), y no se sabe cuál citar',
    )
  }
  const [l] = filas
  const apertura = String(l.openProposalsDate ?? '').slice(0, 10)
  const fecha = dia(apertura)
  if (!fecha) {
    throw new Error(
      `${enlace}: la licitación no tiene fecha de apertura en tenders.json, y sin ella no se ` +
        'sabe si es anterior a lo que se dijo',
    )
  }
  const titulo = espacios(l.title)
  const expediente = espacios(l.documentNumber)
  const propia = filas.find((f) => f.permalink === enlace) ?? l
  return {
    fila: {
      kind: 'licitacion',
      ref: String(propia.permalink),
      snippet:
        `Licitación de un sistema dinámico de adquisición · ${titulo} · ` +
        `${expediente ? `expediente ${expediente} · ` : ''}ofertas desde el ${fecha}`,
      stance: 'checked',
    },
    fecha: apertura,
    diceImporte: false,
  }
}

interface FilaBdns {
  bdnsCode?: string | number
  description?: string
  date?: string
  sourceUrl?: string
  url?: string
}

interface FilaPunto {
  number?: number
  title?: string
  section?: PlenoSection
}

interface FilaSesion {
  id?: string
  date?: string
  kind?: string
  link?: string
  agenda?: FilaPunto[]
}

/**
 * La parte del orden del día, como la publica la convocatoria —«PARTE
 * RESOLUTIVA», «PARTE DE INFORMACIÓN, IMPULSO Y CONTROL…», «Ruegos y
 * preguntas»—, o `null` si no la dice: entonces la fila no nombra ninguna.
 */
const PARTE_DEL_ORDEN_DEL_DIA: Record<PlenoSection, string | null> = {
  resolutiva: 'parte resolutiva',
  informativa: 'parte de información y control',
  ruegos: 'ruegos y preguntas',
  apertura: null,
  otro: null,
}

/** El tipo de sesión, como lo dice el índice de plenos; uno que no conste no se nombra. */
const TIPO_DE_SESION: Readonly<Record<string, string>> = {
  ordinario: 'pleno ordinario',
  extraordinario: 'pleno extraordinario',
  urgente: 'pleno urgente',
}

/** El enlace sin su consulta (`?idioma=…`) ni la barra final: una sesión es su ruta. */
const sinConsulta = (url: string) => url.split(/[?#]/)[0].replace(/\/+$/, '')

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

/** Una línea por punto, para que quien firma elija el suyo. */
function lineaDePunto(p: FilaPunto): string {
  const titulo = espacios(p.title)
  return `  · punto ${p.number ?? '¿?'} · ${titulo.length > 80 ? `${titulo.slice(0, 80)}…` : titulo}`
}

/**
 * La fila de un punto del orden del día: la sesión, su fecha, su parte, el
 * número y el título entero, tal y como lo publica la convocatoria —en su
 * lengua—. Nunca dice que se aprobara: el resultado es otro registro, con otra
 * procedencia. El título no se corta: es el registro, y hay puntos de casi 900
 * caracteres cuyo objeto está al final.
 */
function registroDelOrdenDelDia(
  sesion: FilaSesion,
  enlace: string,
  pedida: EvidenciaPedida,
): RegistroDeLaSubida {
  if (pedida.lote != null) {
    throw new Error(
      `--lote ${pedida.lote}, pero ${enlace} es una sesión del pleno: el punto de su orden del ` +
        'día se elige con --punto <n>',
    )
  }
  const puntos = lista<FilaPunto>(sesion.agenda)
  const pedido = pedida.punto ?? null
  if (pedido == null) {
    throw new Error(
      `${enlace} es una sesión del pleno con ${puntos.length} punto(s) en su orden del día, y el ` +
        `enlace solo no dice cuál citas: elígelo con --punto <n>.\n${puntos.map(lineaDePunto).join('\n')}`,
    )
  }
  const punto = puntos.find((p) => p?.number === pedido)
  if (!punto) {
    throw new Error(
      `${enlace} no tiene un punto ${pedido}; los que tiene:\n${puntos.map(lineaDePunto).join('\n')}`,
    )
  }
  const fecha = dia(sesion.date)
  if (!fecha) {
    throw new Error(
      `${enlace}: la sesión no tiene fecha en plenos-agendas.json, y sin ella no se sabe si es ` +
        'anterior a lo que se dijo',
    )
  }
  const titulo = espacios(punto.title)
  if (!titulo) throw new Error(`${enlace}: el punto ${pedido} no tiene título que citar`)
  const tipo = TIPO_DE_SESION[String(sesion.kind)] ?? 'pleno'
  const parte = punto.section ? PARTE_DEL_ORDEN_DEL_DIA[punto.section] : null
  return {
    fila: {
      kind: 'agenda',
      ref: String(sesion.link),
      snippet:
        `Orden del día del ${tipo} del ${fecha}${parte ? ` · ${parte}` : ''} · ` +
        `punto ${pedido}: ${titulo}`,
      stance: 'checked',
    },
    fecha: String(sesion.date).slice(0, 10),
    diceImporte: false,
  }
}

/**
 * El registro que nombra `enlace`, con su fila escrita desde el registro. Lanza,
 * con el porqué, si el registro no se puede citar por esta vía.
 *
 * El `snippet` nunca lo teclea quien firma: un resumen puede equivocarse, y
 * entonces lo dice su firma; una fila que dijera del registro lo que el registro
 * no dice sería otra cosa.
 */
export function registroDeLaSubida(
  pedida: EvidenciaPedida,
  corpus: CorpusCitable,
): RegistroDeLaSubida {
  const enlace = (pedida.enlace ?? '').trim()
  const lotePedido = pedida.lote
  if (!/^https?:\/\//.test(enlace)) {
    throw new Error(`«${enlace}» no es un enlace: el registro se nombra por su enlace público`)
  }

  const agendas = corpus.agendas as { plenos?: unknown } | null | undefined
  const sesion = lista<FilaSesion>(agendas?.plenos).find(
    (r) => typeof r?.link === 'string' && sinConsulta(r.link) === sinConsulta(enlace),
  )
  if (sesion) return registroDelOrdenDelDia(sesion, enlace, pedida)
  if (pedida.punto != null) {
    // «No está entre los órdenes del día», no «no es una sesión»: sin
    // plenos-agendas.json en disco no se sabe qué es.
    throw new Error(
      `--punto ${pedida.punto}, pero ${enlace} no está entre los órdenes del día del corpus ` +
        '(plenos-agendas.json): --punto elige un punto del orden del día de una sesión del pleno',
    )
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
      fila: {
        kind: 'bdns',
        ref: enlace,
        snippet: conTitulo(espacios(convocatoria.description), cola),
        stance: 'checked',
      },
      fecha: null,
      diceImporte: false,
    }
  }

  const tenders = corpus.tenders as { contracts?: unknown; tenders?: unknown } | null
  const contratos = lista<FilaContrato>(tenders?.contracts).filter((r) => r?.permalink === enlace)
  const licitaciones = lista<FilaLicitacion>(tenders?.tenders).filter(
    (r) => r?.permalink === enlace,
  )
  const expediente = espacios(licitaciones.find((l) => l?.documentNumber)?.documentNumber) || null

  if (contratos.length === 0) {
    // La licitación de un SDA, con cualquiera de las codificaciones de su enlace,
    // y sin ningún contrato que lleve a él con ninguna: ésa es el registro.
    const delRegistro = lista<FilaLicitacion>(tenders?.tenders).filter((r) =>
      mismoEnlace(r?.permalink, enlace),
    )
    const algunContrato = lista<FilaContrato>(tenders?.contracts).some((r) =>
      mismoEnlace(r?.permalink, enlace),
    )
    if (delRegistro.length > 0 && !algunContrato && delRegistro.every(esLicitacionDeSda)) {
      return registroDeLicitacionDeSda(delRegistro, enlace, lotePedido)
    }
    if (licitaciones.length > 0) {
      throw new Error(
        `${enlace} es una licitación${expediente ? ` (${expediente})` : ''} sin contrato ` +
          'adjudicado ni formalizado en tenders.json: esta vía cita un contrato adjudicado, una ' +
          'convocatoria de la BDNS, un punto del orden del día o la licitación de un sistema ' +
          'dinámico de adquisición',
      )
    }
    throw new Error(
      `${enlace} no está en tenders.json, ni en bdns.json, ni entre los órdenes del día: esta ` +
        'vía sólo cita registros del corpus publicado',
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
    fila: {
      kind: 'tender',
      ref: enlace,
      snippet: filaDeContrato(fila, contratos.length > 1, expediente),
      stance: 'checked',
    },
    fecha: null,
    diceImporte: positivo(fila.finalAmount) != null || positivo(fila.finalAmountNoTaxes) != null,
  }
}

/** La fila de evidencia del registro que nombra `enlace` (`registroDeLaSubida`). */
export function evidenciaDelRegistro(
  pedida: EvidenciaPedida,
  corpus: CorpusCitable,
): ClaimEvidence {
  return registroDeLaSubida(pedida, corpus).fila
}

/**
 * Lo que los registros citados pueden sostener de la declaración que se sube.
 * Lanza, con el porqué, si no llegan:
 *
 *  · un registro con fecha —la sesión de un orden del día— posterior a la
 *    declaración no sostiene lo que se dijo antes de él; una promesa cumplida es
 *    otra afirmación, y se sigue en /promesas;
 *  · si la declaración trae una cifra y ninguna fila citada dice un importe, la
 *    subida no llega a `verificado`: un orden del día o una convocatoria no
 *    establecen la cifra. `parcial` sí, y el resumen dice que no consta.
 *
 * Sin la fecha de la declaración no se sabe si un registro con fecha es
 * posterior, y no se sube.
 */
export function comprobarRegistrosConLaDeclaracion(
  registros: readonly RegistroDeLaSubida[],
  declaracion: { fecha: string | null; conImporte: boolean },
  veredicto: ClaimVerdict,
): void {
  const dicha = declaracion.fecha ? String(declaracion.fecha).slice(0, 10) : null
  for (const r of registros) {
    if (r.fecha == null) continue
    if (dicha == null) {
      throw new Error(
        `${r.fila.ref}: la declaración no tiene fecha, y sin ella no se sabe si el registro es posterior`,
      )
    }
    if (r.fecha > dicha) {
      throw new Error(
        `${r.fila.ref}: el registro es del ${dia(r.fecha)}, posterior a la declaración ` +
          `(${dia(dicha)}): no sostiene lo que se dijo antes de él`,
      )
    }
  }
  if (
    declaracion.conImporte &&
    veredicto === 'verificado' &&
    !registros.some((r) => r.diceImporte)
  ) {
    throw new Error(
      'la declaración cita un importe y ningún registro citado dice uno: no llega a verificado. ' +
        'Como mucho, parcial, y el resumen dice que la cifra no consta.',
    )
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
  if (esTextoDeMaquina(resumen, observado.resumenesDeMaquina)) {
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
