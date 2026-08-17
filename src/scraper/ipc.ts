/**
 * Índice de precios, para poder leer una serie de coste como una serie.
 *
 * `/eficiencia` publica diez costes unitarios con serie de 2014 a 2024. Hasta
 * ahora esa serie iba en **euros corrientes**, que es como no ir en nada: entre
 * 2014 y 2024 el nivel de precios subió un 22,8 %, así que un servicio que
 * costara exactamente lo mismo en términos reales aparecía subiendo un 23 %.
 * Pavimentación de vías públicas se leía «+29 %» y en euros constantes es
 * «+5 %»; la inflación se comía veinticuatro de los veintinueve puntos.
 *
 * Eso importa más aquí que en otras páginas, porque el hallazgo firmado de
 * `/eficiencia` dice que estas series no se pueden leer como gestión al tener
 * el denominador congelado. Es verdad, y con euros corrientes había **dos**
 * motivos en vez de uno, mezclados y sin separar. Deflactar no falsa el
 * hallazgo: lo hace preciso, porque deja ver cuánto del movimiento es precio y
 * cuánto es el denominador que nadie vuelve a medir.
 *
 * ## Qué índice, y por qué éste
 *
 * Para deflactar **gasto público** el índice de manual es el *deflactor
 * implícito del PIB*: cubre los servicios de las administraciones y excluye
 * precios de importación, mientras que el IPC mide una cesta de consumo
 * doméstico. Aquí se usa el IPC, y conviene decir por qué en vez de
 * disimularlo:
 *
 *  - La API abierta del INE **no sirve** el deflactor implícito como serie. La
 *    Contabilidad Nacional anual (`CNE`) no expone tablas por esa vía, y la
 *    trimestral sólo publica el volumen como *índices encadenados*, que no se
 *    pueden sumar para obtener un deflactor anual sin los agregados en euros
 *    constantes que la API tampoco da.
 *  - El coste de estos servicios es sobre todo salarios y compras corrientes,
 *    donde el IPC es una aproximación razonable.
 *  - Y sobre todo: **ninguna conclusión de la página depende de la elección**.
 *    Los dos índices se mueven parecido en este periodo, y lo que se afirma es
 *    que buena parte de la subida aparente es nivel de precios — cierto con
 *    cualquiera de los dos.
 *
 * La limitación se declara en `/metodologia`. Si algún día hay deflactor del
 * PIB en la API, se cambia la fuente y esta serie sale sola: nada de lo que
 * consume este módulo depende de que el índice sea el IPC.
 *
 * Parser puro — la descarga vive en `scripts/scrape-ipc.ts`.
 */

/** Meses que tiene que traer un año para que su media anual sea una media. */
export const MESES_POR_ANIO_COMPLETO = 12

/** Tabla 24077 del INE, «Índice general nacional», mensual desde 1961. */
export const TABLA_INE = 24077

/** De dónde sale, para que la cifra publicada se pueda volver a pedir. */
export const FUENTE_URL = `https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/${TABLA_INE}`

export interface PuntoIpc {
  anio: number
  /** Código de periodo del INE (1–12 para los meses). Se guarda sin traducir. */
  periodo: number
  valor: number
}

/** Índice medio de cada año completo, indexado por año. */
export type MediasAnuales = Record<number, number>

/**
 * Lee el payload de la API JSON del INE.
 *
 * La respuesta es un array de series; la tabla 24077 trae una sola. Se
 * descartan los puntos sin valor numérico en vez de convertirlos a cero: un
 * cero en un índice de precios no es un dato bajo, es un dato que no está.
 */
export function parseSerieIpc(crudo: unknown): PuntoIpc[] {
  if (!Array.isArray(crudo) || crudo.length === 0) return []
  const puntos: PuntoIpc[] = []
  for (const serie of crudo) {
    const datos = (serie as { Data?: unknown }).Data
    if (!Array.isArray(datos)) continue
    for (const d of datos) {
      const anio = Number((d as { Anyo?: unknown }).Anyo)
      const periodo = Number((d as { FK_Periodo?: unknown }).FK_Periodo)
      const valor = Number((d as { Valor?: unknown }).Valor)
      if (!Number.isFinite(anio) || !Number.isFinite(valor)) continue
      puntos.push({ anio, periodo, valor })
    }
  }
  return puntos
}

/**
 * Media anual, **sólo** de los años que traen los doce meses.
 *
 * El primer y el último año de cualquier descarga vienen a medias. Promediar
 * siete meses y llamarlo «el índice de 2026» es exactamente el tipo de cifra
 * que luego nadie puede reproducir, así que esos años no salen: quien pida un
 * deflactor contra ellos recibe `null` y se entera.
 */
export function mediasAnuales(puntos: PuntoIpc[]): MediasAnuales {
  const porAnio = new Map<number, number[]>()
  for (const p of puntos) {
    const lista = porAnio.get(p.anio) ?? []
    lista.push(p.valor)
    porAnio.set(p.anio, lista)
  }
  const medias: MediasAnuales = {}
  for (const [anio, valores] of porAnio) {
    if (valores.length !== MESES_POR_ANIO_COMPLETO) continue
    medias[anio] = valores.reduce((s, v) => s + v, 0) / valores.length
  }
  return medias
}

/**
 * Factor por el que multiplicar un importe de `anioOrigen` para expresarlo en
 * euros de `anioBase`. `null` si falta cualquiera de los dos índices.
 */
export function factorDeflactor(
  anioOrigen: number,
  anioBase: number,
  medias: MediasAnuales,
): number | null {
  const origen = medias[anioOrigen]
  const base = medias[anioBase]
  if (!Number.isFinite(origen) || !Number.isFinite(base) || !origen) return null
  return base / origen
}

/**
 * Pasa un importe a euros constantes del año base.
 *
 * Devuelve `null` cuando no hay índice, nunca el importe sin tocar: un valor
 * que vuelve igual es indistinguible de uno bien deflactado, y esa confusión es
 * justo la que hace que una serie mienta sin que nadie lo note.
 */
export function aEurosConstantes(
  valor: number,
  anioOrigen: number,
  anioBase: number,
  medias: MediasAnuales,
): number | null {
  const factor = factorDeflactor(anioOrigen, anioBase, medias)
  if (factor === null || !Number.isFinite(valor)) return null
  return valor * factor
}

export interface IpcSnapshot {
  generatedAt: string
  fuente: string
  tabla: number
  indice: string
  /** Año cuyo índice vale 100 en la serie descargada. */
  anioBase100: number | null
  medias: MediasAnuales
  stats: { anios: number; desde: number | null; hasta: number | null }
}

/** Arma el snapshot que se publica en `public/data/ipc.json`. */
export function construirSnapshot(puntos: PuntoIpc[], generatedAt: string): IpcSnapshot {
  const medias = mediasAnuales(puntos)
  const anios = Object.keys(medias)
    .map(Number)
    .sort((a, b) => a - b)
  const base100 = anios.find((a) => Math.abs(medias[a] - 100) < 0.005) ?? null
  return {
    generatedAt,
    fuente: FUENTE_URL,
    tabla: TABLA_INE,
    indice: 'IPC general nacional · media anual',
    anioBase100: base100,
    medias,
    stats: {
      anios: anios.length,
      desde: anios[0] ?? null,
      hasta: anios[anios.length - 1] ?? null,
    },
  }
}
