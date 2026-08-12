/**
 * Candidatos de desviación: qué cifra del panel merece que alguien la mire.
 *
 * `/eficiencia` publica cocientes con su celda detrás. Un cociente, por sí
 * solo, no pide nada a nadie: hay que leer trece tarjetas y acordarse de la
 * mediana para notar que una se sale. Esto recorre el panel y señala las que se
 * salen, con la cifra, la referencia y las veces — y **nada más**.
 *
 * ## Un candidato NO es un hallazgo
 *
 * Es una pregunta con las cifras ya puestas. Lo redacta un curador, lo firma un
 * curador y lo publica un CLI con validador delante. Por la escalera de
 * automatización medida esto es Tier C —dinero municipal bajo un alcalde con
 * nombre—, así que no hay camino automático a publicado ni lo habrá mientras la
 * escalera no registre precisión medida para esta clase.
 *
 * ## Las cuatro reglas, y por qué son las que son
 *
 *  · **umbral-legal** — la norma fija el número (PMP: 30 días, RD 1040/2017).
 *    Es la más fuerte de las cuatro porque no compara con nadie ni juzga nada:
 *    la ley dice 30 y la fuente dice 62,7.
 *  · **posicion-alta / posicion-baja** — fuera del p10–p90 de municipios que
 *    prestan el servicio del MISMO modo, con n ≥ 15. Nunca entre modos: el
 *    coste de un servicio concedido no es el coste que soporta el ayuntamiento.
 *  · **movimiento** — la posición RELATIVA a sus pares cambia por un factor
 *    versionado. Nunca el cambio absoluto: el alumbrado sube un 1.517 % en diez
 *    años y la mediana de sus pares apenas se mueve, así que el porcentaje
 *    absoluto cuenta la historia justo al revés.
 *
 * ## La regla que más se ha ganado su sitio: converger no es moverse
 *
 * Ese mismo alumbrado pasa de 0,07 a 1,05 veces la mediana. Catorce veces de
 * salto, y sin embargo lo que cambió es cuánto se declara: un municipio que
 * declaraba una fracción de lo que declaraban los demás y termina declarando lo
 * mismo no se ha encarecido, se ha puesto al día. **Acercarse a la mediana es
 * la firma de un cambio de criterio contable; alejarse de ella es la única
 * dirección que puede significar algo sobre el coste.** Así que sólo cuenta
 * alejarse — y eso deja fuera al alumbrado por una regla general en vez de por
 * una excepción con su nombre.
 *
 * ## El escalón `input` no genera candidatos, nunca
 *
 * El coste por efectivo de policía divide un gasto entre otro gasto: es un
 * precio, no un rendimiento. Está en el percentil 85 y sube, y publicarlo como
 * desviación diría «la policía es cara» cuando lo que mide es cuánto cobra un
 * policía. Es exactamente la mentira por vecindad que el escalón de Hatry
 * existe para impedir, así que se descarta ANTES de comparar y no después.
 *
 * ## Instrumentación
 *
 * `evaluados`, `descartes` y `reglas` se publican al lado de los candidatos
 * porque «cero desviaciones» de un motor que no evaluó nada es la suite verde
 * que no medía nada (DATA_INTEGRITY, regla 2). Cuántas veces pudo correr cada
 * regla es tan parte del resultado como el resultado.
 *
 * Módulo puro y determinista: sin red, sin disco, sin reloj. El mismo panel da
 * los mismos candidatos con los mismos ids.
 */
import { situacion, DIVERGENCIA_EXTREMA, type Indicador, type Tier } from './indicadores'
import type { IndicadorMunicipal } from './indicadores-friccion'
import type { ModoGestion } from './coste-efectivo'
import { leerIndicador, leerIndicadorMunicipal } from './indicador-lectura'

/**
 * Los umbrales, versionados.
 *
 * Van en el id de cada candidato: aflojar cualquiera de estos números cambia
 * qué se propone publicar, y el registro tiene que poder distinguir «este
 * indicador se salía» de «se salía con los umbrales de antes».
 */
