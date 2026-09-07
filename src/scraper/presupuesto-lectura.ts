/**
 * La lectura de /presupuesto: lo que la página afirma sobre la FORMA del dato.
 *
 * La lámina 5b del lienzo «Civicpulse UI/UX review» ordena la página del
 * crédito inicial a lo ejecutado, y su auditoría acertó en nueve cifras y se
 * equivocó en una: «bajó tres años seguidos» sobre una serie de deuda que baja
 * DOS (2023 y 2024) tras subir en 2022. Una frase escrita a mano habría
 * publicado el error y ninguna prueba lo habría visto, porque las pruebas
 * miran datos y la cifra estaba bien: la palabra estaba mal. Así que las
 * frases que describen el dato —cuánto creció el presupuesto, qué capítulo se
 * llevó la ampliación, hacia dónde va la deuda— se derivan aquí, con sus
 * ausencias declaradas, y el JSX sólo las pinta.
 *
 * Tres reglas, cada una con su caso:
 *
 * 1. Una lectura que no cuadra no se publica. `cascadaGastos` recompone
 *    inicial + modificaciones contra el definitivo que declara la fuente; si
 *    no casan, `cuadra` es false y la página retira el «+65 %» en vez de
 *    imprimir aritmética sin cotejar. Es el patrón de `retribucionesSplit`.
 * 2. «Casi toda la ampliación fue a…» sólo cuando un capítulo se lleva la
 *    MAYORÍA. Con la ampliación repartida, `capituloDominante` devuelve null y
 *    la frase no existe. Un umbral más bajo la haría verdadera de cualquier
 *    ejercicio, que es lo mismo que no decir nada.
 * 3. La tendencia se CUENTA. `tendenciaDeuda` mira el último cambio y la
 *    racha que lo precede, y escribe el titular desde ahí.
 */

export interface TotalEjecucion {
  inicial: number
  modificaciones: number
  /** Crédito definitivo: el nombre que le da el listado municipal es `actual`. */
  actual: number
  /** Obligaciones reconocidas netas. Lo único que se ha gastado. */
  ejecutado: number
}

export interface CapituloEjecucion extends TotalEjecucion {
  capitulo: number
  label: string
}

export interface Cascada {
  inicial: number
  modificaciones: number
  definitivo: number
  ejecutado: number
  /** modificaciones ÷ inicial, en puntos porcentuales. */
  ampliacionPct: number
  ejecutadoSobreDefinitivoPct: number
  ejecutadoSobreInicialPct: number
  /** inicial + modificaciones = definitivo, al euro. */
  cuadra: boolean
}

export interface LecturaCapitulo {
  capitulo: number
  label: string
  /** El rótulo del listado, pasado a frase. */
  rotulo: string
  inicial: number
  modificaciones: number
  definitivo: number
  ejecutado: number
  pctEjecutado: number
  /** Qué parte de TODA la ampliación se llevó este capítulo, 0..1. */
  cuotaAmpliacion: number
  /** Crédito inicial 0 y definitivo > 0: la partida no estaba en lo aprobado. */
  abrioEnCero: boolean
}

export interface CapituloDominante {
  capitulo: number
  label: string
  rotulo: string
  cuotaAmpliacion: number
  abrioEnCero: boolean
  pctEjecutado: number
  definitivo: number
  modificaciones: number
}

export type Direccion = 'sube' | 'baja' | 'igual'

export interface PuntoDeuda {
  ejercicio: number
  deudaEuros: number
  /** Contra el ejercicio anterior; null en el primero. */
  delta: number | null
}

