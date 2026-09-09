/**
 * ¿Hay algo NUESTRO y privado en lo que se está a punto de comitear?
 *
 * Puro y sin red: la decisión vive aquí, el `fetch` de ficheros vive en
 * `scripts/check-privado.ts`. Es la hermana de `check:secrets` y existe porque
 * esa no podía hacer este trabajo: **un secreto se reconoce por su FORMA** —un
 * token de Telegram parece un token de Telegram— y esto no tiene forma de nada.
 *
 * La cicatriz, del 2026-09-09: la referencia de la propuesta de NLnet —su código
 * real, que no se repite aquí— entró en `bot/src/services/convocatorias.ts`, un fichero que
 * se despliega en Fly y que vive en un repositorio público desde el 8-09-2026.
 * `check:secrets` la miró y dijo, con toda la razón, «0 secretos». Y la guarda
 * propia del módulo miraba importes concretos y las palabras «prioridad» y
 * «estrategia», así que también estuvo en verde. Dos puertas, las dos abiertas,
 * porque ninguna preguntaba lo que había que preguntar.
 *
 * EL DISCRIMINADOR ES QUE EL SUJETO SEAMOS NOSOTROS, no la palabra suelta.
 *
 * Esto importa más aquí que en cualquier otro repositorio: **este sitio publica
 * sueldos de concejales, retribuciones de cargos y presupuestos municipales, y
 * eso es su OFICIO.** Una regla que se disparara con «salario» y una cifra en
 * euros marcaría `dedicaciones.json`, media `/cargos` y todo `/presupuesto` — y
 * una guarda que llora en el contenido que da sentido al proyecto se apaga el
 * primer día. Por eso «dedicación», «expediente» y «dotación» están
 * DELIBERADAMENTE fuera de los patrones: son el vocabulario de lo publicable.
 *
 * Tres clases, cada una con su cicatriz real:
 *
 *   · `referencia-solicitud` — el código de una solicitud NUESTRA escrito como
 *     literal. Identifica una propuesta viva (NLnet admite reenvío hasta su
 *     cierre) y al lector del repositorio no le sirve de nada.
 *   · `retribucion-propia` — nuestro objetivo de sueldo. Estuvo público desde el
 *     8-09-2026 en `docs/superpowers/`, en una tabla que lo daba como «funding
 *     goal» con su horquilla anual. La cifra tampoco se repite aquí.
 *   · `importe-solicitado` — lo que PEDIMOS, que no es lo que publica quien
 *     convoca. Las cifras del convocante son hecho público y tienen que pasar:
 *     el calendario del bot lista diez convocatorias con las suyas.
 *
 * No hay lista de excepciones por línea a propósito. Si algún día el proyecto
 * decide publicar su propia financiación —que sería una decisión editorial
 * defendible— esto se revisa con un comentario que lo diga, no con un marcador
 * que cualquiera pueda espolvorear hasta que la guarda no mire nada.
 */
export type ClasePrivada = 'referencia-solicitud' | 'retribucion-propia' | 'importe-solicitado'

export interface HallazgoPrivado {
  fichero: string
  /** 1-indexada, para poder abrirlo sin buscar. */
  linea: number
  clase: ClasePrivada
  /** El fragmento, recortado. Nunca la línea entera: puede ser larguísima. */
  fragmento: string
  motivo: string
}

export interface ResumenPrivado {
  ficheros: number
  hallazgos: number
  porClase: Record<ClasePrivada, number>
  bloquea: boolean
  /**
   * Cero hallazgos sobre cero ficheros no es un visto bueno, es una pasada que
   * no hizo nada. Regla 2 de DATA_INTEGRITY, y `check:secrets` ya lo distingue:
   * esta guarda no puede ser más laxa que la que copia.
   */
  concluyente: boolean
}

/**
 * Una cifra de dinero. `$` NO cuenta: en este repositorio un `$` suelto es casi
 * siempre `$TMP` o `${…}` en un script, y contarlo como dinero convirtió media
 * carpeta de planes en «importes». Tampoco una `k` suelta: tiene que ir pegada
 * a un número.
 */
const DINERO = /(?:€|\bEUR\b|\beuros?\b|\d[\d.,]*\s*(?:€|EUR\b|euros?\b)|\d\s*[kKmM]€|\d\s*k\b)/

/**
 * Retribución: sólo las palabras que describen la paga de UNA PERSONA por su
 * trabajo. Fuera queda «dedicación», que es como el sitio nombra la de un
 * concejal, y «presupuesto», que es la del ayuntamiento.
 */
const RETRIBUCION = /\b(?:salary|salario|sueldo|retribuci[óo]n|remuneraci[óo]n|honorarios)\b/i

/**
 * Y el marcador de que la persona somos nosotros.
 *
 * «propio» y «nuestro» NO valen, y eso lo enseñó un falso positivo real: la
 * nota de curaduría de un concejal decía «su retribución propia del cargo» y la
 * guarda se creyó el sujeto. Sólo valen palabras que nombran al operador del
 * proyecto, que no aparecen jamás en los datos municipales.
 */
