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

/**
 * La fecha de la sesión (YYYY-MM-DD) que nombra la carpeta de un PDF de
 * «Documentos» — `/files/uploads/aytoribarroja/09-02-2026.Pleno…/documentos/…` —
 * o null si `url` no es uno o la carpeta no empieza por `DD-MM-AAAA`. Es el
 * nombre de la carpeta, no el texto del acta: sirve para rechazar el acta de
 * OTRA sesión, nunca para dar por buena una.
 */
export function fechaDeSesionRegmeet(url: string): string | null {
  if (!esDocumentoDeSesionRegmeet(url)) return null
  const m = /^\/files\/uploads\/aytoribarroja\/(\d{2})-(\d{2})-(\d{4})[^/]*\/documentos\//.exec(
    new URL(url).pathname,
  )
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

export interface RegmeetDocumento {
  url: string
  /** Etiqueta del enlace tal cual («03_P 20260209»). No dice qué es el PDF. */
  etiqueta: string
  /** Fecha de subida, del nombre del fichero (`2026-07-30_13-45-56_0.pdf`), o null. */
  subidoEl: string | null
}

/**
 * Enlace de la pestaña «Documentos»: ruta relativa a la carpeta `documentos` de una
 * sesión. El otro enlace de la página que parece una descarga
 * (jqueryfiledownload.apphb.com) es de la librería y no casa: no es una ruta relativa.
 */
const ENLACE =
  /<a\s+href="(\/files\/uploads\/aytoribarroja\/[^"]+\/documentos\/[^"]+\.pdf)"[^>]*>([^<]*)/gi

/** Los PDF de la pestaña «Documentos» de una página de sesión, sin duplicados. */
export function parseRegmeetDocumentos(html: string): RegmeetDocumento[] {
  const out: RegmeetDocumento[] = []
  const vistos = new Set<string>()
  for (const m of html.matchAll(ENLACE)) {
    const url = `https://regmeet.com${m[1]}`
    if (vistos.has(url) || !esDocumentoDeSesionRegmeet(url)) continue
    vistos.add(url)
    const f = /\/documentos\/(\d{4}-\d{2}-\d{2})_/.exec(m[1])
    out.push({ url, etiqueta: m[2].replace(/\s+/g, ' ').trim(), subidoEl: f ? f[1] : null })
  }
  return out
}

const MESES: Record<string, string> = {
  enero: '01',
  febrero: '02',
  marzo: '03',
  abril: '04',
  mayo: '05',
  junio: '06',
  julio: '07',
  agosto: '08',
  septiembre: '09',
  setiembre: '09',
  octubre: '10',
  noviembre: '11',
  diciembre: '12',
}

/**
 * Qué es un PDF de «Documentos», por su texto. Sólo «ACTA SESIÓN …» al principio
 * es un acta; el carácter (ordinaria/extraordinaria) del título NO se usa: el
 * acta del 03-07-2026 dice ORDINARIA en el título y EXTRAORDINARIA en el cuerpo.
 * `fechaCoincide` compara «EL DÍA 9 de febrero de 2026» de la cabecera con la
 * fecha del pleno (YYYY-MM-DD); sin fecha legible, no coincide.
 */
export function clasificarDocumento(
  texto: string,
  fechaPleno: string,
): { tipo: 'acta' | 'otro'; fechaCoincide: boolean } {
  const cabeza = texto.slice(0, 800).replace(/\s+/g, ' ')
  if (!/^\s*ACTA\s+(?:DE\s+LA\s+)?SESI[ÓO]N\b/i.test(cabeza)) {
    return { tipo: 'otro', fechaCoincide: false }
  }
  const m = /EL D[ÍI]A (\d{1,2}) de ([a-záéíóú]+) de (\d{4})/i.exec(cabeza)
  const mes = m ? MESES[m[2].toLowerCase()] : undefined
  const fecha = m && mes ? `${m[3]}-${mes}-${m[1].padStart(2, '0')}` : null
  return { tipo: 'acta', fechaCoincide: fecha === fechaPleno }
}
