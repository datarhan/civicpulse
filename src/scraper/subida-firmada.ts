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
 *  · Desde el 19-10-2026, un registro posterior a la declaración —también un
 *    contrato, por el día en que se publicó su adjudicación, y una
 *    convocatoria— sin un motivo firmado de por qué la sostiene
 *    (`registroPosterior`, que se publica: puede corroborar la descripción de un
 *    contrato en trámite, no que algo estuviera hecho); un contrato que sostenga
 *    una promesa, con motivo o sin él; un `verificado` cuya cifra no dice
 *    ninguna fila; la explotación de un bien municipal (la paga quien explota);
 *    y un contrato sin fecha de adjudicación o titulado con un código CPV sin
 *    licitación que diga de qué es. Lo ya firmado no se reescribe: lo vuelve a
 *    mirar `cotejarSubidasFirmadas`, desde `check:veredictos`.
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
import {
  contractTermYears,
  ingresoMunicipal,
  isCommittedContract,
  isConcession,
} from '../lib/contract-status.js'
import { charlaDeTarea } from './charla-de-tarea'
import type { PlenoSection } from './pleno-agenda'
import { corpusDeEvidencia, esTextoDeMaquina, type ClaimVerdict } from './claim-verdicts'
import {
  IMPORTE_PRACTICAMENTE_EXACTO,
  similarAmount,
  type ClaimEvidence,
  type ClaimVerification,
} from './claim-verifier'
import { decodeHtmlEntities } from './normalize'
import { rechazoDeFirma, rechazoDeMarcador } from './firma-de-persona'
import { TRINQUETE } from './trinquete'
import {
  applyOverlayEntries,
  isDowngrade,
  sustituidaDe,
  validateOverlay,
  verificacionDeBajada,
  type Overlay,
  type OverlayEntry,
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
   * La fecha que acota lo que el registro puede sostener (`AAAA-MM-DD`): la de
   * la sesión de un orden del día, la apertura de la licitación de un SDA, la
   * publicación de una convocatoria o, en un contrato, el día en que se publicó
   * su adjudicación. Un registro sin ella no se cita.
   *
   * Hasta el 19-10-2026 un contrato y una convocatoria no la tenían, y la guarda
   * se los saltaba: 10 de las 13 subidas que citaban un contrato citaban una
   * adjudicación publicada después de lo dicho. De las dos fechas que podían
   * acotar un contrato —la apertura de su licitación y el anuncio de su
   * adjudicación— es la segunda, que es la que la fila imprime y la que deja
   * fuera más: la apertura dice que se licitó, no a quién ni por cuánto.
   */
  fecha: string
  /**
   * La cifra que la fila imprime y puede establecer, o `null`: sólo el importe
   * de un contrato. El valor estimado de una concesión por todo su plazo se
   * imprime, pero no establece un precio ni un canon anual, y no cuenta.
   */
  importe: number | null
}

interface FilaContrato {
  id?: string | number
  permalink?: string
  title?: string
  status?: string
  contractType?: string | null
  duration?: number | null
  assignee?: string | null
  awardDate?: string | null
  finalAmount?: number | null
  finalAmountNoTaxes?: number | null
  estimatedValue?: number | null
  batchNumber?: number | null
}

