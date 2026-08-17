/**
 * Coste esperado — la respuesta a «nosotros no somos comparables».
 *
 * Al modo OpenCivitas: junto al gasto observado de cada servicio, el que
 * cabría esperar dada la estructura del municipio. v1 usa UN impulsor —
 * log(población)— porque es el único con fuente limpia hoy (la superficie no
 * tiene tabla JSON del INE y la renta ADRH queda para v2), y esa escalera está
 * declarada en la página: una especificación sólo-población se publica con su
 * R² a la vista, no disimulado.
 *
 * Tres decisiones que son política, no técnica, y por eso viven aquí:
 *
 * 1. **Sólo gestión directa entra en la muestra.** Es la regla 4 de la
 *    metodología aplicada al revés: un coste bajo concesión no es lo que el
 *    servicio cuesta al ayuntamiento, y meterlo en la regresión sesgaría la
 *    recta hacia los ceros de tarifa. Lo excluido se cuenta por motivo.
 * 2. **La muestra publicada es anónima y va ordenada por población.** Dos
 *    números por punto. El orden del libro fuente permitiría re-identificar
 *    municipios por posición; ordenar por población lo rompe sin perder nada.
 *    La misma regla que la DEA: ningún municipio ajeno, en ningún campo.
 * 3. **Sin semilla porque no hay azar.** El intervalo de predicción es
 *    analítico (t de Student sobre la varianza residual), así que la guarda
 *    reproduce el modelo exacto desde la muestra publicada, sin bootstrap.
 *
 * Puro: sin red, sin fs, sin reloj. El script de cómputo suministra las filas
 * (libros CCAA-17 parseados SIN `soloEntes`) y el censo de población.
 */
import type { CesteRow } from './coste-efectivo'
import { INE_PROPIO } from './dea-especificacion'
import { ATIPICO_FACTOR } from './indicadores'

export { INE_PROPIO }

/** Mínimo muestral para publicar una recta (E2 de la escalera declarada). */
export const MIN_MUESTRA = 40

/** Nivel del intervalo de predicción: 1 − α. */
export const NIVEL_ALFA = 0.05

export const ESTADOS_ESPERADO = [
  'publicada',
  'muestra-insuficiente',
  'sin-declaracion-propia',
] as const
export type EstadoEsperado = (typeof ESTADOS_ESPERADO)[number]

export const MOTIVOS_EXCLUSION_ESPERADO = [
  'otro-modo',
  'sin-coste',
  'sin-poblacion',
  'filas-duplicadas',
  'cifra-inverosimil',
] as const
export type MotivoExclusionEsperado = (typeof MOTIVOS_EXCLUSION_ESPERADO)[number]

export interface PuntoMuestra {
  poblacion: number
  coste: number
}

export interface ModeloOls {
  n: number
  /** Constante de la recta en el espacio log. */
  alfa: number
  /** Elasticidad: % de coste por % de población. */
  beta: number
  r2: number
  /** Varianza residual (SSE / (n − 2)). */
  sigma2: number
  xMedia: number
  sxx: number
  /** Cuantil t_{n−2, 1−α/2} con el que se construye el intervalo. */
  tCrit: number
  nivelAlfa: number
}

export interface BandaPrediccion {
  esperado: number
  inferior: number
  superior: number
}

export interface PropiaEsperado extends BandaPrediccion {
  poblacion: number
  costeObservado: number
  /** observado / esperado: 1,34 = declara un 34 % más que la recta. */
  razon: number
  residuoLog: number
  dentroDeLoEsperado: boolean
}

export interface CoberturaEsperado {
  /** Filas del programa en el libro, antes de limpiar. */
  filas: number
  /**
   * Municipios que declaran el programa. Es la unidad de cuentas: un municipio
   * puede traer DOS filas legítimas (la mitad del coste y la mitad de las
   * unidades físicas de la misma declaración), así que las filas no suman.
   */
  declarantes: number
  incluidas: number
  excluidas: Partial<Record<MotivoExclusionEsperado, number>>
}

export interface AnalisisEsperado {
  programa: string
  estado: EstadoEsperado
  motivoEstado: string | null
  cobertura: CoberturaEsperado
  modelo: ModeloOls | null
  muestra: PuntoMuestra[]
  propia: PropiaEsperado | null
}

/**
 * Inversa de la normal estándar (Acklam). Error absoluto < 1,15e−9 en (0, 1),
 * de sobra para anclar un cuantil t que después se redondea a tres decimales.
 */
function cuantilNormal(p: number): number {
  if (!(p > 0 && p < 1)) throw new Error(`cuantilNormal: p fuera de (0,1): ${p}`)
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ]
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ]
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const pLow = 0.02425
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    )
  }
  if (p <= 1 - pLow) {
    const q = p - 0.5
    const r = q * q
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    )
  }
  const q = Math.sqrt(-2 * Math.log(1 - p))
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  )
}

