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
import { programaCe4CasaCon, type Ce4Row, type CesteRow, type ModoGestion } from './coste-efectivo'
import { crearPrng, semillaDesde } from './prng'
import { SERVICIOS, type ServicioDef, type Divisor } from './indicador-registry'
import { medirDeclaracionCongelada } from './declaracion-congelada'

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
  /**
   * Banda plausible del percentil [2,5 %, 97,5 %], por bootstrap sembrado
   * sobre la propia muestra de pares (B = `BOOTSTRAP_B` remuestreos).
   *
   * Con treinta o cincuenta comparables, «percentil 85» aparenta una precisión
   * que la muestra no tiene: quitar tres municipios y volver a mirar puede
   * moverlo diez puestos. La banda dice cuánto. La semilla se deriva de
   * conjunto+programa+entrega, así que la misma entrada produce el mismo
   * intervalo hasta el último dígito — un snapshot que cambia sin que cambie
   * ningún dato es indistinguible de una revisión del ministerio.
   */
  percentilBanda: [number, number]
  p25: number
  mediana: number
  p75: number
  miembros: ParMiembro[]
}

/** Remuestreos del bootstrap del percentil. */
export const BOOTSTRAP_B = 2000

export interface PuntoSerie {
  anio: number
  valor: number | null
  estado: EstadoCelda
  /**
   * Las DOS mitades de la división de esa entrega, no sólo su cociente.
   *
   * El motor las tiene delante en el momento de dividir y no las publicaba, así
   * que «declara la misma cantidad desde 2019 mientras actualiza el coste» sólo
   * se podía afirmar en prosa. Con las dos, la ficha lo ENSEÑA: cinco casillas
   * idénticas debajo de cinco que cambian todos los años. Un lector puede
   * rehacer el cociente y comprobarlo, que es de lo que va esta página.
   */
  numerador?: number
  denominador?: number
  /**
   * La entrega declara la cifra, pero está a órdenes de magnitud de lo que
   * declararon sus pares ESE MISMO año. No se borra —es lo que publica el
   * ministerio— pero se marca, porque una serie con un punto de 67 millones de
   * euros por metro cuadrado no se lee: se descarta entera.
   */
  atipico?: boolean
  /** Mediana de los pares de ese año, que es contra lo que se juzga. */
  medianaPares?: number
  /**
   * El mismo valor en euros constantes del año base, o `null` si no hay índice
   * para ese año.
   *
   * La serie SÓLO se puede leer en términos reales. En corrientes, el 22,8 % de
   * inflación acumulada entre 2014 y 2024 se lee como si fuera gestión:
   * pavimentación aparenta subir un 29 % y sube un 5 %. Y como el denominador
   * de estos cocientes lleva años congelado, sin deflactar había DOS motivos
   * distintos empujando la misma línea, mezclados y sin separar.
   */
  valorReal?: number | null
  /**
   * La mediana de los pares del mismo año, deflactada con el MISMO índice.
   *
   * Si se deflacta la línea propia y no la de comparación, la distancia entre
   * ambas deja de significar nada. Van juntas o no va ninguna.
   */
  medianaParesReal?: number | null
  /**
   * Los cuartiles de la banda de pares de ESE año, con su tamaño. Sólo cuando
   * ese año llega al mínimo de comparables — el mismo umbral que la mediana.
   * Es lo que permite dibujar la banda detrás de la serie: «cerca de la
   * mediana» no dice nada sin saber cuánta anchura tenía el grupo.
   */
  p25Pares?: number
  p75Pares?: number
  nPares?: number
  /** Los mismos cuartiles en euros constantes, con el factor de `valorReal`. */
  p25ParesReal?: number | null
  p75ParesReal?: number | null
  /**
   * El servicio se prestaba ese año bajo OTRO modo de gestión que el que
   * titula la tarjeta (regla 4). El valor se publica —es la cifra oficial—
   * pero la línea no lo une con los años del régimen actual: un coste bajo
   * concesión y uno de gestión directa no son la misma magnitud.
   */
  otroModo?: ModoGestion
}

export interface DeclaracionMagnitud {
  /** Repite el mismo valor en las últimas `MIN_ENTREGAS_CONGELADA` entregas o más. */
  congelada: boolean
  repeticionesFinales: number
  /** Primera entrega del tramo repetido. */
  desde: number | null
  /** Entregas en las que la celda resolvió a un valor positivo. */
  entregas: number
}