export interface TendenciaDeuda {
  ultimo: PuntoDeuda
  direccion: Direccion
  /** La racha ANTERIOR al último cambio: dirección y cuántos años seguidos. */
  rachaPrevia: { direccion: Direccion; n: number } | null
  titular: string
  puntos: PuntoDeuda[]
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Margen para «cuadra»: la fuente publica céntimos y suma en coma flotante. */
const TOLERANCIA_CUADRE = 1

export function cascadaGastos(total: Partial<TotalEjecucion> | null | undefined): Cascada | null {
  if (!total) return null
  const inicial = num(total.inicial)
  const modificaciones = num(total.modificaciones)
  const definitivo = num(total.actual)
  const ejecutado = num(total.ejecutado)
  if (inicial <= 0 || definitivo <= 0) return null
  return {
    inicial,
    modificaciones,
    definitivo,
    ejecutado,
    ampliacionPct: (modificaciones / inicial) * 100,
    ejecutadoSobreDefinitivoPct: (ejecutado / definitivo) * 100,
    ejecutadoSobreInicialPct: (ejecutado / inicial) * 100,
    cuadra: Math.abs(inicial + modificaciones - definitivo) <= TOLERANCIA_CUADRE,
  }
}

/**
 * «GASTOS CORRIENTES EN BIENES Y SERVICIOS» → «Gastos corrientes en bienes y
 * servicios». El listado municipal viene en mayúsculas; el de CONPREL, en
 * frase. Una misma página no puede gritar en una columna y hablar en la otra.
 * Sólo se toca lo que viene ENTERO en mayúsculas: un rótulo ya en frase se
 * devuelve tal cual, para no desmontar una sigla.
 */
export function rotuloCapitulo(label: string): string {
  const s = String(label ?? '').trim()
  if (!s) return s
  if (s !== s.toUpperCase()) return s
  const bajo = s.toLowerCase()
  return bajo.charAt(0).toUpperCase() + bajo.slice(1)
}

export function lecturaCapitulos(
  chapters: CapituloEjecucion[] | null | undefined,
  total: Partial<TotalEjecucion> | null | undefined,
): LecturaCapitulo[] {
  const filas = (chapters ?? []).map((c) => {
    const definitivo = num(c.actual)
    const ejecutado = num(c.ejecutado)
    const inicial = num(c.inicial)
    const modificaciones = num(c.modificaciones)
    const ampliacionTotal = num(total?.modificaciones)
    return {
      capitulo: c.capitulo,
      label: c.label,
      rotulo: rotuloCapitulo(c.label),
      inicial,
      modificaciones,
      definitivo,
      ejecutado,
      pctEjecutado: definitivo > 0 ? (ejecutado / definitivo) * 100 : 0,
      cuotaAmpliacion: ampliacionTotal > 0 ? modificaciones / ampliacionTotal : 0,
      abrioEnCero: inicial === 0 && definitivo > 0,
    }
  })
  return filas.sort((a, b) => b.definitivo - a.definitivo)
}

/** Por encima de esta cuota, un capítulo «se llevó casi toda» la ampliación. */
export const CUOTA_DOMINANTE = 0.5

export function capituloDominante(
  chapters: CapituloEjecucion[] | null | undefined,
  total: Partial<TotalEjecucion> | null | undefined,
): CapituloDominante | null {
  if (num(total?.modificaciones) <= 0) return null
  const filas = lecturaCapitulos(chapters, total)
  if (filas.length === 0) return null
  const mayor = filas.reduce((a, b) => (b.cuotaAmpliacion > a.cuotaAmpliacion ? b : a))
  if (mayor.cuotaAmpliacion <= CUOTA_DOMINANTE) return null
  return {
    capitulo: mayor.capitulo,
    label: mayor.label,
    rotulo: mayor.rotulo,
    cuotaAmpliacion: mayor.cuotaAmpliacion,
    abrioEnCero: mayor.abrioEnCero,
    pctEjecutado: mayor.pctEjecutado,
    definitivo: mayor.definitivo,
    modificaciones: mayor.modificaciones,
  }
}

const ORDINAL = ['', 'primer', 'segundo', 'tercer', 'cuarto', 'quinto', 'sexto', 'séptimo']
const CARDINAL = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete']
const cardinal = (n: number) => CARDINAL[n] ?? String(n)
const ordinal = (n: number) => ORDINAL[n] ?? `${n}º`

function direccionDe(delta: number | null): Direccion {
  if (delta === null || delta === 0) return 'igual'
  return delta > 0 ? 'sube' : 'baja'
}

export function tendenciaDeuda(
  serie: { ejercicio: number; deudaEuros: number }[] | null | undefined,
): TendenciaDeuda | null {
  const s = (serie ?? []).filter((p) => p && Number.isFinite(p.deudaEuros))
  if (s.length < 2) return null
  const puntos: PuntoDeuda[] = s.map((p, i) => ({
    ejercicio: p.ejercicio,
    deudaEuros: p.deudaEuros,
    delta: i === 0 ? null : p.deudaEuros - s[i - 1].deudaEuros,
  }))
  const ultimo = puntos[puntos.length - 1]
  const direccion = direccionDe(ultimo.delta)

  // La racha ANTERIOR: cuántos cambios seguidos, hacia atrás desde el
  // penúltimo, llevan la misma dirección que el penúltimo.
  let rachaPrevia: TendenciaDeuda['rachaPrevia'] = null
  if (puntos.length >= 3) {
    const dirPrev = direccionDe(puntos[puntos.length - 2].delta)
    let n = 0
    for (let i = puntos.length - 2; i >= 1; i--) {
      if (direccionDe(puntos[i].delta) !== dirPrev) break
      n++
    }
    rachaPrevia = { direccion: dirPrev, n }
  }

  const anio = ultimo.ejercicio
  let titular: string
  if (direccion === 'igual') {
    titular = `Sin cambio en ${anio}`
  } else if (!rachaPrevia || rachaPrevia.direccion === 'igual') {
    titular = direccion === 'sube' ? `Sube en ${anio}` : `Baja en ${anio}`
  } else if (rachaPrevia.direccion === direccion) {
    // La racha continúa: el último año es el (n+1)-ésimo en la misma dirección.
    const verbo = direccion === 'sube' ? 'Sube' : 'Baja'
    titular = `${verbo} por ${ordinal(rachaPrevia.n + 1)} año seguido`
  } else {
    const previo = rachaPrevia.direccion === 'sube' ? 'Subió' : 'Bajó'
    const ahora = direccion === 'sube' ? 'vuelve a subir' : 'baja'
    titular =
      rachaPrevia.n === 1
        ? `${previo} en ${anio - 1} y en ${anio} ${ahora}`
        : `${previo} ${cardinal(rachaPrevia.n)} años seguidos, y en ${anio} ${ahora}`
  }

  return { ultimo, direccion, rachaPrevia, titular, puntos }
}

/**
 * Los capítulos aprobados a cero. Se dejan dichos en vez de omitidos: un
 * lector que no vea el fondo de contingencia en la lista no sabe si no existe
 * o si no se le dotó.
 */
export function capitulosACero<T extends { code: string; label: string; amount: number }>(
  capitulos: T[] | null | undefined,
): T[] {
  return (capitulos ?? []).filter((c) => num(c.amount) === 0)
}

export interface MagnitudDelEjercicio {
  /** La cifra que representa el ejercicio en una sola celda. */
  valor: number
  /** Qué es esa cifra: el crédito tras modificaciones, o el aprobado. */
  etapa: 'definitivo' | 'aprobado'
  /** De quién es. Nunca se mezclan en una misma celda. */
  fuente: 'municipal' | 'conprel'
  year: number
  /** Obligaciones reconocidas, cuando la fuente las trae. */
  ejecutado: number | null
  pctEjecutado: number | null
  /**
   * El capítulo 1, de LA MISMA fuente y sobre el MISMO total.
   *
   * Va aquí, y no en una segunda función, porque la portada pinta las dos
   * cifras en celdas contiguas: «€62,1M» y «€20,3M · 49 %». Ese 49 % era el
   * capítulo de CONPREL sobre el total de CONPREL —correcto por su cuenta— y
   * bajo un total municipal invitaba a una división que da 33 %. Devolviendo
   * las dos de la misma rama, divergir es imposible; con dos funciones, sólo
   * improbable.
   */
  personal: { valor: number; pct: number } | null
}

/**
 * Qué cifra representa el ejercicio cuando sólo cabe UNA.
 *
 * La portada publicaba los 41,58 M€ que el ayuntamiento rinde a CONPREL como
 * «el presupuesto», y de las cuatro magnitudes del año es la menos
 * informativa: el consistorio abrió con 37,60 M€, acabó autorizado a gastar
 * 62,12 M€ —un 49 % más— y reconoció obligaciones por 18,91 M€. Un lector que
 * lee «presupuesto 2025 · 41,58 M€» se lleva una idea del tamaño del
 * ayuntamiento que se queda a un tercio de lo que el propio ayuntamiento
 * declara haber podido gastar. Lo señaló la revisión lectora tres veces
 * seguidas, y rotularlo mejor no lo arreglaba: el defecto estaba en la
 * elección de la cifra, no en su etiqueta.
 *
 * Así que cuando el estado de ejecución cubre el MISMO ejercicio, la cifra es
 * el crédito definitivo; si no, el aprobado de CONPREL. Las dos salen
 * etiquetadas con su etapa y su fuente, porque este sitio publica dos
 * contabilidades que no se reconcilian y ninguna celda puede sugerir que sí.
 *
 * La puerta del año no es una formalidad: etiquetar el definitivo de 2024 como
 * el de 2025 fabricaría una cifra, que es peor que publicar la menos
 * informativa de las verdaderas.
 *
 * Vive aquí y no en cada componente para que la tira de indicadores y la
 * columna editorial no puedan contar cosas distintas del mismo año — que es
 * exactamente lo que pasaba mientras cada una escribía su propia frase.
 */
export function magnitudDelEjercicio(
  conprel:
    | {
        year?: number
        totalExpense?: number
        expenseByEconomicChapter?: { code?: string; amount?: number }[]
      }
    | null
    | undefined,
  ejecucion:
    | {
        year?: number
        gastos?: {
          total?: Partial<TotalEjecucion>
          chapters?: { capitulo?: number; actual?: number }[]
        }
      }
    | null
    | undefined,
): MagnitudDelEjercicio | null {
  const year = conprel?.year
  if (!year) return null
  const cuota = (valor: number, sobre: number) =>
    valor > 0 && sobre > 0 ? { valor, pct: (valor / sobre) * 100 } : null

  const total = ejecucion?.gastos?.total
  const definitivo = num(total?.actual)
  if (ejecucion?.year === year && definitivo > 0) {
    const ejecutado = num(total?.ejecutado)
    const cap1 = (ejecucion?.gastos?.chapters ?? []).find((c) => c?.capitulo === 1)
    return {
      valor: definitivo,
      etapa: 'definitivo',
      fuente: 'municipal',
      year,
      ejecutado,
      pctEjecutado: (ejecutado / definitivo) * 100,
      personal: cuota(num(cap1?.actual), definitivo),
    }
  }
  const aprobado = num(conprel?.totalExpense)
  if (aprobado <= 0) return null
  const cap1 = (conprel?.expenseByEconomicChapter ?? []).find((c) => String(c?.code) === '1')
  return {
    valor: aprobado,
    etapa: 'aprobado',
    fuente: 'conprel',
    year,
    ejecutado: null,
    pctEjecutado: null,
    personal: cuota(num(cap1?.amount), aprobado),
  }
}
