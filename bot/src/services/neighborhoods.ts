import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { situarEn, type GeoBarrios, type Situado } from '../../../src/scraper/situar-barrio.ts'

export {
  situarEn,
  SITUACIONES,
  RADIO_MAXIMO_M,
  type Situacion,
  type Situado,
} from '../../../src/scraper/situar-barrio.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

let cached: GeoBarrios | null = null

function loadGeo(): GeoBarrios {
  if (cached) return cached
  const path = resolve(HERE, '..', '..', '..', 'public', 'data', 'geo.json')
  try {
    cached = JSON.parse(readFileSync(path, 'utf8')) as GeoBarrios
  } catch (err) {
    // Sin geo.json no se puede situar nada, y `situar` lo dice (`sin-geo`). Antes
    // se callaba: cada queja se quedaba sin barrio sin que nadie supiera por qué.
    console.error('[barrios] no se pudo leer geo.json:', (err as Error).message)
    cached = {}
  }
  return cached
}

/** Sitúa un punto contra el geo.json que publica el sitio (src/scraper/situar-barrio.ts). */
export function situar(lat: number, lng: number): Situado {
  return situarEn(loadGeo(), lat, lng)
}

/** Lo que guarda una queja: el slug de su barrio, o null si no cae en ninguno. */
export function matchNeighborhood(lat: number, lng: number): string | null {
  const s = situar(lat, lng)
  return s.situacion === 'barrio' ? s.slug : null
}
