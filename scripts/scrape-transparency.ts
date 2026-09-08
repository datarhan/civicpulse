#!/usr/bin/env tsx
/**
 * Index the official transparency-portal documents of Riba-roja de Túria into
 * public/data/transparency-docs.json — a *link catalogue* (RPT/plantilla =
 * staffing + salary structure, councillor CVs), NOT a data extraction. We
 * surface the documents as citable links; pulling figures out of the PDFs is a
 * separate, legal-sensitivity-gated job for the journalist subsystem.
 *
 * Each source is an index "contenidos" page whose PDF anchors are static
 * (no JS/headless needed). Add a source by appending to SOURCES.
 *
 * Usage: npm run scrape:transparency
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseTransparencyDocs, type TransparencyDoc } from '../src/scraper/transparency'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/transparency-docs.json')

const UA = 'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'

const SOURCES = [
  {
    category: 'rpt',
    categoryLabel: 'Relación de puestos de trabajo (RPT) y plantilla',
    url: 'https://www.ribarroja.es/es/portal_de_transparencia/1_transparencia_activa_e_informacion_sobre_la_corporacion_municipal/relacion_de_puesto_de_trabajo_del_ayuntamiento/contenidos/7559961/0835919',
  },
  // DELIBERADAMENTE AUSENTE: la categoría `cv`.
  //
  // Apuntaba a la página agregada de «datos biográficos del alcalde/sa y
  // concejales», que la mudanza del portal (~2-09-2026) dejó en 403 y que ya no
  // figura en la sección de corporación. Su contenido no se retiró: se repartió
  // en un PDF por concejal, colgado de la ficha de cada uno en
  // `/es/pagina/corporación-municipal`.
  //
  // Y por ahí es por donde entra ahora: `scrape:officials` los lee y los guarda
  // en `officials[].cvUrl`, que es el sitio donde sirven —al lado de la persona
  // a la que pertenecen— en vez de sueltos en un índice de documentos que había
  // que volver a cruzar por el nombre para saber de quién era cada uno.
  //
  // Se quita en vez de dejarse fallando: una fuente que no puede funcionar
  // ensucia el log de cada noche con un 403 que nadie va a arreglar, y enseña a
  // saltarse los 403 de verdad.
]

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      console.warn(`[transparency] HTTP ${res.status} for ${url}`)
      return null
    }
    const html = await res.text()
    // The Drupal site returns HTTP 200 with a "Página no encontrada" body for
    // missing pages — guard against indexing a 404 shell.
    if (/Página no encontrada|no encontrada/i.test(html.slice(0, 4000))) {
      console.warn(`[transparency] 404-shell for ${url}`)
      return null
    }
    return html
  } catch (err) {
    console.warn(`[transparency] fetch failed for ${url}: ${(err as Error).message}`)
    return null
  }
}

async function main() {
  const docs: TransparencyDoc[] = []
  const seen = new Set<string>()
  const sources: Array<{
    category: string
    label: string
    url: string
    ok: boolean
    count: number
  }> = []

  for (const s of SOURCES) {
    console.log(`[transparency] fetching ${s.category}: ${s.url}`)
    const html = await fetchHtml(s.url)
    if (!html) {
      sources.push({
        category: s.category,
        label: s.categoryLabel,
        url: s.url,
        ok: false,
        count: 0,
      })
      continue
    }
    const found = parseTransparencyDocs(html, {
      category: s.category,
      categoryLabel: s.categoryLabel,
    })
    let added = 0
    for (const d of found) {
      if (seen.has(d.id)) continue
      seen.add(d.id)
      docs.push(d)
      added += 1
    }
    sources.push({
      category: s.category,
      label: s.categoryLabel,
      url: s.url,
      ok: true,
      count: added,
    })
  }

  // Refuse to clobber the last good catalogue with an empty one when every
  // source failed (a total outage / site change), as opposed to a real "0 docs".
  if (sources.every((s) => !s.ok)) {
    console.error(
      '[transparency] every source failed — refusing to overwrite transparency-docs.json',
    )
    process.exit(1)
  }

  docs.sort((a, b) =>
    a.category !== b.category
      ? a.category.localeCompare(b.category)
      : (b.year ?? 0) - (a.year ?? 0),
  )

  const byCategory: Record<string, number> = {}
  for (const d of docs) byCategory[d.category] = (byCategory[d.category] || 0) + 1

  const payload = {
    generatedAt: new Date().toISOString(),
    source: { name: 'Portal de Transparencia · Ayuntamiento de Riba-roja de Túria' },
    sources,
    stats: { total: docs.length, byCategory },
    docs,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(
    `[transparency] wrote ${OUT} — ${docs.length} docs across ${sources.filter((s) => s.ok).length} source(s)`,
  )
}

main().catch((err) => {
  console.error('[transparency] failed:', err)
  process.exit(1)
})
