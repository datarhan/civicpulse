import { useEffect } from 'react'
import { useMap } from 'react-leaflet'

/**
 * Encaja la vista cada vez que el contenedor cambia de tamaño, y no deja
 * alejarse más. Al montarse desde `lazy`, el contenedor aún medía cero:
 * `fitBounds` sobre una caja vacía cae al zoom máximo, y el mapa salía a 30 m
 * de escala. Un ResizeObserver espera a que mida algo, y vuelve a encajar si
 * cambia el ancho (el móvil al girar).
 *
 * Lo comparten los mapas de las piezas —«matrículas y móviles» y
 * «reconstrucción DANA»—, los dos cargados perezosos.
 *
 * @param {{ bounds: [[number, number], [number, number]], padding?: number }} props
 */
export default function EncajeMapa({ bounds, padding = 12 }) {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    const encaja = () => {
      if (!el.clientWidth || !el.clientHeight) return
      map.invalidateSize()
      map.setMinZoom(0)
      map.fitBounds(bounds, { padding: [padding, padding], animate: false })
      map.setMinZoom(map.getZoom())
    }
    encaja()
    const ro = new ResizeObserver(encaja)
    ro.observe(el)
    return () => ro.disconnect()
  }, [map, bounds, padding])
  return null
}