export const UMBRALES = {
  version: 'v1-2026-08-12',
  /** Por encima de este percentil entre sus pares, la posición es candidata. */
  percentilAlto: 90,
  /** Por debajo de este percentil, también: barato de más también se explica. */
  percentilBajo: 10,
  /** Misma n que el motor. Bajo esto la banda habla de quién declaró, no del municipio. */
  minPares: 15,
  /** Factor de cambio en la posición relativa a los pares que cuenta como movimiento. */
  movimientoRelativo: 3,
  /** Años mínimos entre los dos extremos: dos entregas seguidas no son una tendencia. */
  minAniosMovimiento: 2,
  /** Un movimiento cuya última observación comprobable es más vieja que esto describe otro servicio. */
  maxAntiguedadAnios: 3,
} as const

export const MOTIVOS_DESVIACION = [
  'umbral-legal',
  'posicion-alta',
  'posicion-baja',
  'movimiento',
] as const
export type MotivoDesviacion = (typeof MOTIVOS_DESVIACION)[number]

/** Por qué un indicador no llegó a evaluarse. Suman con `evaluados` el panel entero. */
export const DESCARTES = [
  /** Concesión: el coste del ayuntamiento no es el coste del servicio. */
  'no-comparable',
  /** El cociente está bloqueado — celda ambigua, cero sin declarar, sin unidad. */
  'sin-valor',
  /** Un precio no es un rendimiento. */
  'tier-input',
  /** Ni banda suficiente, ni umbral legal, ni serie: no había nada que comprobar. */
  'sin-regla',
] as const
export type Descarte = (typeof DESCARTES)[number]

/** Reglas que SÍ corrieron y dijeron que no. Distinto de no haber corrido. */
export const RECHAZOS = [
  'dentro-de-banda',
  'convergente',
  'movimiento-pequeno',
  'movimiento-corto',
  'movimiento-antiguo',
  /**
   * El punto final del movimiento divide un coste actualizado entre una
   * cantidad que el ayuntamiento no vuelve a declarar. Ver `reglaMovimiento`.
   */
  'denominador-congelado',
] as const
export type Rechazo = (typeof RECHAZOS)[number]

/**
 * Cuánto pesa una desviación, y por qué no todas pesan igual.
 *
 * `indicadores.ts` ya avisa de que una cifra a más del doble (o menos de la
 * mitad) de la mediana de sus pares suele decir más de cómo rellena cada
 * ayuntamiento la casilla que de cómo presta el servicio — «superficie
 * urbanizada» la declara cada casa a su manera. Una desviación construida sobre
 * esa comparación hereda esa debilidad, y proponerla al mismo nivel que un
 * plazo que la ley fija en 30 días sería enterrar la fuerte entre las flojas.
 *
 * Un umbral legal no compara con nadie: la norma dice el número. Ésa es la
 * única clase que sale `alta` por construcción.
 */
export const FIABILIDADES = ['alta', 'debil'] as const
export type Fiabilidad = (typeof FIABILIDADES)[number]

export interface Desviacion {
  motivo: MotivoDesviacion
  fiabilidad: Fiabilidad
  /** La cifra del municipio, en las unidades del indicador. */
  valor: number
  /** Contra qué se mide: el límite legal, la mediana de los pares, la posición de partida. */
  referencia: number
  etiquetaReferencia: string
  /** Cuántas veces la referencia. Siempre ≥ 1: la dirección va en el motivo y en el detalle. */
  veces: number
  /** Una frase con las dos cifras dentro, para que el borrador no las reconstruya. */
  detalle: string
}

export interface Candidato {
  /** `cand-<indicador>-<versión de umbrales>`. Estable entre pasadas. */
  id: string
  indicadorId: string
  familia: 'servicio' | 'municipal'
  etiqueta: string
  tier?: Tier
  modoGestion?: ModoGestion
  valor: number
  unidad: string
  /** Año o rango que cubre la cifra. Nunca implícito. */
  periodo: string
  desviaciones: Desviacion[]
  /** La mejor de sus desviaciones. Ordena la cola: lo firme primero, lo flojo marcado. */
  fiabilidad: Fiabilidad
  pares?: { conjunto: string; n: number; percentil: number; mediana: number }
  /** Las celdas exactas de las que sale el cociente, para que el gate las resuelva. */
  fuentes: string[]
  citas: { url: string; etiqueta: string }[]
  caveats: string[]
  /** Versión de umbrales bajo la que este candidato existe. */
  umbrales: string
  /**
   * Primera de las dos capas independientes: el esquema publicado RECHAZA este
   * campo, así que un borrador no puede llegar a publicado por descuido.
   */
  requiresHumanApproval: true
  /**
   * El texto propuesto. Determinista, por la misma razón que
   * `indicador-lectura.ts`: el espacio de frases es una rejilla finita y meter
   * un modelo aquí añadiría alucinación sobre las cifras que son el motivo
   * entero de la página, en un sitio cuya regla es que nada automático escribe
   * prosa publicada.
   *
   * Dice el cociente, el reparto, el modo de gestión y la n. **No dice
   * «ineficiente»**: el juicio es del curador, y para eso lo firma.
   */
  borrador: { titulo: string; cuerpo: string }
}

