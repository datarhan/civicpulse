// @ts-check
/**
 * Las frases de la lectura vecinal del laboratorio (auditoría de las dos
 * lecturas, §24, §25 y §27): una respuesta corta encima de páginas que son,
 * por naturaleza, la lectura experta. Cada una sale de los mismos datos que la
 * página enseña debajo, nunca de una cifra escrita a mano, y ninguna suaviza
 * el aviso de su página: en /laboratorio/coste-esperado va DESPUÉS de «esto no
 * es una nota», no en su lugar.
 */

const NUMEROS = [
  'ninguno',
  'uno',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
]
const enLetra = (/** @type {number} */ n) => NUMEROS[n] ?? n.toLocaleString('es-ES')

/**
 * /lab-health: cuántos ficheros se comprueban, si alguno está atrasado y cuál
 * lleva más tiempo sin cambiar, con su plazo. `tono` es el de la fila en la
 * página (`ok`/`civic` dentro de su plazo, `warn` desactualizado, `crit` sin
 * refresco); `horas`, su edad.
 *
 * @param {{ label: string, tono: string, horas: number }[]} filas
 * @returns {string | null}
 */
export function fraseLabHealth(filas) {
  if (!filas.length) return null
  const atrasados = filas.filter((f) => f.tono === 'warn').length
  const sinRefresco = filas.filter((f) => f.tono === 'crit').length
  let estado
  if (atrasados + sinRefresco === 0) estado = 'ninguno está desactualizado'
  else {
    const partes = []
    if (atrasados)
      partes.push(
        atrasados === 1 ? 'uno está desactualizado' : `${enLetra(atrasados)} están desactualizados`,
      )
    if (sinRefresco)
      partes.push(
        sinRefresco === 1
          ? 'uno lleva sin refrescar'
          : `${enLetra(sinRefresco)} llevan sin refrescar`,
      )
    estado = partes.join(' y ')
  }
  const cuantos =
    filas.length === 1
      ? 'el único fichero de datos del sitio'
      : `los ${filas.length.toLocaleString('es-ES')} ficheros de datos del sitio`
  const primera = `Esta página comprueba, cada vez que se abre, ${cuantos}: ${estado}.`

  const conEdad = filas.filter((f) => Number.isFinite(f.horas))
  if (!conEdad.length) return primera
  const viejo = conEdad.reduce((a, b) => (b.horas > a.horas ? b : a))
  const dias = Math.round(viejo.horas / 24)
  const plazo =
    viejo.tono === 'ok' || viejo.tono === 'civic'
      ? 'y sigue dentro de su plazo'
      : 'y ya ha pasado su plazo'
  return `${primera} El que lleva más tiempo sin cambiar, «${viejo.label}», es de hace ${dias.toLocaleString('es-ES')} ${dias === 1 ? 'día' : 'días'} ${plazo}.`
}

/**
 * /laboratorio/coste-esperado: en cuántos servicios el gasto queda dentro o
 * fuera de la banda del modelo, y cuántos no se pueden comparar. Va justo
 * después de «esto no es una nota, y "dentro de la banda" no es un aprobado».
 *
 * @param {{ estado: string, propia?: { dentroDeLoEsperado: boolean } | null }[]} especificaciones
 * @returns {string | null}
 */
export function respuestaCosteEsperado(especificaciones) {
  const comparables = especificaciones.filter((e) => e.estado === 'publicada' && e.propia)
  const n = comparables.length
  if (!n) return null
  const fuera = comparables.filter((e) => !e.propia?.dentroDeLoEsperado).length
  const sinComparar = especificaciones.length - n
  const banda = 'la banda que el modelo espera para un municipio de su población'
  let frase
  if (fuera === 0)
    frase =
      n === 1
        ? `En el único servicio que se puede comparar, el gasto de Riba-roja cae dentro de ${banda}.`
        : `En los ${n} servicios que se pueden comparar, el gasto de Riba-roja cae dentro de ${banda}.`
  else if (fuera === n)
    frase = `En los ${n} servicios que se pueden comparar, el gasto de Riba-roja queda fuera de ${banda}.`
  else
    frase = `En ${fuera} de los ${n} servicios que se pueden comparar, el gasto de Riba-roja queda fuera de ${banda}; en ${n - fuera === 1 ? 'el otro' : `los otros ${n - fuera}`}, dentro.`
  if (sinComparar === 1) frase += ' Otro no se puede comparar.'
  else if (sinComparar > 1) frase += ` Otros ${sinComparar} no se pueden comparar.`
  return frase
}

/**
 * /laboratorio/cobertura: qué parte de lo extraído de los plenos se ha cotejado
 * con algún dato público. Cuenta filas de extracción, como la página: dos
 * ventanas del extractor pueden recoger la misma frase. Lo que eso NO dice del
 * resto —que no las hace ni falsas ni ciertas— lo dice el aviso de encima.
 *
 * @param {{ total: number, conCorpus: number } | null} resumen
 * @returns {string | null}
 */
export function fraseCobertura(resumen) {
  if (!resumen || resumen.total <= 0) return null
  const de100 = Math.round((100 * resumen.conCorpus) / resumen.total)
  return `De cada 100 filas que el extractor saca de lo dicho en pleno, unas ${de100} se han cotejado con algún dato público.`
}
