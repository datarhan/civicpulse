// @ts-check
import { useJsonFetch } from './useJsonFetch'

/**
 * Fichas societarias de las empresas que cobran servicios municipales.
 *
 * Curado y firmado: cada dato lleva el anuncio del BORME o el expediente del
 * que sale. `scrape:borme` trae el material en bruto a `.cache/`; esto sólo lee
 * lo que una persona firmó. Ver `src/scraper/sociedades.ts`.
 *
 * Constante a nivel de módulo, no un literal nuevo por render: la caché de
 * instantáneas compara por referencia.
 */
const EMPTY = { sociedades: [] }

export function useSociedades() {
  return useJsonFetch('/data/sociedades.json', EMPTY)
}

/** `id` → ficha, para que quien la pinta no recorra el array. */
export function indexarSociedades(data) {
  const m = new Map()
  for (const s of data?.sociedades ?? []) m.set(s.id, s)
  return m
}
