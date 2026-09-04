// @ts-check
/**
 * El estado de una capa de teselas ajena: `null` | `'cargando'` | `'error'`.
 *
 * Nace para la capa de riesgo de inundación, cuyo WMS del ICV va por HTTP/1.1,
 * sin ninguna cabecera de caché, y —medido el 4-sep-2026— alterna respuestas de
 * 150 ms, de 5-10 s y errores 400. Con un origen así hacen falta las dos cosas:
 * decir que se está esperando, y decir que no ha llegado.
 *
 * Dos reglas, y las dos salieron de medir, no de suponer:
 *
 * 1. **El aviso de carga se demora.** Sin umbral aparecía a los 90 ms y se iba
 *    a los 107 — parpadeo, y encima llamando la atención sobre lo único que iba
 *    rápido. El reloj cuenta desde la PRIMERA tanda y no se reinicia con cada
 *    una: Leaflet dispara `loading` por tanda, y reiniciando, quien lleva diez
 *    segundos esperando no vería nunca el aviso, que es justo a quien va
 *    dirigido.
 *
 * 2. **El veredicto se da al terminar la tanda, no al fallar una tesela.**
 *    Leaflet dispara `load` cuando la tanda acaba AUNQUE sus teselas hayan
 *    fallado, y en ese orden exacto: `loading → tileerror → load`. Decidiendo
 *    en `tileerror`, el error se ponía y `load` lo borraba un instante después;
 *    la capa se quedaba encendida, pintando nada y sin decir nada. Eso está
 *    medido en una traza de consola, y es el motivo de que `falla()` sólo
 *    apunte y sea `termina()` quien dictamine.
 *
 * Vive fuera del componente porque la espera —y el fallo— de un servicio ajeno
 * no se pueden provocar en un navegador, y aquí sí se le adelanta el reloj.
 *
 * @param {(estado: null | 'cargando' | 'error') => void} notificar
 * @param {number} umbralMs
 */
export function creaAvisoDemorado(notificar, umbralMs) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let reloj
  let fallo = false

  return {
    /** Empieza una tanda. Reentrante: no reinicia el reloj ya en marcha. */
    empieza() {
      fallo = false
      if (reloj) return
      reloj = setTimeout(() => {
        reloj = undefined
        notificar('cargando')
      }, umbralMs)
    },
    /** Una tesela de la tanda falló. Sólo lo apunta; no dictamina. */
    falla() {
      fallo = true
    },
    /** La tanda terminó: ahora sí se sabe si hubo fallo. */
    termina() {
      clearTimeout(reloj)
      reloj = undefined
      notificar(fallo ? 'error' : null)
    },
    /** Al desmontar: desarma sin notificar nada. */
    cancela() {
      clearTimeout(reloj)
      reloj = undefined
    },
  }
}
