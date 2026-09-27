// @ts-check
import { useJsonFetch } from './useJsonFetch'
import { sensibilidadCestas } from '../scraper/dea-sensibilidad'

// El experimento de frontera (`npm run compute:dea`). Vive en /laboratorio
// porque es lo único de este sitio cuya cifra sale de un modelo nuestro y no de
// una fuente citable; la página lo dice antes que cualquier número.
//
// Constante a nivel de módulo, no un literal nuevo en cada render: la caché de
// instantáneas compara por referencia.
const EMPTY = { especificaciones: [], declaracion: null, modelo: null, fuente: null }

export function useFrontera() {
  return useJsonFetch('/data/dea.json', EMPTY)
}

// Cuánto mueve la cesta la puntuación, para las páginas que lo cuentan fuera
// del experimento (/metodologia, /nosotros, /about). Mientras el fichero no ha
// llegado, o si falla, devuelve «nada medido» y cada frase cae a su versión sin
// cifras: ver `src/components/frontera/SensibilidadCestas.jsx`.
export function useSensibilidadCestas() {
  const { data } = useFrontera()
  return sensibilidadCestas(data?.especificaciones)
}
