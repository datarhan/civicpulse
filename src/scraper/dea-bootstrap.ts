/**
 * Bootstrap homogéneo de Simar y Wilson (1998) sobre la envolvente DEA.
 *
 * ## El problema que resuelve
 *
 * θ̂ está sesgado hacia arriba **por construcción**, no por un fallo. La
 * frontera se estima con las unidades que se observan, y las que se observan
 * caen todas por dentro de la frontera verdadera: la envolvente muestral queda
 * más cerca de los datos de lo que estaría la real, así que todo el mundo
 * parece mejor de lo que es. Con veinte municipios el sesgo no es un detalle
 * de segundo orden; puede ser mayor que la diferencia entre dos unidades que la
 * página pondría una al lado de la otra.
 *
 * Publicar θ̂ = 0,78 sin intervalo invita a leerlo como una medición —«al
 * 78 %»— cuando es un estimador con ruido. El bootstrap da las dos cosas que
 * faltan: cuánto sobra por sesgo, y cuánto se movería con otra muestra.
 *
 * ## El procedimiento
 *
 * 1. θ̂_j contra la muestra observada.
 * 2. Se remuestrea con reemplazo del conjunto **reflejado** {θ̂} ∪ {2 − θ̂}, se
 *    suaviza con un núcleo gaussiano de ancho h y se dobla lo que pase de 1.
 *    La reflexión es necesaria porque θ se acumula justo en el borde 1 y un
 *    núcleo sin reflejar repartiría masa donde no puede haberla.
 * 3. Se corrige la inflación de varianza que introduce el suavizado.
 * 4. Se construye la pseudomuestra x*_j = x_j · θ̂_j / θ*_j y se vuelve a
 *    resolver la envolvente de cada unidad contra ella.
 * 5. sesgo = media(θ̂*) − θ̂ · θ̂corregido = θ̂ − sesgo.
 * 6. IC por percentiles de (θ̂* − θ̂), que es el intervalo de Simar y Wilson y
 *    NO el percentil directo de θ̂*: usar el segundo lo desplaza al lado
 *    equivocado del punto estimado, que es el error clásico al implementar esto.
 *
 * ## Cuándo NO corregir
 *
 * Efron y Tibshirani: si |sesgo| / σ̂ < 1/3, la corrección añade más varianza de
 * la que quita y es preferible el θ̂ crudo. La razón se publica y la página dice
 * cuál de los dos está mirando el lector. Corregir siempre, en silencio, sería
 * otra forma de la misma trampa.
 *
 * Determinista: la semilla entra por parámetro y sale en el resultado. Dos
 * pasadas sobre los mismos datos dan el mismo intervalo hasta el último
 * decimal, para que un intervalo que se mueve signifique que se movió el dato.
 */
import { resolverDea, resolverDmu, type Dmu, type Rendimientos } from './dea'
import { crearPrng, semillaDesde } from './prng'

/** Efron y Tibshirani (1993): por debajo, corregir empeora el estimador. */
export const RAZON_SESGO_MINIMA = 1 / 3

/** Suelo del ancho de banda: sin él, una muestra sin dispersión da intervalo cero. */
const BANDA_MINIMA = 0.01

export interface OpcionesBootstrap {
  /** Réplicas B. Por debajo de ~1000 el percentil del intervalo es inestable. */
  replicas?: number
  /** Nivel de significación. 0,05 → intervalo del 95 %. */
  alfa?: number
  semilla: string | number
}

export interface IntervaloConfianza {
  inferior: number
  superior: number
  alfa: number
}

export interface PuntuacionBootstrap {
  id: string
  /** θ̂ sobre la muestra observada. */
  theta: number
  /** θ̂ menos el sesgo estimado. */
  thetaCorregido: number
  sesgo: number
  errorEstandar: number
  ic: IntervaloConfianza
  /** |sesgo| / σ̂. */
  razonSesgo: number
  /** razonSesgo > 1/3. */
  correccionRecomendada: boolean
}

export interface ResultadoBootstrap {
  rendimientos: Rendimientos
  replicas: number
  /** Réplicas que produjeron una envolvente completa. */
  replicasResueltas: number
  /** Réplicas descartadas porque algún LP no llegó a óptimo. */
  replicasFallidas: number
  /** Programas lineales resueltos. Una pasada tiene que demostrar que trabajó. */
  lpsResueltos: number
  banda: number
  semilla: number
  puntuaciones: PuntuacionBootstrap[]
}

