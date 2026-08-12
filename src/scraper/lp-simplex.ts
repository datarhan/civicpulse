/**
 * Símplex de dos fases, en forma estándar y con todas las variables ≥ 0.
 *
 * Existe para una sola cosa: resolver la envolvente del análisis DEA de
 * `/laboratorio/frontera`. Se escribe aquí en vez de añadir una dependencia
 * porque las dos opciones razonables del ecosistema son un paquete sin
 * mantenimiento con fallos numéricos conocidos y un GLPK compilado a WASM de
 * un megabyte largo. El problema que hay que resolver tiene cinco
 * restricciones y treinta columnas: la parte difícil no es el tamaño, es poder
 * demostrar que la respuesta es la correcta, y para eso hace falta un módulo
 * puro con pruebas de óptimo conocido (`tests/lp-simplex.test.ts`).
 *
 * ## Por qué el enum de estados importa tanto
 *
 * Un LP no siempre tiene solución, y las tres formas de no tenerla significan
 * cosas distintas para quien lee la página: `infactible` es un modelo mal
 * planteado, `no-acotado` es una restricción que falta, y `sin-converger` es
 * que este solver se rindió. Colapsar las tres en «devuelve null» —o peor, en
 * un cero— es la regla 3 de `docs/DATA_INTEGRITY.md`: un centinela nunca es un
 * valor. Quien llama tiene que poder distinguirlas, así que se exporta el enum
 * y las pruebas lo importan.
 *
 * ## Anticiclado
 *
 * Con la regla de Dantzig (coste reducido más negativo) un problema degenerado
 * puede volver a una base ya visitada y girar para siempre; el ejemplo de
 * Beale está en las pruebas. A partir de cierto número de iteraciones se pasa
 * a la regla de Bland (el índice más bajo que mejora), que es más lenta pero
 * tiene terminación demostrada.
 *
 * Puro: sin red, sin reloj, sin aleatoriedad. La misma entrada da la misma
 * salida, que es lo que permite congelar un snapshot y volver a comprobarlo.
 */

export const ESTADOS_LP = ['optimo', 'infactible', 'no-acotado', 'sin-converger'] as const
export type EstadoLp = (typeof ESTADOS_LP)[number]

export type RelacionLp = '<=' | '>=' | '='

export interface RestriccionLp {
  /** Un coeficiente por variable, en el mismo orden que `objetivo`. */
  coef: number[]
  rel: RelacionLp
  rhs: number
}

export interface LpProblema {
  /** Se MINIMIZA. Para maximizar, pásese el objetivo negado. */
  objetivo: number[]
  restricciones: RestriccionLp[]
}

export interface LpSolucion {
  estado: EstadoLp
  /** Valor del objetivo minimizado. `null` salvo que el estado sea `optimo`. */
  objetivo: number | null
  /** Valor de las variables originales, en orden. `null` salvo `optimo`. */
  variables: number[] | null
  iteraciones: number
}

export interface OpcionesLp {
  /** Techo de iteraciones sumando las dos fases. */
  maxIter?: number
  /** Umbral bajo el cual un número se considera cero. */
  tol?: number
}

const TOL = 1e-9

/**
 * Una fila del tableau por restricción, más la fila de costes reducidos.
 * `basica[i]` es el índice de columna que hace de variable básica en la fila i.
 */
interface Tableau {
  filas: number[][]
  basica: number[]
  columnas: number
}

function pivotar(t: Tableau, fila: number, col: number): void {
  const pivote = t.filas[fila][col]
  const f = t.filas[fila]
  for (let j = 0; j < t.columnas; j++) f[j] /= pivote
  for (let i = 0; i < t.filas.length; i++) {
    if (i === fila) continue
    const factor = t.filas[i][col]
    if (factor === 0) continue
    const fi = t.filas[i]
    for (let j = 0; j < t.columnas; j++) fi[j] -= factor * f[j]
  }
  t.basica[fila] = col
}

/**
 * Itera hasta que ningún coste reducido mejora. La última fila del tableau es
 * la de costes; la última columna, el término independiente.
 *
 * Devuelve `optimo`, `no-acotado` o `sin-converger`. Nunca `infactible`: eso lo
 * decide la fase 1 leyendo su propio óptimo.
 */
function iterar(
  t: Tableau,
  activas: number[],
  presupuesto: { restante: number },
  tol: number,
  umbralBland: number,
): Exclude<EstadoLp, 'infactible'> {
  const costes = t.filas[t.filas.length - 1]
  let giros = 0
  while (presupuesto.restante > 0) {
    // Bland tras `umbralBland` giros: más lento, pero no cicla.
    const bland = giros >= umbralBland
    let entra = -1
    let mejor = -tol
    for (const j of activas) {
      if (costes[j] < -tol) {
        if (bland) {
          entra = j
          break
        }
        if (costes[j] < mejor) {
          mejor = costes[j]
          entra = j
        }
      }
    }
    if (entra < 0) return 'optimo'

    // Razón mínima. Empate → índice básico más bajo, que es la mitad de Bland
    // que evita el ciclado.
    let sale = -1
    let razon = Infinity
    for (let i = 0; i < t.filas.length - 1; i++) {
      const a = t.filas[i][entra]
      if (a <= tol) continue
      const r = t.filas[i][t.columnas - 1] / a
      if (
        r < razon - tol ||
        (Math.abs(r - razon) <= tol && sale >= 0 && t.basica[i] < t.basica[sale])
      ) {
        razon = r
        sale = i
      }
    }
    if (sale < 0) return 'no-acotado'

    pivotar(t, sale, entra)
    presupuesto.restante--
    giros++
  }
  return 'sin-converger'
}