export interface Deteccion {
  umbrales: typeof UMBRALES
  /** Indicadores en los que al menos una regla llegó a correr. */
  evaluados: number
  descartes: Partial<Record<Descarte, number>>
  rechazos: Partial<Record<Rechazo, number>>
  /** Cuántas veces pudo correr cada regla. Un cero aquí es «no se comprobó», no «no hay». */
  reglas: { posicion: number; umbralLegal: number; movimiento: number }
  candidatos: Candidato[]
}

// ─── Formato ────────────────────────────────────────────────────────────────

const dec = (v: number, min = 2, max = 2) =>
  v.toLocaleString('es-ES', { minimumFractionDigits: min, maximumFractionDigits: max })

const cifra = (v: number, unidad: string) =>
  v >= 1000 ? `${dec(v, 0, 0)} ${unidad}` : `${dec(v)} ${unidad}`

/** Como `cifra`, pero sin decimales de adorno: un plazo legal de «30,00 días» no existe. */
const cifraExacta = (v: number, unidad: string) =>
  Number.isInteger(v) ? `${entero(v)} ${unidad}` : cifra(v, unidad)

const veces = (v: number) => `${dec(v, 1, 1)} veces`

const entero = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 0 })

// ─── Reglas ─────────────────────────────────────────────────────────────────

/**
 * ¿Se aleja de la mediana de sus pares, o se acerca?
 *
 * Se compara en logaritmo porque la posición relativa es multiplicativa: 0,25×
 * y 4× están igual de lejos de la mediana, y una resta diría que uno está a
 * 0,75 y el otro a 3.
 */
function seAleja(relInicial: number, relFinal: number): boolean {
  if (!(relInicial > 0) || !(relFinal > 0)) return false
  return Math.abs(Math.log(relFinal)) > Math.abs(Math.log(relInicial))
}

/** El salto de posición relativa, siempre ≥ 1: la dirección la lleva el detalle. */
function saltoRelativo(relInicial: number, relFinal: number): number {
  const s = relFinal / relInicial
  return s >= 1 ? s : 1 / s
}

interface Contexto {
  reglas: Deteccion['reglas']
  rechazos: Partial<Record<Rechazo, number>>
}

const sube = <K extends string>(m: Partial<Record<K, number>>, k: K) => {
  m[k] = (m[k] ?? 0) + 1
}

/**
 * ¿Descansa esta comparación sobre una banda que el propio motor ya marca como
 * poco fiable? Se recalcula la condición de `indicadores.ts` en vez de buscar
 * su frase: leer el texto de una salvedad para decidir política es una prueba
 * que se rompe la próxima vez que alguien reescriba la frase.
 */
function fiabilidadComparativa(valor: number, mediana: number): Fiabilidad {
  if (!(mediana > 0)) return 'debil'
  const razon = valor / mediana
  return razon > DIVERGENCIA_EXTREMA || razon < 1 / DIVERGENCIA_EXTREMA ? 'debil' : 'alta'
}

/** Posición dentro de la banda de pares. `null` si la banda no da para hablar. */
/**
 * `queSon` describe CONTRA QUIÉN se compara, y lo pone quien lo sabe.
 *
 * Esta regla la comparten las dos familias, y la frase estaba clavada: «en N
 * municipios que prestan el servicio del mismo modo». Para un servicio es
 * cierta —los pares se filtran por modo de gestión antes de calcular ningún
 * percentil— y para el plazo de pago o los denominadores sin remedir no
 * significa nada, porque ahí no hay servicio ni modo que compartir. Nunca llegó
 * a una ficha publicada, pero el borrador es de donde copia un curador.
 */
