/**
 * Qué unidad física divide el coste de cada servicio.
 *
 * Esta tabla se cura a mano y no se descubre, porque CE3 mezcla en la misma
 * columna cantidades, plantillas y CÓDIGOS. `a1621` (recogida de residuos)
 * declara cuatro atributos y uno de ellos es
 * `Periodicidad (1 - DI, 2 - AL, 3 - SE, 4 - QU, 5 - OT, 6 - NO) = 5`: elegir
 * denominador automáticamente podría dividir el gasto anual entre 5 y publicar
 * un coste unitario perfectamente formateado y perfectamente falso.
 *
 * `denominador` tiene que coincidir LITERALMENTE con el texto del atributo tal
 * como lo emite el ministerio, incluidas sus erratas —`Nº préstamos por fondo
 * biblitotecario` viene así— y su puntuación. El parser sólo recorta espacios
 * sobrantes (`Nº puntos de luz  ` llega con dos al final).
 *
 * Los tests importan esta constante en vez de reescribirla: el modo de fallo 1
 * de docs/DATA_INTEGRITY.md fue exactamente una prueba que copiaba a mano la
 * forma que debía comprobar.
 */
import type { Tier } from './indicadores'

/**
 * Bloques temáticos bajo los que la página agrupa las fichas.
 *
 * Son las áreas FUNCIONALES de la propia clasificación por programas del coste
 * efectivo — nunca concejalías de /departamentos: mapear un coste unitario a
 * una concejalía lo pondría a un clic de un concejal con nombre, un salto
 * editorial que el retorno ministerial no hace y esta superficie no puede dar.
 *
 * Cada servicio declara su área aquí, igual que cada indicador municipal
 * declara su `panel`: la agrupación sale del registro, no de una lista a mano
 * en la página que pudiera desviarse.
 */
export const AREAS = {
  seguridad: { etiqueta: 'Seguridad' },
  'medio-urbano': { etiqueta: 'Medio urbano' },
  'agua-residuos': { etiqueta: 'Agua y residuos' },
  'cultura-educacion': { etiqueta: 'Cultura, deporte y educación' },
  'territorio-movilidad': { etiqueta: 'Territorio y movilidad' },
} as const

export type AreaId = keyof typeof AREAS

export interface ServicioDef {
  /** Nombre del servicio en la clasificación por programas. */
  label: string
  /** Texto literal del atributo CE3 que hace de denominador. */
  denominador: string
  /** Cómo se lee el cociente: «€/t», «€/m²». */
  unidad: string
  /** Escalón de Hatry. Ver el tipo `Tier`. */
  tier: Tier
  /** Bloque temático en el que la página presenta la ficha. Ver `AREAS`. */
  area: AreaId
  /** Lo que un lector necesita saber para no malinterpretar el número. */
  caveats: string[]
}