interface FilaLicitacion {
  id?: string | number
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
    importe: null,
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

/**
 * Un texto del registro, como se lee: sin espacios de más y sin las entidades
 * HTML con que lo exporta Gobierto («Construcciones Arnau&amp;March, S.L.»,
 * cuatro adjudicatarias el 19-10-2026). Sólo para lo que viene del registro: lo
 * que teclea quien firma no se decodifica.
 */
const delRegistro = (s: unknown) => espacios(decodeHtmlEntities(String(s ?? '')))

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

/**
 * El importe de adjudicación de una fila, y si el registro dice de qué es.
 *
 * «con IVA» sólo cuando la fila da los dos importes y son distintos: el de la
 * concesión del agua, 31/2021 y otras filas del registro traen el mismo
 * número en los dos campos, y entonces el registro no dice si lleva IVA. Con
 * uno solo, tampoco: un campo vacío no es una afirmación sobre el otro.
 */
function importeDeAdjudicacion(f: FilaContrato): { texto: string; cifra: number } | null {
  const conIva = positivo(f.finalAmount)
  const sinIva = positivo(f.finalAmountNoTaxes)
  if (conIva && sinIva && Math.abs(conIva - sinIva) >= 0.005) {
    return { texto: `${euros(conIva)} con IVA`, cifra: conIva }
  }
  const uno = conIva ?? sinIva
  return uno ? { texto: euros(uno), cifra: uno } : null
}

/**
 * Lo que dice de una concesión su fila: el valor estimado por todo su plazo, y
 * nunca un «adjudicado por». Una concesión se adjudica de una vez por todos sus
 * años —17 la del agua—, y su importe impreso como precio de adjudicación se
 * lee como un pago puntual mayor que el presupuesto municipal de un año. Es la
 * salvedad que ya dicen la portada y /presupuesto (`isConcession`).
 *
 * En un lote no hay importe: Gobierto repite en cada lote el valor estimado del
 * expediente entero, y se leería como el de ese lote (snippet-de-contrato.ts).
 */
function valorDeLaConcesion(f: FilaContrato, variosLotes: boolean): string | null {
  const valor = variosLotes ? null : positivo(f.estimatedValue)
  if (!valor) return null
  const anios = contractTermYears(f)
  return `valor estimado por todo su plazo${anios ? ` (${anios} años)` : ''}: ${euros(valor)}`
}

/**
 * Lo que un contrato adjudicado dice de sí mismo: lote, expediente, adjudicataria,
 * importe, y el día en que se publicó su adjudicación.
 *
 * La fecha es la del ANUNCIO, no la del acuerdo, y la fila lo dice. Cotejado el
 * 19-10-2026 en siete fichas de la Plataforma de 2018 a 2026: en las siete,
 * `awardDate` es el día en que se publicó el anuncio de adjudicación —la del
 * agua, 06-08-2026; el Pleno la había acordado el 27-07-2026—. Impresa como
 * «adjudicado … el», atribuye al acuerdo una fecha que no es la suya.
 */
function filaDeContrato(
  f: FilaContrato,
  titulo: string,
  variosLotes: boolean,
  expediente: string | null,
): { texto: string; importe: number | null } {
  const partes: string[] = []
  const lote = positivo(f.batchNumber)
  if (variosLotes && lote) {
    partes.push(expediente ? `lote ${lote} del expediente ${expediente}` : `lote ${lote}`)
  } else if (expediente) {
    partes.push(`expediente ${expediente}`)
  }
  const adjudicataria = delRegistro(f.assignee)
  let cifra: number | null = null
  if (isConcession(f)) {
    partes.push(`concesión adjudicada${adjudicataria ? ` a ${adjudicataria}` : ''}`)
    // Se imprime, y no establece ninguna cifra de lo dicho: ni un precio ni un
    // canon anual son el valor de todos sus años.
    const valor = valorDeLaConcesion(f, variosLotes)
    if (valor) partes.push(valor)
  } else if (ingresoMunicipal(f) === 'enajenacion') {
    // La paga la adjudicataria al Ayuntamiento: «adjudicado a … por» se leería
    // como dinero que sale.
    const importe = importeDeAdjudicacion(f)
    cifra = importe?.cifra ?? null
    partes.push(
      `enajenación adjudicada${adjudicataria ? ` a ${adjudicataria}` : ''}` +
        `${importe ? `, que paga al Ayuntamiento ${importe.texto}` : ''}`,
    )
  } else {
    const importe = importeDeAdjudicacion(f)
    cifra = importe?.cifra ?? null
    partes.push(
      `adjudicado${adjudicataria ? ` a ${adjudicataria}` : ''}` +
        `${importe ? ` por ${importe.texto}` : ''}`,
    )
  }
  const fecha = dia(f.awardDate)
  if (fecha) partes.push(`adjudicación publicada el ${fecha}`)
  return { texto: conTitulo(titulo, partes.join(' · ')), importe: cifra }
}

/**
 * ¿Es el título un código CPV y su descripción —«92000000-Servicios de
 * esparcimiento, culturales y deportivos.»—? Así exporta Gobierto el título de
 * algunos contratos derivados de un SDA: 11 de los citables el 19-10-2026.
 */
const TITULO_CPV = /^\s*\d{8}(?:-\d)?\s*-\s*/

/**
 * El título que la fila da al contrato. El suyo, salvo que sea un código CPV:
 * entonces el de su licitación, que es la que dice de qué es. Un contrato
 * derivado de un SDA no tiene licitación propia en tenders.json, pero Gobierto
 * le da el identificador de la del SDA (`1794430#23` es de 1794430, ESDA2/2022):
 * la fila dice entonces de qué SDA deriva y que su objeto es el que dice el CPV,
 * no un título que el registro no da. Sin ninguna de las dos no se cita: un
 * código no dice de qué es el contrato.
 */
function tituloDelContrato(
  f: FilaContrato,
  licitaciones: FilaLicitacion[],
  todas: FilaLicitacion[],
  enlace: string,
): string {
  const propio = delRegistro(f.title)
  if (!TITULO_CPV.test(propio)) return propio
  const deSuLicitacion = licitaciones
    .map((l) => delRegistro(l.title))
    .find((t) => t && !TITULO_CPV.test(t))
  if (deSuLicitacion) return deSuLicitacion
  const base = String(f.id ?? '').split('#')[0]
  const sda = todas.find((l) => String(l?.id ?? '') === base && esLicitacionDeSda(l))
  const expedienteDelSda = delRegistro(sda?.documentNumber)
  if (sda && expedienteDelSda) {
    const objeto = propio.replace(TITULO_CPV, '').replace(/\.$/, '')
    return (
      `Contrato derivado del sistema dinámico de adquisición ${expedienteDelSda} · ` +
      `objeto según su CPV: ${objeto}`
    )
  }
  throw new Error(
    `${enlace}: el título del contrato es un código CPV («${propio}») y ninguna licitación de ` +
      'tenders.json dice de qué es: la fila no diría qué contrato cita',
  )
}

/** Una línea por lote, para que quien firma elija el suyo. */
function lineaDeLote(f: FilaContrato): string {
  const importe = isConcession(f) ? null : importeDeAdjudicacion(f)
  return (
    `  · lote ${f.batchNumber ?? '¿?'} · ${delRegistro(f.assignee) || 'sin adjudicataria'}` +
    `${importe ? ` · ${importe.texto}` : ''} · estado ${f.status ?? 'desconocido'}`
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
    importe: null,
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
    if (!fecha) {
      throw new Error(
        `${enlace}: la convocatoria no tiene fecha en bdns.json, y sin ella no se sabe si es ` +
          'anterior a lo que se dijo',
      )
    }
    const cola = `convocatoria BDNS ${convocatoria.bdnsCode ?? '¿?'} del ${fecha}`
    return {
      fila: {
        kind: 'bdns',
        ref: enlace,
        snippet: conTitulo(delRegistro(convocatoria.description), cola),
        stance: 'checked',
      },
      fecha: String(convocatoria.date).slice(0, 10),
      importe: null,
    }
  }

  const tenders = corpus.tenders as { contracts?: unknown; tenders?: unknown } | null
  const contratos = lista<FilaContrato>(tenders?.contracts).filter((r) => r?.permalink === enlace)
  const licitaciones = lista<FilaLicitacion>(tenders?.tenders).filter(
    (r) => r?.permalink === enlace,
  )
  const expediente =
    delRegistro(licitaciones.find((l) => l?.documentNumber)?.documentNumber) || null

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
  const cual = contratos.length > 1 ? ` (lote ${lotePedido})` : ''
  const titulo = tituloDelContrato(fila, licitaciones, lista(tenders?.tenders), enlace)
  const deSuLicitacion = licitaciones.find((l) => l?.title)?.title ?? null
  if (ingresoMunicipal(fila, deSuLicitacion) === 'explotacion') {
    throw new Error(
      `${enlace}${cual}: es la explotación de un bien municipal («${titulo}»), por la que paga ` +
        'quien la explota, no el Ayuntamiento, y el registro no dice si su importe es el canon de ' +
        'un año, el de todo el plazo u otra cosa. La fila diría «adjudicado … por» como si pagara ' +
        'el Ayuntamiento: esta vía no la cita',
    )
  }
  const adjudicacion = String(fila.awardDate ?? '').slice(0, 10)
  if (!dia(adjudicacion)) {
    throw new Error(
      `${enlace}${cual}: el contrato no tiene fecha de adjudicación en tenders.json, y sin ella ` +
        'no se sabe si es anterior a lo que se dijo',
    )
  }
  const { texto, importe } = filaDeContrato(fila, titulo, contratos.length > 1, expediente)
  return {
    fila: { kind: 'tender', ref: enlace, snippet: texto, stance: 'checked' },
    fecha: adjudicacion,
    importe,
  }
}

/** La fila de evidencia del registro que nombra `enlace` (`registroDeLaSubida`). */
export function evidenciaDelRegistro(
  pedida: EvidenciaPedida,
  corpus: CorpusCitable,
): ClaimEvidence {
  return registroDeLaSubida(pedida, corpus).fila
}

/** La declaración que se sube, en lo que importa para saber qué la sostiene. */
export interface DeclaracionCotejada {
  /** El día de su sesión (`plenoDate`). */
  fecha: string | null
  /** Su tipo publicado, reclasificación incluida: `promesa`, `cita_obra`… */
  tipo?: string | null
  /** La cifra que dice (`entities.amountEuros`), o `null`. */
  importe?: number | null
}

/**
 * Lo que impide a unos registros sostener una declaración, por clase:
 *
 *   posterior  un registro posterior a lo dicho
 *   sin-fecha  la declaración, o un registro, sin fecha con que compararlos
 *   promesa    un contrato citado para una promesa
 *   importe    un `verificado` con cifra que ninguna fila dice
 */
export const PROBLEMAS_DE_LA_DECLARACION = ['posterior', 'sin-fecha', 'promesa', 'importe'] as const
export type ProblemaDeLaDeclaracion = (typeof PROBLEMAS_DE_LA_DECLARACION)[number]

export interface ProblemaConLaDeclaracion {
  codigo: ProblemaDeLaDeclaracion
  detalle: string
}

/** ¿Dice la fila la cifra de la declaración? Con el umbral del verificador. */
const mismaCifra = (dicha: number, fila: number) =>
  similarAmount(dicha, fila) >= IMPORTE_PRACTICAMENTE_EXACTO

/**
 * Lo que los registros citados NO pueden sostener de la declaración, uno por
 * problema y con el porqué; vacío si la sostienen. La usan la subida, que se
 * niega con ellos (`comprobarRegistrosConLaDeclaracion`), y el cotejo de lo ya
 * firmado (`cotejarSubidasFirmadas`), que los señala sin reescribir nada:
 *
 *  · un registro posterior a la declaración no sostiene lo que se dijo antes de
 *    él. Vale para todos, y desde el 19-10-2026 también para un contrato —con
 *    el día en que se publicó su adjudicación— y una convocatoria;
 *  · una promesa no la sostiene un contrato: que se contratara o se cumpliera
 *    es otra afirmación, y se sigue en /promesas. Un orden del día anterior sí
 *    puede sostenerla —lo que se llevó al pleno—, como hasta ahora;
 *  · si la declaración trae una cifra, `verificado` pide una fila que diga ESA
 *    cifra, con el umbral de «prácticamente exacto» del verificador (un 1 %:
 *    `IMPORTE_PRACTICAMENTE_EXACTO`). Hasta el 19-10-2026 bastaba con que alguna
 *    fila dijera un importe, el que fuera. `parcial` sí llega, y el resumen
 *    dice qué cifra consta.
 *
 * Sin la fecha de la declaración no se sabe si un registro es posterior.
 */
export function problemasConLaDeclaracion(
  registros: readonly RegistroDeLaSubida[],
  declaracion: DeclaracionCotejada,
  veredicto: ClaimVerdict,
): ProblemaConLaDeclaracion[] {
  const problemas: ProblemaConLaDeclaracion[] = []
  const dicha = declaracion.fecha ? String(declaracion.fecha).slice(0, 10) : null
  if (declaracion.tipo === 'promesa') {
    for (const r of registros.filter((x) => x.fila.kind === 'tender')) {
      problemas.push({
        codigo: 'promesa',
        detalle:
          `${r.fila.ref}: la declaración es una promesa, y una promesa no la sostiene un ` +
          'contrato: que se contratara o se cumpliera es otra afirmación, y se sigue en /promesas',
      })
    }
  }
  for (const r of registros) {
    if (!r.fecha || !dia(r.fecha)) {
      problemas.push({
        codigo: 'sin-fecha',
        detalle: `${r.fila.ref}: el registro no tiene fecha, y sin ella no se sabe si es posterior`,
      })
    } else if (dicha == null) {
      problemas.push({
        codigo: 'sin-fecha',
        detalle:
          `${r.fila.ref}: la declaración no tiene fecha, y sin ella no se sabe si el registro ` +
          'es posterior',
      })
    } else if (r.fecha > dicha) {
      problemas.push({
        codigo: 'posterior',
        detalle:
          r.fila.kind === 'tender'
            ? `${r.fila.ref}: la adjudicación se publicó el ${dia(r.fecha)}, posterior a la ` +
              `declaración (${dia(dicha)}). ${DOCTRINA_DEL_POSTERIOR}`
            : `${r.fila.ref}: el registro es del ${dia(r.fecha)}, posterior a la declaración ` +
              `(${dia(dicha)}). ${DOCTRINA_DEL_POSTERIOR}`,
      })
    }
  }
  const cifra = positivo(declaracion.importe)
  if (cifra != null && veredicto === 'verificado') {
    const conCifra = registros.filter((r) => r.importe != null)
    if (conCifra.length === 0) {
      problemas.push({
        codigo: 'importe',
        detalle:
          'la declaración cita un importe y ningún registro citado dice uno: no llega a ' +
          'verificado. Como mucho, parcial, y el resumen dice que la cifra no consta.',
      })
    } else if (!conCifra.some((r) => mismaCifra(cifra, r.importe as number))) {
      problemas.push({
        codigo: 'importe',
        detalle:
          `la declaración dice ${euros(cifra)} y ningún registro citado dice esa cifra ` +
          `(dicen ${conCifra.map((r) => euros(r.importe as number)).join(', ')}): no llega a ` +
          'verificado. Como mucho, parcial, y el resumen dice qué cifra consta.',
      })
    }
  }
  // Varios lotes de un mismo enlace, con la misma fecha, dan el mismo problema:
  // dicho una vez.
  const vistos = new Set<string>()
  return problemas.filter((p) => {
    const clave = `${p.codigo}\u0000${p.detalle}`
    if (vistos.has(clave)) return false
    vistos.add(clave)
    return true
  })
}

/**
 * Lo que la vía dice de un registro posterior a lo dicho, y lo que pide para
 * aceptarlo. Decisión del curador, 19-10-2026: c8kr44-229, -230 y -231
 * describían, lote a lote, el contenido de un contrato que se estaba tramitando
 * el 08-09-2025, y la licitación de noviembre trae esos cinco lotes con esos
 * nombres; su adjudicación, publicada el 01-04-2026, corrobora la descripción.
 */
export const DOCTRINA_DEL_POSTERIOR =
  'Un registro posterior puede corroborar lo que se describió de un contrato que se estaba ' +
  'tramitando —su objeto, sus lotes—; no que algo ya estuviera hecho, ni una promesa. Si es ' +
  'lo primero, fírmalo con --registro-posterior "<motivo>" (o --registro-posterior-de ' +
  '<fichero>): el motivo se publica con la subida. Si no, cita un registro anterior —el orden ' +
  'del día de su sesión—'

/**
 * Lo que los registros citados pueden sostener de la declaración que se sube.
 * Lanza, con todos los porqués, si no llegan (`problemasConLaDeclaracion`).
 *
 * Un registro posterior a lo dicho se acepta sólo con `registroPosterior`: el
 * motivo, firmado, de que corrobore la descripción de un contrato en trámite
 * (`DOCTRINA_DEL_POSTERIOR`). Nunca para una promesa, y nunca sin un registro
 * posterior que justificar: un motivo que no explica nada no se publica.
 */
export function comprobarRegistrosConLaDeclaracion(
  registros: readonly RegistroDeLaSubida[],
  declaracion: DeclaracionCotejada,
  veredicto: ClaimVerdict,
  registroPosterior: string | null = null,
): void {
  const problemas = problemasConLaDeclaracion(registros, declaracion, veredicto)
  const motivo = registroPosterior == null ? null : enUnaLinea(registroPosterior)
  if (motivo != null) {
    if (!problemas.some((p) => p.codigo === 'posterior')) {
      throw new Error(
        '--registro-posterior, pero ningún registro citado es posterior a la declaración: no hay ' +
          'nada que justificar, y el motivo se publicaría',
      )
    }
    if (motivo.length < 20) {
      throw new Error(
        '--registro-posterior dice por qué el registro posterior sostiene lo dicho, en al menos ' +
          '20 caracteres',
      )
    }
    const charla = charlaDeTarea(motivo)
    if (charla) {
      throw new Error(`--registro-posterior habla de la tarea de un modelo (${charla})`)
    }
  }
  const quedan = problemas.filter((p) => !(motivo != null && p.codigo === 'posterior'))
  if (quedan.length > 0) throw new Error(quedan.map((p) => p.detalle).join('\n'))
}

// ─── Lo ya firmado, contra el corpus de hoy ─────────────────────────────────

/**
 * Los cuatro desenlaces de una fila de contrato ya firmada, vuelta a derivar
 * contra el tenders.json de hoy. Es la forma de CLAUDE.md «A verbatim stays put;
 * a number does not»: una fila firmada no la reescribe nada (regla 4), así que
 * lo que haga falta lo decide una persona con lo que esto le diga.
 *
 *   coincide      la vía escribiría hoy la misma fila
 *   movido        el mismo contrato, con el mismo importe, estado, fecha y
 *                 expediente: la fila sólo cambia por el formato de la vía o
 *                 por cómo escribe el registro la adjudicataria
 *   contradice    el importe, el estado, la fecha, la adjudicataria o el
 *                 contrato no son los mismos, o la vía ya no la escribiría
 *   sin-registro  el contrato, o su lote, ya no está en tenders.json
 *
 * Los dos últimos salen 1 en `check:veredictos`.
 */
export const DESENLACES_DE_FILA = ['coincide', 'movido', 'contradice', 'sin-registro'] as const
export type DesenlaceDeFila = (typeof DESENLACES_DE_FILA)[number]

export interface CotejoDeFila {
  ref: string
  /** El lote que dice la fila, o `null`. */
  lote: number | null
  desenlace: DesenlaceDeFila
  detalle: string
  /** La fila que la vía escribiría hoy, o `null` si no la escribiría. */
  filaDeHoy: string | null
  /** El registro de hoy, para las comprobaciones de la subida. */
  registro: RegistroDeLaSubida | null
}

/** Sin tildes, mayúsculas, entidades ni espacios de más: para comparar textos. */
const comparable = (s: unknown) => sinTildes(decodeHtmlEntities(String(s ?? '')))

/** Las formas jurídicas y las palabras vacías no distinguen a una adjudicataria. */
const NO_DISTINGUEN = new Set([
  'sa',
  'sl',
  'sau',
  'slu',
  'sll',
  'slp',
  'slne',
  'sc',
  'scoop',
  'coop',
  'sccl',
  'scv',
  'cb',
  'ltd',
  'gmbh',
  'ag',
  'sociedad',
  'limitada',
  'anonima',
  'unipersonal',
  'de',
  'del',
  'la',
  'las',
  'el',
  'los',
  'y',
  'e',
])

const nombreDistintivo = (s: unknown) =>
  comparable(s)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1 && !NO_DISTINGUEN.has(t))

