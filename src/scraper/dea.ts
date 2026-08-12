/**
 * Análisis envolvente de datos (DEA), orientado a entrada.
 *
 * Responde una pregunta muy concreta y sólo esa: **dado lo que gastó cada
 * ayuntamiento de la banda y lo que declaró producir, ¿existe alguna
 * combinación de los demás que produjera al menos lo mismo con menos dinero?**
 * θ = 0,72 significa «hay una combinación observada que habría bastado con el
 * 72 % de ese gasto». No significa que el 28 % restante se despilfarrara, ni
 * que el servicio sea peor: significa que otros declararon hacer lo mismo por
 * menos, con todo lo que «declararon» arrastra.
 *
 * ## Por qué esto vive en /laboratorio y no en /eficiencia
 *
 * Un coste unitario de `/eficiencia` es una división de dos cifras que publica
 * el ministerio: el lector puede rehacerla. Una puntuación DEA es el veredicto
 * de un modelo con decisiones nuestras dentro —qué servicios entran, qué
 * rendimientos a escala se suponen, qué se hace con quien no declara—, y esas
 * decisiones mueven el número. Es una clase de afirmación distinta y va donde
 * se dice que es un experimento.
 *
 * ## Los tres artefactos que hacen que DEA parezca un hallazgo sin serlo
 *
 * 1. **θ = 1 no es «eficiente», es «nadie observado lo hizo mejor».** Con
 *    veinte unidades es fácil ser insuperable: basta ser el único con una
 *    combinación rara. `autorreferente` marca justo eso —eficiente y sin que
 *    nadie se apoye en ella—, que es el caso que más se parece a un logro y
 *    menos lo es.
 * 2. **La frontera es la muestra.** Los ayuntamientos que no declaran no
 *    disciplinan a nadie. La mitad de la banda se cae por eso, y quien lea la
 *    página tiene que saberlo antes que la puntuación.
 * 3. **Más dimensiones, más eficientes.** Cada salida que se añade da una vía
 *    más de ser extremo en algo. Por eso hay una regla de grados de libertad y
 *    por eso una especificación que no la cumple se publica como fallida en vez
 *    de esconderse.
 *
 * ## El modelo
 *
 * Forma envolvente, orientada a entrada, para la unidad o:
 *
 *     min θ   s.a.   Σ_j λ_j x_ij ≤ θ x_io   ∀i
 *                    Σ_j λ_j y_rj ≥ y_ro     ∀r
 *                    λ_j ≥ 0     [ y Σ_j λ_j = 1 bajo VRS ]
 *
 * CRS (Charnes-Cooper-Rhodes) supone que doblar el gasto dobla el servicio;
 * VRS (Banker-Charnes-Cooper) no. Para municipios de 15.000 a 40.000
 * habitantes la escala varía, así que VRS es la lectura principal y CRS entra
 * sólo para derivar la eficiencia de escala. Se publican las dos porque el
 * lector merece ver cuánto se mueve una puntuación al cambiar un supuesto.
 *
 * Puro: sin red, sin reloj, sin aleatoriedad. El bootstrap vive aparte
 * (`dea-bootstrap.ts`) precisamente para que este módulo siga siendo
 * determinista.
 */
import { resolverLp, type EstadoLp, type RestriccionLp } from './lp-simplex'

export const RENDIMIENTOS = ['crs', 'vrs'] as const
export type Rendimientos = (typeof RENDIMIENTOS)[number]

export interface Dmu {
  id: string
  /** Recursos consumidos. Todos estrictamente positivos. */
  entradas: number[]
  /** Productos declarados. Todos estrictamente positivos. */
  salidas: number[]
}

export interface Referencia {
  id: string
  lambda: number
}

export interface PuntuacionDmu {
  id: string
  /** Estado del LP. Si no es `optimo`, `theta` es null. */
  estado: EstadoLp
  /** Eficiencia técnica en (0, 1]. */
  theta: number | null
  /** Unidades observadas que dominan a ésta, con su peso. */
  referencias: Referencia[]
  /** Cuántas OTRAS unidades se apoyan en ésta. */
  vecesReferenciada: number
  /** Eficiente y sin que nadie se apoye en ella. Ver artefacto 1. */
  autorreferente: boolean
}

export interface GradosLibertad {
  n: number
  entradas: number
  salidas: number
  /** max(m·s, 3(m+s)). */
  minimo: number
  cumple: boolean
}

export interface ResultadoDea {
  rendimientos: Rendimientos
  puntuaciones: PuntuacionDmu[]
  gradosLibertad: GradosLibertad
  /** Cuántas unidades salen con θ = 1. */
  eficientes: number
}

export const REGLA_GRADOS_LIBERTAD =
  'n ≥ max(m·s, 3(m+s)) — Cooper, Seiford y Tone, «Data Envelopment Analysis» (2007)'

/** Por debajo de este umbral una λ se considera cero y no cuenta como referencia. */
const LAMBDA_MIN = 1e-6
/** Margen para llamar «eficiente» a un θ que el símplex deja en 0,999999999. */
const TOL_EFICIENTE = 1e-7

export function gradosLibertad(n: number, entradas: number, salidas: number): GradosLibertad {
  const minimo = Math.max(entradas * salidas, 3 * (entradas + salidas))
  return { n, entradas, salidas, minimo, cumple: n >= minimo }
}

/**
 * Eficiencia de escala: cuánto de la ineficiencia técnica se explica por operar
 * a un tamaño distinto del óptimo. 1 = el tamaño no penaliza.
 */
