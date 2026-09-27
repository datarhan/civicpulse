/**
 * Dónde cae un punto: en un barrio, en el término pero en ninguno, fuera del
 * término, o sin datos para decirlo. Puro: recibe geo.json ya leído.
 *
 * Lo usa el bot de quejas para guardar el barrio de una ubicación
 * (bot/src/services/neighborhoods.ts), y /metodologia imprime su radio: por eso
 * vive aquí y no en bot/. No importa nada, y tiene que seguir así: los workflows
 * del bot se disparan por las rutas que bot/src importa directamente
 * (`tests/bot-despliegue.test.js`), no por las que éstas importan a su vez.
 *
 * Hasta el 2026-09-27 el bot tomaba el centroide más cercano a menos de 2 km
 * sin mirar el término. El propio Ajuntament caía en
 * `poligono-industrial-entrevias`, a 1.752 m, porque el casco —donde vive la
 * mayor parte del pueblo— no tiene centroide en geo.json: sus barrios son los
 * lugares que OSM nombra dentro del término (urbanizaciones, polígonos,
 * caseríos). Y un punto de otro municipio se atribuía a la urbanización más
 * próxima. Un fallo honesto es mejor que un pin equivocado, la misma regla que
 * `place-resolver.ts`: el casco sale `sin-barrio`, y los mapas de quejas dicen
 * cuántas sitúan.
 */

/**
 * Como mucho a esta distancia de su centroide se atribuye un punto a un barrio.
 *
 * Los barrios de geo.json son compactos, y seiscientos metros cubren su núcleo.
 * El radio de cada uno es además la mitad de la distancia a su centroide más
 * cercano, para que dos vecinos no se disputen un punto: medido el 2026-09-27,
 * esa distancia va de 305 m a 3,4 km.
 */
export const RADIO_MAXIMO_M = 600

/** Qué se puede decir de un punto. Quien lo necesite lo importa; no lo repite. */
export const SITUACIONES = ['barrio', 'sin-barrio', 'fuera-del-termino', 'sin-geo'] as const
export type Situacion = (typeof SITUACIONES)[number]

export type Situado =
  | { situacion: 'barrio'; slug: string; metros: number }
  | { situacion: 'sin-barrio' }
  | { situacion: 'fuera-del-termino' }
  | { situacion: 'sin-geo' }

interface Barrio {
  slug: string
  centroid: [number, number]
}

/** Lo que se lee de geo.json: el término y los centroides de sus barrios. */
export interface GeoBarrios {
  boundary?: { polygon?: [number, number][] }
  neighborhoods?: Barrio[]
}

function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const la1 = toRad(a[0])
  const la2 = toRad(b[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Punto en polígono por rayos. El polígono va en [lat, lng], como en geo.json. */
function dentroDe(poligono: [number, number][], lat: number, lng: number): boolean {
  let dentro = false
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [yi, xi] = poligono[i]
    const [yj, xj] = poligono[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro
  }
  return dentro
}

const radios = new WeakMap<Barrio[], Map<string, number>>()

function radiosDe(barrios: Barrio[]): Map<string, number> {
  const hechos = radios.get(barrios)
  if (hechos) return hechos
  const r = new Map<string, number>()
  for (const a of barrios) {
    let masCercano = Infinity
    for (const b of barrios) {
      if (a !== b) masCercano = Math.min(masCercano, haversine(a.centroid, b.centroid))
    }
    r.set(a.slug, Math.min(masCercano / 2, RADIO_MAXIMO_M))
  }
  radios.set(barrios, r)
  return r
}

export function situarEn(geo: GeoBarrios, lat: number, lng: number): Situado {
  const poligono = geo.boundary?.polygon
  const barrios = geo.neighborhoods
  if (!poligono || poligono.length < 3 || !barrios?.length) return { situacion: 'sin-geo' }
  if (!dentroDe(poligono, lat, lng)) return { situacion: 'fuera-del-termino' }
  const r = radiosDe(barrios)
  let mejor: { slug: string; metros: number } | null = null
  for (const n of barrios) {
    const metros = haversine([lat, lng], n.centroid)
    if (metros <= (r.get(n.slug) ?? 0) && (!mejor || metros < mejor.metros)) {
      mejor = { slug: n.slug, metros }
    }
  }
  return mejor ? { situacion: 'barrio', ...mejor } : { situacion: 'sin-barrio' }
}
