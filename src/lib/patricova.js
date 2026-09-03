// @ts-check
/**
 * La capa oficial de riesgo de inundación, en un solo sitio.
 *
 * PATRICOVA — Pla d'Acció Territorial de caràcter sectorial sobre prevenció del
 * Risc d'Inundació a la Comunitat Valenciana. WMS de la Generalitat / ICV.
 *
 * **El identificador numérico se mueve.** El ICV republicó el servicio y la
 * capa de riesgo dejó de ser la 59 para ser la 60; el mapa llevaba desde
 * entonces pidiendo una capa que ya no existe. Lo que hace que eso no se note
 * es que el servicio no falla — medido sobre el término el 3-sep-2026:
 *
 *     layers=59  →  HTTP 200 · image/png ·  2.198 B  (imagen en blanco)
 *     layers=60  →  HTTP 200 · image/png · 14.924 B  (la llanura de inundación)
 *
 * Por eso el número vive aquí junto al TÍTULO que debe tener, y `check:wms`
 * comprueba contra el servicio vivo que sigan correspondiéndose. Resolver el
 * número en cada carga saldría más caro que el problema: GetCapabilities son
 * 112 KB para averiguar un entero.
 */

export const PATRICOVA_URL =
  'https://carto.icv.gva.es/arcgis/services/tm_infraestructuras/ordenacion_territorial/MapServer/WMSServer'

/** Capa «Riesgo de Inundación | Risc d'inundació | Flood risk». */
export const PATRICOVA_FLOOD_LAYER = '60'