export function eficienciaEscala(crs: number, vrs: number): number {
  if (!(vrs > 0)) return 1
  return crs / vrs
}

function validar(dmus: Dmu[]): { m: number; s: number } {
  if (dmus.length === 0) throw new Error('dea: no hay unidades que puntuar')
  const m = dmus[0].entradas.length
  const s = dmus[0].salidas.length
  if (m === 0 || s === 0) throw new Error('dea: hacen falta al menos una entrada y una salida')
  for (const d of dmus) {
    if (d.entradas.length !== m || d.salidas.length !== s) {
      throw new Error(
        `dea: dimensiones inconsistentes en «${d.id}» — se esperaban ${m} entradas y ${s} salidas`,
      )
    }
    for (const v of d.entradas) {
      if (!Number.isFinite(v) || v <= 0) {
        throw new Error(
          `dea: entrada no positiva en «${d.id}». Un cero de la fuente significa «no lo declaré», ` +
            'y aquí saldría como eficiencia infinita: hay que excluir la unidad antes de llegar.',
        )
      }
    }
    for (const v of d.salidas) {
      if (!Number.isFinite(v) || v <= 0) {
        throw new Error(
          `dea: salida no positiva en «${d.id}». Un cero de la fuente significa «no lo declaré», ` +
            'y aquí saldría como eficiencia infinita: hay que excluir la unidad antes de llegar.',
        )
      }
    }
  }
  return { m, s }
}

export interface PuntuacionSimple {
  estado: EstadoLp
  theta: number | null
  referencias: Referencia[]
}

/**
 * Puntúa UNA unidad contra un conjunto de referencia.
 *
 * Está separada de `resolverDea` porque el bootstrap la necesita así: cada
 * réplica proyecta la unidad observada sobre una pseudofrontera construida con
 * OTROS puntos. Rehacer la envolvente entera para leer una sola fila costaba
 * veinte veces más y, peor, invitaba a meter el punto original dentro de su
 * propio conjunto de referencia —con lo que salía eficiente en todas las
 * réplicas, error estándar cero e intervalo de anchura nula.
 *
 * `objetivo` no tiene por qué pertenecer a `referencia`.
 */
export function resolverDmu(
  objetivo: Dmu,
  referencia: Dmu[],
  rendimientos: Rendimientos,
): PuntuacionSimple {
  const { m, s } = validar([objetivo, ...referencia])
  // Variables del LP: [θ, λ_1 … λ_n].
  const restricciones: RestriccionLp[] = [
    // Σ_j λ_j x_ij − θ x_io ≤ 0
    ...Array.from({ length: m }, (_, i) => ({
      coef: [-objetivo.entradas[i], ...referencia.map((j) => j.entradas[i])],
      rel: '<=' as const,
      rhs: 0,
    })),
    // Σ_j λ_j y_rj ≥ y_ro
    ...Array.from({ length: s }, (_, r) => ({
      coef: [0, ...referencia.map((j) => j.salidas[r])],
      rel: '>=' as const,
      rhs: objetivo.salidas[r],
    })),
  ]
  if (rendimientos === 'vrs') {
    restricciones.push({ coef: [0, ...referencia.map(() => 1)], rel: '=' as const, rhs: 1 })
  }

  const sol = resolverLp({ objetivo: [1, ...referencia.map(() => 0)], restricciones })
  if (sol.estado !== 'optimo' || !sol.variables) {
    return { estado: sol.estado, theta: null, referencias: [] }
  }
  return {
    estado: sol.estado,
    // El símplex puede dejar 1,0000000004; recortar arriba evita publicar una
    // eficiencia mayor que 1, que no significa nada en este modelo. El techo
    // sólo aplica cuando el objetivo está DENTRO de la referencia; el bootstrap
    // lo evalúa contra otra frontera y ahí θ > 1 sí es posible y significativo.
    theta: referencia.includes(objetivo) ? Math.min(sol.variables[0], 1) : sol.variables[0],
    referencias: referencia
      .map((j, idx) => ({ id: j.id, lambda: sol.variables![idx + 1] }))
      .filter((r) => r.lambda > LAMBDA_MIN),
  }
}

export function resolverDea(dmus: Dmu[], rendimientos: Rendimientos): ResultadoDea {
  const { m, s } = validar(dmus)
  const n = dmus.length

  const puntuaciones: PuntuacionDmu[] = dmus.map((o) => {
    const p = resolverDmu(o, dmus, rendimientos)
    return {
      id: o.id,
      estado: p.estado,
      theta: p.theta,
      referencias: p.referencias,
      vecesReferenciada: 0,
      autorreferente: false,
    }
  })

  // Cuántas OTRAS unidades se apoyan en cada una. Una unidad eficiente siempre
  // se referencia a sí misma (λ = 1), así que esa no cuenta.
  const apoyos = new Map<string, number>()
  for (const p of puntuaciones) {
    for (const r of p.referencias) {
      if (r.id === p.id) continue
      apoyos.set(r.id, (apoyos.get(r.id) ?? 0) + 1)
    }
  }
  for (const p of puntuaciones) {
    p.vecesReferenciada = apoyos.get(p.id) ?? 0
    p.autorreferente = p.theta !== null && p.theta >= 1 - TOL_EFICIENTE && p.vecesReferenciada === 0
  }

  return {
    rendimientos,
    puntuaciones,
    gradosLibertad: gradosLibertad(n, m, s),
    eficientes: puntuaciones.filter((p) => p.theta !== null && p.theta >= 1 - TOL_EFICIENTE).length,
  }
}
