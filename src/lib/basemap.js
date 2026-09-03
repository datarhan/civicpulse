// @ts-check
/**
 * El mapa base, en un solo sitio.
 *
 * CARTO empezó a exigir clave en sus teselas ráster. Lo que hace sin ella no
 * es fallar: devuelve `200 image/png` con una tesela perfectamente válida y
 * «API KEY REQUIRED» estampado en diagonal encima. Los cuatro mapas del sitio
 * llevaban su propia copia de la URL, así que el mismo defecto salió cuatro
 * veces y ninguna prueba pudo verlo — todas miran códigos, datos y texto.
 *
 * Dos cosas medidas el 3-sep-2026 que mandan sobre este fichero:
 *
 * 1. **Una clave equivocada responde IGUAL que ninguna clave.** Byte a byte:
 *    la tesela sin clave y la misma tesela pedida con una clave inventada
 *    dan el mismo md5. No hay 401, ni 403, ni cabecera que lo distinga. Así que
 *    una variable mal escrita, un secreto sin poner en Vercel o una clave
 *    revocada producen un mapa marcado en producción que ningún control por
 *    HTTP puede detectar. Eso lo mira `npm run check:basemap`, comparando
 *    bytes contra la respuesta SIN clave.
 * 2. **El parámetro es `key`, no `api_key`.** Equivocarse cae en el caso 1.
 *
 * La clave viaja en el paquete del navegador porque no hay otro sitio donde
 * ponerla en una SPA sin servidor: es un identificador de cuota, no un
 * secreto. Aun así no se comitea —sale de `VITE_CARTO_API_KEY` en tiempo de
 * construcción— porque CARTO no ofrece restricción por dominio y quien la
 * copie gasta nuestra cuota.
 */

/** Servicio ráster de CARTO. Sin `{s}`: el reparto por subdominios es un
 *  apaño de HTTP/1.1 y la documentación de CARTO ya no lo usa. */
export const CARTO_TILES = 'https://basemaps.cartocdn.com/rastertiles/voyager'

/**
 * Obligatoria por partida doble: la capa gratuita de CARTO la exige por
 * escrito, y la ODbL de OpenStreetMap la exige venga la tesela de quien venga.
 * Tres de los cuatro mapas no pintaban ninguna.
 */
export const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · ' +
  '&copy; <a href="https://carto.com/attributions">CARTO</a>'

/**
 * URL de teselas para Leaflet. `{r}` lo expande Leaflet a `@2x` en pantallas
 * densas y CARTO lo sirve; quitarlo degrada el mapa en cualquier portátil
 * moderno.
 *
 * @param {string} [clave] clave de CARTO; vacía en desarrollo sin `.env`.
 */
export function tileUrl(clave) {
  const base = `${CARTO_TILES}/{z}/{x}/{y}{r}.png`
  // Sin clave se devuelve la URL limpia. Un `?key=` vacío se comporta igual
  // —marca de agua— pero deja creer que hay clave puesta.
  return clave ? `${base}?key=${encodeURIComponent(clave)}` : base
}

/** La clave que se horneó en la construcción, o vacía. */
export const CARTO_KEY = import.meta.env?.VITE_CARTO_API_KEY ?? ''

/** Lo que consumen los cuatro `<TileLayer>`. */
export const BASEMAP_URL = tileUrl(CARTO_KEY)
