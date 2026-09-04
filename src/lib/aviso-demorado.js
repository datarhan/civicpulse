// @ts-check
/**
 * Un aviso de «cargando» que sólo habla si la espera se nota.
 *
 * Nace para la capa de riesgo de inundación, cuyo WMS ajeno va por HTTP/1.1 y
 * sin ninguna cabecera de caché: cada encendido vuelve a pedirlo todo. Entre el
 * clic y la primera trama no pasaba nada visible, y cualquier lentitud se leía
 * como que el botón no funciona.
 *
 * El retardo es la mitad del asunto. Sin él, en una conexión rápida el aviso
 * aparecía a los 90 ms y se iba a los 107 — medido —, que es parpadeo y no
 * información. Con él, quien va rápido no ve nada y quien espera sabe por qué.
 *
 * Vive fuera del componente por una razón concreta: la espera larga de un
 * servicio ajeno no se puede provocar en un navegador, y aquí sí se puede
 * adelantar el reloj y comprobarla.
 *
 * @param {(cargando: boolean) => void} notificar
 * @param {number} umbralMs
 */
export function creaAvisoDemorado(notificar, umbralMs) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let reloj

  return {
    /** Empieza una carga. Reentrante: Leaflet dispara `loading` por tanda. */
    empieza() {
      if (reloj) return
      reloj = setTimeout(() => {
        reloj = undefined
        notificar(true)
      }, umbralMs)
    },
    /** Terminó (bien o mal): retira el aviso y desarma el reloj. */
    acaba() {
      clearTimeout(reloj)
      reloj = undefined
      notificar(false)
    },
    /** Al desmontar: desarma sin notificar nada. */
    cancela() {
      clearTimeout(reloj)
      reloj = undefined
    },
  }
}