function reglaPosicion(
  percentil: number,
  n: number,
  valor: number,
  mediana: number,
  unidad: string,
  queSon: string,
  ctx: Contexto,
): Desviacion | null {
  if (n < UMBRALES.minPares) return null
  ctx.reglas.posicion += 1
  const alta = percentil >= UMBRALES.percentilAlto
  const baja = percentil <= UMBRALES.percentilBajo
  if (!alta && !baja) {
    sube(ctx.rechazos, 'dentro-de-banda')
    return null
  }
  const razon = mediana > 0 ? valor / mediana : 0
  return {
    motivo: alta ? 'posicion-alta' : 'posicion-baja',
    fiabilidad: fiabilidadComparativa(valor, mediana),
    valor,
    referencia: mediana,
    etiquetaReferencia: `mediana de ${entero(n)} municipios comparables`,
    veces: razon >= 1 ? razon : razon > 0 ? 1 / razon : 0,
    detalle:
      `${cifra(valor, unidad)} frente a una mediana de ${cifra(mediana, unidad)} en ` +
      `${entero(n)} municipios ${queSon} ` +
      `(percentil ${percentil}).`,
  }
}

/** Umbral que fija la norma. La única regla que no compara con nadie. */
function reglaUmbralLegal(
  valor: number,
  referencia: { valor: number; etiqueta: string; fuente: string } | undefined,
  unidad: string,
  ctx: Contexto,
): Desviacion | null {
  if (!referencia || !(referencia.valor > 0)) return null
  ctx.reglas.umbralLegal += 1
  if (valor <= referencia.valor) {
    sube(ctx.rechazos, 'dentro-de-banda')
    return null
  }
  return {
    motivo: 'umbral-legal',
    // La norma fija el número: no hay comparación que pueda estar sesgada.
    fiabilidad: 'alta',
    valor,
    referencia: referencia.valor,
    etiquetaReferencia: referencia.etiqueta,
    veces: valor / referencia.valor,
    detalle:
      `${cifra(valor, unidad)} frente al límite de ${cifraExacta(referencia.valor, unidad)} ` +
      `que fija la norma (${referencia.etiqueta}) — ${veces(valor / referencia.valor)} el límite.`,
  }
}

/**
 * Movimiento de la posición relativa a los pares.
 *
 * Se mide sólo entre puntos que tienen mediana de pares de SU año y que
 * pasaron la comprobación de atípicos, igual que la tendencia de
 * `indicador-lectura.ts`: una tendencia anclada en una cifra que nadie pudo
 * verificar es justo la afirmación que este motor no hace.
 */
function reglaMovimiento(i: Indicador, anioBase: number, unidad: string, ctx: Contexto) {
  const limpios = i.serie.filter(
    (p) => p.estado === 'declarado' && p.medianaPares !== undefined && !p.atipico && p.valor! > 0,
  )
  if (limpios.length < 2) {
    sube(ctx.rechazos, 'movimiento-corto')
    return null
  }
  ctx.reglas.movimiento += 1
  const a = limpios[0]
  const b = limpios[limpios.length - 1]
  if (b.anio - a.anio < UMBRALES.minAniosMovimiento) {
    sube(ctx.rechazos, 'movimiento-corto')
    return null
  }
  if (anioBase - b.anio > UMBRALES.maxAntiguedadAnios) {
    sube(ctx.rechazos, 'movimiento-antiguo')
    return null
  }
  const relA = a.valor! / a.medianaPares!
  const relB = b.valor! / b.medianaPares!
  const salto = saltoRelativo(relA, relB)
  if (salto < UMBRALES.movimientoRelativo) {
    sube(ctx.rechazos, 'movimiento-pequeno')
    return null
  }
  // Converger hacia la mediana es la firma de un cambio en cuánto se declara,
  // no en cuánto cuesta. Ver la cabecera.
  if (!seAleja(relA, relB)) {
    sube(ctx.rechazos, 'convergente')
    return null
  }
  // ÚLTIMA puerta, y va última a propósito: lo que cuenta este rechazo es
  // «habría sido candidato, si alguien hubiera vuelto a medir el denominador».
  // Adelantarla robaría casos a `convergente` y a `movimiento-pequeno`, que
  // dejarían de ejercitarse sobre datos reales — y una regla que no corre no
  // está probada.
  //
  // El punto final de una afirmación de movimiento tiene que ser una medición
  // fresca. Si `b` cae dentro del tramo en el que el ayuntamiento repite el
  // mismo denominador, `relB` es un coste de hoy dividido entre una cantidad de
  // hace años: lo que se movió fue el numerador, y decir que el servicio «se
  // alejó de sus pares» atribuye a la gestión lo que hizo la falta de medición.
  //
  // No es hipotético. Los dos únicos candidatos de servicio que llegó a haber
  // —urbanismo (×4,9) y centros docentes (×3,5)— eran exactamente esto, y la
  // mediana contra la que se medían estaba igual de contaminada: 46 de 58 y 38
  // de 55 municipios comparables congelan también la suya. Rebajarlos a `debil`
  // no bastaba; la regla no debe emitirlos.
  const congelado = i.declaracion?.denominador
  if (congelado?.congelada && congelado.desde !== null && b.anio >= congelado.desde) {
    sube(ctx.rechazos, 'denominador-congelado')
    return null
  }
  return {
    motivo: 'movimiento' as const,
    // El movimiento se mide CONTRA la mediana de los pares, así que hereda la
    // fiabilidad de esa comparación en el punto donde termina.
    fiabilidad: fiabilidadComparativa(b.valor!, b.medianaPares!),
    valor: b.valor!,
    referencia: a.valor!,
    etiquetaReferencia: `posición relativa en ${a.anio}`,
    veces: salto,
    detalle:
      `Medido contra sus pares pasa de ${dec(relA)} a ${dec(relB)} veces la mediana entre ` +
      `${a.anio} y ${b.anio} (de ${cifra(a.valor!, unidad)} a ${cifra(b.valor!, unidad)}), ` +
      `alejándose de ellos.`,
  }
}