/**
 * ¿Es la misma adjudicataria, escrita de otro modo? El registro la reescribe
 * sin avisar —«VODAFONE ESPANA SA» y hoy «VODAFONE SA», «HIDRAQUA GESTIÓN
 * INTEGRAL DE AGUAS DE LEVANTE, S.A.» y hoy «HIDRAQUA S.A.U», «URBEADAPTA S. L.»
 * y hoy «URBEADAPTA, S.L»—. Lo es si, sin formas jurídicas ni palabras vacías,
 * las palabras de una están todas en la otra; si no, es otra.
 */
export function mismaAdjudicataria(a: unknown, b: unknown): boolean {
  const x = nombreDistintivo(a)
  const y = nombreDistintivo(b)
  if (x.length === 0 || y.length === 0) return comparable(a) === comparable(b)
  const [corta, larga] = x.length <= y.length ? [x, new Set(y)] : [y, new Set(x)]
  return corta.every((t) => larga.has(t))
}

/**
 * Las cifras de una fila: «194.810,00 €» → 194810. Con o sin el punto de los
 * millares: `toLocaleString('es-ES')` no lo pone en un número de cuatro cifras
 * («1936,00 €»).
 */
function cifrasDeLaFila(texto: string): number[] {
  return [...texto.matchAll(/(?<![\d.])(\d+(?:\.\d{3})*,\d{2})\s?€/g)].map((m) =>
    Number(m[1].replace(/\./g, '').replace(',', '.')),
  )
}

