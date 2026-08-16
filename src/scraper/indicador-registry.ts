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

export interface ServicioDef {
  /** Nombre del servicio en la clasificación por programas. */
  label: string
  /** Texto literal del atributo CE3 que hace de denominador. */
  denominador: string
  /** Cómo se lee el cociente: «€/t», «€/m²». */
  unidad: string
  /** Escalón de Hatry. Ver el tipo `Tier`. */
  tier: Tier
  /** Lo que un lector necesita saber para no malinterpretar el número. */
  caveats: string[]
}

export const SERVICIOS: Record<string, ServicioDef> = {
  a1621: {
    label: 'Recogida de residuos',
    denominador: 'Producción anual residuos urbanos: toneladas',
    unidad: '€/t',
    tier: 'carga',
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
    caveats: ['La superficie es la declarada con servicio, no la superficie total del municipio.'],
  },
  'a171/170P': {
    label: 'Parques y jardines',
    denominador:
      'Superficie: suma en metros cuadrados de la superficie total (tanto la cubierta como al aire libre)',
    unidad: '€/m²',
    tier: 'output',
    caveats: [
      'Un metro cuadrado de césped y uno de zona pavimentada cuestan distinto de mantener; la fuente no los separa.',
    ],
  },
  'a342/340P': {
    label: 'Instalaciones deportivas',
    denominador: 'Superficie: suma de superficies de todas las instalaciones',
    unidad: '€/m²',
    tier: 'output',
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
    caveats: [
      'Divide el gasto del servicio entre su plantilla propia, así que un programa que se presta con más contratación externa y menos personal propio sale «más caro» por efectivo sin que eso diga nada de cuánto deporte se promueve.',
    ],
  },
  'a1532/150P': {
    label: 'Pavimentación de vías públicas',
    denominador: 'Superficie de los tramos pavimentados (metros cuadrados)',
    unidad: '€/m²',
    tier: 'output',
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
    caveats: [
      'El préstamo es sólo uno de los usos de una biblioteca: no cuenta consultas en sala, actividades ni uso de los equipos.',
    ],
  },
  a165: {
    label: 'Alumbrado público',
    denominador: 'Nº puntos de luz',
    unidad: '€/punto de luz',
    tier: 'output',
    caveats: [
      'Cuenta puntos de luz, no consumo ni potencia: una red renovada y una vieja se cuentan igual.',
    ],
  },
  a164: {
    label: 'Cementerio y servicios funerarios',
    denominador: 'Superficie total del cementerio: metros cuadrados',
    unidad: '€/m²',
    tier: 'output',
    caveats: [],
  },
  'b151/150P': {
    label: 'Urbanismo: planeamiento y gestión',
    denominador: 'Superficie urbanizada (kilómetros cuadrados)',
    unidad: '€/km²',
    tier: 'carga',
    caveats: [
      'La superficie urbanizada es el territorio que hay que planificar, no un producto del servicio.',
    ],
  },
  'b323/324/320P': {
    label: 'Centros docentes de enseñanza infantil y primaria',
    denominador: 'Superficie en metros cuadrados de los edificios',
    unidad: '€/m²',
    tier: 'carga',
    caveats: [
      'El ayuntamiento mantiene los edificios; la enseñanza es competencia autonómica, así que esto no mide resultados educativos.',
    ],
  },
  'b132/130P': {
    label: 'Seguridad y orden público (policía local)',
    denominador: 'Nº efectivos asignados al servicio',
    unidad: '€/efectivo',
    tier: 'input',
    caveats: [
      'Coste por efectivo es un PRECIO, no un rendimiento: divide un gasto entre otro gasto. Un cuerpo mejor pagado sale «más caro» sin que eso diga nada de la seguridad.',
    ],
  },
  'a4411/440P': {
    label: 'Transporte colectivo urbano',
    denominador: 'Nº total de viajeros al año',
    unidad: '€/viajero',
    tier: 'output',
    caveats: [],
  },
  a161: {
    label: 'Abastecimiento domiciliario de agua potable',
    denominador: 'Longitud de la red: metros lineales',
    unidad: '€/m de red',
    tier: 'output',
    caveats: [],
  },
  a160: {
    label: 'Alcantarillado',
    denominador: 'Longitud del tramo: metros lineales.',
    unidad: '€/m de red',
    tier: 'output',
    caveats: [],
  },
}
