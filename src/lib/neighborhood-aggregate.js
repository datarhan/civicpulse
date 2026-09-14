// @ts-check
/**
 * Pure joins for the interactive-neighborhood map layer. No React, no fetch —
 * unit-tested in isolation. Combines geo neighborhoods + tender-geo located
 * spend + citizen quejas into one honest per-barrio snapshot. Shared with the
 * /quejas heatmap (computePerNeighborhood) so both surfaces bucket identically.
 *
 * ## Por qué estas funciones reciben la INSTANTÁNEA y no sólo `items`
 *
 * «⏳ 1» junto a un barrio afirma que el ayuntamiento le debe una respuesta, y
 * el plazo de la LPACAP corre desde el REGISTRO de la queja. Con la única queja
 * publicada —capturada y sin registrar— los tres mapas decían «✓ 0 · ⏳ 1»: un
 * expediente limpio que nadie se había ganado y una deuda que el ayuntamiento no
 * tenía. Es el mismo defecto que `lib/reloj-lpacap` arregló por cargo, que
 * sobrevivió aquí porque los barrios se agregan por otro camino.
 *
 * Decidirlo exige saber si el listado publicado está ENTERO (el bot exporta
 * como mucho mil quejas mientras `stats` las cuenta todas), y eso vive en
 * `stats`, no en `items`. De ahí el cambio de firma: las cuatro superficies que
 * llaman aquí ya tenían la instantánea completa en la mano y sólo pasaban
 * `items`.
 *
 * El criterio NO se reescribe aquí: se importa `medibilidad` de
 * `lib/reloj-lpacap`, que es donde vive la regla legal. Lo único que cambia
 * entre un cargo y un barrio es qué quejas le pertenecen.
 */

import { medibilidad } from './reloj-lpacap'

/**
 * Health signal for a neighborhood from its queja counts. NEUTRAL when there
 * are zero quejas — we never colour a barrio red/green from an absence of data,
 * only from what citizens actually reported. silencio ≥30% → crit (red),
 * ≥10% → warn (amber), else resolved ≥50% → ok (green), else civic (blue).
 *
 * Se le pasan siempre los recuentos CRUDOS, nunca los gateados: el tono sale de
 * lo que los vecinos reportaron, que es lo que esta función promete. Es seguro
 * por construcción —`resuelta`, `silencio_negativo` y `escalada_sindic` son
 * estados POSTERIORES al registro, así que un barrio sin registro sólo puede
 * pintar el azul «en curso»— y por eso los módulos de arriba lo calculan aquí
 * dentro: con un `null` por recuento, `null / total` daría 0 % de silencio y el
 * tono saldría de una coerción en vez de de un dato.
 *
 * @param {number} total
 * @param {number} resueltas
 * @param {number} silencios
 * @returns {{color:string, resolvedPct:number, silencioPct:number, level:string}}
 */
export function healthFromCounts(total, resueltas, silencios) {
  if (!total || total <= 0) {
    return { color: '#9AA3B2', resolvedPct: 0, silencioPct: 0, level: 'neutral' }
  }
  const resolvedPct = (resueltas / total) * 100
  const silencioPct = (silencios / total) * 100
  if (silencioPct >= 30) return { color: '#DC2626', resolvedPct, silencioPct, level: 'crit' }
  if (silencioPct >= 10) return { color: '#D97706', resolvedPct, silencioPct, level: 'warn' }
  if (resolvedPct >= 50) return { color: '#16A34A', resolvedPct, silencioPct, level: 'ok' }
  return { color: '#60A5FA', resolvedPct, silencioPct, level: 'civic' }
}

/** Las quejas de un barrio, repartidas por estado. Recuentos crudos. */
function bucketsDeBarrio(quejaItems, slug) {
  let total = 0
  let resueltas = 0
  let silencios = 0
  let pendientes = 0
  for (const q of quejaItems ?? []) {
    if (q.address_string !== slug) continue
    total += 1
    if (q.status === 'resuelta') resueltas += 1
    else if (q.status === 'silencio_negativo' || q.status === 'escalada_sindic') silencios += 1
    else pendientes += 1
  }
  return { total, resueltas, pendientes, silencios }
}

/**
 * Las cifras de UN barrio, ya decididas: el tono con los recuentos crudos y las
 * tres cifras de respuesta sólo si se pueden leer como respuestas.
 *
 * `total` se da SIEMPRE: cuántas quejas pusieron los vecinos es un hecho del
 * canal, no una nota sobre el ayuntamiento. Las otras tres son `null` cuando no
 * significan nada todavía, y `motivo` dice por qué —con las mismas claves de
 * catálogo que los cargos (`quejas.reloj.<motivo>`), porque el motivo es el
 * mismo y no hay nada nuevo que traducir.
 *
 * Un barrio SIN quejas no lleva motivo: su cero es un cero de verdad.
 *
 * @param {{stats?: any, items?: any[]} | null | undefined} instantanea
 * @param {string} slug
 */