// ─── Borrador ───────────────────────────────────────────────────────────────

/** Motivo que titula, de más fuerte a menos. La ley antes que la comparación. */
const ORDEN: MotivoDesviacion[] = ['umbral-legal', 'posicion-alta', 'posicion-baja', 'movimiento']

/** Fiable primero, y dentro de cada grupo la razón más fuerte. */
const ordenar = (ds: Desviacion[]): Desviacion[] =>
  [...ds].sort(
    (a, b) =>
      (a.fiabilidad === 'alta' ? 0 : 1) - (b.fiabilidad === 'alta' ? 0 : 1) ||
      ORDEN.indexOf(a.motivo) - ORDEN.indexOf(b.motivo),
  )

const mejorFiabilidad = (ds: Desviacion[]): Fiabilidad =>
  ds.some((d) => d.fiabilidad === 'alta') ? 'alta' : 'debil'

/**
 * `Etiqueta: resto`, salvo que la etiqueta ya traiga dos puntos —«Urbanismo:
 * planeamiento y gestión»— y el titular acabe con dos veces el mismo signo.
 */
const encabeza = (etiqueta: string, resto: string) =>
  `${etiqueta}${etiqueta.includes(':') ? ' — ' : ': '}${resto}`

const TITULO: Record<
  MotivoDesviacion,
  (c: Omit<Candidato, 'id' | 'borrador'>, d: Desviacion) => string
> = {
  'umbral-legal': (c, d) =>
    encabeza(
      c.etiqueta,
      `${cifra(c.valor, c.unidad)} frente al límite legal de ` +
        `${cifraExacta(d.referencia, c.unidad)} en ${c.periodo}`,
    ),
  'posicion-alta': (c, d) =>
    encabeza(
      c.etiqueta,
      `${cifra(c.valor, c.unidad)} frente a una mediana de ` +
        `${cifra(d.referencia, c.unidad)} entre municipios comparables`,
    ),
  'posicion-baja': (c, d) =>
    encabeza(
      c.etiqueta,
      `${cifra(c.valor, c.unidad)} frente a una mediana de ` +
        `${cifra(d.referencia, c.unidad)} entre municipios comparables`,
    ),
  movimiento: (c, d) =>
    encabeza(
      c.etiqueta,
      `la distancia a sus pares se multiplica por ${dec(d.veces, 1, 1)} hasta ${c.periodo}`,
    ),
}

/**
 * El cuerpo del borrador.
 *
 * Estructura fija: qué es el número, en qué se sale, cómo se lee ese escalón,
 * qué salvedades arrastra y de dónde sale. La última frase dice en voz alta que
 * esto no es un veredicto, porque el borrador se lee entero antes de firmarlo y
 * la tentación de firmarlo tal cual es exactamente lo que hay que estorbar.
 */
