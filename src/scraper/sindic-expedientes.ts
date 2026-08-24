/**
 * Síndic de Greuges de la Comunitat Valenciana — el ÍNDICE de expedientes que
 * el propio organismo publica sobre Riba-roja de Túria. Parser puro, sin red.
 *
 * Por qué existe, y por qué no lo escribe una persona
 * ---------------------------------------------------
 * `sindic.ts` es el registro CURADO: una ficha firmada, con el `resumen`
 * verbatim leído del PDF y un `sentido` que alguien ha decidido. Eso sigue
 * siendo trabajo humano y sigue guardado por el hook de ficheros curados.
 *
 * Este módulo hace lo contrario y por eso puede ser automático: TRANSCRIBE un
 * registro público sin emitir ningún juicio. Materia, asunto, administración
 * reclamada y el título de cada resolución se copian tal cual los imprime el
 * buscador del Síndic. No se recodifican, no se resumen y no se puntúan.
 *
 * De dónde sale
 * -------------
 * El formulario de https://www.elsindic.com/actuaciones/ es WordPress con un
 * buscador Elasticsearch (`buscador-expedientes-elastic`). Habla por POST con
 * `wp-admin/admin-ajax.php?action=buscador_expedientes_elastic_search`, un
 * único campo `params` con JSON, y responde HTML. El `robots.txt` del propio
 * organismo lo permite de forma explícita:
 *
 *     Disallow: /wp-admin/
 *     Allow: /wp-admin/admin-ajax.php
 *
 * (La cabecera anterior de `sindic.ts` decía «Oracle APEX-style POST with
 * viewstate» y «low-value-high-effort» para «~1–5 resoluciones per year». Las
 * dos mitades eran falsas, y esa frase es la razón por la que el fichero pasó
 * 125 días publicando un cero.)
 *
 * Los dos ejes, y por qué NO se suman
 * -----------------------------------
 * El buscador ofrece dos filtros que parecen el mismo y no lo son:
 *
 *   · texto `"Riba-roja"`  → todo lo que menciona el municipio (49 el 24-08-26)
 *   · facet `poblacion`    → expedientes cuyo QUEJOSO vive aquí (16)
 *
 * `poblacion` NO es la administración reclamada. De sus 16 filas, una va contra
 * el Ayuntamiento de València y otra contra el de Guadassuar. Un adaptador que
 * filtrara por ahí publicaría «4» creyendo publicar «38».
 *
 * La puerta buena es el campo `Administración`, que el buscador imprime en cada
 * fila. Con ella salen dos listas que responden a preguntas distintas:
 *
 *   · contra el Ayuntamiento de Riba-roja  (rendición de cuentas del municipio)
 *   · vecinos de aquí ante otras administraciones  (contexto, no lo mismo)
 *
 * Y con su límite: el eje de texto llega a 2013; el facet `poblacion` no
 * devuelve nada anterior a 2023, así que la segunda lista no es una serie
 * histórica. Quien la pinte tiene que decirlo.
 */

import { normalizeAlphanumeric, RIBA_ROJA_ALIASES, decodeHtmlEntities } from './normalize'

/** Una resolución concreta dentro de un expediente. El `tipo` es del Síndic. */
export interface ResolucionSindic {
  /** Título que publica el Síndic, verbatim. Nunca recodificado. */
  tipo: string
  /** ISO yyyy-mm-dd. */
  fecha: string
  urlPdf: string
}

export interface ExpedienteSindic {
  /** Nº de expediente del Síndic, p. ej. "202502231". */
  expediente: string
  /** Año que codifican los cuatro primeros dígitos. */
  anio: number
  /** Materia del Síndic, verbatim (su vocabulario, no el nuestro). */
  materia: string
  /** Asunto del Síndic, verbatim. */
  asunto: string
  /** Administración reclamada, verbatim. Es el campo sobre el que va la puerta. */
  administracion: string
  resoluciones: ResolucionSindic[]
}

export interface ResultadoBusqueda {
  /**
   * Total que declara la cabecera «Expedientes 1 - 10 de N», NO `filas.length`.
   * Confundirlos deja de paginar en la primera vuelta.
   */
  total: number
  filas: ExpedienteSindic[]
  /**
   * ¿Es esto una respuesta del buscador que hemos sabido leer?
   *
   * «Sin resultados» y «no supe leer la página» dan los dos cero filas y sólo
   * uno es un dato. Sin esta distinción, un cambio de plantilla publicaría un
   * cero con toda la pinta de un hecho — que es exactamente lo que este dominio
   * llevaba 125 días haciendo.
   */
  reconocida: boolean
}

