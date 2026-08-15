// @ts-check
/**
 * Display config + grouping for the civic-POI map layer. Category keys match the
 * scraper's PoiCategory enum (src/scraper/civic-poi.ts) — keep the two in sync.
 * Pure, unit-tested; no React.
 */

// §02: «Un acento de marca. Cinco veredictos. El cromo es gris. Si un color no
// emite un juicio, es gris.»
//
// Los puntos de interés no afirman nada —dicen dónde hay un colegio—, así que no
// les toca croma. Eso ya se respetaba: la versión anterior pintaba las seis
// categorías en una rampa de pizarra de #0F172A a #72819C, acotada por abajo
// para que el paso más claro siguiera llegando a 3:1 contra la tesela.
//
// Lo que esa rampa no hacía era SEPARAR. Seis pasos de un solo tono, en un punto
// de 10 px, son un color y no seis: Educación (#0F172A), Salud (#243044) y Zonas
// verdes (#38455C) eran indistinguibles ya en la leyenda —donde el swatch está
// quieto, ampliado y sobre papel blanco— y más aún sobre el mapa. Una leyenda de
// seis filas que el mapa no puede sostener miente sobre lo que el lector está
// viendo: enseña seis categorías y entrega una mancha.
//
// La categoría va por DOS canales a la vez: color y forma.
//
// La forma se quedó porque es la que sobrevive a lo que el color no aguanta —el
// solape en el casco urbano, un lector daltónico, una impresión en gris— y
// porque un cuadrado no se parece a un círculo por muy juntos que caigan. Pero
// la forma sola, en una tinta única, seguía leyéndose como una nube de marcas
// negras: se distinguían de una en una, no de un vistazo. De un vistazo es como
// se lee un mapa.
//
// El color es lo que da ese vistazo, y aquí hay una regla real que respetar:
// §02 reserva el croma —cinco veredictos y un acento de marca— y los hexes de
// los partidos viven en party-colors.js. Nada de eso se toca. Lo que sí se hace
// ahora, y antes no, es COMPROBARLO: `tests/lib/civic-poi.test.js` importa
// PARTY_COLORS y los tokens de veredicto y rechaza cualquier coincidencia, en
// vez de confiar en que quien edite este fichero se acuerde. La regla que valía
// la pena de aquella rampa no era «todo gris», era «no robes el croma de un
// juicio»; eso se conserva, y encima con dientes.
//
// Los seis tonos son de mapa, no de pastilla: más apagados y más oscuros que los
// tokens de veredicto (#C0392B no es el #dc2626 de «contradicho», #2E7D32 no es
// el #16a34a de «corroborado»), y esquivan el petróleo del gasto y el ámbar de
// DANA que ya pintan en esta misma capa. Donde se pudo, el par color+forma dice
// algo: cruz roja es sanidad, triángulo verde un árbol, círculo un balón.

/** Halo blanco de cada silueta. Es lo que hace legible un color medio sobre
 *  parques, agua y cintas de autovía por igual, y lo que permite medir el
 *  contraste contra el halo en vez de contra una tesela que cambia bajo el pie.
 *  No es decoración. */
export const POI_HALO = '#FFFFFF'

/** Tinta de reserva: sólo la usa una categoría que no esté en el enum. */
export const POI_INK = '#0F172A'

/** Lado del lienzo SVG de un marcador. Las siluetas están centradas en (8,8). */
export const POI_VIEWBOX = 16

/**
 * Silueta por nombre, como `d` de un `<path>`. Un solo sitio para la geometría:
 * el mapa la inyecta como innerHTML de un divIcon y la leyenda la pinta como
 * JSX, de modo que el swatch no puede divergir del punto que explica.
 *
 * Todas son `path` —también el círculo y el cuadrado— para que ambos consumidores
 * rendericen el mismo elemento y no dos ramas distintas.
 */
export const POI_SHAPES = {
  circulo: 'M2.8 8a5.2 5.2 0 1 0 10.4 0a5.2 5.2 0 1 0-10.4 0Z',
  cuadrado: 'M3.2 3.2H12.8V12.8H3.2Z',
  triangulo: 'M8 2.3L13.7 12.7H2.3Z',
  trianguloInvertido: 'M2.3 3.3H13.7L8 13.7Z',
  rombo: 'M8 2.1L13.9 8L8 13.9L2.1 8Z',
  cruz: 'M6.1 2.5H9.9V6.1H13.5V9.9H9.9V13.5H6.1V9.9H2.5V6.1H6.1Z',
}

/** Etiqueta + color + silueta por categoría cívica. Orden = orden de la leyenda.
 *  Los dos canales son REDUNDANTES a propósito: cada uno solo ya identifica la
 *  categoría, así que perder uno —daltonismo, gris, solape— no cuesta el dato. */
export const POI_CATEGORIES = {
  educacion: { label: 'Educación', color: '#1F5FA8', shape: 'cuadrado' },
  salud: { label: 'Salud', color: '#C0392B', shape: 'cruz' },
  verde: { label: 'Zonas verdes', color: '#2E7D32', shape: 'triangulo' },
  deporte: { label: 'Deporte', color: '#7B3FA0', shape: 'circulo' },
  cultura: { label: 'Cultura', color: '#A3197D', shape: 'rombo' },
  civico: { label: 'Servicios públicos', color: '#4E5A65', shape: 'trianguloInvertido' },
}

/**
 * `d` de la silueta de una categoría. `null` cuando la categoría no está en el
 * enum: el scraper la tiene cerrada en seis, así que una séptima significa que
 * los dos ficheros se han desincronizado. Devolver `null` deja que quien pinta
 * lo marque como lo que es —sin asignar—, en vez de repartir una forma al azar
 * que el lector leería como una categoría de verdad.
 * @param {string} category
 * @returns {string|null}
 */
export function poiShapePath(category) {
  const shape = POI_CATEGORIES[category]?.shape
  return shape ? POI_SHAPES[shape] : null
}

/**
 * Group POIs into a Map<category, {label, color, shape, path, items[]}>, in
 * POI_CATEGORIES order, omitting categories with no POIs (so the legend never
 * lists an empty bucket).
 * @param {Array<{category:string}>} [pois]
 * @returns {Map<string, {label:string, color:string, shape:string, path:string, items:any[]}>}
 */
export function groupPoiByCategory(pois) {
  const out = new Map()
  for (const key of Object.keys(POI_CATEGORIES)) {
    const items = (pois ?? []).filter((p) => p.category === key)
    if (items.length === 0) continue
    const { label, color, shape } = POI_CATEGORIES[key]
    out.set(key, { label, color, shape, path: POI_SHAPES[shape], items })
  }
  return out
}
