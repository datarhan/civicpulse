/**
 * El motor de indicadores: coste ÷ unidad física, y todas las razones para
 * negarse a hacer esa división.
 *
 * Un indicador aquí no es un número, es un registro con procedencia: cada
 * magnitud lleva la celda exacta de la que sale (`cesel:2021:CE2:a1621:Econ14`)
 * para que `check:indicadores` pueda comprobar la aritmética igual que
 * `check:citations` comprueba las citas. En un sitio cuyo contrato entero es
 * que toda afirmación lleva cita, un cociente sin procedencia sería la única
 * cifra publicada sin respaldo.
 *
 * LAS CINCO TRAMPAS QUE ESTE MÓDULO EXISTE PARA PARAR
 *
 *  1. La concesión declara 0 €. Agua y alcantarillado no le cuestan nada al
 *     ayuntamiento porque los paga el concesionario vía tarifa, y el
 *     denominador (metros de red) sí está. Dividir publicaría «Riba-roja
 *     suministra agua gratis, el más eficiente de la comarca».
 *  2. El cero significa «no lo declaré». Transporte urbano tiene presupuesto
 *     real y 0 viajeros declarados.
 *  3. Un servicio puede traer varias filas con costes distintos.
 *  4. El mismo atributo puede venir dos veces con valores contradictorios.
 *  5. Las toneladas de basura son demanda, no logro — de ahí `tier`.
 *
 * Las tres primeras se resuelven igual: **un fallo honesto es mejor que un
 * número equivocado**. Si la fuente es ambigua, la celda queda `no-declarado`
 * con su motivo y la tarjeta explica por qué no hay cociente. Nunca gana la
 * primera fila.
 *
 * Módulo puro: sin red, sin lectura de ficheros. Los CLIs le pasan los datos.
 */
import type { CesteRow, ModoGestion } from './coste-efectivo'
import { SERVICIOS } from './indicador-registry'

/**
 * El escalón de Hatry, y la razón de que este panel no sea otro cuadro de
 * mando. Mezclar los cuatro bajo un título que diga «eficiencia» es mentir por
 * vecindad: el coste por efectivo de policía (`input`) y el coste por tonelada
 * (`carga`) no se leen igual, y ninguno de los dos es un resultado.
 */
export type Tier =
  /** Recursos consumidos. Dividir un input entre otro da un precio, no un rendimiento. */
  | 'input'
  /** Demanda o extensión que el servicio no elige: toneladas generadas, km² a planificar. */
  | 'carga'
  /** Lo que el servicio entrega: m² limpiados, préstamos, puntos de luz mantenidos. */
  | 'output'
  /** El efecto sobre la vida del municipio. CESEL no publica ninguno. */
  | 'outcome'

export type Dimension = 'operativa' | 'respuesta' | 'fiscal' | 'friccion'

/** Tres estados, nunca colapsados. El motivo explica; no añade un cuarto estado. */
export type EstadoCelda = 'declarado' | 'no-declarado' | 'no-se-presta'

export type Motivo =
  /** El atributo o la fila no aparecen. */
  | 'ausente'
  /** Vino 0 junto a un gasto real: es «no lo declaré», no una cantidad. */
  | 'cero-sin-declarar'
  /** Varias filas del mismo servicio con costes distintos. */
  | 'filas-duplicadas'
  /** El mismo atributo declarado dos veces con valores distintos. */
  | 'atributo-ambiguo'
  /** Lo paga el concesionario: el coste del ayuntamiento no es el del servicio. */
  | 'concesion'

export interface Magnitud {
  /** `null` siempre que `estado !== 'declarado'`: una celda que no vale no se pinta. */
  valor: number | null
  estado: EstadoCelda
  motivo?: Motivo
  /** La celda exacta, p. ej. `cesel:2021:CE3:a1621:Producción anual…`. */
  fuente: string
}

export interface ParMiembro {
  ine: string
  nombre: string
  poblacion: number
  valor: number
}

export interface ParesResumen {
  conjunto: string
  n: number
  /** Siempre el mismo que el del municipio: nunca se compara entre modos. */
  modoGestion: ModoGestion
  percentil: number
  p25: number
  mediana: number
  p75: number
  miembros: ParMiembro[]
}

export interface PuntoSerie {
  anio: number
  valor: number | null
  estado: EstadoCelda
}

