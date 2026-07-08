/**
 * Locates the newest dated "Registro Asociaciones" PDF on the participación
 * page, pdf-parses it, and writes public/data/asociaciones.json. Idempotent.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAsociacionesPdf } from '../src/scraper/asociaciones'

const UA = 'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'
const LISTING =
  'https://www.ribarroja.es/es/participacion_y_transparencia/2_pagina_web__relaciones_con_los_ciudadanos_y_la_sociedad__y_participacion_ciudadana/entidades_y_asociaciones_de_vecinos_del_municipio/contenidos/1141262/1043662'
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public/data/asociaciones.json')

async function fetchPdfText(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/pdf,*/*' } })
  if (!res.ok) return null
  const buf = Buffer.from(await res.arrayBuffer())
  const mod = (await import('pdf-parse')) as unknown as {
    default: (b: Buffer) => Promise<{ text: string }>
  }
  return (await mod.default(buf)).text
}

async function main() {
  const html = await fetch(LISTING, { headers: { 'User-Agent': UA } }).then((r) => r.text())
  // pick the newest "Registro Asociaciones" PDF (filenames start with a YYYYMMDD date).
  const pdfs = [...html.matchAll(/href="([^"]+\.pdf[^"]*)"[^>]*>([^<]*)</gi)]
    .map((m) => ({
      href: m[1].startsWith('http') ? m[1] : `https://www.ribarroja.es${m[1]}`,
      text: m[2],
    }))
    .filter(
      (p) =>
        /registro\s*asociaciones/i.test(decodeURIComponent(p.href)) ||
        /registro asociaciones/i.test(p.text),
    )
  pdfs.sort((a, b) => b.href.localeCompare(a.href)) // date-prefixed filenames sort newest-last-alphabetically → reverse
  const target = pdfs[0]
  if (!target) throw new Error('asociaciones: no register PDF found on the listing page')

  const text = await fetchPdfText(target.href)
  if (!text) throw new Error('asociaciones: register PDF fetch failed')
  const doc = parseAsociacionesPdf(text)
  // Honesty: the `email` field can carry a wrong-but-valid value when the PDF
  // glues an unseen town/venue into the address→correo seam (see
  // asociaciones.ts header — the EMAIL_ONLY_RE gate guarantees well-formedness,
  // not correctness). No surface consumes `email`, so it is OMITTED from the
  // published snapshot until the Wave 3.1 town-gazetteer hardening lands — an
  // absent field beats a wrong one in publicly-downloadable open data. The
  // parser still returns it for that future work + the regression tests.
  const publicAsociaciones = doc.asociaciones.map(({ email: _email, ...rest }) => rest)
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: target.href,
        fechaRegistro: doc.fechaRegistro,
        asociaciones: publicAsociaciones,
      },
      null,
      2,
    ),
  )
  console.log(`wrote ${doc.asociaciones.length} asociaciones · registro ${doc.fechaRegistro}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
