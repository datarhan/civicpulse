/**
 * Qué entra en la frontera, quién se queda fuera, y por qué.
 *
 * `dea.ts` es aritmética: dados unos números, devuelve una distancia a una
 * envolvente. Todo lo que decide si esa distancia significa algo vive aquí.
 *
 * ## La cesta
 *
 * Una entrada —el coste efectivo total de los servicios de la cesta— y una
 * salida por servicio. Es la especificación de la literatura de eficiencia
 * municipal española (Balaguer-Coll, Prior, Tortosa-Ausina): con este dinero,
 * este ayuntamiento declaró producir esto de cada cosa. Poner el coste de cada
 * servicio como entrada separada convertiría el modelo en «el mejor de tres
 * cocientes» y dejaría de medir precisamente lo que interesa, que es el reparto.
 *
 * ## Por qué sólo gestión directa
 *
 * Un municipio con la limpieza en concesión declara **coste cero**: el
 * concesionario lo soporta y lo recupera por tarifa. Colado en la muestra sale
 * insuperable, tira de la frontera hacia abajo y **empeora la puntuación de
 * todos los demás**. Es la trampa 1 de la fuente con efecto sobre terceros, y
 * es la razón de que la mitad de la banda se caiga.
 *
 * ## Por qué hay más de una especificación, y una que falla
 *
 * Porque la puntuación se mueve al cambiarla, y ése es el resultado del
 * experimento. Una página que enseñara sólo la cesta que sale bien estaría
 * enseñando el resultado en vez del método. `cinco-servicios` no llega a
 * grados de libertad y se publica diciéndolo: es la mitad interesante.
 *
 * Puro: sin red, sin reloj. La semilla del bootstrap se deriva del id de la
 * especificación, así que dos pasadas dan el mismo intervalo.
 */
import type { CesteRow } from './coste-efectivo'
import { SERVICIOS } from './indicador-registry'
import { resolverCoste, resolverUnidad } from './indicadores'
import {
  resolverDea,
  eficienciaEscala,
  gradosLibertad,
  type Dmu,
  type GradosLibertad,
  type Rendimientos,
} from './dea'
import { bootstrapDea, type IntervaloConfianza } from './dea-bootstrap'

/** Riba-roja de Túria. La única unidad que este sitio nombra en su propio análisis. */
export const INE_PROPIO = '46214'

/**
 * `no-se-presta` va aparte de `modo-no-directa` a propósito. Un municipio que
 * no tiene servicio de limpieza viaria y otro que lo tiene concesionado están
 * fuera por razones distintas, y la tira de cobertura de la página cuenta cosas
 * distintas según cuál sea: el primero dice algo del municipio, el segundo dice
 * algo de la fuente. Meterlos en el mismo cajón sería un centinela con dos
 * significados, que es el defecto que este repo ya ha pagado dos veces.
 */
export const MOTIVOS_EXCLUSION = [
  'sin-filas',
  'no-se-presta',
  'modo-no-directa',
  'coste-no-declarado',
  'unidad-no-declarada',
] as const
export type MotivoExclusion = (typeof MOTIVOS_EXCLUSION)[number]

export const ESTADOS_ESPECIFICACION = ['publicada', 'insuficiente'] as const
export type EstadoEspecificacion = (typeof ESTADOS_ESPECIFICACION)[number]

export interface EspecificacionDea {
  id: string
  titulo: string
  /** Por qué esta cesta y no otra. Se publica junto al resultado. */
  porQue: string
  /** Claves de `SERVICIOS`. Cada una aporta una salida. */
  programas: string[]
}

export const ESPECIFICACIONES: EspecificacionDea[] = [
  {
    id: 'residuos-limpieza-alumbrado',
    titulo: 'Residuos, limpieza viaria y alumbrado',
    porQue:
      'Los tres servicios que más municipios de la banda prestan de forma directa y declaran ' +
      'completos. Es la cesta con más unidades comparables, y por eso la lectura principal.',
    programas: ['a1621', 'a163', 'a165'],
  },
  {
    id: 'residuos-limpieza',
    titulo: 'Residuos y limpieza viaria',
    porQue:
      'La misma muestra con una salida menos. Sirve para ver cuánto de la puntuación depende de ' +
      'añadir dimensiones: cada salida nueva da una vía más de ser extremo en algo.',
    programas: ['a1621', 'a163'],
  },
  {
    id: 'cuatro-servicios',
    titulo: 'Residuos, limpieza, parques y alumbrado',
    porQue:
      'Añade parques y jardines, que muchos municipios de la banda no declaran completo. Queda ' +
      'justo en el mínimo de grados de libertad: la muestra se parte casi por la mitad para ' +
      'ganar una dimensión.',
    programas: ['a1621', 'a163', 'a171/170P', 'a165'],
  },
  {
    id: 'cinco-servicios',
    titulo: 'Los cuatro anteriores más cementerio',
    porQue:
      'Se incluye a propósito aunque no pueda publicarse. Con cinco salidas harían falta 18 ' +
      'unidades y la exigencia de declaración completa deja bastantes menos: es el límite real ' +
      'de la fuente, y esconderlo daría una idea falsa de hasta dónde llega este método.',
    programas: ['a1621', 'a163', 'a171/170P', 'a165', 'a164'],
  },
]