/** La adjudicataria que nombra una fila, de cualquiera de sus formatos. */
function adjudicatariaDeLaFila(texto: string): string | null {
  const m = /\badjudicad[oa] a (.+?)(?= por \d|, que paga | · |$)/.exec(texto)
  return m ? m[1] : null
}

/**
 * Una fila de contrato ya firmada contra el tenders.json de hoy: el mismo
 * contrato —el enlace y, si lo dice, el lote—, y lo que la fila dice de él.
 * Puro.
 */
export function cotejarFilaDeContrato(fila: ClaimEvidence, corpus: CorpusCitable): CotejoDeFila {
  const ref = String(fila.ref ?? '')
  const vieja = String(fila.snippet ?? '')
  const m = /\blote (\d+)\b/.exec(vieja)
  const lote = m ? Number(m[1]) : null
  const con = (
    desenlace: DesenlaceDeFila,
    detalle: string,
    hoy: RegistroDeLaSubida | null = null,
  ): CotejoDeFila => ({
    ref,
    lote,
    desenlace,
    detalle,
    filaDeHoy: hoy?.fila.snippet ?? null,
    registro: hoy,
  })

  const tenders = corpus.tenders as { contracts?: unknown } | null
  const contratos = lista<FilaContrato>(tenders?.contracts).filter((r) => r?.permalink === ref)
  if (contratos.length === 0) {
    return con('sin-registro', 'el enlace ya no lleva a ningún contrato de tenders.json')
  }
  let c: FilaContrato
  if (contratos.length > 1) {
    if (lote == null) {
      return con(
        'contradice',
        `el enlace lleva hoy a ${contratos.length} contratos, uno por lote, y la fila no dice cuál`,
      )
    }
    const elegidos = contratos.filter((r) => Number(r?.batchNumber) === lote)
    if (elegidos.length === 0)
      return con('sin-registro', `el lote ${lote} ya no está en tenders.json`)
    if (elegidos.length > 1) {
      return con('contradice', `el lote ${lote} son hoy ${elegidos.length} contratos`)
    }
    c = elegidos[0]
  } else {
    if (lote != null) {
      return con(
        'contradice',
        `la fila cita el lote ${lote} y el enlace lleva hoy a un solo contrato`,
      )
    }
    c = contratos[0]
  }
  if (!isCommittedContract(c)) {
    return con(
      'contradice',
      `el contrato ya no está adjudicado ni formalizado (estado ${c.status ?? 'desconocido'})`,
    )
  }
  let hoy: RegistroDeLaSubida
  try {
    hoy = registroDeLaSubida({ enlace: ref, lote: contratos.length > 1 ? lote : null }, corpus)
  } catch (err) {
    return con('contradice', `la vía ya no escribiría esta fila: ${(err as Error).message}`)
  }
  if (hoy.fila.snippet === vieja) return con('coincide', '', hoy)

  const diferencias: string[] = []
  const delRegistroHoy = [c.finalAmount, c.finalAmountNoTaxes, c.estimatedValue]
    .map(positivo)
    .filter((n): n is number => n != null)
  for (const x of cifrasDeLaFila(vieja)) {
    if (!delRegistroHoy.some((n) => Math.abs(n - x) < 0.005)) {
      diferencias.push(`importe: la fila dice ${euros(x)} y el registro ya no lo da`)
    }
  }
  const adjudicataria = adjudicatariaDeLaFila(vieja)
  if (adjudicataria != null && !mismaAdjudicataria(adjudicataria, c.assignee)) {
    diferencias.push(
      `adjudicataria: la fila dice «${adjudicataria}» y el registro «${delRegistro(c.assignee)}»`,
    )
  }
  const fechas = vieja.match(/\b\d{2}-\d{2}-\d{4}\b/g)
  const fechaVieja = fechas ? fechas[fechas.length - 1] : null
  if (fechaVieja && fechaVieja !== dia(c.awardDate)) {
    diferencias.push(
      `fecha: la fila dice ${fechaVieja} y la adjudicación se publica hoy el ` +
        `${dia(c.awardDate) ?? 'sin fecha'}`,
    )
  }
  const expediente = (t: string) => /\bexpediente (\S+?)(?= ·|$)/.exec(t)?.[1] ?? null
  if (expediente(vieja) !== expediente(hoy.fila.snippet)) {
    diferencias.push(
      `expediente: la fila dice ${expediente(vieja) ?? 'ninguno'} y hoy ` +
        `${expediente(hoy.fila.snippet) ?? 'ninguno'}`,
    )
  }
  const tituloViejo = comparable(vieja.split(' · ')[0].replace(/…$/, ''))
  const titulos = [comparable(c.title), comparable(hoy.fila.snippet)]
  if (!titulos.some((t) => t.startsWith(tituloViejo))) {
    diferencias.push('título: la fila no empieza por el título que el registro da hoy')
  }
  if (diferencias.length > 0) return con('contradice', diferencias.join('; '), hoy)
  return con(
    'movido',
    'el mismo contrato, con el mismo importe, fecha y expediente: la vía la escribiría hoy de ' +
      'otro modo (su formato o la grafía de la adjudicataria)',
    hoy,
  )
}

