/**
 * «En breve» de /presupuesto: las cifras de la primera capa, la que lee un
 * vecino que no sabe qué son unas obligaciones reconocidas.
 *
 * La página ya lo dice todo, pero lo dice en el idioma de la Intervención, y
 * a quien llega preguntando «¿se ha gastado el dinero?» le hacía cruzar doce
 * secciones. Este módulo deriva las respuestas a cuatro preguntas —cuánto
 * tenía para gastar, cuánto gastó, en qué, cuánto debe— y una advertencia de
 * mapa, y el JSX sólo las pinta (docs/superpowers/specs/2026-10-21-lectura-
 * vecinal-design.md).
 *
 * Tres reglas, las mismas del resto de la página:
 *
 * 1. Las cifras salen de las MISMAS funciones que la sección de abajo
 *    (`cascadaGastos`, `capituloDominante`, `lecturaCapitulos`,
 *    `contrastarPresupuesto`). Un resumen con su propia aritmética acabaría
 *    diciendo otra cosa que el detalle al que enlaza.
 * 2. Una respuesta que no se puede dar es `null`, nunca un cero. Sin listado
 *    municipal del mismo ejercicio no hay «cuánto gastó»; un «0 €» lo
 *    inventaría.
 * 3. «Gastado» es sólo lo ejecutado (obligaciones reconocidas). El tope del
 *    presupuesto se dice tope.
 */
import { contrastarPresupuesto, TOLERANCIA_EQUILIBRIO } from './budget-contraste'
import {
  cascadaGastos,
  capituloDominante,
  lecturaCapitulos,
  type CapituloEjecucion,
  type TotalEjecucion,
} from './presupuesto-lectura'

export interface EjecucionEnBreve {
  year: number
  fechaListado?: string | null
  gastos?: { total?: Partial<TotalEjecucion>; chapters?: CapituloEjecucion[] }
}

export interface EntradaEnBreve {
  budget?: {
    snapshot?: { year?: number; totalExpense?: number | null; population?: number }
  } | null
  ejecucion?: { latest?: EjecucionEnBreve | null } | null
  deuda?: {
    ultimo?: {
      ejercicio?: number
      deudaEuros?: number
      percentil?: number | null
      reparto?: { n?: number; aCero?: number } | null
    } | null
  } | null
  tenderGeo?: { universe?: { totalAmount?: number; locatedAmount?: number } | null } | null
}

export interface LimiteEnBreve {
  year: number
  inicial: number
  modificaciones: number
  definitivo: number
  /** null sin población de CONPREL del mismo ejercicio. */
  porVecino: number | null
  /** El total de CONPREL, sólo cuando discrepa del listado municipal. */
  conprelDiscrepa: number | null
}

export interface GastadoEnBreve {
  year: number
  ejecutado: number
  /** De cada 100 € del crédito definitivo, cuántos se gastaron. Entero. */
  deCada100: number
  /** Porcentaje exacto, para el ancho de la barra. */
  pct: number
  /** «31/12/2025», tal como lo da el listado; null si no lo trae. */
  fecha: string | null
  /** Parte del año transcurrida a la fecha del listado, 0..1; null sin fecha legible. */
  avanceDelAnio: number | null
}

export interface FilaEnQue {
  /** null para «resto». */
  capitulo: number | null
  label: string | null
  ejecutado: number
  /** Parte de lo gastado, 0..1. */
  cuota: number
}

export interface EnQueEnBreve {
  filas: FilaEnQue[]
  /** Los dos primeros juntos superan la mitad de lo gastado. */
  dosLaMayoria: boolean
  /** El capítulo que se llevó la mayoría de la ampliación, si lo hay. */
  dominante: { capitulo: number; definitivo: number; ejecutado: number } | null
}

export interface DeudaEnBreve {
  ejercicio: number
  deudaEuros: number
  porVecino: number | null
  /** Ayuntamientos con MENOS deuda, de cada 100. null sin reparto. */
  percentil: number | null
  /** Ayuntamientos que declaran cero, de cada 100. null sin reparto. */
  ceroDeCada100: number | null
}

export interface BarrioEnBreve {
  /** De cada 100 € adjudicados, cuántos van a contratos que nombran un barrio. */
  deCada100: number
  menosDeUno: boolean
}

export interface EnBrevePresupuesto {
  /** Sin listado municipal del ejercicio: el aprobado de CONPREL, si lo hay. */
  aprobado: { year: number; total: number } | null
  limite: LimiteEnBreve | null
  gastado: GastadoEnBreve | null
  enQue: EnQueEnBreve | null
  deuda: DeudaEnBreve | null
  barrio: BarrioEnBreve | null
}

/** Cuántos capítulos se pintan por su nombre antes de agrupar el resto. */
export const FILAS_EN_QUE = 3

const esNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * «31/12/2025» → la parte del año ya pasada. Sólo se lee la fecha si es del
 * mismo ejercicio: un listado de enero del año siguiente no dice que el año
 * vaya «por el 3 %».
 */