/**
 * Cuantil de la t de Student por expansión de Cornish–Fisher sobre la normal.
 *
 * Con ν ≥ MIN_MUESTRA − 2 el error queda por debajo de 1e−4, que es lo que
 * esta superficie necesita: el término de ν⁻³ ya aporta menos que el redondeo
 * con el que se publica. Para ν pequeños NO es de fiar — por eso el mínimo
 * muestral se comprueba antes de llegar aquí.
 */
export function cuantilT(p: number, nu: number): number {
  if (!(nu > 0)) throw new Error(`cuantilT: ν no positivo: ${nu}`)
  const z = cuantilNormal(p)
  const z3 = z ** 3
  const z5 = z ** 5
  const z7 = z ** 7
  return (
    z +
    (z3 + z) / (4 * nu) +
    (5 * z5 + 16 * z3 + 3 * z) / (96 * nu ** 2) +
    (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * nu ** 3)
  )
}

/** Recta de mínimos cuadrados sobre (ln población, ln coste). */
export function ajustarOls(puntos: PuntoMuestra[]): ModeloOls {
  const n = puntos.length
  if (n < 3) throw new Error(`ajustarOls: ${n} puntos no dan para una recta con residuo`)
  const xs = puntos.map((p) => Math.log(p.poblacion))
  const ys = puntos.map((p) => Math.log(p.coste))
  const xMedia = xs.reduce((a, b) => a + b, 0) / n
  const yMedia = ys.reduce((a, b) => a + b, 0) / n
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMedia
    const dy = ys[i] - yMedia
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }
  if (sxx === 0) throw new Error('ajustarOls: todas las poblaciones son iguales')
  const beta = sxy / sxx
  const alfa = yMedia - beta * xMedia
  let sse = 0
  for (let i = 0; i < n; i++) {
    const r = ys[i] - (alfa + beta * xs[i])
    sse += r * r
  }
  const r2 = syy === 0 ? 1 : 1 - sse / syy
  const sigma2 = sse / (n - 2)
  return {
    n,
    alfa,
    beta,
    r2,
    sigma2,
    xMedia,
    sxx,
    tCrit: cuantilT(1 - NIVEL_ALFA / 2, n - 2),
    nivelAlfa: NIVEL_ALFA,
  }
}

/**
 * Banda de predicción para UN municipio nuevo de esa población, en euros.
 *
 * Analítica: t · s · √(1 + 1/n + (x₀−x̄)²/Sxx) en el espacio log, exponenciada
 * al salir — la banda es multiplicativa, como corresponde a un error
 * log-normal, y se ensancha lejos de la media de la muestra.
 */
export function intervaloPrediccion(m: ModeloOls, poblacion: number): BandaPrediccion {
  const x0 = Math.log(poblacion)
  const yhat = m.alfa + m.beta * x0
  const se = Math.sqrt(m.sigma2 * (1 + 1 / m.n + (x0 - m.xMedia) ** 2 / m.sxx))
  const half = m.tCrit * se
  return {
    esperado: Math.exp(yhat),
    inferior: Math.exp(yhat - half),
    superior: Math.exp(yhat + half),
  }
}

export interface ContextoEsperado {
  filas: CesteRow[]
  /** Censo INE → población (roster CONPREL completo de la comunidad). */
  poblaciones: Map<string, number>
}

/**
 * Un servicio, de las filas del libro al veredicto publicable.
 *
 * El propio municipio entra en la muestra del ajuste cuando declara en
 * directa: se le compara contra una recta de la que forma parte, no contra un
 * modelo del que se le ha dejado fuera. Con ~400 municipios su punto mueve la
 * recta menos que el redondeo.
 */
