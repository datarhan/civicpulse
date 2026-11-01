/**
 * La huella del CONTENIDO de un base de veredictos (`items`, sin sello). Módulo
 * aparte para que `verified-rebuild` la importe sin ciclo con
 * `cotejo-compose`, que importa de él las rutas. Por qué existe: ver la
 * cabecera de `cotejo-compose.ts`.
 */
import { sha256Short } from '../../src/scraper/hash'

/** JSON con las claves ordenadas: lo escrito y lo releído dan la misma cadena. */
function canonico(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonico).join(',') + ']'
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return (
      '{' +
      Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonico(o[k]))
        .join(',') +
      '}'
    )
  }
  return JSON.stringify(v)
}

/** Huella del contenido de un base: sus `items`, sin `generatedAt`. */
export function huellaDelBase(base: { items?: unknown; generatedAt?: unknown }): string {
  return sha256Short(canonico(base.items ?? null))
}
