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
// No hay rampa que arregle eso, porque el canal está agotado por decreto. El
// croma pertenece a los cinco veredictos y al acento de marca; los hexes que
// quedan libres los ocupan los partidos (party-colors.js) y las otras capas de
// este mismo mapa (petróleo #0E5B62 del gasto situado, ámbar #E08600 de DANA).
// Elegir seis tonos aquí es chocar con algo que sí emite un juicio — que es
// exactamente cómo Salud acabó una vez en el rojo de «contradicho».
//
// Así que la categoría va por FORMA, en una sola tinta. La forma es un canal que
// este sistema no había gastado: no toma prestado el croma de ningún veredicto,
// separa a 12 px lo que seis grises no separaban, y deja de confiar el
// significado al color (WCAG 1.4.1, «uso del color»). Donde se pudo, la silueta
// dice algo: la cruz es sanidad, el triángulo un árbol, el círculo un balón.

/** Tinta única de la capa. Las siluetas van con halo blanco, así que su
 *  contraste se mide contra el halo (~17:1) y no contra la tesela — la rampa
 *  anterior sí dependía de la tesela, y por eso su extremo claro vivía pegado al
 *  mínimo de 3:1 de WCAG 1.4.11. */
export const POI_INK = '#0F172A'
export const POI_HALO = '#FFFFFF'

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

/** Etiqueta + silueta por categoría cívica. Orden = orden de la leyenda. */
export const POI_CATEGORIES = {
  educacion: { label: 'Educación', shape: 'cuadrado' },
  salud: { label: 'Salud', shape: 'cruz' },
  verde: { label: 'Zonas verdes', shape: 'triangulo' },
  deporte: { label: 'Deporte', shape: 'circulo' },
  cultura: { label: 'Cultura', shape: 'rombo' },
  civico: { label: 'Servicios públicos', shape: 'trianguloInvertido' },
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
 * Group POIs into a Map<category, {label, shape, path, items[]}>, in
 * POI_CATEGORIES order, omitting categories with no POIs (so the legend never
 * lists an empty bucket).
 * @param {Array<{category:string}>} [pois]
 * @returns {Map<string, {label:string, shape:string, path:string, items:any[]}>}
 */
export function groupPoiByCategory(pois) {
  const out = new Map()
  for (const key of Object.keys(POI_CATEGORIES)) {
    const items = (pois ?? []).filter((p) => p.category === key)
    if (items.length === 0) continue
    const { label, shape } = POI_CATEGORIES[key]
    out.set(key, { label, shape, path: POI_SHAPES[shape], items })
  }
  return out
}
