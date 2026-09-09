#!/usr/bin/env tsx
/**
 * Una tarjeta por ruta: escribe `dist/<ruta>/index.html` con sus metaetiquetas.
 *
 *   npm run prerender:meta        (lo llama `npm run build` al terminar)
 *
 * El porqué y la regla de «no se inventa descripción» están en
 * `src/scraper/meta-og.ts`; aquí sólo se enumeran rutas, se leen títulos reales
 * y se escriben ficheros.
 *
 * Corre DESPUÉS de `vite build` porque parte del `dist/index.html` ya generado
 * —con sus hashes de bundle dentro—, así que cada copia arranca exactamente la
 * misma aplicación. Si se hiciera antes, habría que replicar el trabajo de Vite
 * y se desincronizaría al primer cambio de hash.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { construirGrafoRutas, rutasPublicas } from './lib/route-graph.ts'
import { construirMetas, inyectarMeta, resumirMetas } from '../src/scraper/meta-og.ts'

const DIST = resolve('dist')
const BASE = 'https://www.civicpulse.es'

/**
 * Las etiquetas de navegación, leídas del FUENTE y no importadas.
 *
 * `src/nav.js` importa `./flags`, que lee `import.meta.env.MODE`; fuera de Vite
 * eso no existe y el import revienta. Leer el fichero es la misma técnica que ya
 * usan `route-graph` y `build-prose-map` sobre este código.
 */
function etiquetasDeNav(): Record<string, string> {
  const texto = readFileSync(resolve('src/nav.js'), 'utf8')
  const out: Record<string, string> = {}
  // Cada entrada abre con `to:` y trae su `label:` pocas líneas después. Se
  // acota la ventana para no emparejar el `label` de la entrada siguiente.
  const re = /to:\s*'([^']+)'[\s\S]{0,220}?label:\s*'([^']+)'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(texto))) out[m[1]] = m[2]
  return out
}

/** Los reportajes, de sus instantáneas congeladas. */
function reportajesDeDisco(): Record<
  string,
  { titulo: string; subtitulo: string; estado: string }
> {
  const dir = resolve('public/data/reportajes')
  const out: Record<string, { titulo: string; subtitulo: string; estado: string }> = {}
  if (!existsSync(dir)) return out
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const meta = JSON.parse(readFileSync(join(dir, f), 'utf8')).meta ?? {}
    if (!meta.slug) continue
    out[meta.slug] = {
      titulo: meta.titulo ?? '',
      subtitulo: meta.subtitulo ?? '',
      estado: meta.estado ?? '',
    }
  }
  return out
}

function main(): void {
  const indice = join(DIST, 'index.html')
  if (!existsSync(indice)) {
    process.stderr.write('[prerender-meta] no hay dist/index.html: corre `npm run build` antes\n')
    process.exit(2)
  }
  const plantilla = readFileSync(indice, 'utf8')

  const grafo = construirGrafoRutas(resolve('src'))
  const rutas = rutasPublicas(grafo)

  // El título y la descripción del sitio salen del propio HTML, no de una
  // constante paralela: si alguien los cambia en `index.html`, esto los sigue.
  const tituloSitio = /<title>([\s\S]*?)<\/title>/.exec(plantilla)?.[1]?.trim() ?? 'CivicPulse'
  // Se toma la de `og:description`, NO la de `name="description"`. Las dos
  // existen y no dicen lo mismo, y la que ya viajaba en las tarjetas es la
  // primera: leer la otra habría cambiado la ficha de la portada sin que nadie
  // lo pidiera, que es reescribir prosa publicada de tapadillo.
  const descripcionSitio =
    /<meta[^>]*property="og:description"[^>]*content="([^"]*)"/.exec(plantilla)?.[1]?.trim() ??
    /<meta[^>]*name="description"[^>]*content="([^"]*)"/.exec(plantilla)?.[1]?.trim() ??
    ''

  const metas = construirMetas({
    rutas,
    etiquetas: etiquetasDeNav(),
    reportajes: reportajesDeDisco(),
    base: BASE,
    tituloSitio,
    descripcionSitio,
  })

  let escritos = 0
  for (const m of metas) {
    const html = inyectarMeta(plantilla, m)
    if (m.ruta === '/') {
      // La portada se reescribe en su sitio: aunque el texto no cambie, gana la
      // canónica y el `og:url` con el host bueno.
      writeFileSync(indice, html)
    } else {
      const destino = join(DIST, m.ruta.replace(/^\//, ''))
      mkdirSync(destino, { recursive: true })
      writeFileSync(join(destino, 'index.html'), html)
    }
    escritos += 1
  }

  const r = resumirMetas(metas)
  process.stdout.write(
    `[prerender-meta] ${escritos} ruta(s) · ${r.porOrigen.reportaje} con título de reportaje · ` +
      `${r.porOrigen.nav} con etiqueta de navegación · ${r.porOrigen.defecto} con la ficha del sitio\n`,
  )

  // Cero fichas propias sobre N rutas no es «no había nada que poner»: es que
  // ni los reportajes ni la navegación se han leído. Regla 2 de DATA_INTEGRITY.
  if (!r.concluyente) {
    process.stderr.write(
      '[prerender-meta] ninguna ruta obtuvo título propio: los reportajes o nav.js no se han leído\n',
    )
    process.exit(1)
  }
}

main()
