// @ts-check
/**
 * Curated town-centre coordinates for the comarca municipalities that appear in
 * the ADL job feed. REAL coordinates only — a municipality without an entry is
 * dropped from the map (honest miss, never a fabricated point). Keyed by the
 * exact `detail.municipio` string the portal emits; add a row when a new town
 * shows up in the feed.
 *
 * @type {Record<string, [number, number]>}
 */
export const COMARCA_COORDS = {
  'Riba-roja de Túria': [39.5439, -0.5711],
  Paterna: [39.5028, -0.4406],
  "Eliana (l')": [39.5758, -0.53],
  Cheste: [39.4919, -0.6839],
  Vilamarxant: [39.5686, -0.6172],
  Chiva: [39.4708, -0.7181],
  Paiporta: [39.4278, -0.4181],
  'San Antonio de Benagéber': [39.5931, -0.5089],
  Puig: [39.5892, -0.3033],
  Carlet: [39.2264, -0.5222],
  Loriguilla: [39.47, -0.5386],
  'Pobla de Vallbona (la)': [39.5892, -0.5486],
  Valencia: [39.4699, -0.3763],
}
