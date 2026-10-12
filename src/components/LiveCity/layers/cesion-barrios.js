// @ts-check
import { useMemo, useState } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { barriosBajoElPin, barriosQueCeden } from '../../../lib/barrios-bajo-pines'

/**
 * El lado Leaflet de `lib/barrios-bajo-pines`: proyecta barrios y pines a píxeles al
 * zoom actual y dice qué puntos de barrio ceden el toque al pin de debajo.
 *
 * Lo usan tres capas —barrios, dinero y obras— con la misma lista de pines, que
 * arma StylizedMap, así que las tres sacan el mismo conjunto: el punto que cede y
 * el pin cuya ficha lleva a su barrio no pueden discrepar. Basta recalcular al
 * cambiar de zoom: desplazar el mapa no cambia ninguna distancia en píxeles.
 */

/** @typedef {{ id: string, name: string, centroid: [number, number] }} Barrio */
/** @typedef {{ point: [number, number], radio: number }} Pin */

/** El zoom del mapa, al terminar cada cambio. */
function useZoom() {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  return zoom
}

/**
 * @param {Barrio[] | undefined} barrios  `geo.neighborhoods`
 * @param {Pin[]} pines  los pines del dinero y de las obras que se pintan ahora
 */
export function useCesionBarrios(barrios, pines) {
  const map = useMap()
  const zoom = useZoom()
  return useMemo(() => {
    /** @param {[number, number]} p */
    const enPantalla = (p) => map.project(p, zoom)
    const puntos = (barrios || []).map((b) => {
      const { x, y } = enPantalla(b.centroid)
      return { ...b, x, y }
    })
    const ceden = barriosQueCeden(
      puntos,
      pines.map((p) => ({ ...enPantalla(p.point), radio: p.radio })),
    )
    return {
      ceden,
      /** Los barrios que ceden bajo este pin, para el enlace de su ficha. @param {Pin} pin */
      bajoElPin: (pin) =>
        barriosBajoElPin({ ...enPantalla(pin.point), radio: pin.radio }, puntos, ceden),
    }
  }, [map, zoom, barrios, pines])
}

/** Abre la ficha de un barrio desde la ficha de un pin: el globo de su marcador. */
export function useAbreBarrio() {
  const map = useMap()
  /** @param {Barrio} barrio */
  return (barrio) => {
    map.eachLayer((capa) => {
      if (
        capa instanceof L.Marker &&
        capa.getElement()?.classList.contains('cp-osm-neigh') &&
        capa.getLatLng().equals(barrio.centroid)
      )
        capa.openPopup()
    })
  }
}
