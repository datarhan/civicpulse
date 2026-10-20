/**
 * ¿Es esta pieza del feed de prensa un anuncio clasificado y no una noticia? —
 * puro, sin E/S.
 *
 * El feed de Google News para «Riba-roja de Túria» trae, mezclados con la prensa,
 * los listados de un portal inmobiliario: «1 Casas y pisos en Calle Serrans,
 * Riba-roja de Túria», firmados «Fotocasa». El 19-10-2026 eran 12 de los 68
 * «Titulares monitorizados» de /laboratorio, y contaban como prensa en el KPI, en
 * la tabla por medio (una fila «Fotocasa» con 12 artículos) y en el vocabulario de
 * las lagunas de cobertura: «túria» salía en 20 titulares, 12 de ellos anuncios.
 *
 * La regla es el DOMINIO del portal, no el título ni el nombre: el nombre lo pone
 * el agregador («Fotocasa», «Fotocasa.es»), y un título como «Casas y pisos…» lo
 * puede escribir un periódico. Un portal de anuncios no publica noticias de este
 * municipio, así que todo lo que llega desde él es un anuncio. Sin host no se
 * descarta nada: no hay con qué saber de dónde viene.
 *
 * Sólo /laboratorio lo aplica (press-analytics.ts y src/lib/press-lab.js): press.json
 * sigue guardando lo que el feed trae.
 */

/** Portales de anuncios clasificados; un subdominio cuenta (www.fotocasa.es). */
export const PORTALES_DE_ANUNCIOS = [
  'fotocasa.es',
  'idealista.com',
  'habitaclia.com',
  'pisos.com',
  'milanuncios.com',
  'yaencontre.com',
] as const

export interface PiezaDelFeed {
  source?: string | null
  sourceHost?: string | null
}

export function esAnuncioClasificado(a: PiezaDelFeed): boolean {
  const host = (a.sourceHost ?? '').toLowerCase()
  if (!host) return false
  return PORTALES_DE_ANUNCIOS.some((p) => host === p || host.endsWith(`.${p}`))
}

/** Las piezas del feed que son prensa: sin los anuncios clasificados. */
export function sinAnunciosClasificados<T extends PiezaDelFeed>(items: ReadonlyArray<T>): T[] {
  return items.filter((a) => !esAnuncioClasificado(a))
}
