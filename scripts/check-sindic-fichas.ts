#!/usr/bin/env tsx
/**
 * Cada ficha firmada del Síndic, contra su propio PDF.
 *
 * Hermano de `check:citations` y de `check:eficiencia-findings`, y con la misma
 * regla de desenlaces: `literal` · `no-literal` · `pdf-inalcanzable` ·
 * `sin-pdf`. Sólo los dos últimos casos que son NUESTROS hacen fallar; un PDF
 * que no responde es cosa de la fuente y se informa sin romper nada, porque una
 * guarda que se pone roja por el servidor de otro es una guarda que la gente
 * aprende a saltarse.
 *
 * Necesita red, así que su sitio es `scrape-ci-blocked.sh` con los demás: desde
 * un runner de GitHub encontraría todos los PDFs «inalcanzables», no informaría
 * de nada y tendría un aspecto estupendo.
 *
 * Uso: npm run check:sindic-fichas
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pdf from 'pdf-parse'
import {
  cotejarResumen,
  resumirParte,
  haCotejadoAlgo,
  debeFallar,
} from '../src/scraper/sindic-verbatim'
import type { Cotejo } from '../src/scraper/sindic-verbatim'
import { validateSnapshot } from '../src/scraper/sindic'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SNAP = join(__dirname, '..', 'public/data/sindic.json')
const UA = 'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'

async function textoDe(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/pdf,*/*' },
      redirect: 'follow',
    })
    if (!res.ok) return null
    return (await pdf(Buffer.from(await res.arrayBuffer()))).text
  } catch {
    return null
  }
}

async function main() {
  const snap = validateSnapshot(JSON.parse(readFileSync(SNAP, 'utf8')))
  const cotejos: Cotejo[] = []
  for (const it of snap.items) {
    cotejos.push(cotejarResumen(it.id, it.expediente, it.resumen, await textoDe(it.urlPdf)))
    await new Promise((r) => setTimeout(r, 700))
  }

  const p = resumirParte(cotejos)
  for (const c of cotejos) {
    const marca = { literal: '✓', 'no-literal': '✗', 'pdf-inalcanzable': '·', 'sin-pdf': '✗' }[
      c.desenlace
    ]
    console.log(
      `  ${marca} ${c.expediente}  ${c.desenlace}${c.detalle ? `\n      ${c.detalle}` : ''}`,
    )
  }
  console.log(
    `[check-sindic-fichas] ${p.intentadas} ficha(s) · ${p.literales} literal(es) · ` +
      `${p.noLiterales} discrepante(s) · ${p.inalcanzables} PDF(s) inalcanzable(s) · ${p.sinPdf} sin texto`,
  )

  // Cero fichas, o trece PDFs caídos, dan cero discrepancias — y eso no es un
  // all-clear, es una pasada que no midió nada.
  if (!haCotejadoAlgo(p)) {
    console.error(
      `[check-sindic-fichas] ✗ [sin-cotejar] no se pudo cotejar NI UNA ficha ` +
        `(${p.intentadas} en el fichero, ${p.inalcanzables} PDFs inalcanzables). ` +
        `Esto no es «todo bien»: es que la comprobación no llegó a hacerse.`,
    )
    process.exit(1)
  }
  if (debeFallar(p)) {
    console.error(
      `[check-sindic-fichas] ✗ [ficha-no-literal] hay ${p.noLiterales + p.sinPdf} ficha(s) cuyo ` +
        `texto entrecomillado ya no aparece en su resolución. Corrígelas o retíralas: ` +
        `publicamos ese párrafo como cita literal del Síndic.`,
    )
    process.exit(1)
  }
  console.log('[check-sindic-fichas] ✓ cada cita sigue donde dice estar')
}

main().catch((err) => {
  console.error('[check-sindic-fichas] failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
