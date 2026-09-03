// @ts-check
import { useJsonFetch } from './useJsonFetch'

const EMPTY_INCENDIOS = {
  generatedAt: null,
  fuente: null,
  universe: null,
  incendios: [],
  stats: { total: 0, porCausa: {}, porAnyo: {} },
}

/**
 * Índice de incendios forestales: atributos, centroide y bbox, SIN geometría.
 * `/datos` llama a este hook sólo para leer `stats`, y no debe arrastrar los
 * anillos para pintar un recuento de filas.
 */
export function useIncendios() {
  return useJsonFetch('/data/incendios.json', EMPTY_INCENDIOS)
}