/** Un aviso sobre una subida firmada: lo que hoy no la dejaría escribir. */
export interface AvisoDeSubida extends ProblemaConLaDeclaracion {
  id: string
}

export interface FilaCotejada {
  id: string
  ref: string
  lote: number | null
  desenlace: DesenlaceDeFila
  detalle: string
}

export interface CotejoDeSubidas {
  /** `sin-corpus`: no había tenders.json que leer, y no se cotejó nada. */
  estado: 'cotejado' | 'sin-corpus'
  /** Las subidas firmadas que se miraron. */
  subidas: number
  /** Cada fila de contrato, con su desenlace. */
  filas: FilaCotejada[]
  /** Las filas de otros registros —convocatorias, órdenes del día, SDA—: no se cotejan aquí. */
  otrasFilas: number
  /** De ésas, las que no se pudieron volver a derivar para mirar su fecha. */
  otrasSinRegistro: number
  /**
   * Lo que hoy no dejaría escribir la subida y ningún motivo arregla: un contrato
   * que sostiene una promesa, un `verificado` cuya cifra no dice ninguna fila,
   * una fecha que falta. Salen 1.
   */
  avisos: AvisoDeSubida[]
  /**
   * Un registro posterior a lo dicho, en una subida que no guarda por qué lo
   * sostiene (`registroPosterior`). Las firmadas antes del 19-10-2026 no podían
   * guardarlo: es un AVISO, sale 0, y lo decide el curador al volver a firmar.
   * Una subida que ya cae en `promesa` no entra aquí: ningún motivo la arregla.
   */
  posterioresSinMotivo: AvisoDeSubida[]
  /** Las que citan un registro posterior con su motivo firmado: se listan, salen 0. */
  posterioresConMotivo: Array<{ id: string; motivo: string }>
  /** Subidas cuya declaración no se sirve: su fecha, tipo y cifra no se miran. */
  sinDeclaracion: string[]
}

