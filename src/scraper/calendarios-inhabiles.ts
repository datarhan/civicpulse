/**
 * Los calendarios de días inhábiles de quien resuelve cada solicitud de acceso.
 *
 * El mes del art. 20 de la Ley 19/2013 se prorroga al primer día hábil siguiente
 * cuando acaba en un día inhábil (art. 30.5 LPACAP), y qué días lo son no es lo
 * mismo para todas las administraciones: cada una fija su calendario «en su
 * respectivo ámbito» (art. 30.7), y su sede lo aplica «atendiendo al ámbito
 * territorial en el que ejerce sus competencias» (art. 31.3). Las solicitudes que
 * publican los reportajes van al Ayuntamiento, a la Generalitat y a dos
 * ministerios, así que no basta con el calendario de la sede de Riba-roja: el
 * 9 de octubre, Día de la Comunitat Valenciana, es inhábil para el Ayuntamiento y
 * para la Generalitat y no lo es para un ministerio en Madrid; el 2 de noviembre
 * de 2026, al revés.
 *
 * QUÉ CALENDARIO ES EL DE CADA UNA. El de la administración que resuelve, en el
 * territorio de la sede de su órgano: las fiestas nacionales, las de su
 * comunidad autónoma y las dos locales de su municipio. Así declara la AGE sus
 * inhábiles, por territorio (BOE-A-2025-23702, apartado segundo: «en todo el
 * territorio nacional», «en el ámbito territorial de las Comunidades Autónomas»
 * y en el de las entidades locales), y así los fijan las sedes que publican el
 * suyo (la Universitat Jaume I, DOGV núm. 9792; la Universidad de Alcalá, BOCM
 * núm. 307 de 2023). La fiesta local de la sede es la dirección prudente: si una
 * sede no la contara, este cálculo daría un día de más, nunca uno de menos.
 *
 * LO QUE NO CUENTA. El art. 30.6 añade los inhábiles del municipio donde reside
 * el interesado, y aquí no se sabe cuál es. El 31.3 lo excluye para lo
 * presentado por registro electrónico, que es lo que afirma un vencimiento; lo
 * enviado por correo se publica ya «contado desde el envío», una fecha que el
 * mes real nunca adelanta.
 *
 * Cada día se copia a mano de la disposición que lo declara y pasa el mismo
 * validador que `FESTIVOS_DE_LA_SEDE` (`problemasDelCalendario`): un año va
 * entero —nacionales, autonómicos y las dos fiestas locales— o no va, y un plazo
 * que acaba en un año que no está no se calcula (falla cerrado).
 *
 * Cambiar este fichero no redespliega el bot: sólo lo leen las páginas.
 */
import {
  FESTIVOS_DE_LA_SEDE,
  type FestivoDeLaSede,
  type FestivosPorAnio,
  type FuenteDelFestivo,
} from './queja-router'

export const CALENDARIOS = [
  'ayuntamiento-de-riba-roja',
  'generalitat-en-valencia',
  'estado-en-madrid',
] as const
export type Calendario = (typeof CALENDARIOS)[number]

/**
 * Cómo se nombra cada calendario al explicar la prórroga, detrás de «el
 * calendario de días inhábiles es el de quien resuelve:».
 */
export const CALENDARIO_ETIQUETA: Record<Calendario, string> = {
  'ayuntamiento-de-riba-roja':
    'el del Ayuntamiento de Riba-roja de Túria (con sus dos fiestas locales)',
  'generalitat-en-valencia':
    'el de la Generalitat (con las fiestas locales de València, donde tienen su sede los órganos que resuelven)',
  'estado-en-madrid':
    'el de la Administración General del Estado en Madrid (donde tienen su sede los ministerios)',
}

// ─── La Generalitat, con sede en València ─────────────────────────────────────

/**
 * Las dos fiestas locales de València, año a año, como las da la resolución de
 * fiestas locales del DOGV, la misma que da las de Riba-roja. Las nacionales y
 * autonómicas son las de la Comunitat, que ya están en `FESTIVOS_DE_LA_SEDE`: no
 * se copian dos veces.
 */
const LOCALES_DE_VALENCIA: Readonly<
  Record<number, readonly Pick<FestivoDeLaSede, 'fecha' | 'nombre'>[]>
> = {
  // DOGV núm. 10238, «VALÈNCIA: 22 de enero, San Vicente Mártir, patrón de la
  // ciudad de València; 13 de abril, San Vicente Ferrer, patrón de la Comunidad
  // Valenciana». La corrección del DOGV núm. 10281 no toca València.
  2026: [
    { fecha: '2026-01-22', nombre: 'San Vicente Mártir' },
    { fecha: '2026-04-13', nombre: 'San Vicente Ferrer' },
  ],
}

/**
 * Por cada año de la sede, sus nacionales y autonómicos y las locales de
 * València, citadas con la misma resolución del DOGV que las de Riba-roja. Un
 * año sin las locales de València no está: falla cerrado, no hereda las de
 * Riba-roja.
 */