const SOMOS_NOSOTROS =
  /\b(?:operator|operador|operadora|fundador|fundadora|founder|full-?time|jornada completa)\b/i

/**
 * Pedir es en primera persona. «budget» a secas se cayó de esta lista: es el
 * PRESUPUESTO MUNICIPAL, que es justo lo que este sitio publica.
 */
const PEDIMOS =
  /\b(?:pedimos|solicitamos|pediremos|we ask|we request|we're asking|our ask|importe solicitado|importe que pedimos|funding goal|proposal draft)\b/i

/**
 * Los financiadores, que es la mitad que falta del discriminador: una línea
 * sobre sueldos en un fichero que no habla de financiación es de otra cosa.
 * Ninguno de estos nombres aparece en los datos municipales.
 */
const FINANCIADORES =
  /\b(?:NLnet|Goteo|European Press Prize|Sigma Awards?|JournalismFund|IJ4EU|Pluralistic Media|Local Media for Democracy|Sovereign Tech Fund|NGI ?Zero|Civitates|Carasso|Cotec|Open Society|matchfunding)\b/i

/**
 * Una clave que guarda la referencia de una solicitud. `expediente` NO está:
 * los expedientes municipales son la materia publicable del sitio. Y el valor
 * tiene que parecer un código —cifra más separador— para que un `ref: 'main'`
 * o un `ref` de React no cuenten.
 */
const REF_LITERAL =
  /\b(?:ref|referencia|refSolicitud|codigoSolicitud)\s*[:=]\s*['"]([^'"]{4,40})['"]/i
const PARECE_CODIGO = /(?=.*\d)(?=.*[-_/])/

/**
 * Y el contexto de ENVÍO, sin el cual `ref` no significa nada aquí.
 *
 * Ésta fue la lección cara: en esta casa `ref` es el campo de una CITA —la
 * prueba documental que sostiene un hallazgo— y aparece en once ficheros
 * (`{ kind: 'tender', ref: 'https://…' }`). Marcar todos habría sido una guarda
 * inservible el primer día. Lo que distingue nuestra referencia de solicitud es
 * que va pegada a que la solicitud está PRESENTADA.
 */
const CONTEXTO_ENVIO = /\b(?:presentada|presentado|solicitud|submitted|application)\b/i

const RECORTE = 120

function recorta(linea: string): string {
  const t = linea.trim()
  return t.length <= RECORTE ? t : `${t.slice(0, RECORTE)}…`
}

/**
 * Una línea da como mucho UN hallazgo, y las clases se prueban en orden. Una
 * línea que es a la vez «funding goal» y «salary … operator» es un solo defecto
 * y contarlo dos veces sólo infla el informe.
 *
 * `hablaDeFinanciacion` es del FICHERO, no de la línea: el objetivo de sueldo y
 * el nombre del financiador casi nunca caen en el mismo renglón.
 */
function clasificar(
  linea: string,
  hablaDeFinanciacion: boolean,
): { clase: ClasePrivada; motivo: string } | null {
  const m = REF_LITERAL.exec(linea)
  if (m && PARECE_CODIGO.test(m[1]) && CONTEXTO_ENVIO.test(linea) && hablaDeFinanciacion) {
    return {
      clase: 'referencia-solicitud',
      motivo:
        'la referencia de una solicitud nuestra, escrita como literal: identifica una propuesta viva. Pásala por entorno',
    }
  }

  if (!hablaDeFinanciacion) return null
  if (!DINERO.test(linea)) return null

  if (RETRIBUCION.test(linea) && SOMOS_NOSOTROS.test(linea)) {
    return {
      clase: 'retribucion-propia',
      motivo: 'nuestro propio objetivo de retribución. Va en editorial/, que está gitignorado',
    }
  }

  if (PEDIMOS.test(linea)) {
    return {
      clase: 'importe-solicitado',
      motivo:
        'el importe que PEDIMOS (distinto del que publica quien convoca). Va en editorial/, que está gitignorado',
    }
  }

  return null
}

export function buscarPrivado(fichero: string, contenido: string): HallazgoPrivado[] {
  const out: HallazgoPrivado[] = []
  const hablaDeFinanciacion = FINANCIADORES.test(contenido)
  const lineas = contenido.split('\n')
  for (let i = 0; i < lineas.length; i += 1) {
    const c = clasificar(lineas[i], hablaDeFinanciacion)
    if (c) out.push({ fichero, linea: i + 1, fragmento: recorta(lineas[i]), ...c })
  }
  return out
}

export function resumirPrivado(hallazgos: HallazgoPrivado[], ficheros: number): ResumenPrivado {
  const porClase: Record<ClasePrivada, number> = {
    'referencia-solicitud': 0,
    'retribucion-propia': 0,
    'importe-solicitado': 0,
  }
  for (const h of hallazgos) porClase[h.clase] += 1

  return {
    ficheros,
    hallazgos: hallazgos.length,
    porClase,
    bloquea: hallazgos.length > 0,
    concluyente: ficheros > 0,
  }
}