/** El registro de una fila que no es de contrato, pedido como lo pidió la vía. */
function pedidaDeLaFila(fila: ClaimEvidence): EvidenciaPedida {
  const punto = fila.kind === 'agenda' ? /\bpunto (\d+):/.exec(String(fila.snippet ?? '')) : null
  return { enlace: String(fila.ref ?? ''), lote: null, punto: punto ? Number(punto[1]) : null }
}

/**
 * Cada subida firmada del overlay, vuelta a mirar con las reglas y el corpus de
 * hoy: sus filas de contrato (`cotejarFilaDeContrato`) y lo que sus registros
 * pueden sostener de su declaración (`problemasConLaDeclaracion`). No reescribe
 * nada: una fila firmada sólo la cambia otra firma, o su retirada. Sin
 * tenders.json no se coteja nada, y lo dice: un «0 contradicen» sin haber mirado
 * sería el visto bueno hueco. Puro.
 */
export function cotejarSubidasFirmadas(input: {
  overlay: Overlay
  declaraciones: ReadonlyMap<string, DeclaracionCotejada>
  corpus: CorpusCitable | null
}): CotejoDeSubidas {
  const { overlay, declaraciones, corpus } = input
  const r: CotejoDeSubidas = {
    estado: 'sin-corpus',
    subidas: 0,
    filas: [],
    otrasFilas: 0,
    otrasSinRegistro: 0,
    avisos: [],
    posterioresSinMotivo: [],
    posterioresConMotivo: [],
    sinDeclaracion: [],
  }
  const tenders = corpus?.tenders as { contracts?: unknown } | null | undefined
  if (!corpus || !Array.isArray(tenders?.contracts)) return r
  r.estado = 'cotejado'
  for (const [id, e] of Object.entries(overlay?.entries ?? {})) {
    if (e?.source !== CANAL_DE_LA_SUBIDA) continue
    r.subidas += 1
    const registros: RegistroDeLaSubida[] = []
    for (const fila of e.verification?.evidence ?? []) {
      if (fila.kind === 'tender') {
        const c = cotejarFilaDeContrato(fila, corpus)
        r.filas.push({ id, ref: c.ref, lote: c.lote, desenlace: c.desenlace, detalle: c.detalle })
        if (c.registro) registros.push(c.registro)
        continue
      }
      r.otrasFilas += 1
      try {
        registros.push(registroDeLaSubida(pedidaDeLaFila(fila), corpus))
      } catch {
        r.otrasSinRegistro += 1
      }
    }
    const declaracion = declaraciones.get(id)
    if (!declaracion) {
      r.sinDeclaracion.push(id)
      continue
    }
    const problemas = problemasConLaDeclaracion(registros, declaracion, e.verification.verdict)
    const esPromesa = problemas.some((p) => p.codigo === 'promesa')
    const motivo = typeof e.registroPosterior === 'string' ? e.registroPosterior : null
    let posterior = false
    for (const p of problemas) {
      if (p.codigo !== 'posterior') r.avisos.push({ id, ...p })
      else if (esPromesa) continue
      else if (motivo) posterior = true
      else r.posterioresSinMotivo.push({ id, ...p })
    }
    if (posterior && motivo) r.posterioresConMotivo.push({ id, motivo })
  }
  return r
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
  /**
   * Por qué la sostiene un registro posterior a la declaración, si cita uno
   * (`comprobarRegistrosConLaDeclaracion`). Se publica con la entrada.
   */
  registroPosterior?: string | null
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
        ...(pedida.registroPosterior
          ? { registroPosterior: enUnaLinea(pedida.registroPosterior) }
          : {}),
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
 * nadie lo firmara. La bajada guarda en `sustituye` la subida que retira, con
 * lo que ésta sustituía (`heredaSustituida`, en `applyOverlayEntries`). Puro:
 * devuelve un overlay nuevo.
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

// ─── Lo que se perdió ───────────────────────────────────────────────────────

/** De dónde sale lo que se recupera, y quién lo firma. */
export interface RecuperacionPedida {
  /** El commit entero en el que la entrada sustituida todavía estaba. */
  commit: string
  /** Una persona o la cuenta de rol: la prueba es mecánica y se rehace desde git. */
  editor: string
}

/**
 * Devuelve a una subida firmada lo que sustituyó, cuando la subida es anterior
 * al 11-10-2026 y su vía aún lo tiraba (ver `EntradaSustituida`): la entrada que
 * había, leída de git por quien llama, pasa a `sustituye` como la guardaría hoy
 * la vía, más de qué commit se recuperó, quién lo hizo y cuándo.
 *
 * No toca nada más de la subida —ni su veredicto, ni su resumen, ni su fecha—,
 * así que lo publicado no cambia. Y sólo recupera lo que encaja con ella: una
 * subida que aún no lo dice, una entrada que publicaba su `desde` y que es
 * anterior a ella. Puro: devuelve un overlay nuevo.
 */
export function recuperarSustituida(
  overlay: Overlay,
  claimId: string,
  anterior: OverlayEntry,
  pedida: RecuperacionPedida,
  stampIso: string,
): Overlay {
  const donde = `[recuperar] ${claimId}`
  const hueco = rechazoDeMarcador(pedida.editor)
  if (hueco) throw new Error(`${donde}: la recuperación la firma alguien: ${hueco}`)
  if (!/^[0-9a-f]{40}$/.test(pedida.commit)) {
    throw new Error(`${donde}: el commit se escribe entero, 40 hex (${pedida.commit})`)
  }
  const e = overlay?.entries?.[claimId]
  if (!e || e.source !== CANAL_DE_LA_SUBIDA || !e.desde) {
    throw new Error(
      `${donde}: no es una subida firmada (la entrada es ${e ? `de ${e.source}` : 'ninguna'})`,
    )
  }
  if (e.sustituye) {
    throw new Error(`${donde}: la subida ya dice lo que sustituyó (${e.sustituye.source})`)
  }
  if (anterior?.verification?.verdict !== e.desde) {
    throw new Error(
      `${donde}: la entrada de git publica ${String(anterior?.verification?.verdict)}, y la ` +
        `subida dice que subió desde ${e.desde}: no es la que sustituyó`,
    )
  }
  if (!(Date.parse(anterior.appliedAt) < Date.parse(e.appliedAt))) {
    throw new Error(
      `${donde}: la entrada de git (${anterior.appliedAt}) no es anterior a la subida (${e.appliedAt})`,
    )
  }
  const sustituye = {
    ...sustituidaDe(anterior),
    recuperada: { commit: pedida.commit, editor: pedida.editor, recuperadaAt: stampIso },
  }
  const next: Overlay = {
    ...overlay,
    generatedAt: stampIso,
    entries: { ...overlay.entries, [claimId]: { ...e, sustituye } },
  }
  validateOverlay(next)
  return next
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