/**
 * Los títulos de resolución que el Síndic usa hoy. Se EXPORTA para que las
 * pruebas lo importen en vez de recopiarlo (regla 1 de DATA_INTEGRITY: seis
 * pruebas de este repo copiaron una forma a mano y siguieron verdes mientras
 * producción no casaba con nada).
 *
 * Es un vocabulario OBSERVADO, no una restricción: `tipo` se guarda verbatim
 * aunque no esté aquí. Esta lista sólo sirve para el techo — si la proporción
 * de títulos desconocidos sube, el Síndic cambió su nomenclatura y hay que
 * mirarlo, en vez de descubrirlo cuando alguien lea la página.
 */
export const TIPOS_RESOLUCION_CONOCIDOS: readonly string[] = [
  'Resolución de cierre',
  'Resolución de consideraciones a la Administración',
  'Petición de informe. Resolución.',
]

const ALIAS_NORMALIZADOS = RIBA_ROJA_ALIASES.map(normalizeAlphanumeric)

/** Cuerpos municipales, en las dos lenguas oficiales. */
const ES_MUNICIPAL = /(ayuntamiento|ajuntament)/

/**
 * ¿Es esta administración el Ayuntamiento de Riba-roja de Túria?
 *
 * Deliberadamente estrecha, igual que `place-resolver.ts`: pide un cuerpo
 * municipal Y un alias completo con su desambiguador «de Túria / del Turia».
 * Un fallo honesto es mejor que una fila mal atribuida — y aquí la fila
 * atribuye una queja ciudadana a una administración concreta.
 */
export function esAyuntamientoDeRibaRoja(administracion: string | null | undefined): boolean {
  if (!administracion) return false
  const n = normalizeAlphanumeric(administracion)
  if (!ES_MUNICIPAL.test(n)) return false
  return ALIAS_NORMALIZADOS.some((a) => n.includes(a))
}