function cifrasDeBarrio(instantanea, slug) {
  const crudos = bucketsDeBarrio(instantanea?.items, slug)
  const health = healthFromCounts(crudos.total, crudos.resueltas, crudos.silencios)
  if (crudos.total === 0) {
    return {
      total: 0,
      medible: true,
      motivo: null,
      resueltas: 0,
      pendientes: 0,
      silencios: 0,
      health,
    }
  }
  const { medible, motivo } = medibilidad(instantanea, (q) => q.address_string === slug)
  return {
    total: crudos.total,
    medible,
    motivo,
    resueltas: medible ? crudos.resueltas : null,
    pendientes: medible ? crudos.pendientes : null,
    silencios: medible ? crudos.silencios : null,
    health,
  }
}

/**
 * Full civic snapshot for ONE neighborhood, joining geo (population) +
 * tender-geo (located spend, from the matching zone) + quejas. Honest zeros
 * throughout: a barrio with no located contracts reports amount 0 (not hidden),
 * a barrio with no quejas reports neutral health.
 * @param {{neighborhood:any, zones?:any[], instantanea?:any}} input
 */
export function aggregateNeighborhood({ neighborhood, zones = [], instantanea = null }) {
  const slug = neighborhood.slug
  const zone = (zones ?? []).find((z) => z.slug === slug) || null
  const { health, ...quejas } = cifrasDeBarrio(instantanea, slug)
  return {
    slug,
    name: neighborhood.name,
    centroid: neighborhood.centroid,
    population: neighborhood.population ?? null,
    contractCount: zone?.contractCount ?? 0,
    amount: zone?.amount ?? 0,
    danaAmount: zone?.danaAmount ?? 0,
    quejas,
    health,
  }
}

/**
 * Bucket quejas by neighborhood slug into rows, keeping only barrios with ≥1
 * queja. Slugs with no geo entry are ignored (never fabricated). Shared by the
 * /quejas heatmap, the landing layer and its legend so the three cannot
 * disagree.
 *
 * Cada fila trae su `health` ya calculado. Antes lo calculaba cada consumidor
 * con los recuentos de la fila, y eso es lo que permitía imprimir una cifra que
 * no se puede publicar: ahora las tres cifras de respuesta llegan en `null`
 * cuando no son medibles, y el tono llega hecho.
 *
 * @param {{stats?: any, items?: any[]} | null | undefined} instantanea
 * @param {any[]} neighborhoods
 */
export function computePerNeighborhood(instantanea, neighborhoods) {
  const filas = []
  for (const n of neighborhoods ?? []) {
    const cifras = cifrasDeBarrio(instantanea, n.slug)
    if (cifras.total === 0) continue
    filas.push({ slug: n.slug, name: n.name, centroid: n.centroid, ...cifras })
  }
  return filas
}

/**
 * Town-wide overlap rows for the D4 gap view: one row per barrio that has EITHER
 * quejas OR situated spend, sorted quejas-desc then amount-desc. `gap` flags a
 * barrio with citizen complaints but zero located spend — surfaced as a NEUTRAL
 * figure, never as an accusation. Reuses aggregateNeighborhood so the numbers
 * match the map + heatmap exactly.
 *
 * Estas cifras NO se gatean, y es deliberado: `quejas` aquí es cuántas pusieron
 * los vecinos y `gap` es si hay gasto situado en ese barrio. Ninguna de las dos
 * afirma que el ayuntamiento deba una respuesta, así que esconderlas sin registro
 * sería ocultar un dato legítimo.
 *
 * @param {{neighborhoods?:any[], zones?:any[], instantanea?:any}} input
 */
export function computeOverlapRows({ neighborhoods = [], zones = [], instantanea = null }) {
  return neighborhoods
    .map((n) => {
      const agg = aggregateNeighborhood({ neighborhood: n, zones, instantanea })
      return {
        slug: agg.slug,
        name: agg.name,
        quejas: agg.quejas.total,
        amount: agg.amount,
        contractCount: agg.contractCount,
        gap: agg.quejas.total > 0 && agg.amount === 0,
      }
    })
    .filter((r) => r.quejas > 0 || r.amount > 0)
    .sort((x, y) => y.quejas - x.quejas || y.amount - x.amount)
}
