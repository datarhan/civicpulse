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

/**
 * El divisor dicho en la lengua de un vecino.
 *
 * `denominador` es el texto de FORMULARIO del ministerio —«Nº efectivos
 * asignados al servicio»— y sirve para encontrar la fila, no para leerla. El
 * lector recibía sólo su símbolo: «81.965 €/efectivo · 4.262.162 € ÷ 52
 * efectivo». «Efectivo» es jerga de plantilla policial, no está explicada en
 * ninguna parte de la página, y colisiona con el «coste EFECTIVO» del título,
 * que significa otra cosa. Lo mismo con «€/km²» (¿qué kilómetros cuadrados?) y
 * «€/m de red».
 *
 * Se cura y no se deriva, por dos razones que la aritmética no puede resolver:
 * «punto de luz» pluraliza el núcleo y no la cola, y sobre todo QUÉ cuenta cada
 * atributo es conocimiento sobre la fuente —los m² de limpieza viaria son los
 * declarados con servicio, no los del municipio— que no está en su nombre.
 */
export interface Divisor {
  /** Una unidad, tal como se lee tras «por cada»: «efectivo», «tonelada». */
  singular: string
  /** Varias, tal como se leen tras la cifra: «52 efectivos», «4.514 puntos de luz». */
  plural: string
  /** Qué cuenta exactamente, sin jerga. Va entre rayas dentro de la frase. */
  glosa: string
}

export interface ServicioDef {
  /** Nombre del servicio en la clasificación por programas. */
  label: string
  /** Texto literal del atributo CE3 que hace de denominador. */
  denominador: string
  /** El mismo denominador, en palabras que un vecino entienda. Ver `Divisor`. */
  divisor: Divisor
  /** Cómo se lee el cociente: «€/t», «€/m²». */
  unidad: string
  /** Escalón de Hatry. Ver el tipo `Tier`. */
  tier: Tier
  /** Bloque temático en el que la página presenta la ficha. Ver `AREAS`. */
  area: AreaId
  /** Lo que un lector necesita saber para no malinterpretar el número. */
  caveats: string[]
  /**
   * Un hecho sobre lo que el ayuntamiento DECLARÓ, que no puede ir plegado.
   *
   * Las `caveats` viven dentro del desplegable «Serie completa y salvedades»,
   * que es el sitio correcto para una advertencia de lectura: quien quiera
   * afinar, la abre. Pero algunas de esas frases no son advertencias de
   * lectura, son hechos sobre la rendición de cuentas — que la fuente traiga
   * una casilla de viajeros y este ayuntamiento la ponga a cero mientras 22 de
   * sus comparables la rellenan no es un matiz del cociente, es la noticia—.
   * Plegado, se leía una vez y se saltaba nueve.
   *
   * La regla es la misma que ya gobierna la chapa de «cantidad sin remedir»:
   * lo que el ayuntamiento hizo o dejó de hacer con su declaración se enseña;
   * lo interpretativo se pliega.
   */
  avisoDeclaracion?: string
  /**
   * Quién presta el servicio cuando está concedido, y con qué contrato.
   *
   * Sólo para las fichas que el panel no puede calcular por concesión. La
   * celda vacía no se explica sin decir a quién se le paga: es la diferencia
   * entre «aquí falta un dato» y «aquí el dinero no cruza los libros del
   * ayuntamiento porque lo cobra otro directamente del recibo».
   *
   * Se cura A MANO y contra el expediente, no contra `tenders.json`. Ese
   * snapshot trae el mismo expediente DOS VECES con estados que se contradicen
   * —`revoked` como licitación, `awarded` como contrato— porque son dos tablas
   * distintas de Gobierto, y quien lea la primera publicará un estado falso.
   * Cada campo de aquí está contrastado contra la ficha de PLACSP que enlaza
   * `url`. Ver `tests/tenders-colision-id.test.ts`.
   *
   * Nada de estado VIVO: fechas y cifras de la adjudicación, que son
   * históricas y no se mueven. Si el contrato se formaliza mañana, esto sigue
   * siendo cierto — que es justo lo que no pasaría con un «pendiente de
   * formalizar» congelado en un registro.
   */
  concesion?: {
    /** Razón social de la adjudicataria, literal del expediente. */
    adjudicataria: string
    /** Valor estimado del contrato por todo su plazo, en euros. */
    importe: number
    /** Fecha de adjudicación, ISO. */
    adjudicadaEl: string
    /** Último día del plazo, ISO. */
    hasta: string
    /** Cuántas ofertas concurrieron. */
    ofertas: number
    /** Ficha del expediente en la Plataforma de Contratación del Estado. */
    url: string
    /** Lo que el expediente cuenta y una fecha sola no. */
    nota: string
  }
}