export interface Indicador {
  id: string
  dimension: Dimension
  tier: Tier
  servicio: string | null
  etiqueta: string
  numerador: Magnitud
  denominador: Magnitud
  /** El cociente. `null` salvo que AMBAS magnitudes estén declaradas. */
  valor: number | null
  unidad: string
  modoGestion: ModoGestion
  codGestionRaw: string
  comparable: boolean
  pares: ParesResumen | null
  serie: PuntoSerie[]
  caveats: string[]
  citas: { url: string; entrega: number }[]
}

/**
 * En qué situación queda cada servicio. Es una PARTICIÓN: cada servicio cae en
 * exactamente una, y las cinco suman el registro entero.
 *
 * Que sumen es el punto. `MoneyCoverage` existe porque una cifra agregada sin
 * denominador se lee como completitud; una franja de cobertura cuyos números no
 * cuadran hace lo mismo con más aplomo. El test comprueba la identidad.
 */
export type SituacionServicio =
  | 'con-ratio'
  | 'concesion'
  | 'no-se-presta'
  | 'sin-unidad'
  | 'sin-coste'

export function situacion(i: Indicador): SituacionServicio {
  if (i.numerador.estado === 'no-se-presta') return 'no-se-presta'
  if (i.numerador.motivo === 'concesion') return 'concesion'
  if (i.valor !== null) return 'con-ratio'
  if (i.denominador.estado !== 'declarado') return 'sin-unidad'
  return 'sin-coste'
}

export interface IndicadoresUniverse {
  serviciosEnRegistro: number
  conRatio: number
  enConcesion: number
  sinUnidad: number
  sinCoste: number
  noSePresta: number
  comparables: number
  /** Entregas realmente obtenidas, para que la página no finja una serie. */
  aniosDisponibles: number[]
}

export interface IndicadoresSnapshot {
  indicadores: Indicador[]
  universe: IndicadoresUniverse
}

/**
 * Mínimo de pares para publicar un percentil.
 *
 * Por debajo de esto la posición depende de quién declaró ese año más que del
 * municipio, y una banda dibujada sobre ocho puntos invita a leer una precisión
 * que no existe.
 */
export const MIN_PARES = 15

/**
 * Cuánto puede alejarse de la mediana antes de que la comparación diga más de
 * cómo declara cada ayuntamiento que de lo que cuesta el servicio.
 *
 * Medido sobre la entrega 2021: cinco de diez indicadores comparables de
 * Riba-roja caen fuera de este factor, en las dos direcciones. Eso no es que un
 * municipio sea cuatro veces mejor barriendo: es que «superficie urbanizada» o
 * «superficie con servicio de limpieza» las rellena cada casa a su manera
 * —Riba-roja declara 58,01 km² urbanizados, prácticamente todo su término—.
 *
 * El cociente en sí está bien y lleva su celda detrás; lo que aquí se debilita
 * es la LECTURA de la comparación. Por eso esto añade una salvedad y nunca
 * retira el dato: sólo baja la fuerza de la afirmación, que es la única clase
 * de juicio que este proyecto deja automatizar sin curador.
 */
export const DIVERGENCIA_EXTREMA = 2

/** Modos en los que el coste declarado ES el coste que soporta el ayuntamiento. */
const MODOS_COMPARABLES: ReadonlySet<ModoGestion> = new Set<ModoGestion>([
  'directa',
  'mancomunada',
  'consorciada',
  'convenio',
  'mixta',
])

const fuenteCoste = (anio: number, programa: string) => `cesel:${anio}:CE2:${programa}:Econ14`
const fuenteUnidad = (anio: number, programa: string, atributo: string) =>
  `cesel:${anio}:CE3:${programa}:${atributo}`

/**
 * El coste del servicio, o la razón por la que no se puede usar.
 *
 * Nunca «gana la primera fila»: si el ministerio publica dos costes distintos
 * para el mismo programa, los dos son igual de creíbles y elegir sería un
 * volado disfrazado de dato.
 */
