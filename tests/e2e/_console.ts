import type { Page } from '@playwright/test'

/**
 * «¿Ha registrado la página algún error?», en un solo sitio.
 *
 * Veintisiete specs llevaban esta misma línea copiada palabra por palabra:
 *
 *     expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
 *
 * y veinticuatro repetían también el par de `page.on`. Es la lección del
 * RefList otra vez: arreglar el filtro en uno deja mintiendo a los otros
 * veintiséis.
 *
 * Y había algo que arreglar. La suite completa fallaba de forma intermitente
 * —una de cada tres pasadas, en un spec distinto cada vez: departamentos,
 * empleo, frontera, eficiencia— sin agotar ningún tiempo de espera: caía
 * siempre en esta aserción, en menos de medio segundo. En local Playwright
 * levanta cinco workers contra un único `vite preview` y no reintenta
 * (`retries: 0` fuera de CI, donde son 2), así que basta con que el servidor
 * suelte una petición para que el navegador escriba un error de red en la
 * consola y la aserción salte.
 *
 * Un fallo de TRANSPORTE no es un fallo del producto: `net::ERR_ABORTED` o
 * `ERR_CONNECTION_RESET` los emite la capa de red del navegador y ninguna
 * línea de este repo puede provocarlos. Se ignoran, y sólo ésos.
 *
 * Lo que se sigue cazando, que es el motivo de que la aserción exista:
 *   · cualquier excepción de JavaScript (`pageerror`)
 *   · cualquier `console.error` de la aplicación
 *   · un recurso que responde 404 o 500 — un snapshot que falta es un defecto
 *     de verdad, y su texto no lleva `net::`
 */
const TRANSPORTE = /net::ERR_[A-Z_]+/

/** Ruido conocido del entorno, no de la página. */
const RUIDO = [/favicon/i, /\bws:/i, TRANSPORTE]

/**
 * Engancha los dos oyentes y devuelve el array vivo donde se acumulan.
 * Llamar ANTES del `page.goto`.
 */
export function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  return errors
}

/**
 * Sólo excepciones de JavaScript, sin la consola.
 *
 * Cinco specs vigilaban únicamente esto. No se les amplía la vigilancia al
 * unificar: pasar a escuchar también la consola les haría cazar cosas que hoy
 * ignoran, y eso es un cambio de comportamiento disfrazado de limpieza. Si
 * conviene igualarlos, que sea una decisión con su propia pasada.
 */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  return errors
}

/** Los que son de la página, ya sin el ruido del entorno. */
export function appErrors(errors: string[]): string[] {
  return errors.filter((e) => !RUIDO.some((r) => r.test(e)))
}
