/**
 * El motor de indicadores: coste ÷ unidad física, y todas las razones para
 * negarse a hacer esa división.
 *
 * Un indicador aquí no es un número, es un registro con procedencia: cada
 * magnitud lleva la dirección de su cifra en coste-efectivo.json
 * (`cesel:2021:CE2:a1621:Econ14`) para que `check:indicadores` pueda comprobar
 * la aritmética igual que `check:citations` comprueba las citas, y cada ficha
 * lleva el documento del ministerio y la hoja, fila y columna en que un lector
 * encuentra esa cifra (`citas`, `procedencia`; src/scraper/cesel-procedencia.ts).
 * Son dos cosas distintas: la dirección tiene la forma del volcado de 2021 para
 * todos los años, y la celda del documento no. En un sitio cuyo contrato entero
 * es que toda afirmación lleva cita, un cociente sin procedencia sería la única
 * cifra publicada sin respaldo.
 *
 * LAS CINCO TRAMPAS QUE ESTE MÓDULO EXISTE PARA PARAR
 *
 *  1. La concesión declara 0 €. El concesionario cobra del recibo, así que
 *     agua y alcantarillado pueden venir a cero con el denominador (metros de
 *     red) ahí puesto. Dividir publicaría «Riba-roja suministra agua gratis,
 *     el más eficiente de la comarca». Ojo al ALCANCE: lo que no se divide es
 *     la casilla vacía, no el modo de gestión. Hasta el 2026-09-02 se
 *     rechazaba toda concesión sin mirar la casilla, y en la entrega de 2024
 *     el ministerio declara 1.898.034,08 € para el agua: eso es un coste, se
 *     divide, y se compara sólo contra otras concesiones.
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
import {
  esGestionPorConcesion,
  programaCe4CasaCon,
  type Ce4Row,
  type CesteRow,
  type ModoGestion,
} from './coste-efectivo'
import { procedenciaCesel, type OrigenEntrega, type Procedencia } from './cesel-procedencia'
import { crearPrng, semillaDesde } from './prng'
import { SERVICIOS, idDeServicio, type ServicioDef, type Divisor } from './indicador-registry'
import { medirDeclaracionCongelada, MIN_ENTREGAS_CONGELADA } from './declaracion-congelada'
import { SALVEDAD_DENOMINADOR_CONGELADO, paresDeclaracionCongelada } from './indicador-lectura'
import { cruzaMediana } from './indicador-areas'
// La etiqueta legible de cada modo, la misma que pinta la ficha. Se publicaba
// la clave interna («(concesion)») en la salvedad del año de otro régimen.
import { GESTION } from '../components/eficiencia/vocabulario.js'

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
  /** El atributo o la fila no aparecen, o su casilla viene vacía: la entrega no trae cifra. */
  | 'ausente'
  /** Vino 0 junto a un gasto real: es «no lo declaré», no una cantidad. */
  | 'cero-sin-declarar'
  /** Varias filas del mismo servicio con costes distintos. */
  | 'filas-duplicadas'
  /** El mismo atributo declarado dos veces con valores distintos. */
  | 'atributo-ambiguo'
  /** Servicio concedido y casilla de coste vacía o a cero: el concesionario cobra del recibo. */
  | 'concesion'
  /**
   * La casilla trae una cifra de relleno —0,01 o 1 € de coste, 0,01 de unidad—,
   * no una medida. Ver `COSTES_SIMBOLICOS`.
   */
  | 'cifra-simbolica'

export interface Magnitud {
  /** `null` siempre que `estado !== 'declarado'`: una celda que no vale no se pinta. */
  valor: number | null
  estado: EstadoCelda
  motivo?: Motivo
  /**
   * La dirección de la cifra en coste-efectivo.json, p. ej.
   * `cesel:2021:CE3:a1621:Producción anual…`. NO es la celda del documento del
   * ministerio —ésa está en `Indicador.citas`—: tiene la forma del volcado
   * nacional para todos los años, y la llevan congelada las fichas firmadas.
   */
  fuente: string
}

