/**
 * «Otras lecturas» del agua de Riba-roja: lo que han publicado terceros sobre
 * ella, junto al resultado de la tarjeta de abastecimiento.
 *
 * Lista curada a mano, en código para que cada alta pase por revisión. Dos
 * reglas:
 *
 *  1. **Se dice de dónde sacan el dato.** Ninguna de las publicaciones de hoy
 *     tomó muestras propias: leen los boletines que los gestores notifican a
 *     SINAC, los mismos que aquí. Presentarlas como «análisis independientes»
 *     daría a entender una segunda medición que no existe. Si algún día llega
 *     una con muestras propias, `base` lo dirá y la frase cambia sola.
 *  2. **«Coincide» se comprueba, no se escribe.** Cada lectura señala el
 *     boletín al que se refiere (red y fecha) y `cotejarLectura` lo busca en
 *     nuestro archivo de SINAC. Si no está —la página rota y el archivo empieza
 *     el 22-10-2026—, la tarjeta dice que no lo encontramos, no que coincide.
 *
 * Cita: el fragmento entrecomillado es literal de la publicación, comprobado
 * el 22-10-2026; corto a propósito (la de Ecologistas en Acción es CC BY-NC-SA
 * y la de DATADISTA, © sin licencia abierta: se cita y se enlaza, no se copia).
 */
import type { Boletin } from './sinac'

export interface LecturaAgua {
  quien: string
  titulo: string
  fecha: string
  url: string
  /** Literal de la publicación. */
  cita: string
  /** De dónde sale su dato: hoy, siempre los boletines de SINAC. */
  base: 'sinac' | 'muestras-propias'
  /** El boletín de nuestro archivo al que se refiere. */
  refiere: { red: string; fecha: string }
}

export const OTRAS_LECTURAS_AGUA: readonly LecturaAgua[] = [
  {
    quien: 'Ecologistas en Acción',
    titulo: 'Bebiendo mierda',
    fecha: 'junio de 2026',
    url: 'https://www.ecologistasenaccion.org/wp-content/uploads/2026/06/informe-contaminacion-por-nitratos-agua-potable.pdf',
    cita: 'Riba Roja 6. Residencia Entre Naranjos',
    base: 'sinac',
    refiere: { red: 'ENTRE NARANJOS', fecha: '2024-06-19' },
  },
  {
    quien: 'DATADISTA',
    titulo: 'El agua de tu pueblo (infoagua.es)',
    fecha: 'consultado el 22-10-2026',
    url: 'https://infoagua.es/agua-de-tu-pueblo/valencia/riba-roja-de-turia/',
    cita: 'Incumple por nitratos en 1 de 6 redes',
    base: 'sinac',
    refiere: { red: 'ENTRE NARANJOS', fecha: '2024-06-19' },
  },
]

/** Lo que la tarjeta pinta de cada lectura. */
export interface LecturaCotejada {
  quien: string
  titulo: string
  fecha: string
  url: string
  cita: string
  /** De dónde saca el dato, en palabras. */
  base: string
  /** Qué dice nuestro archivo del boletín al que se refiere. */
  cotejo: string
  coincide: boolean
}

const CONTEXTO: Record<string, string> = {
  'Ecologistas en Acción':
    'la lista en su «Anexo I: localidades afectadas por contaminación de nitratos de su agua potable por encima del límite legal en 2024»',
  DATADISTA: 'lo resume así en su ficha del municipio',
}

/**
 * Busca en el archivo el boletín al que se refiere la lectura: red cuyo nombre
 * contiene `refiere.red`, misma fecha de toma, calificado «no apta».
 */
export function cotejarLectura(
  l: LecturaAgua,
  agua: { redes: { idRed: number; nombre: string }[]; boletines: Boletin[] },
): LecturaCotejada {
  const redes = agua.redes.filter((r) => r.nombre.toUpperCase().includes(l.refiere.red))
  const b = agua.boletines.find(
    (x) =>
      redes.some((r) => r.idRed === x.idRed) &&
      x.fecha === l.refiere.fecha &&
      x.calificacion === 'no-apta',
  )
  const fecha = l.refiere.fecha.split('-').reverse().join('-')
  const nitrato = b?.parametros?.find((p) => p.nombre === 'Nitrato')?.valor
  return {
    quien: l.quien,
    titulo: l.titulo,
    fecha: l.fecha,
    url: l.url,
    cita: `«${l.cita}»${CONTEXTO[l.quien] ? ` — ${CONTEXTO[l.quien]}` : ''}`,
    base:
      l.base === 'sinac'
        ? 'No tomó muestras propias: lee los boletines que el gestor notifica a SINAC, los mismos que se publican aquí.'
        : 'Tomó muestras propias, distintas de los boletines oficiales.',
    cotejo: b
      ? `En nuestro archivo de SINAC, esa red tiene un análisis «no apta» del ${fecha}` +
        (typeof nitrato === 'number' ? ` con ${nitrato} mg/L de nitrato` : '') +
        ': coincide.'
      : `No encontramos en nuestro archivo de SINAC el boletín del ${fecha} al que se refiere ` +
        '(la consulta pública sólo enseña los últimos, y el archivo empieza el 22-10-2026).',
    coincide: !!b,
  }
}
