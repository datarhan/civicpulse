// @ts-check
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

/**
 * Encuadra UNA vez los puntos que recibe, para que ninguno quede fuera de la vista.
 *
 * El encuadre de partida centra el casco y puede cortar la franja sur, y Leaflet no
 * pinta un círculo fuera de la vista: un pin cortado desaparece sin que nada lo
 * delate. Si algún punto cae fuera, `fitBounds` a todos, con margen y sin acercar
 * nunca. Una sola vez por montaje, y a propósito no vuelve a encuadrar cuando
 * cambian los filtros o la línea de tiempo: un mapa que salta es peor que un
 * encuadre quieto.
 *
 * Tiene que haber uno por mapa. El dinero situado y las obras montaban cada uno el
 * suyo, en cuanto llegaba su instantánea, y el segundo medía la vista del primero a
 * mitad de su animación: el mapa acababa a zoom 11 o a zoom 12 según el orden de
 * llegada. En la CI de #39 cayó a 12, y a 375×629 una estación de Riba-roja quedó
 * bajo la pila de controles. StylizedMap le pasa la unión de los dos puntos cuando
 * han llegado las dos instantáneas.
 */
export function FitToPins({ points }) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || !points.length) return
    fitted.current = true
    const bounds = L.latLngBounds(points)
    if (!map.getBounds().contains(bounds)) {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: map.getZoom() })
    }
  }, [map, points])
  return null
}
