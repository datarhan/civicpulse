// @ts-check
import { WMSTileLayer } from 'react-leaflet'

// PATRICOVA — Pla d'Acció Territorial de caràcter sectorial sobre prevenció del
// Risc d'Inundació a la Comunitat Valenciana. Official Generalitat Valenciana /
// ICV WMS. Layer 59 = "Riesgo de Inundación / Risc d'inundació / Flood risk"
// (confirmed via GetCapabilities; the service offers EPSG:3857, Leaflet's
// default). ArcGIS numeric layer ids can shift on republish — re-check with
// GetCapabilities if the overlay ever renders blank.
const PATRICOVA_URL =
  'https://carto.icv.gva.es/arcgis/services/tm_infraestructuras/ordenacion_territorial/MapServer/WMSServer'
export const PATRICOVA_FLOOD_LAYER = '59'

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
