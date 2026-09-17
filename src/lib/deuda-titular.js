import { CATALOGUE } from '../i18n'
import { rellena } from './formatters'

/**
 * El titular de la deuda viva, en el idioma de la interfaz.
 *
 * `tendenciaDeuda` (scraper/presupuesto-lectura) ya lo escribe, pero en castellano y
 * con sus ordinales y cardinales castellanos dentro del módulo: un módulo del
 * raspador no carga el catálogo. Aquí se compone de los MISMOS campos que ese
 * titular —la dirección del último año y la racha anterior—, con las palabras del
 * catálogo. En castellano escribe exactamente lo que `tendencia.titular`, rama a
 * rama: lo fija `tests/deuda-titular-valencia.test.js`, que es lo que impide que las
 * dos redacciones se separen.
 *
 * @param {{ direccion: 'sube' | 'baja' | 'igual', rachaPrevia: { direccion: string, n: number } | null, ultimo: { ejercicio: number } }} tendencia
 * @param {(clave: string) => string} [t]
 * @returns {string}
 */
export function titularDeuda(tendencia, t = (clave) => CATALOGUE.es[clave] ?? clave) {
  const { direccion, rachaPrevia, ultimo } = tendencia
  const anio = ultimo.ejercicio
  if (direccion === 'igual') return rellena(t('presupuesto.deuda.titular.igual'), { anio })
  if (!rachaPrevia || rachaPrevia.direccion === 'igual') {
    return rellena(
      t(direccion === 'sube' ? 'presupuesto.deuda.titular.sube' : 'presupuesto.deuda.titular.baja'),
      { anio },
    )
  }
  if (rachaPrevia.direccion === direccion) {
    // La racha continúa: el último año es el (n+1)-ésimo en la misma dirección.
    return rellena(
      t(
        direccion === 'sube'
          ? 'presupuesto.deuda.titular.sigueSubiendo'
          : 'presupuesto.deuda.titular.sigueBajando',
      ),
      { ordinal: ordinalDe(t, rachaPrevia.n + 1) },
    )
  }
  if (rachaPrevia.n === 1) {
    return rellena(
      t(
        direccion === 'sube'
          ? 'presupuesto.deuda.titular.bajoYSube'
          : 'presupuesto.deuda.titular.subioYBaja',
      ),
      { anterior: anio - 1, anio },
    )
  }
  return rellena(
    t(
      direccion === 'sube'
        ? 'presupuesto.deuda.titular.bajoAniosYSube'
        : 'presupuesto.deuda.titular.subioAniosYBaja',
    ),
    { cardinal: cardinalDe(t, rachaPrevia.n), anio },
  )
}

/** «segundo», «tercer»…; sin palabra en el catálogo, la cifra con su marca. */
function ordinalDe(t, n) {
  const clave = `presupuesto.deuda.ordinal.${n}`
  const palabra = t(clave)
  return palabra !== clave ? palabra : rellena(t('presupuesto.deuda.ordinal.otro'), { n })
}

/** «dos», «tres»…; sin palabra en el catálogo, la cifra. */
function cardinalDe(t, n) {
  const clave = `presupuesto.deuda.cardinal.${n}`
  const palabra = t(clave)
  return palabra !== clave ? palabra : rellena(t('presupuesto.deuda.cardinal.otro'), { n })
}
