// @ts-check
import { useEffect, useRef } from 'react'
import { WMSTileLayer } from 'react-leaflet'
import { PATRICOVA_FLOOD_LAYER, PATRICOVA_URL } from '../../../lib/patricova'
import { creaAvisoDemorado } from '../../../lib/aviso-demorado'

// El servicio y el número de capa viven en `src/lib/patricova.js`, junto al
// título que ese número debe tener. El aviso que había aquí —«los ids de
// ArcGIS pueden correrse al republicar, vuelve a mirar GetCapabilities si la
// capa sale en blanco»— resultó ser exacto y no sirvió de nada, porque nadie
// vuelve a mirar. Ahora lo mira `npm run check:wms` todas las noches.

/**
 * Official flood-risk overlay. Semi-transparent so the base map + money bubbles
 * stay legible; rendered only while toggled on (no tiles fetched otherwise).
 * Ties the DANA recovery spend in the money layer to the mapped risk zones.
 */
/**
 * Cuánto puede tardar la trama antes de que valga la pena decirlo. Medido: en
 * una conexión rápida el aviso aparecía a los 90 ms y se iba a los 107, que es
 * parpadeo y no información.
 */
const UMBRAL_AVISO_MS = 250

export function FloodRiskLayer({ onCargando }) {
  // El retardo vive en `lib/aviso-demorado` y no aquí porque la espera larga de
  // un servicio ajeno no se puede provocar en un navegador; allí sí se le
  // adelanta el reloj y se comprueba.
  const aviso = useRef(null)
  if (!aviso.current) aviso.current = creaAvisoDemorado((v) => onCargando?.(v), UMBRAL_AVISO_MS)
  useEffect(() => () => aviso.current?.cancela(), [])

  return (
    <WMSTileLayer
      url={PATRICOVA_URL}
      layers={PATRICOVA_FLOOD_LAYER}
      format="image/png"
      transparent={true}
      version="1.3.0"
      opacity={0.5}
      attribution="Generalitat Valenciana · ICV — PATRICOVA"
      // Una petición en vez de cuatro. El servicio va por HTTP/1.1 —medido— así
      // que el navegador sólo abre seis conexiones a ese host, y encima no manda
      // NINGUNA cabecera de caché (ni Cache-Control, ni ETag, ni Expires): cada
      // encendido, cada arrastre y cada zoom vuelven a pedirlo entero. Pedir
      // teselas de 512 con `zoomOffset={-1}` cubre lo mismo con la misma
      // resolución y una cuarta parte de los viajes, que es además menos carga
      // para un servicio público que nos deja usarlo gratis.
      tileSize={512}
      zoomOffset={-1}
      // Sin esto, arrastrar el mapa dispara peticiones a mitad del gesto que se
      // tiran al soltar. Con un origen que no cachea nada, eso es tráfico
      // regalado.
      updateWhenIdle={true}
      eventHandlers={{
        loading: () => aviso.current.empieza(),
        load: () => aviso.current.acaba(),
        // Si el servicio falla, el aviso NO puede quedarse encendido: diría
        // «cargando» sobre algo que ya no va a llegar.
        tileerror: () => aviso.current.acaba(),
      }}
    />
  )
}