export function analizarServicio(programa: string, ctx: ContextoEsperado): AnalisisEsperado {
  const filasPrograma = ctx.filas.filter((f) => f.programa === programa)
  const excluidas: Partial<Record<MotivoExclusionEsperado, number>> = {}
  const excluir = (motivo: MotivoExclusionEsperado, n = 1) => {
    excluidas[motivo] = (excluidas[motivo] ?? 0) + n
  }

  const porIne = new Map<string, CesteRow[]>()
  for (const f of filasPrograma) {
    const lista = porIne.get(f.ine) ?? []
    lista.push(f)
    porIne.set(f.ine, lista)
  }

  const incluidos: { ine: string; poblacion: number; coste: number }[] = []
  for (const [ine, lista] of porIne) {
    // La fila que importa es la que TRAE coste. El libro publica algunos
    // programas en dos mitades por municipio —una con el coste, otra con las
    // unidades físicas— y esa pareja no es un duplicado: duplicado es que el
    // ministerio publique MÁS DE UN COSTE para el mismo servicio (regla 1).
    const conCoste = lista.filter((f) => typeof f.costeTotal === 'number' && f.costeTotal > 0)
    if (conCoste.length > 1) {
      // Elegir uno sería un volado disfrazado de dato; fuera el municipio.
      excluir('filas-duplicadas')
      continue
    }
    if (conCoste.length === 0) {
      // Sin coste utilizable. Si lo que hay declara otro modo de gestión, el
      // motivo es ése: la concesión declara cero porque lo paga la tarifa.
      excluir(lista.some((f) => f.modoGestion !== 'directa') ? 'otro-modo' : 'sin-coste')
      continue
    }
    const f = conCoste[0]
    if (f.modoGestion !== 'directa') {
      excluir('otro-modo')
      continue
    }
    const poblacion = ctx.poblaciones.get(ine)
    if (typeof poblacion !== 'number' || poblacion <= 0) {
      excluir('sin-poblacion')
      continue
    }
    incluidos.push({ ine, poblacion, coste: f.costeTotal })
  }

  // Cordura (regla 7 del panel, normalizada por habitante): el libro real trae
  // ayuntamientos declarando 1 € de coste de escuelas, y ese artefacto dentro
  // del ajuste arrastra la recta y estira el eje diez décadas. Se excluye lo
  // que queda a más de ATIPICO_FACTOR de la mediana de €/hab del servicio —
  // el MISMO factor publicado, no un umbral nuevo — por los dos lados.
  const perCapita = incluidos.map((p) => p.coste / p.poblacion).sort((a, b) => a - b)
  let candidatos = incluidos
  if (perCapita.length >= 3) {
    const mediana = perCapita[Math.floor(perCapita.length / 2)]
    if (mediana > 0) {
      candidatos = incluidos.filter((p) => {
        const razon = p.coste / p.poblacion / mediana
        const verosimil = razon <= ATIPICO_FACTOR && razon >= 1 / ATIPICO_FACTOR
        if (!verosimil) excluir('cifra-inverosimil')
        return verosimil
      })
    }
  }

  const cobertura: CoberturaEsperado = {
    filas: filasPrograma.length,
    declarantes: porIne.size,
    incluidas: candidatos.length,
    excluidas,
  }

  const base = { programa, cobertura }

  if (candidatos.length < MIN_MUESTRA) {
    return {
      ...base,
      estado: 'muestra-insuficiente',
      motivoEstado:
        `${candidatos.length} municipios declaran este servicio en gestión directa con coste y ` +
        `población, y el mínimo para publicar una recta es ${MIN_MUESTRA}. La especificación ` +
        'se publica como fallida en vez de estirar la muestra.',
      modelo: null,
      muestra: [],
      propia: null,
    }
  }

  // Anónima y ordenada por población: el orden del libro re-identificaría.
  const muestra: PuntoMuestra[] = candidatos
    .map((p) => ({ poblacion: p.poblacion, coste: p.coste }))
    .sort((a, b) => a.poblacion - b.poblacion || a.coste - b.coste)
  const modelo = ajustarOls(muestra)

  const propioIncluido = candidatos.find((p) => p.ine === INE_PROPIO)
  if (!propioIncluido) {
    const filasPropias = porIne.get(INE_PROPIO) ?? []
    const costesPropios = filasPropias.filter(
      (f) => typeof f.costeTotal === 'number' && f.costeTotal > 0,
    )
    const cortadoPorCordura = incluidos.some((p) => p.ine === INE_PROPIO)
    let motivo: string
    if (cortadoPorCordura) {
      motivo =
        'La cifra propia queda a más de veinte veces de la mediana de euros por habitante del ' +
        'servicio: inverosímil como coste (regla 7), igual que para cualquier otro municipio, ' +
        'así que no se dibuja punto.'
    } else if (filasPropias.length === 0) {
      motivo = 'El municipio no declara este servicio en la entrega analizada.'
    } else if (costesPropios.length > 1) {
      motivo =
        'El municipio publica más de un coste para este servicio (regla 1): no hay un punto que dibujar.'
    } else if ((costesPropios[0] ?? filasPropias[0]).modoGestion !== 'directa') {
      motivo =
        'El municipio presta este servicio en concesión u otro modo: el coste que declara no es ' +
        'lo que cuesta el servicio (regla 4) y no se puede situar sobre una recta de gestión directa.'
    } else {
      motivo = 'El municipio declara la función sin coste utilizable.'
    }
    return {
      ...base,
      estado: 'sin-declaracion-propia',
      motivoEstado: motivo,
      modelo,
      muestra,
      propia: null,
    }
  }

  const banda = intervaloPrediccion(modelo, propioIncluido.poblacion)
  const propia: PropiaEsperado = {
    ...banda,
    poblacion: propioIncluido.poblacion,
    costeObservado: propioIncluido.coste,
    razon: propioIncluido.coste / banda.esperado,
    residuoLog: Math.log(propioIncluido.coste) - Math.log(banda.esperado),
    dentroDeLoEsperado:
      propioIncluido.coste >= banda.inferior && propioIncluido.coste <= banda.superior,
  }

  return { ...base, estado: 'publicada', motivoEstado: null, modelo, muestra, propia }
}
