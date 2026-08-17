// @ts-check
import { useJsonFetch } from './useJsonFetch'

// Panel de coste unitario por servicio (`npm run compute:indicadores`).
// Ships empty until the first compute pass; a 404 resolves to the empty shape
// rather than erroring. Module-level constant, not a fresh literal — the
// snapshot store compares by reference.
//
// La forma vacía declara TODAS las claves que las páginas leen. Le faltaba
// `municipales` —justo la que /eficiencia y /gestion filtran— así que en un 404
// ambas caían a un `?? []` improvisado en vez de a una forma declarada.
const EMPTY = { indicadores: [], municipales: [], universe: null, cobertura: null }

export function useIndicadores() {
  return useJsonFetch('/data/indicadores.json', EMPTY)
}
