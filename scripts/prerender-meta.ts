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
import {
  construirMetas,
  construirMetasConParametro,
  construirRobots,
  construirSitemap,
  inyectarMeta,
  resumirMetas,
  sinUrlPropia,
  type PaginaConParametro,
} from '../src/scraper/meta-og.ts'

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
  // Se toma la de `og:description`, que es la que viaja en las tarjetas. Hoy
  // las tres etiquetas dicen lo mismo —el one-liner de docs/DESCRIPCION.md, y
  // `tests/metaetiquetas.test.js` lo exige—, así que la elección no cambia nada;
  // si algún día se separan, manda la de las tarjetas. Cuando SÍ decían cosas
  // distintas, leer la otra habría reescrito la ficha de la portada sin que
  // nadie lo pidiera, que es cambiar prosa publicada de tapadillo.
  const descripcionSitio =
    /<meta[^>]*property="og:description"[^>]*content="([^"]*)"/.exec(plantilla)?.[1]?.trim() ??
    /<meta[^>]*name="description"[^>]*content="([^"]*)"/.exec(plantilla)?.[1]?.trim() ??
    ''
  // Y si no encuentra ninguna, se para. Con el `?? ''` solo, renombrar esas dos
  // etiquetas escribía todas las fichas con `description=""` y salía 0: el
  // `concluyente` de abajo mira TÍTULOS, así que la única señal de que la ficha
  // del sitio se había perdido era abrir el HTML. Regla 2 de DATA_INTEGRITY
  // —una pasada tiene que demostrar que hizo el trabajo— apuntada al campo que
  // este script había dejado de vigilar.
  if (!descripcionSitio) {
    process.stderr.write(
      '[prerender-meta] index.html no trae og:description ni description: ' +
        'las fichas de todas las rutas saldrían vacías\n',
    )
    process.exit(1)
  }

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
      // La portada se reescribe en su sitio, pero SIN canónica ni `og:url`:
      // ese mismo fichero es el que Vercel sirve para toda ruta sin fichero
      // propio (`/cargos/:slug`, `/plenos/:id`…), y con la URL de la portada
      // dentro cada una de ellas se declaraba duplicado de la portada ante los
      // buscadores. Ver `sinUrlPropia`.
      writeFileSync(indice, sinUrlPropia(html))
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

  // Las páginas con parámetro que tienen titular propio en un volcado: cada
  // hallazgo, cada cargo en ejercicio y cada pleno. Son las que más se
  // reenvían, y sin fichero propio Vercel les servía el HTML de reserva, con la
  // ficha del sitio. Una queja no entra: es el texto de un vecino y no se le
  // empuja a los buscadores; una oferta de empleo tampoco, porque caduca.
  const paginas: PaginaConParametro[] = [
    ...desdeVolcado(grafo.rutas, '/hallazgos/:id', 'pleno-findings.json', (j) =>
      (j.items ?? []).map((f: { id?: string; title?: string; summary?: string }) => ({
        valor: f.id,
        titulo: f.title,
        descripcion: f.summary,
        origen: 'hallazgo' as const,
      })),
    ),
    ...desdeVolcado(grafo.rutas, '/cargos/:slug', 'officials.json', (j) =>
      (j.officials ?? []).map((o: { slug?: string; name?: string }) => ({
        valor: o.slug,
        titulo: o.name,
        origen: 'cargo' as const,
      })),
    ),
    ...desdeVolcado(grafo.rutas, '/plenos/:id', 'plenos.json', (j) =>
      (j.items ?? []).map((pl: { id?: string; title?: string }) => ({
        valor: pl.id,
        titulo: pl.title ? `Pleno · ${pl.title}` : undefined,
        origen: 'pleno' as const,
      })),
    ),
  ]
  const conParametro = construirMetasConParametro(paginas, {
    base: BASE,
    tituloSitio,
    descripcionSitio,
  })
  for (const m of conParametro) {
    const destino = join(DIST, m.ruta.replace(/^\//, ''))
    mkdirSync(destino, { recursive: true })
    writeFileSync(join(destino, 'index.html'), inyectarMeta(plantilla, m))
  }
  const rp = resumirMetas(conParametro)
  process.stdout.write(
    `[prerender-meta] ${conParametro.length} página(s) con parámetro · ` +
      `${rp.porOrigen.hallazgo} hallazgo(s) · ${rp.porOrigen.cargo} cargo(s) · ` +
      `${rp.porOrigen.pleno} pleno(s)\n`,
  )

  // El mapa del sitio: las rutas públicas de arriba MÁS esas páginas, que un
  // buscador sólo encontraría siguiendo enlaces que pinta JavaScript.
  const urls = [...metas.map((m) => m.url), ...conParametro.map((m) => m.url)]
  writeFileSync(join(DIST, 'sitemap.xml'), construirSitemap(urls))
  writeFileSync(join(DIST, 'robots.txt'), construirRobots(BASE))
  process.stdout.write(
    `[prerender-meta] sitemap.xml · ${metas.length} ruta(s) + ${conParametro.length} página(s) con parámetro\n`,
  )
  // Sin cargos ni plenos no es un sitio sin concejales: es que no se han leído
  // los volcados. Misma regla 2. (Hallazgos puede haber cero de verdad: el
  // volcado sale vacío hasta la primera promoción.)
  if (rp.porOrigen.cargo === 0 || rp.porOrigen.pleno === 0) {
    process.stderr.write(
      '[prerender-meta] sin páginas de cargos o de plenos: no se han leído sus volcados\n',
    )
    process.exit(1)
  }
}

/**
 * Las páginas concretas de un patrón con parámetro, leídas de su volcado. Nada
 * si la ruta ya no existe en App.jsx (el grafo la deriva de allí) o el volcado
 * no se deja leer.
 */
function desdeVolcado(
  rutas: string[],
  patron: string,
  fichero: string,
  filas: (j: any) => {
    valor?: string
    titulo?: string
    descripcion?: string
    origen: PaginaConParametro['origen']
  }[],
): PaginaConParametro[] {
  if (!rutas.includes(patron)) return []
  const p = resolve('public/data', fichero)
  if (!existsSync(p)) return []
  try {
    return filas(JSON.parse(readFileSync(p, 'utf8')))
      .filter((f) => typeof f.valor === 'string' && f.valor.length > 0)
      .map((f) => ({
        ruta: patron.replace(/:[a-zA-Z]+$/, f.valor as string),
        titulo: f.titulo ?? '',
        descripcion: f.descripcion,
        origen: f.origen,
      }))
  } catch {
    return []
  }
}

main()
