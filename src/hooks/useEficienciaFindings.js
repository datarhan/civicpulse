// @ts-check
import { useJsonFetch } from './useJsonFetch'

// Fichas firmadas sobre desviaciones del panel (`npm run promote-indicador`).
// El fichero existe con `items: []` desde el primer día: cero fichas es el
// estado normal antes de la primera firma, y la página lo dice en voz alta en
// vez de dejar un hueco que se lee como «no hay nada que contar».
//
// Constante a nivel de módulo, no un literal nuevo en cada render: la caché de
// instantáneas compara por referencia.
const EMPTY = { items: [], retractions: [] }

export function useEficienciaFindings() {
  return useJsonFetch('/data/eficiencia-findings.json', EMPTY)
}
