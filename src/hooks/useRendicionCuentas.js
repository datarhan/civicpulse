// @ts-check
import { useJsonFetch } from './useJsonFetch'

// La Cuenta General de cada ejercicio en la Plataforma de Rendición de Cuentas
// (`npm run scrape:rendicion-cuentas`): estado y fecha de cada trámite. Los
// plazos no viajan en el fichero: los juzga `evaluarPlazo` al pintar, con la
// fecha del día, para que un «pendiente» no se quede pendiente para siempre en
// un snapshot viejo.
const EMPTY = { ejercicios: [], stats: null }

export function useRendicionCuentas() {
  return useJsonFetch('/data/rendicion-cuentas.json', EMPTY)
}