export function resolverCoste(filas: CesteRow[], programa: string, anio: number): Magnitud {
  const fuente = fuenteCoste(anio, programa)
  const rows = filas.filter((f) => f.programa === programa && f.anio === anio)
  if (!rows.length) return { valor: null, estado: 'no-declarado', motivo: 'ausente', fuente }

  if (rows.every((r) => r.modoGestion === 'no-se-presta')) {
    return { valor: null, estado: 'no-se-presta', fuente }
  }
  if (rows.some((r) => r.modoGestion === 'concesion')) {
    return { valor: null, estado: 'no-declarado', motivo: 'concesion', fuente }
  }

  // Una fila con coste 0 no es una afirmación rival: es la misma «no lo
  // declaré» que ya se aplica a las unidades de CE3. Parques y jardines viene
  // con 718.015,88 € y 0 €, las dos en gestión directa; tratar el 0 como un
  // segundo dato aplicaría la regla contraria a las dos mitades de este mismo
  // módulo y borraría un servicio de 700 mil euros con buen denominador.
  //
  // Dos costes POSITIVOS distintos sí son dos afirmaciones (a1721 declara
  // 1.964.894,95 y 282.412,19), y ahí no hay forma honesta de elegir.
  const positivas = rows.filter((r) => (r.costeTotal ?? 0) > 0)
  if (!positivas.length) {
    return { valor: null, estado: 'no-declarado', motivo: 'cero-sin-declarar', fuente }
  }
  const distintos = new Set(positivas.map((r) => r.costeTotal))
  if (distintos.size > 1) {
    return { valor: null, estado: 'no-declarado', motivo: 'filas-duplicadas', fuente }
  }
  return { valor: positivas[0].costeTotal!, estado: 'declarado', fuente }
}

/**
 * La unidad física, o la razón por la que no se puede usar.
 *
 * El 0 es el caso importante: junto a un gasto real significa «no lo declaré»,
 * y tratarlo como cantidad da un cociente infinito o absurdo.
 */
export function resolverUnidad(
  filas: CesteRow[],
  programa: string,
  anio: number,
  atributo: string,
): Magnitud {
  const fuente = fuenteUnidad(anio, programa, atributo)
  const rows = filas.filter((f) => f.programa === programa && f.anio === anio)
  const valores = rows.flatMap((r) => r.unidades.filter((u) => u.atributo === atributo))
  if (!valores.length) return { valor: null, estado: 'no-declarado', motivo: 'ausente', fuente }

  const distintos = new Set(valores.map((v) => v.valor))
  if (distintos.size > 1) {
    return { valor: null, estado: 'no-declarado', motivo: 'atributo-ambiguo', fuente }
  }

  const valor = valores[0].valor
  if (valor <= 0) {
    return { valor: null, estado: 'no-declarado', motivo: 'cero-sin-declarar', fuente }
  }
  return { valor, estado: 'declarado', fuente }
}

function percentil(ordenados: number[], q: number): number {
  if (!ordenados.length) return 0
  const i = (ordenados.length - 1) * q
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return lo === hi ? ordenados[lo] : ordenados[lo] + (ordenados[hi] - ordenados[lo]) * (i - lo)
}

export interface ConstruirInput {
  municipio: { ine: string; nombre: string; filas: CesteRow[] }
  pares: {
    conjunto: string
    /** Años para los que hay filas de pares. */
    anios?: number[]
    miembros: { ine: string; nombre: string; poblacion: number }[]
    filas: CesteRow[]
  }
  /** Entrega que titula la tarjeta. Por omisión, la más reciente con datos. */
  anioBase?: number
  citaUrl: string
}