export const SERVICIOS: Record<string, ServicioDef> = {
  a1621: {
    label: 'Recogida de residuos',
    denominador: 'Producción anual residuos urbanos: toneladas',
    unidad: '€/t',
    tier: 'carga',
    area: 'agua-residuos',
    caveats: [
      'La tonelada mide cuánta basura genera el municipio, no lo bien que se recoge: más toneladas no es peor gestión.',
      'La fuente no publica tasa de reciclaje, así que no hay dato de resultado con el que contrastar el coste.',
    ],
  },
  a163: {
    label: 'Limpieza viaria',
    denominador: 'Superficie en metros cuadrados con servicio de limpieza',
    unidad: '€/m²',
    tier: 'output',
    area: 'medio-urbano',
    caveats: ['La superficie es la declarada con servicio, no la superficie total del municipio.'],
  },
  'a171/170P': {
    label: 'Parques y jardines',
    denominador:
      'Superficie: suma en metros cuadrados de la superficie total (tanto la cubierta como al aire libre)',
    unidad: '€/m²',
    tier: 'output',
    area: 'medio-urbano',
    caveats: [
      'Un metro cuadrado de césped y uno de zona pavimentada cuestan distinto de mantener; la fuente no los separa.',
    ],
  },
  'a342/340P': {
    label: 'Instalaciones deportivas',
    denominador: 'Superficie: suma de superficies de todas las instalaciones',
    unidad: '€/m²',
    tier: 'output',
    area: 'cultura-educacion',
    caveats: [
      'La fuente suma en un solo metro cuadrado el pabellón cubierto, la piscina y el campo al aire libre, que no cuestan lo mismo de mantener.',
      'El ministerio declara el mismo coste bajo dos programas (a342/340P y b342/340P); aquí se cuenta una sola vez.',
    ],
  },
  'b341/340P': {
    label: 'Promoción del deporte',
    denominador: 'Nº efectivos en plantilla asignados al servicio',
    unidad: '€/efectivo',
    tier: 'input',
    area: 'cultura-educacion',
    caveats: [
      'Divide el gasto del servicio entre su plantilla propia, así que un programa que se presta con más contratación externa y menos personal propio sale «más caro» por efectivo sin que eso diga nada de cuánto deporte se promueve.',
    ],
  },
  'a1532/150P': {
    label: 'Pavimentación de vías públicas',
    denominador: 'Superficie de los tramos pavimentados (metros cuadrados)',
    unidad: '€/m²',
    tier: 'output',
    area: 'medio-urbano',
    caveats: [
      'Es el gasto de un ejercicio sobre todo el pavimento existente, no el coste de asfaltar un metro nuevo.',
    ],
  },
  'a3321/330P': {
    label: 'Biblioteca pública',
    // La errata «biblitotecario» está en la fuente. Corregirla aquí no
    // encontraría ninguna fila.
    denominador: 'Nº préstamos por fondo biblitotecario',
    unidad: '€/préstamo',
    tier: 'output',
    area: 'cultura-educacion',
    caveats: [
      'El préstamo es sólo uno de los usos de una biblioteca: no cuenta consultas en sala, actividades ni uso de los equipos.',
    ],
  },
  a165: {
    label: 'Alumbrado público',
    denominador: 'Nº puntos de luz',
    unidad: '€/punto de luz',
    tier: 'output',
    area: 'medio-urbano',
    caveats: [
      'Cuenta puntos de luz, no consumo ni potencia: una red renovada y una vieja se cuentan igual.',
    ],
  },
  a164: {
    label: 'Cementerio y servicios funerarios',
    denominador: 'Superficie total del cementerio: metros cuadrados',
    unidad: '€/m²',
    tier: 'output',
    area: 'medio-urbano',
    caveats: [],
  },
  'b151/150P': {
    label: 'Urbanismo: planeamiento y gestión',
    denominador: 'Superficie urbanizada (kilómetros cuadrados)',
    unidad: '€/km²',
    tier: 'carga',
    area: 'territorio-movilidad',
    caveats: [
      'La superficie urbanizada es el territorio que hay que planificar, no un producto del servicio.',
    ],
  },
  'b323/324/320P': {
    label: 'Centros docentes de enseñanza infantil y primaria',
    denominador: 'Superficie en metros cuadrados de los edificios',
    unidad: '€/m²',
    tier: 'carga',
    area: 'cultura-educacion',
    caveats: [
      'El ayuntamiento mantiene los edificios; la enseñanza es competencia autonómica, así que esto no mide resultados educativos.',
    ],
  },
  'b132/130P': {
    label: 'Seguridad y orden público (policía local)',
    denominador: 'Nº efectivos asignados al servicio',
    unidad: '€/efectivo',
    tier: 'input',
    area: 'seguridad',
    caveats: [
      'Coste por efectivo es un PRECIO, no un rendimiento: divide un gasto entre otro gasto. Un cuerpo mejor pagado sale «más caro» sin que eso diga nada de la seguridad.',
    ],
  },
  'a4411/440P': {
    label: 'Transporte colectivo urbano',
    // El divisor natural sería «Nº total de viajeros al año» —un producto de
    // verdad— pero el ayuntamiento lo declara a CERO con 737.000 € de gasto,
    // así que la tarjeta llevaba años bloqueada en null. La misma entrega
    // declara los kilómetros de la red, y 23 de los 60 de la banda también:
    // un €/km es un cociente honesto SI se rotula como carga de red y no como
    // coste por viaje. El cero de viajeros no desaparece: baja a salvedad,
    // porque la anomalía es local — 22 pares sí declaran viajeros.
    denominador: 'Nº total de kms de calzada de la red en trayecto de ida',
    unidad: '€/km',
    tier: 'carga',
    area: 'territorio-movilidad',
    caveats: [
      'El divisor es la longitud de la red, no cuánta gente la usa: la fuente tiene una casilla de viajeros y este ayuntamiento la declara a cero, mientras 22 de sus comparables sí la rellenan.',
    ],
  },
  a161: {
    label: 'Abastecimiento domiciliario de agua potable',
    denominador: 'Longitud de la red: metros lineales',
    unidad: '€/m de red',
    tier: 'output',
    area: 'agua-residuos',
    caveats: [],
  },
  a160: {
    label: 'Alcantarillado',
    denominador: 'Longitud del tramo: metros lineales.',
    unidad: '€/m de red',
    tier: 'output',
    area: 'agua-residuos',
    caveats: [],
  },
}
