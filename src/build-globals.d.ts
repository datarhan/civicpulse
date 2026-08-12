/**
 * Constantes que Vite resuelve en el build (`define` en vite.config.js).
 *
 * Fecha del último commit que tocó cada página de contrato editorial, leída de
 * git. `null` cuando no hay historial —un tarball, un contenedor sin `.git`—,
 * y entonces la página no escribe fecha ninguna: mejor sin fecha que con una
 * inventada.
 *
 * Existen porque las dos llevaban la suya escrita a mano y la de
 * `/metodologia` iba seis ediciones por detrás, con una coletilla que
 * describía un cambio de hacía un mes como si fuera el último.
 */
declare const __REVISION_METODOLOGIA__: string | null
declare const __REVISION_AVISO_LEGAL__: string | null
