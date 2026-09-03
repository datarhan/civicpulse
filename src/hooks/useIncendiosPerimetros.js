// @ts-check
import { useJsonFetch } from './useJsonFetch'

const EMPTY_PERIMETROS = {
  generatedAt: null,
  fuente: null,
  anillos: {},
  stats: { total: 0, vertices: 0 },
}

/**
 * Los anillos de cada incendio, indexados por parte oficial. Va aparte del
 * índice porque sólo la capa del mapa los necesita, y la capa sólo se monta
 * cuando alguien enciende su interruptor.
 */
export function useIncendiosPerimetros() {
  return useJsonFetch('/data/incendios-perimetros.json', EMPTY_PERIMETROS)
}