function limpiar(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function campo(bloque: string, etiqueta: string): string {
  // El buscador emite «<strong>Administración:</strong> …</p>», con la etiqueta
  // a veces con entidad (`Administraci&oacute;n`), así que se busca sobre el
  // bloque ya decodificado.
  const texto = decodeHtmlEntities(bloque)
  const m = texto.match(
    new RegExp(`<strong>\\s*${etiqueta}\\s*:\\s*</strong>([\\s\\S]*?)</p>`, 'i'),
  )
  return m ? limpiar(m[1]) : ''
}

function fechaISO(ddmmyyyy: string): string | null {
  const m = ddmmyyyy.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/**
 * Lee una respuesta del buscador. Una sola página: la paginación es del CLI,
 * porque es lo único que necesita la red.
 */
export function parseResultados(html: string): ResultadoBusqueda {
  const reconocida = /class="resultados-busqueda"/.test(html)
  if (!reconocida) return { total: 0, filas: [], reconocida: false }

  const mTotal = decodeHtmlEntities(html).match(/de\s*<b>\s*([\d.,]+)\s*<\/b>/i)
  const total = mTotal ? Number(mTotal[1].replace(/[.,]/g, '')) : 0

  const filas: ExpedienteSindic[] = []
  for (const [, bloque] of html.matchAll(/<div class="resultado-item">([\s\S]*?)<\/div>/g)) {
    const mExp = decodeHtmlEntities(bloque).match(/Expediente\s*N[ºo°]?\s*([0-9]{5,})/i)
    if (!mExp) continue
    const expediente = mExp[1]

    const resoluciones: ResolucionSindic[] = []
    for (const [, urlPdf, titulo, fecha] of bloque.matchAll(
      /href="([^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>\s*-\s*([\d/]+)/g,
    )) {
      const iso = fechaISO(fecha)
      // Una resolución sin fecha legible se DEJA FUERA en vez de inventarle
      // una: la fecha es lo que sitúa la resolución en el tiempo y una fila
      // fechada mal es peor que una fila que falta. El CLI cuenta las caídas.
      if (!iso) continue
      resoluciones.push({ tipo: limpiar(titulo), fecha: iso, urlPdf: urlPdf.trim() })
    }

    filas.push({
      expediente,
      anio: Number(expediente.slice(0, 4)),
      materia: campo(bloque, 'Materia'),
      asunto: campo(bloque, 'Asunto'),
      administracion: campo(bloque, 'Administración'),
      resoluciones,
    })
  }

  return { total, filas, reconocida: true }
}

export interface Reparto {
  /** Expedientes cuya administración reclamada ES el Ayuntamiento. */
  contraAyuntamiento: ExpedienteSindic[]
  /** Vecinos de Riba-roja que reclaman a OTRA administración. */
  vecinos: ExpedienteSindic[]
  /** Menciones del municipio en expedientes que no son ni una cosa ni la otra. */
  descartadas: ExpedienteSindic[]
  /** Filas repetidas entre los dos ejes, contadas una sola vez. */
  duplicadas: number
}

const masRecienteAntes = (a: ExpedienteSindic, b: ExpedienteSindic) =>
  a.expediente < b.expediente ? 1 : a.expediente > b.expediente ? -1 : 0

/**
 * Une los dos ejes y los reparte en tres cubos disjuntos.
 *
 * Deduplica POR EXPEDIENTE, no por objeto: los dos ejes se solapan (el 24-08-26
 * comparten 8 filas) y un expediente que salga por los dos no puede contarse
 * dos veces ni aparecer en las dos listas.
 *
 * Cuando la puerta rechaza una fila, su cubo depende de por dónde llegó: si el
 * facet de población la trajo, es de un vecino de aquí ante otra administración
 * y va a `vecinos`; si sólo salió por texto, es una mención y va a
 * `descartadas`. Esa asimetría es la que mantiene las dos listas respondiendo a
 * preguntas distintas.
 */
export function repartirPorAdministracion(
  ejeTexto: readonly ExpedienteSindic[],
  ejePoblacion: readonly ExpedienteSindic[],
): Reparto {
  const deLaPoblacion = new Set(ejePoblacion.map((f) => f.expediente))
  const vistos = new Map<string, ExpedienteSindic>()
  let duplicadas = 0
  for (const f of [...ejeTexto, ...ejePoblacion]) {
    if (vistos.has(f.expediente)) {
      duplicadas++
      continue
    }
    vistos.set(f.expediente, f)
  }

  const contraAyuntamiento: ExpedienteSindic[] = []
  const vecinos: ExpedienteSindic[] = []
  const descartadas: ExpedienteSindic[] = []
  for (const f of vistos.values()) {
    if (esAyuntamientoDeRibaRoja(f.administracion)) contraAyuntamiento.push(f)
    else if (deLaPoblacion.has(f.expediente)) vecinos.push(f)
    else descartadas.push(f)
  }

  return {
    contraAyuntamiento: contraAyuntamiento.sort(masRecienteAntes),
    vecinos: vecinos.sort(masRecienteAntes),
    descartadas: descartadas.sort(masRecienteAntes),
    duplicadas,
  }
}

export interface EstadisticasSindic {
  contraAyuntamiento: number
  conResolucionPublicada: number
  vecinosOtrasAdministraciones: number
  /** Recuento de los títulos que pone el Síndic. No es una valoración nuestra. */
  porTipoResolucion: Record<string, number>
  porMateria: Record<string, number>
  /** Título de resolución fuera del vocabulario observado — techo, no filtro. */
  tiposDesconocidos: number
  anioMasAntiguo: number | null
  anioMasReciente: number | null
}

export function estadisticas(r: Reparto): EstadisticasSindic {
  const cuenta = (xs: string[]) =>
    xs.reduce<Record<string, number>>((acc, x) => ((acc[x] = (acc[x] ?? 0) + 1), acc), {})
  const tipos = r.contraAyuntamiento.flatMap((f) => f.resoluciones.map((x) => x.tipo))
  const anios = r.contraAyuntamiento.map((f) => f.anio)
  return {
    contraAyuntamiento: r.contraAyuntamiento.length,
    conResolucionPublicada: r.contraAyuntamiento.filter((f) => f.resoluciones.length > 0).length,
    vecinosOtrasAdministraciones: r.vecinos.length,
    porTipoResolucion: cuenta(tipos),
    porMateria: cuenta(r.contraAyuntamiento.map((f) => f.materia)),
    tiposDesconocidos: tipos.filter((t) => !TIPOS_RESOLUCION_CONOCIDOS.includes(t)).length,
    anioMasAntiguo: anios.length ? Math.min(...anios) : null,
    anioMasReciente: anios.length ? Math.max(...anios) : null,
  }
}