export interface EntradaAnalisis {
  filas: CesteRow[]
  anio: number
  /** Municipios de la banda de referencia, para la tira de cobertura. */
  miembrosBanda: number
  replicas?: number
  alfa?: number
}

export interface Exclusion {
  ine: string
  motivo: MotivoExclusion
}

/**
 * Convierte las filas del ministerio en unidades puntuables, o explica por qué
 * no. Cada municipio sale por exactamente una puerta, y el orden de las puertas
 * está fijado: primero «no hay filas», luego el modo de gestión, luego coste y
 * unidad. Es el mismo cuidado que `descartes` en `indicador-desviacion.ts` —un
 * motivo que significa dos cosas es un centinela disfrazado de valor.
 */
export function construirDmus(
  spec: EspecificacionDea,
  entrada: EntradaAnalisis,
): { incluidas: Dmu[]; excluidas: Exclusion[] } {
  const porIne = new Map<string, CesteRow[]>()
  for (const f of entrada.filas) {
    if (f.anio !== entrada.anio) continue
    const l = porIne.get(f.ine) ?? []
    l.push(f)
    porIne.set(f.ine, l)
  }

  const incluidas: Dmu[] = []
  const excluidas: Exclusion[] = []
  // Orden estable por INE: el símplex puede tener óptimos alternativos y el
  // orden de las columnas decide cuál sale. Un snapshot que cambia porque el
  // Map iteró distinto sería indistinguible de un cambio de dato.
  for (const ine of [...porIne.keys()].sort()) {
    const filas = porIne.get(ine)!
    let motivo: MotivoExclusion | null = null
    let coste = 0
    const salidas: number[] = []

    for (const programa of spec.programas) {
      const propias = filas.filter((f) => f.programa === programa)
      if (propias.length === 0) {
        motivo = 'sin-filas'
        break
      }
      const modos = new Set(propias.map((f) => f.modoGestion))
      if (modos.size === 1 && modos.has('no-se-presta')) {
        motivo = 'no-se-presta'
        break
      }
      if (modos.size !== 1 || !modos.has('directa')) {
        motivo = 'modo-no-directa'
        break
      }
      const c = resolverCoste(filas, programa, entrada.anio)
      if (c.estado !== 'declarado' || !(c.valor! > 0)) {
        motivo = 'coste-no-declarado'
        break
      }
      const u = resolverUnidad(filas, programa, entrada.anio, SERVICIOS[programa].denominador)
      if (u.estado !== 'declarado' || !(u.valor! > 0)) {
        motivo = 'unidad-no-declarada'
        break
      }
      coste += c.valor!
      salidas.push(u.valor!)
    }

    if (motivo) excluidas.push({ ine, motivo })
    else incluidas.push({ id: ine, entradas: [coste], salidas })
  }
  return { incluidas, excluidas }
}

export interface PuntuacionPropia {
  /** θ̂ bajo rendimientos variables, la lectura principal. */
  theta: number
  thetaCorregido: number
  sesgo: number
  errorEstandar: number
  ic: IntervaloConfianza
  razonSesgo: number
  correccionRecomendada: boolean
  /**
   * El intervalo no acota por abajo: el percentil se salía de la escala. Con
   * pocas unidades y muchas salidas pasa, y hay que decirlo en vez de imprimir
   * el recorte como si fuera el dato.
   */
  intervaloAcotaPorAbajo: boolean
  /** θ̂ bajo rendimientos constantes. */
  thetaCrs: number
  /** thetaCrs / theta. 1 = el tamaño no penaliza. */
  escala: number
  /** Cuántas unidades observadas la dominan. Sin nombres. */
  referencias: number
  autorreferente: boolean
  /** Posición dentro de la distribución, en tanto por ciento. */
  percentil: number
}

export interface DistribucionAnonima {
  n: number
  eficientes: number
  /** Eficientes en las que no se apoya nadie: frontera por rareza. */
  autorreferentes: number
  p10: number
  p25: number
  mediana: number
  p75: number
  p90: number
  /** Histograma en décimas, para pintar la distribución sin listar unidades. */
  histograma: { desde: number; hasta: number; n: number }[]
}

export interface AnalisisEspecificacion {
  id: string
  titulo: string
  porQue: string
  anio: number
  rendimientos: Rendimientos
  programas: { programa: string; label: string; denominador: string; unidad: string }[]
  cobertura: {
    banda: number
    incluidas: number
    excluidas: Record<MotivoExclusion, number>
  }
  gradosLibertad: GradosLibertad
  estado: EstadoEspecificacion
  motivoEstado: string | null
  bootstrap: {
    replicas: number
    replicasResueltas: number
    alfa: number
    banda: number
    semilla: number
  } | null
  propia: PuntuacionPropia | null
  distribucion: DistribucionAnonima | null
}