export interface ParMiembro {
  ine: string
  nombre: string
  poblacion: number
  valor: number
  /**
   * Fuera de un orden de magnitud respecto a la mediana de su propio grupo.
   *
   * MISMA regla que la de la serie propia (`ATIPICO_FACTOR`), aplicada al otro
   * conjunto: los miembros de un grupo contra la mediana de ese grupo. No es un
   * juicio nuevo, es el mismo juicio con otro sujeto — y por eso reutiliza la
   * constante en vez de estrenar un umbral.
   *
   * Marca, NO descarta: son cifras oficiales, entran en el percentil como
   * cualquier otra y la posición publicada no se mueve ni un puesto. Lo único
   * que cambia es que un reparto que empieza en 831,03 EUR/efectivo deja de
   * presentarse como si su borde fuera una referencia.
   */
  atipico?: boolean
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
  /** Cuántos de `miembros` van marcados `atipico`. Derivado, para que la UI no lo recuente. */
  atipicos: number
  miembros: ParMiembro[]
  /**
   * Los municipios que prestan el servicio del mismo modo y se quedan FUERA del
   * grupo, por motivo. Contados en el bucle que decide quién entra
   * (`motivoFueraDePares`), así que `n` más la suma de esto es el universo del
   * mismo modo. Se publica para que un lector que abra el informe y vea a
   * Aldaia con una cifra sepa por qué no está en la banda.
   */
  fuera: Record<MotivoFueraDePares, number>
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
  /**
   * Ese año había con qué comprobar la cifra: una banda de pares —la de su
   * modo o, sin ella, la de todos los que declararon— con al menos
   * `MIN_PARES` cocientes. Es la condición de la regla 9: sin banda, un error
   * de orden de magnitud no se puede distinguir de un coste.
   *
   * Existe aparte de `medianaPares` porque son cosas distintas. La mediana es
   * una COMPARACIÓN y sólo se publica contra el mismo modo; la comprobación de
   * cordura puede apoyarse en todos. La tendencia de la ficha exigía la
   * mediana, y así transporte publicaba «entre 2021 y 2023» debajo de una cifra
   * de 2024 que había pasado la cordura contra veintiún municipios.
   */
  contrastado?: boolean
  /**
   * La cifra de relleno que trae la casilla cuando la mitad no consta por
   * `cifra-simbolica` (0,01 m² en limpieza viaria 2014). No es `numerador` ni
   * `denominador` —no divide nada—, pero la rejilla de entregas la enseña tal
   * cual: rotular «no declaró esta cifra» una casilla que trae 0,01 sería
   * desmentir a la fuente en sentido contrario.
   */
  rellenoNumerador?: number
  rellenoDenominador?: number
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
  /**
   * Entregas que hacen falta para contar como «serie suficiente». Viaja con el
   * dato para que la ficha diga el umbral sin importar `declaracion-congelada`,
   * que arrastra `xlsx` al navegador.
   */
  minEntregas: number
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
  /**
   * La cita de la cifra que titula: la entrega base, con el documento del que
   * sale y la hoja, fila y columna de cada mitad. Una sola, y siempre la
   * primera: quien lee `citas[0].entrega` lee el año de la cabecera.
   */
  citas: ({ entrega: number } & Procedencia)[]
  /**
   * La de CADA entrega de la serie, agrupadas por documento y celda: la serie
   * mezcla el volcado de 2021 con los informes por comunidad del resto, y cada
   * punto se busca en un sitio distinto. Toda entrega de `serie` está en
   * exactamente un grupo (`check:indicadores`).
   */
  procedencia: ({ entregas: number[] } & Procedencia)[]
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
  'con-ratio' | 'concesion' | 'no-se-presta' | 'sin-unidad' | 'sin-coste'

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

/**
 * Modos que forman un grupo de comparación coherente consigo mismo.
 *
 * NO es «modos en los que el coste lo soporta el ayuntamiento», que es lo que
 * decía mientras el conjunto excluía `concesion`: esa exclusión ya no la hace
 * este conjunto, porque los pares se filtran al MISMO modo de gestión unas
 * líneas más abajo y una concesión sólo se compara contra concesiones. Lo que
 * queda fuera es lo que no puede formar grupo ni consigo mismo: `otra` es el
 * híbrido «+ otra forma de gestión (*)», donde parte del coste está en otro
 * sitio y no en el mismo sitio para dos municipios cualesquiera, y
 * `sin-clasificar` es un fallo del clasificador, no un dato.
 */
const MODOS_COMPARABLES: ReadonlySet<ModoGestion> = new Set<ModoGestion>([
  'directa',
  'concesion',
  'mancomunada',
  'consorciada',
  'convenio',
  'mixta',
])

const fuenteCoste = (anio: number, programa: string) => `cesel:${anio}:CE2:${programa}:Econ14`
const fuenteUnidad = (anio: number, programa: string, atributo: string) =>
  `cesel:${anio}:CE3:${programa}:${atributo}`

/**
 * Cifras de relleno: lo que algunos ayuntamientos escriben en una casilla del
 * coste efectivo que no quieren —o no pueden— dejar vacía. No son medidas.
 *
 * Medido sobre la banda `cv-15k-40k`, 2014–2024, en los servicios del
 * registro: 81 costes de exactamente 0,01 € y 64 de exactamente 1 €; 0,01
 * aparece además como superficie, préstamos, kilómetros o efectivos. El motor
 * sólo rechazaba lo que valía 0 o menos, y así Riba-roja publicaba limpieza
 * viaria a 53 y 67 millones de euros por m² (0,01 m² en 2014 y 2015), y la
 * mediana de promoción del deporte de 2024 contaba a Aldaia y Benetússer con
 * 0,01 efectivos: 161.045 € con ellos, 129.518 € sin ellos.
 *
 * Lo que NO está aquí, a propósito: el 1 como UNIDAD. «1 efectivo» es una
 * plantilla de una persona —catorce municipios de la banda lo declaran en 2024, trece
 * con coste, de 79.777 € a 931.266 €— y «1 km» o «1 m²» no tienen ninguna
 * prueba de ser relleno. Convertirlo en marca sería decidir por el
 * ayuntamiento qué quiso decir; el 1 € de COSTE, en cambio, no puede ser el
 * coste anual de un servicio.
 */
export const COSTES_SIMBOLICOS: readonly number[] = [0.01, 1]
export const UNIDADES_SIMBOLICAS: readonly number[] = [0.01]

const costeSimbolico = (c: number | null) => c !== null && COSTES_SIMBOLICOS.includes(c)

/** El coste resuelto y las filas que lo llevan: la fuente del modo de gestión. */
function costeConFilas(
  filas: CesteRow[],
  programa: string,
  anio: number,
): { magnitud: Magnitud; filasDelCoste: CesteRow[] } {
  const fuente = fuenteCoste(anio, programa)
  const rows = filas.filter((f) => f.programa === programa && f.anio === anio)
  const sin = (motivo?: Motivo, estado: EstadoCelda = 'no-declarado') => ({
    magnitud: { valor: null, estado, ...(motivo ? { motivo } : {}), fuente },
    filasDelCoste: [] as CesteRow[],
  })
  if (!rows.length) return sin('ausente')

  if (rows.every((r) => r.modoGestion === 'no-se-presta')) return sin(undefined, 'no-se-presta')

  // Una cifra de relleno no es un coste, y tampoco un rival de uno: se aparta
  // igual que el 0 (ver `COSTES_SIMBOLICOS`). Si es lo único que hay, la ficha
  // lo dice con su propio motivo, no con el de la casilla vacía.
  const conCifra = (r: CesteRow) => (r.costeTotal ?? 0) > 0 && !costeSimbolico(r.costeTotal)
  const algunRelleno = rows.some(
    (r) => r.modoGestion !== 'no-se-presta' && costeSimbolico(r.costeTotal),
  )

  if (rows.some((r) => r.modoGestion === 'concesion')) {
    // La trampa 1, acotada a lo que la trampa dice. Esto volvía en cuanto veía
    // el modo de gestión, SIN LEER `costeTotal` siquiera, y así una concesión
    // muda y una concesión con cifra salían idénticas: en la entrega de 2024 el
    // ministerio declara 1.898.034,08 € para el agua y 514.318,78 € para el
    // alcantarillado, y las dos se publicaban como si la fuente callara. Un
    // centinela valiendo por dos hechos —«la fuente calla» y «nosotros no
    // dividimos»— es la regla 3 de DATA_INTEGRITY.
    //
    // Lo que se rechaza ahora es la casilla vacía o a cero, que es donde vive
    // «el agua sale gratis». Un coste declarado ES un coste: se divide, y la
    // comparación con pares lo filtra al mismo modo de gestión, así que una
    // concesión nunca se mide contra una gestión directa.
    const declaradas = rows.filter(conCifra)
    if (!declaradas.length) return sin(algunRelleno ? 'cifra-simbolica' : 'concesion')
    // Dos costes positivos distintos son dos afirmaciones rivales, aquí igual
    // que en gestión directa: elegir sería un volado disfrazado de dato.
    if (new Set(declaradas.map((r) => r.costeTotal)).size > 1) return sin('filas-duplicadas')
    return {
      magnitud: { valor: declaradas[0].costeTotal!, estado: 'declarado', fuente },
      filasDelCoste: declaradas,
    }
  }

  // Una fila con coste 0 no es una afirmación rival: es la misma «no lo
  // declaré» que ya se aplica a las unidades de CE3. Parques y jardines viene
  // con 718.015,88 € y 0 €, las dos en gestión directa; tratar el 0 como un
  // segundo dato aplicaría la regla contraria a las dos mitades de este mismo
  // módulo y borraría un servicio de 700 mil euros con buen denominador.
  //
  // Dos costes POSITIVOS distintos sí son dos afirmaciones (a1721 declara
  // 1.964.894,95 y 282.412,19), y ahí no hay forma honesta de elegir.
  const positivas = rows.filter(conCifra)
  if (!positivas.length) {
    // Una casilla vacía (`null` desde el parser) no «viene a cero», que es lo
    // que el texto de `cero-sin-declarar` le dice al lector. Si ninguna fila
    // del servicio trae cifra, lo cierto es que la entrega no la trae.
    const algunCero = rows.some((r) => r.modoGestion !== 'no-se-presta' && r.costeTotal === 0)
    return sin(algunRelleno ? 'cifra-simbolica' : algunCero ? 'cero-sin-declarar' : 'ausente')
  }
  if (new Set(positivas.map((r) => r.costeTotal)).size > 1) return sin('filas-duplicadas')
  return {
    magnitud: { valor: positivas[0].costeTotal!, estado: 'declarado', fuente },
    filasDelCoste: positivas,
  }
}

/**
 * El coste del servicio, o la razón por la que no se puede usar.
 *
 * Nunca «gana la primera fila»: si el ministerio publica dos costes distintos
 * para el mismo programa, los dos son igual de creíbles y elegir sería un
 * volado disfrazado de dato.
 */
export function resolverCoste(filas: CesteRow[], programa: string, anio: number): Magnitud {
  return costeConFilas(filas, programa, anio).magnitud
}

/**
 * El modo de gestión de la fila cuyo coste se usa.
 *
 * El de un par se tomaba de la PRIMERA fila del servicio (`.find`), y hay
 * municipios que traen dos con modos distintos: en parques y jardines de 2024
 * Cullera declara 0 € en «otra forma de gestión» y 47.168,48 € en gestión
 * directa, y Quart de Poblet y Moncada el mismo coste bajo las dos. Quién
 * entraba en el grupo dependía del orden en que el ministerio escribe las
 * filas: el grupo de parques bailaba entre 28 y 31 sin que cambiara un dato.
 *
 * El coste que se divide es de una fila; el modo con el que se compara tiene
 * que ser el de esa misma fila. Si el mismo coste viene bajo dos modos, no hay
 * forma honesta de elegir y el modo queda `ambiguo`. Sin coste utilizable,
 * `modo` es `null`: no hay fila que decida.
 */
export function modoDelCoste(
  filas: CesteRow[],
  programa: string,
  anio: number,
): { modo: ModoGestion | null; ambiguo: boolean } {
  const { filasDelCoste } = costeConFilas(filas, programa, anio)
  const modos = new Set(filasDelCoste.map((f) => f.modoGestion))
  if (modos.size === 1) return { modo: [...modos][0], ambiguo: false }
  return { modo: null, ambiguo: modos.size > 1 }
}

/**
 * El modo con el que se rotula y se compara el servicio PROPIO en una entrega:
 * el de la fila del coste (`modoDelCoste`). Sin coste utilizable, el de la
 * primera fila —una concesión muda sigue siendo una concesión, y la ficha lo
 * tiene que decir—. Con el mismo coste bajo dos modos, `sin-clasificar`, que no
 * se compara con nadie: elegir uno sería el volado que el motor se niega a
 * echar con los costes rivales.
 */
function modoDelProgramaEn(filas: CesteRow[], programa: string, anio: number): ModoGestion {
  const { modo, ambiguo } = modoDelCoste(filas, programa, anio)
  if (modo) return modo
  if (ambiguo) return 'sin-clasificar'
  return (
    filas.find((f) => f.programa === programa && f.anio === anio)?.modoGestion ?? 'sin-clasificar'
  )
}

/** La fila que da el modo de `modoDelProgramaEn`, para leer su cadena literal. */
function filaDelModo(filas: CesteRow[], programa: string, anio: number): CesteRow | undefined {
  const { filasDelCoste } = costeConFilas(filas, programa, anio)
  if (new Set(filasDelCoste.map((f) => f.modoGestion)).size === 1) return filasDelCoste[0]
  return filas.find((f) => f.programa === programa && f.anio === anio)
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
  // Una casilla vacía no es una afirmación: ni cuenta como valor rival de una
  // declarada («0 y 16» es ambiguo; «nada y 16» no) ni pasa por un cero.
  const declarados = valores.flatMap((v) => (v.valor === null ? [] : [v.valor]))
  if (!declarados.length) {
    return { valor: null, estado: 'no-declarado', motivo: 'ausente', fuente }
  }

  const distintos = new Set(declarados)
  if (distintos.size > 1) {
    return { valor: null, estado: 'no-declarado', motivo: 'atributo-ambiguo', fuente }
  }

  const valor = declarados[0]
  if (valor <= 0) {
    return { valor: null, estado: 'no-declarado', motivo: 'cero-sin-declarar', fuente }
  }
  // 0,01 m², 0,01 préstamos, 0,01 efectivos: relleno, no medida. Ver
  // `COSTES_SIMBOLICOS` — y por qué el 1 no está en esta lista.
  if (UNIDADES_SIMBOLICAS.includes(valor)) {
    return { valor: null, estado: 'no-declarado', motivo: 'cifra-simbolica', fuente }
  }
  return { valor, estado: 'declarado', fuente }
}

/**
 * Por qué un par del MISMO modo de gestión se queda fuera del grupo de
 * comparación. Cada motivo se publica con su propio recuento.
 *
 *   sin-coste           la entrega no trae coste utilizable (vacío o a cero)
 *   sin-unidad          trae coste, pero no la magnitud física con que dividirlo
 *   costes-rivales      trae dos costes positivos distintos para el servicio
 *   coste-simbolico     su coste es una cifra de relleno (0,01 o 1 €)
 *   unidad-simbolica    su unidad es una cifra de relleno (0,01)
 *   coste-en-otro-modo  presta el servicio también de este modo, pero el coste
 *                       que se divide está en la fila de otro
 *   modo-ambiguo        trae el mismo coste bajo dos modos de gestión
 *
 * Hasta el 2026-10-19 la ficha restaba el tamaño del grupo del de todos los
 * pares del modo y llamaba al resto «no declaran su coste». En la entrega de
 * 2024 Paiporta declara 1 € para el agua y el alcantarillado con 0 m de red, y
 * la frase la contaba entre los que no declaran coste. Un resto no es un
 * motivo; contado así, cualquier exclusión nueva se habría publicado con la
 * etiqueta de la primera.
 */
export const MOTIVOS_FUERA_DE_PARES = [
  'sin-coste',
  'sin-unidad',
  'costes-rivales',
  'coste-simbolico',
  'unidad-simbolica',
  'coste-en-otro-modo',
  'modo-ambiguo',
] as const
export type MotivoFueraDePares = (typeof MOTIVOS_FUERA_DE_PARES)[number]

/**
 * El motivo por el que un par no entra en el grupo por sus CELDAS, o `null` si
 * las dos valen. El modo de gestión lo decide el bucle, con `modoDelCoste`.
 */
export function motivoFueraDePares(
  numerador: Magnitud,
  denominador: Magnitud,
): MotivoFueraDePares | null {
  if (numerador.estado !== 'declarado') {
    if (numerador.motivo === 'filas-duplicadas') return 'costes-rivales'
    if (numerador.motivo === 'cifra-simbolica') return 'coste-simbolico'
    return 'sin-coste'
  }
  if (denominador.estado !== 'declarado') {
    return denominador.motivo === 'cifra-simbolica' ? 'unidad-simbolica' : 'sin-unidad'
  }
  return null
}

/** «a», «a y b», «a, b y c». */
function enumerar(partes: string[]): string {
  if (partes.length <= 1) return partes.join('')
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

/**
 * Cada motivo de exclusión con su recuento, en palabras. Sin plural a ojo: «1
 * declara», «10 no declaran».
 */
function frasesFueraDePares(fuera: Record<MotivoFueraDePares, number>, divisor: Divisor): string[] {
  const v = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
  const partes: string[] = []
  const k = fuera['sin-coste']
  if (k) partes.push(`${k} no ${k === 1 ? 'declara' : 'declaran'} su coste`)
  const u = fuera['sin-unidad']
  if (u) {
    partes.push(
      `${v(u, 'declara', 'declaran')} un coste pero no una cifra utilizable de ${divisor.plural}`,
    )
  }
  const r = fuera['costes-rivales']
  if (r) partes.push(`${v(r, 'trae', 'traen')} dos costes distintos para el mismo servicio`)
  const cs = fuera['coste-simbolico']
  if (cs) {
    partes.push(`${v(cs, 'declara', 'declaran')} como coste una cifra de relleno (0,01 € o 1 €)`)
  }
  const us = fuera['unidad-simbolica']
  if (us) {
    partes.push(`${v(us, 'declara', 'declaran')} 0,01 ${divisor.plural}, una cifra de relleno`)
  }
  const om = fuera['coste-en-otro-modo']
  if (om) partes.push(`${v(om, 'declara', 'declaran')} su coste bajo otro modo de gestión`)
  const ma = fuera['modo-ambiguo']
  if (ma) partes.push(`${v(ma, 'trae', 'traen')} el mismo coste bajo dos modos de gestión`)
  return partes
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
    // El modo de la fila cuyo coste se divide, no el de la primera fila: con
    // dos filas de modos distintos, el orden del fichero decidía (ver
    // `modoDelCoste`).
    if (modoGestion && modoDelCoste(suyas, programa, anio).modo !== modoGestion) continue
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
  /**
   * De qué documento salió cada entrega (`source.entregas` de
   * coste-efectivo.json, que escribe el adaptador al leerlas). Sustituye a una
   * sola `citaUrl`, que era el volcado de 2021 puesto debajo de cifras de 2024.
   * Una entrega de la serie sin origen hace FALLAR el cálculo: una cita
   * inventada es justo lo que esto existe para no publicar.
   */
  origenes: Record<number, OrigenEntrega>
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
    minEntregas: MIN_ENTREGAS_CONGELADA,
  }
}

/**
 * La salvedad, derivada del dato y no escrita a mano.
 *
 * Tres casos, y decir el equivocado sería una acusación que la fuente no
 * sostiene:
 *
 * - **Sólo el denominador congelado.** El caso grave: el cociente se mueve con
 *   el coste, suba o baje, sin que el servicio tenga por qué haber cambiado.
 * - **Las dos magnitudes congeladas.** El cociente no se mueve; sencillamente es
 *   viejo. Decir lo primero aquí sería falso.
 * - **Sólo el coste congelado.** Raro, y merece constar: el numerador es el que
 *   se quedó atrás.
 */
function caveatDeclaracion(
  d: DeclaracionIndicador,
  def: ServicioDef,
  nComparables: number | null,
): string | null {
  const conPares =
    d.paresMedibles > 0
      ? ` No es una rareza local: ${paresDeclaracionCongelada(d, nComparables)} (regla 10).`
      : ' (regla 10).'

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
      `actualizaba el coste en cada una. ${SALVEDAD_DENOMINADOR_CONGELADO}${conPares}`
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
  const { municipio, pares, origenes } = input
  const aniosDisponibles = [...new Set(municipio.filas.map((f) => f.anio))].sort((a, b) => a - b)
  const sinOrigen = aniosDisponibles.filter((a) => !origenes[a])
  if (sinOrigen.length) {
    throw new Error(
      `[indicadores] sin documento de origen para la(s) entrega(s) ${sinOrigen.join(', ')}: ` +
        'no se publica una cifra con una cita que no sabe de dónde sale',
    )
  }
  const ente = municipio.filas[0]?.ente ?? ''
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
    //
    // Y dentro de esa entrega, el de la fila cuyo coste se divide, por la
    // misma razón que el de los pares (`modoDelProgramaEn`).
    const propiaBase = filaDelModo(municipio.filas, programa, anioBase)
    const modoGestion: ModoGestion = modoDelProgramaEn(municipio.filas, programa, anioBase)
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
      // Cada mitad por su cuenta, no sólo cuando las dos salen. El punto sólo
      // las llevaba si había cociente, así que una entrega en la que el
      // ayuntamiento declaró los metros de red y no el coste salía idéntica a
      // una en la que no declaró nada — y la rejilla de la ficha la rotulaba
      // «rindió la entrega, no declaró este servicio» sobre las dos filas, con
      // 268.530 m declarados en la fuente. El mismo centinela de dos hechos que
      // arregló `declaradoNoComparable`, una capa más abajo.
      //
      // `valor` sigue exigiendo las dos: un cociente a medias no existe.
      if (n.estado === 'declarado') punto.numerador = n.valor!
      if (d.estado === 'declarado') punto.denominador = d.valor!
      if (n.motivo === 'cifra-simbolica') {
        const r = propias.find((f) => f.anio === anio && costeSimbolico(f.costeTotal))
        if (r) punto.rellenoNumerador = r.costeTotal!
      }
      if (d.motivo === 'cifra-simbolica') {
        const u = propias
          .filter((f) => f.anio === anio)
          .flatMap((f) => f.unidades)
          .find((x) => x.atributo === def.denominador && x.valor !== null)
        if (u) punto.rellenoDenominador = u.valor!
      }
      // El modo de gestión de ESE año, que no tiene por qué ser el que titula:
      // limpieza viaria estuvo concedida antes de 2016 y directa después, y un
      // coste bajo concesión no es la misma magnitud que uno de gestión
      // directa (regla 4). El punto se publica —es la cifra oficial— pero
      // marcado, y la línea no lo une con los años del otro régimen.
      const modoDelAnio = propias.some((f) => f.anio === anio)
        ? modoDelProgramaEn(municipio.filas, programa, anio)
        : undefined
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
          punto.contrastado = true
          punto.medianaPares = banda.mediana
          punto.p25Pares = banda.p25
          punto.p75Pares = banda.p75
          punto.nPares = banda.n
          const razon = valor / banda.mediana
          if (razon > ATIPICO_FACTOR || razon < 1 / ATIPICO_FACTOR) punto.atipico = true
        } else {
          // Sin banda del mismo modo, la CORDURA (regla 9) puede apoyarse en
          // todos los que declararon ese año: nada de eso se publica como
          // comparación, pero sin este respaldo los 67 millones de €/m² de la
          // limpieza de 2015 —un año de concesión, sin quince concesiones con
          // las que compararse— entrarían en la escala como si fueran un coste.
          const cordura = bandaDePares(pares, programa, anio, def.denominador)
          if (cordura !== null && cordura.mediana > 0) {
            punto.contrastado = true
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
    // Los pares del mismo modo que se quedan fuera, por motivo. Se cuentan en
    // el MISMO bucle que decide quién entra, para que la frase que los nombra
    // no pueda describir otro universo que el del percentil.
    const fuera = Object.fromEntries(MOTIVOS_FUERA_DE_PARES.map((k) => [k, 0])) as Record<
      MotivoFueraDePares,
      number
    >
    const puedeCompararse = valor !== null && MODOS_COMPARABLES.has(modoGestion)
    if (puedeCompararse) {
      // Comparar 2024 contra pares de 2021 sería un error de categoría; si no
      // hay pares de la entrega que titula, no hay banda y punto.
      const miembros: ParMiembro[] = []
      for (const m of pares.miembros) {
        if (m.ine === municipio.ine) continue
        const suyas = pares.filas.filter((f) => f.ine === m.ine)
        // Candidato: alguna de sus filas presta el servicio de este modo. Se
        // miraba sólo la PRIMERA, y con dos filas de modos distintos el orden
        // del fichero decidía quién era comparable (ver `modoDelCoste`).
        const delModo = suyas.some(
          (f) => f.programa === programa && f.anio === anioBase && f.modoGestion === modoGestion,
        )
        if (!delModo) continue
        const n = resolverCoste(suyas, programa, anioBase)
        const d = resolverUnidad(suyas, programa, anioBase, def.denominador)
        let motivo = motivoFueraDePares(n, d)
        if (!motivo) {
          // Las celdas valen; falta que el coste que se divide sea de ESTE modo.
          const { modo, ambiguo } = modoDelCoste(suyas, programa, anioBase)
          if (ambiguo) motivo = 'modo-ambiguo'
          else if (modo !== modoGestion) motivo = 'coste-en-otro-modo'
        }
        if (motivo) {
          fuera[motivo] += 1
          continue
        }
        miembros.push({ ...m, valor: n.valor! / d.valor! })
      }
      if (miembros.length >= MIN_PARES) {
        const orden = miembros.map((m) => m.valor).sort((a, b) => a - b)
        const mediana = percentil(orden, 0.5)
        // Los bordes del grupo, marcados por la MISMA regla que ya juzga la
        // serie propia. La ficha los enseñaba como suelo y techo del reparto sin
        // marca ninguna: en policía local eso ponía 831,03 EUR/efectivo —que no
        // puede ser el coste anual de un agente— con el rótulo «p0», o sea
        // prestándole a un dato suelto la autoridad de un cuantil.
        //
        // Se marca DESPUÉS de calcular `orden`, y `orden` no se filtra: el
        // percentil, la banda y los cuartiles salen de los mismos miembros que
        // antes y ninguna cifra publicada se mueve. Excluirlos sería otra
        // decisión, más fuerte y no tomada — son cifras oficiales, y este panel
        // no descarta lo que el ministerio publica.
        let atipicos = 0
        if (mediana > 0) {
          for (const m of miembros) {
            if (m.valor <= 0) continue
            const razon = m.valor / mediana
            if (razon > ATIPICO_FACTOR || razon < 1 / ATIPICO_FACTOR) {
              m.atipico = true
              atipicos += 1
            }
          }
        }
        resumen = {
          conjunto: pares.conjunto,
          n: miembros.length,
          modoGestion,
          percentil: Math.round((100 * orden.filter((v) => v <= valor!).length) / orden.length),
          percentilBanda: bandaBootstrap(orden, valor!, pares.conjunto, programa, anioBase),
          p25: percentil(orden, 0.25),
          mediana,
          p75: percentil(orden, 0.75),
          atipicos,
          miembros,
          fuera,
        }
      }
    }

    // Una divergencia enorme frente a la mediana casi nunca es una diferencia
    // de gestión: es que cada ayuntamiento rellena la magnitud a su manera.
    // Decirlo debilita la lectura, nunca la refuerza.
    const caveats = [...def.caveats]

    // ── El cociente de una concesión no mide lo mismo que el de un servicio
    // propio, y eso no cabe dentro del número ────────────────────────────────
    //
    // Se publica desde el 2026-09-02, y estas dos frases son la condición de
    // que se publique. La primera dice de quién es el dinero: sin ella la fila
    // se lee igual que la de un servicio pagado con impuestos, cuando lo que
    // hay debajo es el recibo de cada casa. La segunda acota el grupo: los
    // pares son las concesiones que RELLENAN la casilla, no las que tienen el
    // servicio concedido, y un percentil sobre una muestra autoseleccionada
    // presentado como si fuera el universo es la misma clase de afirmación que
    // el centinela `Otro` de DATA_INTEGRITY.
    //
    // Derivadas del dato, no escritas a mano: los dos recuentos salen del
    // volcado en cada pase, así que no pueden quedarse viejos cuando el
    // ministerio publique otra entrega.
    //
    // La primera frase es de la CONCESIÓN, no de la clase `concesion`: la
    // clase junta también el concierto y la gestión interesada para poder
    // compararlos, y de un concierto —el ayuntamiento paga a una empresa por
    // prestar el servicio— es falso que lo cobre un concesionario del recibo.
    // Por eso se pregunta a la cadena del ministerio (`esGestionPorConcesion`).
    const concesionPropia = esGestionPorConcesion(codGestionRaw)
    if (modoGestion === 'concesion' && valor !== null) {
      caveats.push(
        concesionPropia
          ? 'Este servicio está concedido: el coste que el ayuntamiento declara no sale de su ' +
              'presupuesto —lo cobra el concesionario del recibo de cada casa—, así que este cociente ' +
              'dice lo que cuesta el servicio, no lo que el ayuntamiento gasta en él. Por eso sólo se ' +
              'compara con otras concesiones.'
          : `Este servicio se presta en gestión indirecta («${codGestionRaw}»), no por el propio ` +
              'ayuntamiento: por eso sólo se compara con otros servicios prestados en concesión, ' +
              'concierto o gestión interesada, nunca con los de gestión directa.',
      )
      if (resumen) {
        // COMPARABLES, sin contar a Riba-roja, que es la misma cuenta que la
        // ficha rotula arriba («n=30») y la que titula la tira de percentiles.
        // Con el municipio propio dentro salía «31 de 42» al lado de un «n=30»,
        // dos universos distintos en la misma tarjeta sin decir en qué se
        // diferencian: lo señaló la revisión lectora del 2026-09-02, y tenía
        // razón — un lector no puede saber si él mismo está o no en la cifra.
        //
        // Cada motivo con su recuento, contado en el bucle que forma el grupo
        // (`motivoFueraDePares`). La frase decía «N no declaran su coste» con
        // N = todos los que no entraban, y en 2024 uno de ellos —Paiporta—
        // declara coste y lo que le falta es la red.
        const partes = frasesFueraDePares(fuera, def.divisor)
        const total = resumen.n + MOTIVOS_FUERA_DE_PARES.reduce((s, k) => s + fuera[k], 0)
        if (partes.length) {
          caveats.push(
            `De los ${total} municipios comparables que también tienen este servicio ` +
              `${concesionPropia ? 'concedido' : 'en concesión, concierto o gestión interesada'}, ` +
              `${enumerar(partes)}: sin un coste y una unidad utilizables no hay cociente con el ` +
              `que compararse, así que el percentil se calcula contra los ${resumen.n} ` +
              'restantes. El grupo lo forman los que declaran coste y unidad, no todos los que hay.',
          )
        }
      }
    }
    // Fuera de la concesión, la ficha no contaba a quién deja fuera, y desde
    // el 2026-10-19 hay exclusiones que un lector no puede adivinar: abre el
    // informe, ve a Aldaia con una cifra en la casilla de efectivos y no la
    // encuentra en la banda. Los que dejan la casilla vacía no necesitan
    // explicación —no hay nada que dividir—; los que escriben algo, sí.
    if (resumen && !(modoGestion === 'concesion' && valor !== null)) {
      const partes = frasesFueraDePares({ ...fuera, 'sin-coste': 0, 'sin-unidad': 0 }, def.divisor)
      if (partes.length) {
        caveats.push(
          'Prestan el servicio del mismo modo y rellenan la casilla, pero quedan fuera del grupo ' +
            `de comparación: ${enumerar(partes)}. El percentil se calcula contra los ` +
            `${resumen.n} que declaran un coste y una unidad utilizables de este modo.`,
        )
      }
    }
    if (resumen && valor !== null && resumen.mediana > 0) {
      const razon = valor / resumen.mediana
      // Sólo la PROSA mira la banda; `DIVERGENCIA_EXTREMA` sigue bajando la
      // confianza en `indicador-desviacion.ts` igual que antes. Con una
      // dispersión ancha, la mitad de la mediana puede caer en mitad del grupo:
      // en pavimentación (×0,5) el percentil es 44 y su banda, 30–58. Decir
      // «muy por debajo» al lado de «no se distingue del grupo» era la ficha
      // desmintiéndose (revisión lectora del 05-10-2026). Sin banda (`null`)
      // la frase se queda: una salvedad que sobra debilita, una que falta no.
      const divergeEnLaPosicion = cruzaMediana(resumen) !== true
      if (divergeEnLaPosicion && (razon > DIVERGENCIA_EXTREMA || razon < 1 / DIVERGENCIA_EXTREMA)) {
        caveats.push(
          `Esta cifra queda ${razon > 1 ? 'muy por encima' : 'muy por debajo'} de la mediana de sus pares ` +
            // `toFixed` escribe el punto decimal inglés, y esta frase se publica
            // en /eficiencia al lado de cifras que Intl formatea bien.
            `(×${razon.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}). ` +
            `Una diferencia así suele venir de que cada ayuntamiento declara ` +
            `«${def.denominador}» a su manera, no de que el servicio se gestione mejor o peor. ` +
            `El coste y la unidad son los que publica el ministerio; lo que conviene tomar con pinzas ` +
            `es la comparación (regla 8 de la metodología).`,
        )
      }
    }

    const otrosModos = serie.filter((p) => p.otroModo)
    if (otrosModos.length) {
      const rangos = otrosModos.map((p) => p.anio).join(', ')
      // La etiqueta de la ficha («concesión»), no la clave interna («concesion»).
      const modos = [...new Set(otrosModos.map((p) => p.otroModo!))]
        .map((m) => GESTION[m]?.label ?? m)
        .join(', ')
      caveats.push(
        `En ${rangos} el servicio se prestaba bajo otro modo de gestión (${modos}): esos años se ` +
          `publican pero la línea no los une con los del régimen actual, porque un coste bajo ` +
          `otro régimen no es la misma magnitud (regla 4).`,
      )
    }

    // Los números de regla son los de la lista publicada en
    // /metodologia#reglas-eficiencia. Citaban 6, 7 y 8 desde que el 24-08-2026
    // se insertaron dos reglas por delante (la escala fija y la banda que cruza
    // la mediana) y nadie movió las citas: la ficha remitía a una regla que
    // decía otra cosa. Son la 8, la 9 y la 10.
    const atipicas = serie.filter((p) => p.atipico).map((p) => p.anio)
    if (atipicas.length) {
      // Decía «El ministerio publica cifras inverosímiles», y no es lo que pasa:
      // el ministerio publica las dos casillas —en transporte, una red de
      // 204.834 «km» que son metros— y lo inverosímil es el COCIENTE, que es
      // nuestro. Atribuirle al ministerio una cifra que no publica es la misma
      // clase de error que citar un documento que no la contiene.
      caveats.push(
        `Al dividir las dos casillas de ${atipicas.join(', ')} sale una cifra inverosímil: se ` +
          `aparta más de ${ATIPICO_FACTOR} veces de lo que da la misma división en los municipios ` +
          `comparables ese mismo año. Las casillas son las que publica el ministerio y se ` +
          `enseñan; el cociente no se puede leer como coste (regla 9).`,
      )
    }

    // ── ¿Vuelve alguien a medir esto? ────────────────────────────────────────
    const declaracion = medirDeclaracion(municipio.filas, pares.filas, programa)
    if (declaracion) {
      const frase = caveatDeclaracion(declaracion, def, resumen?.n ?? null)
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

    // ── De dónde sale cada cifra ────────────────────────────────────────────
    // La cita titula con la entrega base; cada punto de la serie, con la suya.
    // Agrupadas por documento y celda: diez entregas de dos documentos son dos
    // citas, no diez copias de la misma.
    const donde = (anio: number) =>
      procedenciaCesel(anio, origenes[anio], { programa, atributo: def.denominador, ente })
    const procedencia: Indicador['procedencia'] = []
    for (const anio of aniosDisponibles) {
      const p = donde(anio)
      const igual = procedencia.find(
        (g) =>
          g.url === p.url &&
          g.documento === p.documento &&
          g.coste === p.coste &&
          g.unidad === p.unidad,
      )
      if (igual) igual.entregas.push(anio)
      else procedencia.push({ entregas: [anio], ...p })
    }

    indicadores.push({
      id: idDeServicio(programa),
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
      citas: [{ entrega: anioBase, ...donde(anioBase) }],
      procedencia,
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
