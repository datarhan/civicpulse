/**
 * La pestaña «Documentos» de cada sesión de regmeet — donde el Ayuntamiento
 * publica las actas firmadas de pleno.
 *
 * Hasta el 2026-10-13 este repo creía que las actas de 2025-2026 no estaban
 * publicadas: se había medido sólo ribarroja.es. Una solicitud de acceso se
 * presentó con ese motivo y el Ayuntamiento contestó, con razón, que estaban
 * aquí desde el 30-07-2026. Las páginas de sesión llevan un enlace por
 * documento, `/files/uploads/aytoribarroja/<sesión>/documentos/<subida>.pdf`,
 * con una etiqueta interna («03_P 20260209») que no dice «acta»: qué es cada
 * PDF se decide por su texto (`clasificarDocumento`), nunca por la etiqueta.
 *
 * Puro — sin red. La CLI (`scripts/scrape-pleno-actas.ts`) descarga y llama.
 */

const RUTA_DOCUMENTO = /^\/files\/uploads\/aytoribarroja\/[^/]+\/documentos\/[^/]+\.pdf$/i

/** ¿Es `url` un PDF de la pestaña «Documentos» de una sesión de Riba-roja? */
export function esDocumentoDeSesionRegmeet(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  return u.host === 'regmeet.com' && RUTA_DOCUMENTO.test(u.pathname)
}