/**
 * Con qué frecuencia vuelve el ayuntamiento a MEDIR cada mitad del cociente.
 *
 * Es la pregunta que ninguna guarda de datos puede hacer, porque la cifra
 * publicada resuelve perfectamente a la celda que cita y la celda dice justo
 * eso. Lo que falla es lo que la tarjeta deja entender: si el coste se actualiza
 * cada entrega y la unidad física no, el €/t sube sin que el servicio haya
 * cambiado.
 *
 * `paresCongelados` no es decoración. Sin él la salvedad se lee como «este
 * ayuntamiento es especialmente descuidado», y la mitad de la banda hace lo
 * mismo: la diferencia entre un defecto local y uno de la fuente es la noticia.
 */
export interface DeclaracionIndicador {
  numerador: DeclaracionMagnitud
  denominador: DeclaracionMagnitud
  /** Comparables que también repiten su denominador. */
  paresCongelados: number
  /** Comparables con serie suficiente para poder decirlo. */
  paresMedibles: number
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
  /**
   * El divisor en palabras, copiado del registro.
   *
   * Viaja en el snapshot en vez de resolverse contra `SERVICIOS` en la página
   * porque `unidad` y `caveats` ya viajan así: dos consumidores leyendo el
   * mismo campo de dos sitios distintos es cómo se separan.
   */
  divisor: Divisor
  modoGestion: ModoGestion
  codGestionRaw: string
  comparable: boolean
  pares: ParesResumen | null
  serie: PuntoSerie[]
  /** `null` cuando no hay entregas suficientes para afirmar nada. */
  declaracion: DeclaracionIndicador | null
  caveats: string[]
  /**
   * Un hecho sobre la declaración del ayuntamiento que la ficha enseña SIN
   * plegar. Copiado del registro; ver `ServicioDef.avisoDeclaracion`.
   */
  avisoDeclaracion?: string
  /** Quién presta el servicio concedido, con su expediente. Ver el registro. */
  concesion?: ServicioDef['concesion']
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

/**
 * Cuántas veces la mediana de sus pares tiene que superar (o quedarse por
 * debajo de) una entrega para considerarla un error de declaración.
 *
 * Veinte es deliberadamente generoso: no pretende cazar variación real —un
 * servicio puede duplicarse de precio— sino los errores de orden de magnitud
 * que la fuente trae de fábrica. Riba-roja declara limpieza viaria a 67.676.714
 * €/m² en 2015 y biblioteca a 13.686.406 €/préstamo en 2014; con pares cuya
 * mediana anda por 1 €/m², eso no es una gestión cara, es una casilla mal
 * rellenada.
 *
 * El juicio se ancla en datos externos —los pares de ESE año— y no en la propia
 * serie, que es lo que permite distinguir «este municipio se disparó» de «esta
 * casilla está mal».
 */
export const ATIPICO_FACTOR = 20

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

/** Mediana de los pares que declaran las dos celdas ese año, o null. */
/**
 * La banda de pares de UN año: cuartiles y tamaño, o nada.
 *
 * Devolvía sólo la mediana, y la serie histórica dibujaba una línea de
 * comparación sin decir cuánta anchura tenía el grupo alrededor: estar «cerca
 * de la mediana» significa cosas distintas cuando el rango intercuartílico es
 * estrecho y cuando abarca media escala. Mismo umbral de siempre: por debajo
 * de quince comparables no hay banda, ni mediana, ni nada que se le parezca.
 */
function bandaDePares(
  pares: ConstruirInput['pares'],
  programa: string,
  anio: number,
  atributo: string,
  modoGestion?: ModoGestion,
): { n: number; p25: number; mediana: number; p75: number } | null {
  const vals: number[] = []
  for (const m of pares.miembros) {
    const suyas = pares.filas.filter((f) => f.ine === m.ine)
    if (
      modoGestion &&
      suyas.find((f) => f.programa === programa && f.anio === anio)?.modoGestion !== modoGestion
    ) {
      continue
    }
    const n = resolverCoste(suyas, programa, anio)
    const d = resolverUnidad(suyas, programa, anio, atributo)
    if (n.estado === 'declarado' && d.estado === 'declarado') vals.push(n.valor! / d.valor!)
  }
  if (vals.length < MIN_PARES) return null
  vals.sort((a, b) => a - b)
  return {
    n: vals.length,
    p25: percentil(vals, 0.25),
    mediana: percentil(vals, 0.5),
    p75: percentil(vals, 0.75),
  }
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
  /**
   * Índice de precios medio por año, para expresar la serie en euros
   * constantes del año base. Opcional a propósito: sin él la serie sale sólo en
   * corrientes y `valorReal` viene `null`, que es honesto. Lo que no se hace
   * nunca es rellenarlo con un factor de 1, porque entonces una serie sin
   * deflactar y una deflactada se ven idénticas.
   */
  ipc?: Record<number, number>
  /**
   * Filas de CE4 que sirven a este municipio. Cuando una casa con el programa
   * de un indicador en el año que titula, la tarjeta gana la salvedad de que
   * parte de la función la presta además otro ente — sin ella, el coste
   * municipal se lee como el coste entero de la función.
   */
  supramunicipal?: Ce4Row[]
}

/**
 * Mide la declaración del municipio y la de sus comparables para un programa.
 *
 * Devuelve `null` cuando ninguna de las dos magnitudes propias llega al mínimo
 * de entregas: repetir cifra dos años es normal y marcarlo sería ruido, y el
 * ruido en una salvedad es cómo se consigue que nadie las lea.
 */
function medirDeclaracion(
  propias: CesteRow[],
  paresFilas: CesteRow[],
  programa: string,
): DeclaracionIndicador | null {
  const anios = [...new Set([...propias, ...paresFilas].map((f) => f.anio))].sort((a, b) => a - b)
  const mia = medirDeclaracionCongelada(propias, [programa], anios)
  const num = mia.series.find((s) => s.magnitud === 'coste')
  const den = mia.series.find((s) => s.magnitud === 'unidad')
  if (!num && !den) return null

  const vacia: DeclaracionMagnitud = {
    congelada: false,
    repeticionesFinales: 0,
    desde: null,
    entregas: 0,
  }
  const traducir = (s?: (typeof mia.series)[number]): DeclaracionMagnitud =>
    s
      ? {
          congelada: s.congelada,
          repeticionesFinales: s.repeticionesFinales,
          desde: s.congeladaDesde,
          entregas: s.entregas,
        }
      : vacia

  // Los comparables, medidos con la MISMA función. Un segundo criterio aquí
  // dejaría la salvedad diciendo «la mitad de la banda hace lo mismo» con una
  // definición de «lo mismo» distinta de la que se acaba de aplicar.
  const deLosPares = medirDeclaracionCongelada(paresFilas, [programa], anios).series.filter(
    (s) => s.magnitud === 'unidad',
  )

  return {
    numerador: traducir(num),
    denominador: traducir(den),
    paresCongelados: deLosPares.filter((s) => s.congelada).length,
    paresMedibles: deLosPares.length,
  }
}

/**
 * La salvedad, derivada del dato y no escrita a mano.
 *
 * Tres casos, y decir el equivocado sería una acusación que la fuente no
 * sostiene:
 *
 * - **Sólo el denominador congelado.** El caso grave: el cociente sube sin que
 *   el servicio cambie.
 * - **Las dos magnitudes congeladas.** El cociente no sube; sencillamente es
 *   viejo. Decir lo primero aquí sería falso.
 * - **Sólo el coste congelado.** Raro, y merece constar: el numerador es el que
 *   se quedó atrás.
 */
function caveatDeclaracion(d: DeclaracionIndicador, def: ServicioDef): string | null {
  const conPares =
    d.paresMedibles > 0
      ? ` No es una rareza local: ${d.paresCongelados} de ${d.paresMedibles} municipios comparables ` +
        'hacen lo mismo con esta misma cifra (regla 8).'
      : ' (regla 8).'

  if (d.denominador.congelada && d.numerador.congelada) {
    return (
      `El ayuntamiento no ha actualizado ninguna de las dos cifras de este servicio desde ` +
      `${d.denominador.desde}: ni el coste ni ${def.denominador.toLowerCase()}. El cociente no es ` +
      `de este año, es el de entonces repetido.${conPares}`
    )
  }
  if (d.denominador.congelada) {
    return (
      `El ayuntamiento declara la misma cifra de ${def.denominador.toLowerCase()} desde ` +
      `${d.denominador.desde} —${d.denominador.repeticionesFinales} entregas seguidas— mientras ` +
      `actualizaba el coste en cada una. El cociente puede subir sin que el servicio haya ` +
      `cambiado: nadie ha vuelto a medir el denominador.${conPares}`
    )
  }
  if (d.numerador.congelada) {
    return (
      `El ayuntamiento declara el mismo coste desde ${d.numerador.desde} ` +
      `(${d.numerador.repeticionesFinales} entregas seguidas) aunque sí actualiza la unidad ` +
      `física. Es el numerador el que se quedó atrás.`
    )
  }
  return null
}

/**
 * Factor para pasar un importe de `anio` a euros de `anioBase`.
 *
 * Se aplica **sólo a la serie temporal**. La comparación con pares es siempre
 * de un mismo año contra ese mismo año: deflactarla multiplicaría a todos por
 * la misma constante, no movería ni el percentil ni la posición en la banda, y
 * sólo serviría para que las cifras publicadas dejaran de coincidir con las
 * celdas del ministerio que dicen citar.
 */
function deflactor(
  anio: number,
  anioBase: number,
  ipc: Record<number, number> | undefined,
): number | null {
  if (!ipc) return null
  const origen = ipc[anio]
  const base = ipc[anioBase]
  if (!Number.isFinite(origen) || !Number.isFinite(base) || !origen) return null
  return base / origen
}

/**
 * Banda plausible [2,5 %, 97,5 %] del percentil propio, por bootstrap.
 *
 * Remuestrea la muestra de pares con reemplazo `BOOTSTRAP_B` veces y calcula en
 * cada réplica qué percentil ocuparía el valor propio. No modela nada: la
 * anchura sale de la propia muestra, que es lo único que hay. La semilla es una
 * función del conjunto, el programa y la entrega — reproducible por cualquiera
 * con la misma entrada, sin estado que guardar.
 */
function bandaBootstrap(
  muestraOrdenada: number[],
  valorPropio: number,
  conjunto: string,
  programa: string,
  entrega: number,
): [number, number] {
  const prng = crearPrng(semillaDesde(`${conjunto}:${programa}:${entrega}`))
  const n = muestraOrdenada.length
  const pcts: number[] = []
  for (let b = 0; b < BOOTSTRAP_B; b++) {
    let debajo = 0
    for (let i = 0; i < n; i++) {
      if (muestraOrdenada[prng.entero(n)] <= valorPropio) debajo++
    }
    pcts.push(Math.round((100 * debajo) / n))
  }
  pcts.sort((a, b) => a - b)
  const en = (p: number) => pcts[Math.min(pcts.length - 1, Math.floor(pcts.length * p))]
  return [en(0.025), en(0.975)]
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

    // El modo de gestión es el de la entrega que TITULA, no el de la primera
    // fila del array. Con una sola entrega daban lo mismo; con diez años, el
    // array empieza en 2014 y la limpieza viaria estaba entonces concedida:
    // la tarjeta de 2024 se declaraba concesión y perdía su cociente.
    const propiaBase = propias.find((f) => f.anio === anioBase)
    const modoGestion: ModoGestion = propiaBase?.modoGestion ?? 'sin-clasificar'
    const codGestionRaw = propiaBase?.codGestionRaw ?? ''

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
      const valor = ok ? n.valor! / d.valor! : null
      const punto: PuntoSerie = {
        anio,
        valor,
        estado: ok ? 'declarado' : n.estado === 'no-se-presta' ? 'no-se-presta' : 'no-declarado',
      }
      if (ok) {
        punto.numerador = n.valor!
        punto.denominador = d.valor!
      }
      // El modo de gestión de ESE año, que no tiene por qué ser el que titula:
      // limpieza viaria estuvo concedida antes de 2016 y directa después, y un
      // coste bajo concesión no es la misma magnitud que uno de gestión
      // directa (regla 4). El punto se publica —es la cifra oficial— pero
      // marcado, y la línea no lo une con los años del otro régimen.
      const modoDelAnio = municipio.filas.find(
        (f) => f.anio === anio && f.programa === programa,
      )?.modoGestion
      if (ok && modoDelAnio && modoDelAnio !== modoGestion) punto.otroModo = modoDelAnio
      if (valor !== null) {
        // Los pares del año se filtran al modo de gestión DE ESE AÑO — la
        // regla 4 aplicada verticalmente. Se filtraban sólo en la banda que
        // titula, así que la mediana punteada de los años de concesión de
        // limpieza viaria se calculaba contra municipios de gestión directa:
        // la comparación que la propia página dice no hacer nunca.
        const banda = modoDelAnio
          ? bandaDePares(pares, programa, anio, def.denominador, modoDelAnio)
          : null
        if (banda !== null && banda.mediana > 0) {
          punto.medianaPares = banda.mediana
          punto.p25Pares = banda.p25
          punto.p75Pares = banda.p75
          punto.nPares = banda.n
          const razon = valor / banda.mediana
          if (razon > ATIPICO_FACTOR || razon < 1 / ATIPICO_FACTOR) punto.atipico = true
        } else {
          // Sin banda del mismo modo, la CORDURA (regla 7) puede apoyarse en
          // todos los que declararon ese año: nada de eso se publica como
          // comparación, pero sin este respaldo los 67 millones de €/m² de la
          // limpieza de 2015 —un año de concesión, sin quince concesiones con
          // las que compararse— entrarían en la escala como si fueran un coste.
          const cordura = bandaDePares(pares, programa, anio, def.denominador)
          if (cordura !== null && cordura.mediana > 0) {
            const razon = valor / cordura.mediana
            if (razon > ATIPICO_FACTOR || razon < 1 / ATIPICO_FACTOR) punto.atipico = true
          }
        }
      }
      // Términos reales. La propia y la de comparación se deflactan con el
      // mismo factor y en el mismo sitio, para que no puedan divergir.
      const factor = deflactor(anio, anioBase, input.ipc)
      punto.valorReal = valor !== null && factor !== null ? valor * factor : null
      punto.medianaParesReal =
        punto.medianaPares !== undefined && factor !== null ? punto.medianaPares * factor : null
      punto.p25ParesReal =
        punto.p25Pares !== undefined && factor !== null ? punto.p25Pares * factor : null
      punto.p75ParesReal =
        punto.p75Pares !== undefined && factor !== null ? punto.p75Pares * factor : null
      return punto
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
          percentilBanda: bandaBootstrap(orden, valor!, pares.conjunto, programa, anioBase),
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
            // `toFixed` escribe el punto decimal inglés, y esta frase se publica
            // en /eficiencia al lado de cifras que Intl formatea bien.
            `(×${razon.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}). ` +
            `Una diferencia así suele venir de que cada ayuntamiento declara ` +
            `«${def.denominador}» a su manera, no de que el servicio se gestione mejor o peor. ` +
            `El coste y la unidad son los que publica el ministerio; lo que conviene tomar con pinzas ` +
            `es la comparación (regla 6 de la metodología).`,
        )
      }
    }

    const otrosModos = serie.filter((p) => p.otroModo)
    if (otrosModos.length) {
      const rangos = otrosModos.map((p) => p.anio).join(', ')
      const modos = [...new Set(otrosModos.map((p) => p.otroModo))].join(', ')
      caveats.push(
        `En ${rangos} el servicio se prestaba bajo otro modo de gestión (${modos}): esos años se ` +
          `publican pero la línea no los une con los del régimen actual, porque un coste bajo ` +
          `otro régimen no es la misma magnitud (regla 4).`,
      )
    }

    const atipicas = serie.filter((p) => p.atipico).map((p) => p.anio)
    if (atipicas.length) {
      caveats.push(
        `El ministerio publica cifras inverosímiles para ${atipicas.join(', ')}: se apartan más de ` +
          `${ATIPICO_FACTOR} veces de lo que declararon los municipios comparables ese mismo año. ` +
          `Se muestran porque son las oficiales, pero no se pueden leer como coste (regla 7).`,
      )
    }

    // ── ¿Vuelve alguien a medir esto? ────────────────────────────────────────
    const declaracion = medirDeclaracion(municipio.filas, pares.filas, programa)
    if (declaracion) {
      const frase = caveatDeclaracion(declaracion, def)
      if (frase) caveats.push(frase)
    }

    // ── ¿Presta esta función además un ente supramunicipal? ─────────────────
    // CE4 del año que titula. Sin esta salvedad, el coste municipal se lee
    // como el coste entero de la función — y en promoción del deporte la
    // Mancomunitat Camp de Túria rinde su propia parte.
    const supra = (input.supramunicipal ?? []).find(
      (s) => s.anio === anioBase && programaCe4CasaCon(s.programa, programa),
    )
    if (supra) {
      caveats.push(
        `Parte de esta función la presta además ${supra.entePrincipal}, que rinde su propio ` +
          `coste efectivo: esta cifra es sólo la parte municipal.`,
      )
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
      divisor: def.divisor,
      modoGestion,
      codGestionRaw,
      comparable: resumen !== null,
      pares: resumen,
      serie,
      declaracion,
      caveats,
      ...(def.avisoDeclaracion ? { avisoDeclaracion: def.avisoDeclaracion } : {}),
      ...(def.concesion ? { concesion: def.concesion } : {}),
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