function redactar(c: Omit<Candidato, 'id' | 'borrador'>, comoSeLee: string): string {
  const partes: string[] = []
  partes.push(
    `${c.etiqueta} figura en ${cifra(c.valor, c.unidad)} en ${c.periodo}` +
      `${c.modoGestion ? `, con gestión ${c.modoGestion}` : ''}.`,
  )
  for (const d of c.desviaciones) partes.push(d.detalle)
  partes.push(comoSeLee)
  if (c.caveats.length) partes.push(`Salvedades de la fuente: ${c.caveats.join(' ')}`)
  partes.push(
    'Esto es un candidato, no un hallazgo: dice dónde se sale la cifra y contra qué se mide, ' +
      'y no afirma ninguna causa. Comprobar el expediente antes de publicar nada.',
  )
  return partes.join(' ')
}

// ─── Motor ──────────────────────────────────────────────────────────────────

export interface EntradaDeteccion {
  indicadores: Indicador[]
  municipales: IndicadorMunicipal[]
  /** La entrega que titula el panel: contra ella se mide la antigüedad de un movimiento. */
  anioBase: number
}

export function detectarDesviaciones(input: EntradaDeteccion): Deteccion {
  const ctx: Contexto = {
    reglas: { posicion: 0, umbralLegal: 0, movimiento: 0 },
    rechazos: {},
  }
  const descartes: Partial<Record<Descarte, number>> = {}
  const candidatos: Candidato[] = []
  let evaluados = 0

  for (const i of input.indicadores) {
    // El orden importa, y colapsarlo sería el modo de fallo 3 de
    // DATA_INTEGRITY: una concesión TAMBIÉN tiene el cociente bloqueado, así
    // que un único `no-comparable` significaría a la vez «lo paga el
    // concesionario» y «la celda no vale», y la cuenta dejaría de decir nada.
    // La partición ya existe y se importa en vez de reescribirse.
    if (situacion(i) === 'concesion') {
      sube(descartes, 'no-comparable')
      continue
    }
    if (i.valor === null) {
      sube(descartes, 'sin-valor')
      continue
    }
    if (!i.comparable) {
      sube(descartes, 'no-comparable')
      continue
    }
    if (i.tier === 'input') {
      sube(descartes, 'tier-input')
      continue
    }

    const antes = { ...ctx.reglas }
    const desviaciones: Desviacion[] = []
    if (i.pares) {
      const d = reglaPosicion(
        i.pares.percentil,
        i.pares.n,
        i.valor,
        i.pares.mediana,
        i.unidad,
        'que prestan el servicio del mismo modo',
        ctx,
      )
      if (d) desviaciones.push(d)
    }
    const mov = reglaMovimiento(i, input.anioBase, i.unidad, ctx)
    if (mov) desviaciones.push(mov)

    const corrioAlguna =
      ctx.reglas.posicion > antes.posicion || ctx.reglas.movimiento > antes.movimiento
    if (!corrioAlguna) {
      sube(descartes, 'sin-regla')
      continue
    }
    evaluados += 1
    if (!desviaciones.length) continue

    const entrega = i.citas?.[0]?.entrega
    const base: Omit<Candidato, 'id' | 'borrador'> = {
      indicadorId: i.id,
      familia: 'servicio',
      etiqueta: i.etiqueta,
      tier: i.tier,
      modoGestion: i.modoGestion,
      valor: i.valor,
      unidad: i.unidad,
      periodo: entrega ? String(entrega) : String(input.anioBase),
      desviaciones: ordenar(desviaciones),
      // Un denominador que el ayuntamiento no vuelve a medir NO puede sostener
      // una ficha firmada como fiable, por limpia que salga la comparación con
      // los pares: el cociente que se compara lleva el coste de este año y la
      // cantidad de hace seis. Es un TECHO aplicado después de la regla
      // comparativa, no un criterio más que pudiera subir la fiabilidad.
      fiabilidad: i.declaracion?.denominador?.congelada ? 'debil' : mejorFiabilidad(desviaciones),
      ...(i.pares
        ? {
            pares: {
              conjunto: i.pares.conjunto,
              n: i.pares.n,
              percentil: i.pares.percentil,
              mediana: i.pares.mediana,
            },
          }
        : {}),
      fuentes: [i.numerador.fuente, i.denominador.fuente],
      citas: (i.citas ?? []).map((c) => ({ url: c.url, etiqueta: `Entrega ${c.entrega}` })),
      caveats: i.caveats ?? [],
      umbrales: UMBRALES.version,
      requiresHumanApproval: true,
    }
    candidatos.push({
      ...base,
      id: `cand-${i.id}-${UMBRALES.version}`,
      borrador: {
        titulo: TITULO[base.desviaciones[0].motivo](base, base.desviaciones[0]),
        cuerpo: redactar(base, leerIndicador(i).como),
      },
    })
  }

  for (const m of input.municipales) {
    if (m.valor === null) {
      sube(descartes, 'sin-valor')
      continue
    }
    const antes = { ...ctx.reglas }
    const desviaciones: Desviacion[] = []
    // La unidad de un indicador municipal es su formato, no una magnitud
    // física: días, euros, o un porcentaje que se escribe entero.
    const unidad = m.formato === 'dias' ? 'días' : m.formato === 'euros' ? '€' : ''
    const valor = m.formato === 'porcentaje' ? m.valor * 100 : m.valor
    const escala = m.formato === 'porcentaje' ? 100 : 1

    const legal = reglaUmbralLegal(
      valor,
      m.referencia ? { ...m.referencia, valor: m.referencia.valor * escala } : undefined,
      m.formato === 'porcentaje' ? '%' : unidad,
      ctx,
    )
    if (legal) desviaciones.push(legal)
    if (m.pares) {
      const d = reglaPosicion(
        m.pares.percentil,
        m.pares.n,
        valor,
        m.pares.mediana * escala,
        m.formato === 'porcentaje' ? '%' : unidad,
        // Lo pone el propio indicador, que es quien construyó la banda. Un mapa
        // aquí, indexado por `conjunto`, sería una tabla central que se queda
        // vieja en cuanto alguien añada un indicador y no la toque.
        m.pares.descripcion ?? 'comparables',
        ctx,
      )
      if (d) desviaciones.push(d)
    }
    const corrioAlguna =
      ctx.reglas.posicion > antes.posicion || ctx.reglas.umbralLegal > antes.umbralLegal
    if (!corrioAlguna) {
      sube(descartes, 'sin-regla')
      continue
    }
    evaluados += 1
    if (!desviaciones.length) continue

    const base: Omit<Candidato, 'id' | 'borrador'> = {
      indicadorId: m.id,
      familia: 'municipal',
      etiqueta: m.etiqueta,
      valor,
      unidad: m.formato === 'porcentaje' ? '%' : unidad,
      periodo: m.periodo,
      // El texto de la norma va con el candidato: un hallazgo que dice
      // «supera el límite legal» tiene que poder enlazar el límite.
      desviaciones: ordenar(desviaciones),
      fiabilidad: mejorFiabilidad(desviaciones),
      ...(m.pares
        ? {
            pares: {
              conjunto: m.pares.conjunto,
              n: m.pares.n,
              percentil: m.pares.percentil,
              mediana: m.pares.mediana * escala,
            },
          }
        : {}),
      fuentes: [m.numerador.fuente, m.denominador.fuente],
      citas: [
        ...(m.citas ?? []),
        ...(m.referencia?.fuente
          ? [{ url: m.referencia.fuente, etiqueta: `Norma: ${m.referencia.etiqueta}` }]
          : []),
      ],
      caveats: m.caveats ?? [],
      umbrales: UMBRALES.version,
      requiresHumanApproval: true,
    }
    candidatos.push({
      ...base,
      id: `cand-${m.id}-${UMBRALES.version}`,
      borrador: {
        titulo: TITULO[base.desviaciones[0].motivo](base, base.desviaciones[0]),
        cuerpo: redactar(base, leerIndicadorMunicipal(m).como),
      },
    })
  }

  return {
    umbrales: UMBRALES,
    evaluados,
    descartes,
    rechazos: ctx.rechazos,
    reglas: ctx.reglas,
    // Lo firme arriba. Una cola que mezcla «el plazo de pago dobla el límite
    // legal» con «esta comparación depende de cómo rellene cada ayuntamiento su
    // casilla» se trabaja de arriba abajo hasta que alguien se cansa, y la
    // fuerte es la que se queda sin firmar. Desempate por id para que el orden
    // no dependa del recorrido.
    candidatos: candidatos.sort(
      (a, b) =>
        (a.fiabilidad === 'alta' ? 0 : 1) - (b.fiabilidad === 'alta' ? 0 : 1) ||
        a.id.localeCompare(b.id),
    ),
  }
}