function percentilDe(ordenados: number[], p: number): number {
  if (ordenados.length === 0) return NaN
  if (ordenados.length === 1) return ordenados[0]
  const pos = (ordenados.length - 1) * p
  const bajo = Math.floor(pos)
  const alto = Math.ceil(pos)
  if (bajo === alto) return ordenados[bajo]
  return ordenados[bajo] + (pos - bajo) * (ordenados[alto] - ordenados[bajo])
}

export function analizarEspecificacion(
  spec: EspecificacionDea,
  entrada: EntradaAnalisis,
): AnalisisEspecificacion {
  const { incluidas, excluidas } = construirDmus(spec, entrada)
  const cuenta = Object.fromEntries(MOTIVOS_EXCLUSION.map((m) => [m, 0])) as Record<
    MotivoExclusion,
    number
  >
  for (const e of excluidas) cuenta[e.motivo]++

  const gl = gradosLibertad(incluidas.length, 1, spec.programas.length)
  const base: AnalisisEspecificacion = {
    id: spec.id,
    titulo: spec.titulo,
    porQue: spec.porQue,
    anio: entrada.anio,
    rendimientos: 'vrs',
    programas: spec.programas.map((p) => ({
      programa: p,
      label: SERVICIOS[p].label,
      denominador: SERVICIOS[p].denominador,
      unidad: SERVICIOS[p].unidad,
    })),
    cobertura: { banda: entrada.miembrosBanda, incluidas: incluidas.length, excluidas: cuenta },
    gradosLibertad: gl,
    estado: 'publicada',
    motivoEstado: null,
    bootstrap: null,
    propia: null,
    distribucion: null,
  }

  if (!gl.cumple) {
    return {
      ...base,
      estado: 'insuficiente',
      motivoEstado:
        `Grados de libertad: ${gl.n} unidades comparables para ${gl.salidas} salidas, y la regla ` +
        `pide ${gl.minimo}. Con menos, casi todo el mundo sale en la frontera y la puntuación ` +
        'mide el tamaño de la muestra en vez de la gestión.',
    }
  }
  if (!incluidas.some((d) => d.id === INE_PROPIO)) {
    return {
      ...base,
      estado: 'insuficiente',
      motivoEstado:
        'Riba-roja no declara esta cesta completa y en gestión directa, así que no hay puntuación ' +
        'propia que publicar. Puntuar a los demás sin estar dentro sería un ranking de terceros.',
    }
  }

  const vrs = resolverDea(incluidas, 'vrs')
  const crs = resolverDea(incluidas, 'crs')
  const boot = bootstrapDea(incluidas, 'vrs', {
    replicas: entrada.replicas ?? 2000,
    alfa: entrada.alfa ?? 0.05,
    semilla: `frontera:${spec.id}:${entrada.anio}`,
  })

  const idx = incluidas.findIndex((d) => d.id === INE_PROPIO)
  const pVrs = vrs.puntuaciones[idx]
  const pCrs = crs.puntuaciones[idx]
  const pBoot = boot.puntuaciones[idx]
  const thetas = vrs.puntuaciones.map((p) => p.theta!)
  const ordenados = [...thetas].sort((a, b) => a - b)
  const pordebajo = thetas.filter((t) => t < pVrs.theta! - 1e-9).length

  const histograma = Array.from({ length: 10 }, (_, i) => {
    const desde = i / 10
    const hasta = (i + 1) / 10
    return {
      desde,
      hasta,
      // El último tramo se cierra por arriba: θ = 1 es el caso más frecuente y
      // caería fuera de todos los tramos con un `<` estricto.
      n: thetas.filter((t) => t >= desde && (i === 9 ? t <= hasta : t < hasta)).length,
    }
  })

  return {
    ...base,
    bootstrap: {
      replicas: boot.replicas,
      replicasResueltas: boot.replicasResueltas,
      alfa: pBoot.ic.alfa,
      banda: boot.banda,
      semilla: boot.semilla,
    },
    propia: {
      theta: pVrs.theta!,
      thetaCorregido: pBoot.thetaCorregido,
      sesgo: pBoot.sesgo,
      errorEstandar: pBoot.errorEstandar,
      ic: pBoot.ic,
      razonSesgo: pBoot.razonSesgo,
      correccionRecomendada: pBoot.correccionRecomendada,
      intervaloAcotaPorAbajo: !pBoot.ic.truncadoInferior,
      thetaCrs: pCrs.theta!,
      escala: eficienciaEscala(pCrs.theta!, pVrs.theta!),
      referencias: pVrs.referencias.filter((r) => r.id !== INE_PROPIO).length,
      autorreferente: pVrs.autorreferente,
      percentil: (pordebajo / thetas.length) * 100,
    },
    distribucion: {
      n: incluidas.length,
      eficientes: vrs.eficientes,
      autorreferentes: vrs.puntuaciones.filter((p) => p.autorreferente).length,
      p10: percentilDe(ordenados, 0.1),
      p25: percentilDe(ordenados, 0.25),
      mediana: percentilDe(ordenados, 0.5),
      p75: percentilDe(ordenados, 0.75),
      p90: percentilDe(ordenados, 0.9),
      histograma,
    },
  }
}