function festivosDeLaGeneralitat(): FestivosPorAnio {
  const porAnio: Record<number, FestivoDeLaSede[]> = {}
  for (const [clave, dias] of Object.entries(FESTIVOS_DE_LA_SEDE)) {
    const anio = Number(clave)
    const locales = LOCALES_DE_VALENCIA[anio]
    const fuente = dias.find((f) => f.ambito === 'local')?.fuente
    if (!locales || !fuente) continue
    porAnio[anio] = [
      ...dias.filter((f) => f.ambito !== 'local'),
      ...locales.map((l) => ({ ...l, ambito: 'local' as const, fuente })),
    ]
  }
  return porAnio
}

// ─── La Administración General del Estado, con sede en Madrid ─────────────────

const BOE_INHABILES_AGE_2026: FuenteDelFestivo = {
  disposicion:
    'Resolución de 18 de noviembre de 2025, de la Secretaría de Estado de Función Pública, por la que se establece a efectos de cómputo de plazos, el calendario de días inhábiles en el ámbito de la Administración General del Estado para el año 2026',
  diario: 'BOE núm. 282, de 24 de noviembre de 2025',
  url: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2025-23702',
}

// No las modifican las resoluciones de 15 y 22 de diciembre de 2025 (BOCM núm.
// 309 y núm. 6 de 2026), que cambian otros municipios.
const BOCM_FIESTAS_LOCALES_2026: FuenteDelFestivo = {
  disposicion:
    'Resolución de 2 de diciembre de 2025, de la Dirección General de Trabajo, por la que se declaran las fiestas laborales de ámbito local en la Comunidad de Madrid para el año 2026',
  diario: 'BOCM núm. 296, de 12 de diciembre de 2025',
  url: 'https://www.bocm.es/boletin/CM_Orden_BOCM/2025/12/12/BOCM-20251212-34.PDF',
}

/**
 * Los inhábiles de la AGE en Madrid: los que BOE-A-2025-23702 declara «en todo
 * el territorio nacional» y en la Comunidad de Madrid, y las dos fiestas locales
 * de la capital. Los nombres son los de la relación de fiestas laborales
 * (BOE-A-2025-21667), a la que se sujeta; el BOCM no nombra las locales. Los que
 * caen en sábado o domingo no se escriben, como en la sede: la resolución de la
 * AGE tampoco los lista.
 */
const FESTIVOS_DEL_ESTADO_EN_MADRID: FestivosPorAnio = {
  2026: [
    {
      fecha: '2026-01-01',
      nombre: 'Año Nuevo',
      ambito: 'nacional',
      fuente: BOE_INHABILES_AGE_2026,
    },
    {
      fecha: '2026-01-06',
      nombre: 'Epifanía del Señor',
      ambito: 'nacional',
      fuente: BOE_INHABILES_AGE_2026,
    },
    {
      fecha: '2026-04-02',
      nombre: 'Jueves Santo',
      ambito: 'autonomico',
      fuente: BOE_INHABILES_AGE_2026,
    },
    {
      fecha: '2026-04-03',
      nombre: 'Viernes Santo',
      ambito: 'nacional',
      fuente: BOE_INHABILES_AGE_2026,
    },
    {
      fecha: '2026-05-01',
      nombre: 'Fiesta del Trabajo',
      ambito: 'nacional',
      fuente: BOE_INHABILES_AGE_2026,
    },
    {
      fecha: '2026-05-15',
      nombre: 'fiesta local de Madrid',
      ambito: 'local',
      fuente: BOCM_FIESTAS_LOCALES_2026,
    },
    {
      fecha: '2026-10-12',
      nombre: 'Fiesta Nacional de España',
      ambito: 'nacional',
      fuente: BOE_INHABILES_AGE_2026,
    },
    {
      fecha: '2026-11-02',
      nombre: 'Día siguiente a Todos los Santos',
      ambito: 'autonomico',
      fuente: BOE_INHABILES_AGE_2026,
    },
    {
      fecha: '2026-11-09',
      nombre: 'fiesta local de Madrid',
      ambito: 'local',
      fuente: BOCM_FIESTAS_LOCALES_2026,
    },
    {
      fecha: '2026-12-07',
      nombre: 'Lunes siguiente al Día de la Constitución Española',
      ambito: 'autonomico',
      fuente: BOE_INHABILES_AGE_2026,
    },
    {
      fecha: '2026-12-08',
      nombre: 'Inmaculada Concepción',
      ambito: 'nacional',
      fuente: BOE_INHABILES_AGE_2026,
    },
    {
      fecha: '2026-12-25',
      nombre: 'Natividad del Señor',
      ambito: 'nacional',
      fuente: BOE_INHABILES_AGE_2026,
    },
  ],
}

export const FESTIVOS_POR_CALENDARIO: Record<Calendario, FestivosPorAnio> = {
  'ayuntamiento-de-riba-roja': FESTIVOS_DE_LA_SEDE,
  'generalitat-en-valencia': festivosDeLaGeneralitat(),
  'estado-en-madrid': FESTIVOS_DEL_ESTADO_EN_MADRID,
}

/**
 * Los festivos de un calendario por su nombre. Uno que no existe —o que la fila
 * no dice— no es ninguno: sin él no hay año que valga y el plazo falla cerrado.
 * Caer al de la sede haría que una fila mal escrita heredara los festivos de
 * Riba-roja sin que nada lo dijera.
 */
export function festivosDelCalendario(calendario: unknown): FestivosPorAnio {
  return (CALENDARIOS as readonly unknown[]).includes(calendario)
    ? FESTIVOS_POR_CALENDARIO[calendario as Calendario]
    : {}
}