export function avanceDelAnio(fecha: string | null | undefined, year: number): number | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(fecha ?? '').trim())
  if (!m) return null
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (a !== year) return null
  const dia = Date.UTC(a, mes - 1, d)
  const inicio = Date.UTC(a, 0, 1)
  const fin = Date.UTC(a + 1, 0, 1)
  if (Number.isNaN(dia) || dia < inicio || dia >= fin) return null
  // El día del listado cuenta como pasado: el 31/12 cierra el año entero.
  return Math.min(1, (dia - inicio + 86_400_000) / (fin - inicio))
}

export function enBrevePresupuesto(e: EntradaEnBreve): EnBrevePresupuesto {
  const s = e.budget?.snapshot
  const exec = e.ejecucion?.latest ?? null
  const cascada = exec ? cascadaGastos(exec.gastos?.total) : null
  // Una lectura que no cuadra no se resume: la cascada de abajo ya dice que no
  // cuadra y enseña sus cuatro cifras sin sumarlas.
  const valida = cascada && cascada.cuadra ? cascada : null
  const mismoAnioConprel = !!(s && exec && s.year === exec.year)
  const poblacion = (year: number) =>
    s && s.year === year && esNum(s.population) && s.population > 0 ? s.population : null

  let limite: LimiteEnBreve | null = null
  let gastado: GastadoEnBreve | null = null
  let enQue: EnQueEnBreve | null = null
  if (exec && valida) {
    const hab = poblacion(exec.year)
    const contraste = mismoAnioConprel ? contrastarPresupuesto(s, exec) : null
    limite = {
      year: exec.year,
      inicial: valida.inicial,
      modificaciones: valida.modificaciones,
      definitivo: valida.definitivo,
      porVecino: hab ? valida.definitivo / hab : null,
      conprelDiscrepa:
        contraste && Math.abs(contraste.diferenciaGastos) >= TOLERANCIA_EQUILIBRIO
          ? contraste.gastosConprel
          : null,
    }
    gastado = {
      year: exec.year,
      ejecutado: valida.ejecutado,
      deCada100: Math.round(valida.ejecutadoSobreDefinitivoPct),
      pct: valida.ejecutadoSobreDefinitivoPct,
      fecha: exec.fechaListado ?? null,
      avanceDelAnio: avanceDelAnio(exec.fechaListado, exec.year),
    }
    const caps = lecturaCapitulos(exec.gastos?.chapters, exec.gastos?.total)
      .filter((c) => c.ejecutado > 0)
      .sort((a, b) => b.ejecutado - a.ejecutado)
    if (caps.length > 0 && valida.ejecutado > 0) {
      const cabeza = caps.slice(0, FILAS_EN_QUE)
      const resto = caps.slice(FILAS_EN_QUE).reduce((a, c) => a + c.ejecutado, 0)
      const filas: FilaEnQue[] = cabeza.map((c) => ({
        capitulo: c.capitulo,
        label: c.label,
        ejecutado: c.ejecutado,
        cuota: c.ejecutado / valida.ejecutado,
      }))
      if (resto > 0)
        filas.push({
          capitulo: null,
          label: null,
          ejecutado: resto,
          cuota: resto / valida.ejecutado,
        })
      const dom = capituloDominante(exec.gastos?.chapters, exec.gastos?.total)
      const filaDom = dom ? caps.find((c) => c.capitulo === dom.capitulo) : null
      enQue = {
        filas,
        dosLaMayoria:
          caps.length >= 2 && (caps[0].ejecutado + caps[1].ejecutado) / valida.ejecutado > 0.5,
        dominante: dom
          ? {
              capitulo: dom.capitulo,
              definitivo: dom.definitivo,
              ejecutado: filaDom?.ejecutado ?? 0,
            }
          : null,
      }
    }
  }

  const aprobado =
    !limite && s && esNum(s.year) && esNum(s.totalExpense) && s.totalExpense > 0
      ? { year: s.year, total: s.totalExpense }
      : null

  let deuda: DeudaEnBreve | null = null
  const u = e.deuda?.ultimo
  if (u && esNum(u.ejercicio) && esNum(u.deudaEuros)) {
    const r = u.reparto
    const hayReparto = !!(r && esNum(r.n) && r.n > 0 && esNum(r.aCero) && esNum(u.percentil))
    const hab = poblacion(u.ejercicio)
    deuda = {
      ejercicio: u.ejercicio,
      deudaEuros: u.deudaEuros,
      porVecino: hab ? u.deudaEuros / hab : null,
      percentil: hayReparto ? (u.percentil as number) : null,
      ceroDeCada100: hayReparto
        ? Math.round(((r!.aCero as number) / (r!.n as number)) * 100)
        : null,
    }
  }

  // ZONAS, no lugares: la pregunta es «mi barrio», y `locatedAmount` suma los
  // contratos con zona —el medidor de este mismo mapa—. `situatedAmount` cuenta
  // también puntos sin barrio (un colegio, una calle) y respondería otra cosa.
  let barrio: BarrioEnBreve | null = null
  const g = e.tenderGeo?.universe
  if (g && esNum(g.totalAmount) && g.totalAmount > 0 && esNum(g.locatedAmount)) {
    const pct = (g.locatedAmount / g.totalAmount) * 100
    barrio = { deCada100: Math.round(pct), menosDeUno: pct < 0.5 }
  }

  return { aprobado, limite, gastado, enQue, deuda, barrio }
}
