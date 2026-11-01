// @ts-check
import { useJsonFetch } from './useJsonFetch'

// La opinión del editor (`npm run opinion`, src/scraper/opinion-editor.ts).
// Cero opiniones es el estado normal hasta la primera firma, y la página no
// pinta nada en su lugar: una opinión que no existe no se anuncia.
//
// Constante a nivel de módulo: la caché de instantáneas compara por referencia.
const EMPTY = { items: [], retiradas: [] }

export function useOpinionesEditor() {
  return useJsonFetch('/data/opiniones-editor.json', EMPTY)
}