export function construirIndicadores(input: ConstruirInput): IndicadoresSnapshot {
  const { municipio, pares, citaUrl } = input
  const aniosDisponibles = [...new Set(municipio.filas.map((f) => f.anio))].sort((a, b) => a - b)
  // La tarjeta titula con la entrega MÁS RECIENTE que haya. Titular con la más
  // antigua porque es la que tiene pares publicaría a sabiendas una cifra vieja
  // —y en alumbrado, una que la propia fuente corrigió después—.
  const anioBase = input.anioBase ?? aniosDisponibles[aniosDisponibles.length - 1] ?? 0

  const indicadores: Indicador[] = []

  for (const [programa, def] of Object.entries(SERVICIOS)) {
    const propias = municipio.filas.filter((f) => f.programa === programa)
    const numerador = resolverCoste(municipio.filas, programa, anioBase)
    const denominador = resolverUnidad(municipio.filas, programa, anioBase, def.denominador)

    const modoGestion: ModoGestion = propias[0]?.modoGestion ?? 'sin-clasificar'
    const codGestionRaw = propias[0]?.codGestionRaw ?? ''

    const valor =
      numerador.estado === 'declarado' && denominador.estado === 'declarado'
        ? numerador.valor! / denominador.valor!
        : null

    // Serie propia: un punto por entrega OBTENIDA. Si sólo hay una, la tarjeta
    // no dibuja tendencia — mejor un hueco declarado que una línea de un punto.
    const serie: PuntoSerie[] = aniosDisponibles.map((anio) => {
      const n = resolverCoste(municipio.filas, programa, anio)
      const d = resolverUnidad(municipio.filas, programa, anio, def.denominador)
      const ok = n.estado === 'declarado' && d.estado === 'declarado'
      return {
        anio,
        valor: ok ? n.valor! / d.valor! : null,
        estado: ok ? 'declarado' : n.estado === 'no-se-presta' ? 'no-se-presta' : 'no-declarado',
      }
    })

    // Pares: mismo servicio, MISMO MODO DE GESTIÓN, y sólo los que resuelven
    // sus dos celdas. Comparar una gestión directa con una concesión es el
    // error de categoría que la trampa 1 describe.
    let resumen: ParesResumen | null = null
    const puedeCompararse = valor !== null && MODOS_COMPARABLES.has(modoGestion)
    if (puedeCompararse) {
      // Comparar 2024 contra pares de 2021 sería un error de categoría; si no
      // hay pares de la entrega que titula, no hay banda y punto.
      const miembros: ParMiembro[] = []
      for (const m of pares.miembros) {
        if (m.ine === municipio.ine) continue
        const suyas = pares.filas.filter((f) => f.ine === m.ine)
        const fila = suyas.find((f) => f.programa === programa && f.anio === anioBase)
        if (!fila || fila.modoGestion !== modoGestion) continue
        const n = resolverCoste(suyas, programa, anioBase)
        const d = resolverUnidad(suyas, programa, anioBase, def.denominador)
        if (n.estado !== 'declarado' || d.estado !== 'declarado') continue
        miembros.push({ ...m, valor: n.valor! / d.valor! })
      }
      if (miembros.length >= MIN_PARES) {
        const orden = miembros.map((m) => m.valor).sort((a, b) => a - b)
        resumen = {
          conjunto: pares.conjunto,
          n: miembros.length,
          modoGestion,
          percentil: Math.round((100 * orden.filter((v) => v <= valor!).length) / orden.length),
          p25: percentil(orden, 0.25),
          mediana: percentil(orden, 0.5),
          p75: percentil(orden, 0.75),
          miembros,
        }
      }
    }

    // Una divergencia enorme frente a la mediana casi nunca es una diferencia
    // de gestión: es que cada ayuntamiento rellena la magnitud a su manera.
    // Decirlo debilita la lectura, nunca la refuerza.
    const caveats = [...def.caveats]
    if (resumen && valor !== null && resumen.mediana > 0) {
      const razon = valor / resumen.mediana
      if (razon > DIVERGENCIA_EXTREMA || razon < 1 / DIVERGENCIA_EXTREMA) {
        caveats.push(
          `Esta cifra queda ${razon > 1 ? 'muy por encima' : 'muy por debajo'} de la mediana de sus pares ` +
            `(×${razon.toFixed(1)}). Una diferencia así suele venir de que cada ayuntamiento declara ` +
            `«${def.denominador}» a su manera, no de que el servicio se gestione mejor o peor. ` +
            `El coste y la unidad son los que publica el ministerio; lo que conviene tomar con pinzas ` +
            `es la comparación.`,
        )
      }
    }

    indicadores.push({
      id: `${programa.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-coste-unitario`,
      dimension: 'operativa',
      tier: def.tier,
      servicio: programa,
      etiqueta: def.label,
      numerador,
      denominador,
      valor,
      unidad: def.unidad,
      modoGestion,
      codGestionRaw,
      comparable: resumen !== null,
      pares: resumen,
      serie,
      caveats,
      citas: [{ url: citaUrl, entrega: anioBase }],
    })
  }

  const cuenta = (s: SituacionServicio) => indicadores.filter((i) => situacion(i) === s).length
  const universe: IndicadoresUniverse = {
    serviciosEnRegistro: Object.keys(SERVICIOS).length,
    conRatio: cuenta('con-ratio'),
    enConcesion: cuenta('concesion'),
    sinUnidad: cuenta('sin-unidad'),
    sinCoste: cuenta('sin-coste'),
    noSePresta: cuenta('no-se-presta'),
    comparables: indicadores.filter((i) => i.comparable).length,
    aniosDisponibles,
  }

  return { indicadores, universe }
}
