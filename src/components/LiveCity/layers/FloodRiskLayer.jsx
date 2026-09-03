// @ts-check
import { WMSTileLayer } from 'react-leaflet'
import { PATRICOVA_FLOOD_LAYER, PATRICOVA_URL } from '../../../lib/patricova'

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
export function FloodRiskLayer() {
  return (
    <WMSTileLayer
      url={PATRICOVA_URL}
      layers={PATRICOVA_FLOOD_LAYER}
      format="image/png"
      transparent={true}
      version="1.3.0"
      opacity={0.5}
      attribution="Generalitat Valenciana · ICV — PATRICOVA"
    />
  )
}