export function resolverLp(p: LpProblema, opts: OpcionesLp = {}): LpSolucion {
  const tol = opts.tol ?? TOL
  const n = p.objetivo.length
  const m = p.restricciones.length
  const maxIter = opts.maxIter ?? Math.max(200, 20 * (n + m) * (n + m))
  const presupuesto = { restante: maxIter }

  // Normalizar: término independiente ≥ 0, girando la relación si hace falta.
  const filas = p.restricciones.map((r) => {
    const neg = r.rhs < 0
    const coef = neg ? r.coef.map((c) => -c) : r.coef.slice()
    const rhs = neg ? -r.rhs : r.rhs
    const rel: RelacionLp = !neg ? r.rel : r.rel === '<=' ? '>=' : r.rel === '>=' ? '<=' : '='
    return { coef, rel, rhs }
  })

  // Columnas: n originales · holguras/excesos · artificiales · término indep.
  const holguras = filas.filter((r) => r.rel !== '=').length
  const artificiales = filas.filter((r) => r.rel !== '<=').length
  const columnas = n + holguras + artificiales + 1
  const idxIndep = columnas - 1

  const t: Tableau = {
    filas: Array.from({ length: m + 1 }, () => new Array<number>(columnas).fill(0)),
    basica: new Array<number>(m).fill(-1),
    columnas,
  }

  let colHolgura = n
  let colArtificial = n + holguras
  const columnasArtificiales: number[] = []
  for (let i = 0; i < m; i++) {
    const r = filas[i]
    for (let j = 0; j < n; j++) t.filas[i][j] = r.coef[j]
    t.filas[i][idxIndep] = r.rhs
    if (r.rel === '<=') {
      t.filas[i][colHolgura] = 1
      t.basica[i] = colHolgura
      colHolgura++
    } else {
      if (r.rel === '>=') {
        t.filas[i][colHolgura] = -1
        colHolgura++
      }
      t.filas[i][colArtificial] = 1
      t.basica[i] = colArtificial
      columnasArtificiales.push(colArtificial)
      colArtificial++
    }
  }

  const todas = Array.from({ length: columnas - 1 }, (_, j) => j)
  const sinArtificiales = todas.filter((j) => !columnasArtificiales.includes(j))
  const umbralBland = Math.max(50, 4 * (n + m))

  // ── Fase 1: minimizar la suma de artificiales ──────────────────────────────
  if (columnasArtificiales.length > 0) {
    const costes = t.filas[m]
    for (const j of columnasArtificiales) costes[j] = 1
    // Poner la fila de costes en términos de las no básicas.
    for (let i = 0; i < m; i++) {
      if (!columnasArtificiales.includes(t.basica[i])) continue
      for (let j = 0; j < columnas; j++) costes[j] -= t.filas[i][j]
    }
    const estado = iterar(t, todas, presupuesto, tol, umbralBland)
    if (estado !== 'optimo') {
      return {
        estado,
        objetivo: null,
        variables: null,
        iteraciones: maxIter - presupuesto.restante,
      }
    }
    // El objetivo de fase 1 vive negado en el término independiente.
    if (-t.filas[m][idxIndep] > tol * 1000) {
      return {
        estado: 'infactible',
        objetivo: null,
        variables: null,
        iteraciones: maxIter - presupuesto.restante,
      }
    }
    // Sacar de la base cualquier artificial que se haya quedado dentro a nivel
    // cero; si no hay pivote posible la fila es redundante y se puede ignorar.
    for (let i = 0; i < m; i++) {
      if (!columnasArtificiales.includes(t.basica[i])) continue
      const j = sinArtificiales.find((c) => Math.abs(t.filas[i][c]) > tol)
      if (j !== undefined) pivotar(t, i, j)
    }
  }

  // ── Fase 2: el objetivo de verdad ─────────────────────────────────────────
  const costes = t.filas[m]
  costes.fill(0)
  for (let j = 0; j < n; j++) costes[j] = p.objetivo[j]
  for (let i = 0; i < m; i++) {
    const b = t.basica[i]
    if (b < 0 || b >= n) continue
    const factor = costes[b]
    if (factor === 0) continue
    for (let j = 0; j < columnas; j++) costes[j] -= factor * t.filas[i][j]
  }
  // Las artificiales quedan fuera del conjunto de columnas candidatas: dejarlas
  // entrar en fase 2 rompería la factibilidad que la fase 1 acaba de probar.
  const estado = iterar(t, sinArtificiales, presupuesto, tol, umbralBland)
  const iteraciones = maxIter - presupuesto.restante
  if (estado !== 'optimo') return { estado, objetivo: null, variables: null, iteraciones }

  const variables = new Array<number>(n).fill(0)
  for (let i = 0; i < m; i++) {
    const b = t.basica[i]
    if (b >= 0 && b < n) variables[b] = t.filas[i][idxIndep]
  }
  let objetivo = 0
  for (let j = 0; j < n; j++) objetivo += p.objetivo[j] * variables[j]
  return { estado: 'optimo', objetivo, variables, iteraciones }
}
