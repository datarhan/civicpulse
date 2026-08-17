// @ts-check
import { useJsonFetch } from './useJsonFetch'

// Preguntas registradas al gobierno municipal — fichero curado a mano
// (src/scraper/eficiencia-preguntas.ts es su validador; se revisa en PR).
// Ships without the file → the pages simply don't render the section.
const EMPTY = { version: 1, actualizadoEl: null, panels: {} }

export function useEficienciaPreguntas() {
  return useJsonFetch('/data/eficiencia-preguntas.json', EMPTY)
}
