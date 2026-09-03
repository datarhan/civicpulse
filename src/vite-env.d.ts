/// <reference types="vite/client" />

/**
 * Tipos de `import.meta.env`, que hasta ahora no los tenía nadie: los ficheros
 * que la leen (`src/flags.js`) no llevan `@ts-check`, así que el hueco no se
 * notaba hasta que un módulo comprobado la usó.
 *
 * Sólo se declaran las variables PROPIAS; `vite/client` ya trae `MODE`, `DEV`
 * y compañía.
 */
interface ImportMetaEnv {
  /** Banderas de lanzamiento; ver `src/flags.js` y los dos workflows. */
  readonly VITE_ENABLE_PERIODISTAS?: string
  readonly VITE_ENABLE_EFICIENCIA?: string
  /** Clave de las teselas de CARTO; ver `src/lib/basemap.js`. */
  readonly VITE_CARTO_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