export const SERVICIOS: Record<string, ServicioDef> = {
  a1621: {
    label: 'Recogida de residuos',
    denominador: 'Producción anual residuos urbanos: toneladas',
    divisor: {
      singular: 'tonelada',
      plural: 'toneladas',
      glosa: 'las toneladas de basura que el municipio generó en todo el año',
    },
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
    divisor: {
      singular: 'm²',
      plural: 'm²',
      glosa:
        'los metros cuadrados de vía pública que el ayuntamiento declara con servicio de limpieza',
    },
    unidad: '€/m²',
    tier: 'output',
    area: 'medio-urbano',
    caveats: ['La superficie es la declarada con servicio, no la superficie total del municipio.'],
  },
  'a171/170P': {
    label: 'Parques y jardines',
    denominador:
      'Superficie: suma en metros cuadrados de la superficie total (tanto la cubierta como al aire libre)',
    divisor: {
      singular: 'm²',
      plural: 'm²',
      glosa:
        'los metros cuadrados de parques y jardines que declara mantener, cubiertos y al aire libre',
    },
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
    divisor: {
      singular: 'm²',
      plural: 'm²',
      glosa: 'los metros cuadrados que suman entre todas las instalaciones deportivas municipales',
    },
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
    divisor: {
      singular: 'efectivo',
      plural: 'efectivos',
      glosa: 'las personas en plantilla municipal asignadas a promover el deporte',
    },
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
    divisor: {
      singular: 'm²',
      plural: 'm²',
      glosa: 'los metros cuadrados de calzada y acera ya pavimentados que hay que conservar',
    },
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
    divisor: {
      singular: 'préstamo',
      plural: 'préstamos',
      glosa: 'los libros y documentos que los vecinos se llevaron prestados durante el año',
    },
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
    divisor: {
      singular: 'punto de luz',
      plural: 'puntos de luz',
      glosa:
        'las farolas y demás puntos de luz que el ayuntamiento tiene encendidos en la vía pública',
    },
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
    divisor: {
      singular: 'm²',
      plural: 'm²',
      glosa: 'los metros cuadrados que ocupa el recinto del cementerio municipal',
    },
    unidad: '€/m²',
    tier: 'output',
    area: 'medio-urbano',
    caveats: [],
  },
  'b151/150P': {
    label: 'Urbanismo: planeamiento y gestión',
    denominador: 'Superficie urbanizada (kilómetros cuadrados)',
    divisor: {
      singular: 'km²',
      plural: 'km²',
      glosa: 'los kilómetros cuadrados de suelo ya urbanizado que hay que planificar y gestionar',
    },
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
    divisor: {
      singular: 'm²',
      plural: 'm²',
      glosa:
        'los metros cuadrados construidos de los colegios públicos cuyo edificio mantiene el ayuntamiento',
    },
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
    divisor: {
      singular: 'efectivo',
      plural: 'efectivos',
      glosa: 'los agentes y demás personal en plantilla asignados a la policía local',
    },
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
    divisor: {
      singular: 'km de red',
      plural: 'km de red',
      glosa:
        'los kilómetros de recorrido que suman las líneas de autobús urbano, contados sólo de ida',
    },
    unidad: '€/km',
    tier: 'carga',
    area: 'territorio-movilidad',
    caveats: [],
    // Sube de `caveats` a la vista: no es un matiz de cómo se lee el cociente,
    // es lo que el ayuntamiento dejó sin declarar teniendo casilla para ello.
    //
    // DE DÓNDE SALE EL 22, porque no se puede recotejar contra lo que
    // publicamos: `scrape-coste-efectivo` PODA las unidades de los pares y deja
    // sólo el denominador del registro (`podar`, para no triplicar el peso de un
    // fichero que se sirve entero). La evidencia vive en el libro del ministerio,
    // no en `coste-efectivo.json`. Recontado contra `.cache/cesel/ccaa` el
    // 23-08-2026: de los 56 comparables con fila de transporte en la entrega de
    // 2024, 22 declaran viajeros distintos de cero. Tres de esos 22 declaran 1, 1
    // y 18 viajeros al año, que no pueden ser recuentos reales: por eso la frase
    // dice «la rellenan» y no «tienen ese número de viajeros».
    //
    // Riba-roja sí la rellenó: 155.624 en 2015 y 2016, 120.000 en 2017 y 2018.
    // Va a cero desde la entrega de 2019.
    avisoDeclaracion:
      'El divisor es la longitud de la red, no cuánta gente la usa: la fuente tiene una casilla de viajeros y este ayuntamiento la declara a cero, mientras 22 de sus comparables sí la rellenan.',
  },
  a161: {
    label: 'Abastecimiento domiciliario de agua potable',
    denominador: 'Longitud de la red: metros lineales',
    divisor: {
      singular: 'm de red',
      plural: 'm de red',
      glosa: 'los metros de tubería que suma la red de agua potable del municipio',
    },
    unidad: '€/m de red',
    tier: 'output',
    area: 'agua-residuos',
    caveats: [],
    concesion: {
      adjudicataria: 'HIDRAQUA, Gestión Integral de Aguas de Levante, S.A.',
      importe: 55685178.79,
      adjudicadaEl: '2026-08-06',
      hasta: '2043-07-27',
      ofertas: 7,
      url: 'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=pK1YW0Z3femXQV0WE7lYPw%3D%3D',
      nota: 'El expediente se anunció en abril de 2019 y estuvo suspendido —con dos recursos ante el TACRC de por medio— hasta que en abril de 2026 recayó sentencia. La adjudicación llegó en agosto de 2026, siete años después del anuncio.',
    },
  },
  a160: {
    label: 'Alcantarillado',
    denominador: 'Longitud del tramo: metros lineales.',
    divisor: {
      singular: 'm de red',
      plural: 'm de red',
      glosa: 'los metros de colector que suma la red de alcantarillado del municipio',
    },
    unidad: '€/m de red',
    tier: 'output',
    area: 'agua-residuos',
    caveats: [],
    // Mismo expediente que a161: la concesión es conjunta —agua potable,
    // alcantarillado, control de vertidos y depuración en un solo contrato—.
    concesion: {
      adjudicataria: 'HIDRAQUA, Gestión Integral de Aguas de Levante, S.A.',
      importe: 55685178.79,
      adjudicadaEl: '2026-08-06',
      hasta: '2043-07-27',
      ofertas: 7,
      url: 'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=pK1YW0Z3femXQV0WE7lYPw%3D%3D',
      nota: 'El expediente se anunció en abril de 2019 y estuvo suspendido —con dos recursos ante el TACRC de por medio— hasta que en abril de 2026 recayó sentencia. La adjudicación llegó en agosto de 2026, siete años después del anuncio.',
    },
  },
}