function media(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function desviacion(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = media(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

/** Percentil por interpolación lineal sobre la muestra ordenada. */
function percentil(ordenados: number[], p: number): number {
  if (ordenados.length === 0) return NaN
  if (ordenados.length === 1) return ordenados[0]
  const pos = (ordenados.length - 1) * Math.min(Math.max(p, 0), 1)
  const bajo = Math.floor(pos)
  const alto = Math.ceil(pos)
  if (bajo === alto) return ordenados[bajo]
  return ordenados[bajo] + (pos - bajo) * (ordenados[alto] - ordenados[bajo])
}

/**
 * Regla de Silverman: h = 0,9 · min(σ, IQR/1,349) · n^(−1/5).
 *
 * El suelo no es cosmético. Si todas las unidades salen eficientes —posible con
 * pocas observaciones y muchas salidas— σ e IQR valen cero, el suavizado
 * desaparece y el bootstrap devuelve un intervalo de anchura nula: certeza
 * absoluta obtenida por no tener datos, que es el peor resultado publicable.
 */
export function anchoBanda(thetas: number[]): number {
  const n = thetas.length
  if (n < 2) return BANDA_MINIMA
  const ordenados = [...thetas].sort((a, b) => a - b)
  const iqr = percentil(ordenados, 0.75) - percentil(ordenados, 0.25)
  const sd = desviacion(thetas)
  const escala = Math.min(sd || Infinity, iqr / 1.349 || Infinity)
  const h = 0.9 * (Number.isFinite(escala) ? escala : 0) * n ** (-1 / 5)
  return Math.max(h, BANDA_MINIMA)
}

export function bootstrapDea(
  dmus: Dmu[],
  rendimientos: Rendimientos,
  opts: OpcionesBootstrap,
): ResultadoBootstrap {
  const B = opts.replicas ?? 2000
  const alfa = opts.alfa ?? 0.05
  const semilla = typeof opts.semilla === 'string' ? semillaDesde(opts.semilla) : opts.semilla
  const prng = crearPrng(semilla)
  const n = dmus.length

  const base = resolverDea(dmus, rendimientos)
  const thetas = base.puntuaciones.map((p) => {
    if (p.theta === null) {
      throw new Error(`dea-bootstrap: «${p.id}» no resolvió (${p.estado}); no se puede remuestrear`)
    }
    return p.theta
  })

  const h = anchoBanda(thetas)
  const sdTheta = desviacion(thetas)
  // Conjunto reflejado alrededor de 1: θ se acumula en el borde, y un núcleo
  // sin reflejar repartiría densidad por encima de 1, donde no puede haberla.
  const reflejado = [...thetas, ...thetas.map((t) => 2 - t)]
  const mediaReflejada = media(reflejado)
  const factor = Math.sqrt(1 + (h * h) / (sdTheta * sdTheta || 1))

  const replicasPorDmu: number[][] = dmus.map(() => [])
  let replicasResueltas = 0
  let replicasFallidas = 0
  let lpsResueltos = 0

  for (let b = 0; b < B; b++) {
    // Remuestreo suavizado sobre el conjunto reflejado.
    const sorteados = new Array<number>(n)
    for (let i = 0; i < n; i++) {
      const beta = reflejado[prng.entero(reflejado.length)]
      const suave = beta + h * prng.normal()
      // Corrección de la inflación de varianza que mete el suavizado.
      let v = mediaReflejada + (suave - mediaReflejada) / factor
      // Doblar lo que se salga: θ vive en (0, 1].
      if (v > 1) v = 2 - v
      sorteados[i] = Math.min(Math.max(v, 1e-4), 1)
    }

    // Pseudomuestra: mover las entradas de cada unidad para que la frontera de
    // referencia tenga las eficiencias sorteadas.
    const pseudo: Dmu[] = dmus.map((d, j) => ({
      id: d.id,
      entradas: d.entradas.map((x) => (x * thetas[j]) / sorteados[j]),
      salidas: d.salidas,
    }))

    // Cada unidad ORIGINAL contra la pseudomuestra COMPLETA. Sustituir el punto
    // j por el original dejaba a la unidad dentro de su propia referencia: salía
    // eficiente en todas las réplicas y el intervalo se cerraba sobre sí mismo.
    const replica = new Array<number>(n)
    let ok = true
    for (let j = 0; j < n && ok; j++) {
      const p = resolverDmu(dmus[j], pseudo, rendimientos)
      lpsResueltos++
      if (p.theta === null) ok = false
      else replica[j] = p.theta
    }
    if (!ok) {
      replicasFallidas++
      continue
    }
    replicasResueltas++
    for (let j = 0; j < n; j++) replicasPorDmu[j].push(replica[j])
  }

  const puntuaciones: PuntuacionBootstrap[] = dmus.map((d, j) => {
    const rep = replicasPorDmu[j]
    const theta = thetas[j]
    // El sesgo no puede ser negativo en teoría —θ̂ sobreestima— pero el ruido
    // muestral puede dejarlo bajo cero. Recortarlo evita publicar una
    // «corrección» que empuja hacia arriba, que sería justo lo contrario.
    const sesgo = Math.max(0, media(rep) - theta)
    const errorEstandar = desviacion(rep)
    // IC de Simar-Wilson: percentiles de la DIFERENCIA, restados al punto
    // estimado. El percentil directo de θ̂* cae al otro lado y es el fallo
    // clásico al implementar esto.
    const dif = rep.map((t) => t - theta).sort((a, b) => a - b)
    const superior = Math.min(1, theta - percentil(dif, alfa / 2))
    const inferior = Math.max(1e-6, theta - percentil(dif, 1 - alfa / 2))
    const razonSesgo = errorEstandar > 0 ? Math.abs(sesgo) / errorEstandar : 0
    return {
      id: d.id,
      theta,
      thetaCorregido: theta - sesgo,
      sesgo,
      errorEstandar,
      ic: { inferior: Math.min(inferior, superior), superior, alfa },
      razonSesgo,
      correccionRecomendada: razonSesgo > RAZON_SESGO_MINIMA,
    }
  })

  return {
    rendimientos,
    replicas: B,
    replicasResueltas,
    replicasFallidas,
    lpsResueltos,
    banda: h,
    semilla,
    puntuaciones,
  }
}
