/**
 * Scrapes the estados-de-ejecución index → per-period gastos+ingresos PDFs →
 * public/data/budget-execution.json. Idempotent; polite (throttled). Best-effort
 * per period: a period whose PDFs 404, fail to fetch, or throw is skipped
 * (logged), never fatal — one bad PDF can't abort the whole run.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseBudgetExecutionPdf,
  mergeExecutionPeriod,
  type BudgetExecutionPeriod,
} from '../src/scraper/budget-execution'
import {
  fetchPdfText,
  fetchExecutionIndex,
  EXEC_INDEX_URL,
} from '../src/scraper/budget-execution-fetch'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public/data/budget-execution.json')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// From a period content-page, find its gastos + ingresos PDF URLs.
async function pdfUrlsFor(pageUrl: string): Promise<{ gastos?: string; ingresos?: string }> {
  const res = await fetch(pageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CivicPulse/0.1)' },
  })
  if (!res.ok) return {}
  const html = await res.text()
  const links = [...html.matchAll(/href="([^"]+\.pdf[^"]*)"[^>]*>([^<]*)</gi)].map((m) => ({
    href: m[1].startsWith('http') ? m[1] : `https://www.ribarroja.es${m[1]}`,
    text: m[2],
  }))
  const isResumen = (l: { text: string; href: string }) =>
    /resumen/i.test(l.text) || /resumen/i.test(l.href)
  const isDetalle = (l: { text: string; href: string }) =>
    /detalle|corriente/i.test(l.text) || /detalle|corriente/i.test(l.href)
  // When a page carries several gastos/ingresos PDFs, prefer a "resumen" sheet
  // OVER a "detalle"/"corriente" one: the detalle variants lack the Total
  // Capítulo/Total Gastos summary markers the parser keys on. But only escape
  // to resumen when the default (first-match) pick is itself a detalle/corriente
  // sheet — a plain summary first-match (e.g. 2025's "GASTOS 1T") already parses
  // cleanly, and a page may list several trimestres' PDFs at once, so blindly
  // grabbing an unrelated later-trimestre "resumen" would only lose good data.
  const pick = (rx: RegExp) => {
    const matches = links.filter((l) => rx.test(l.text) || rx.test(l.href))
    if (matches.length === 0) return undefined
    if (isDetalle(matches[0])) return (matches.find(isResumen) ?? matches[0]).href
    return matches[0].href
  }
  return { gastos: pick(/gasto/i), ingresos: pick(/ingreso/i) }
}

function trimestreOf(label: string): number | null {
  const m = label.match(/(\d)\s*[ºo]?\s*trimestre|trimestre\s*(\d)/i)
  return m ? Number(m[1] || m[2]) : null
}

// A period only ships if the figures are internally plausible: real year,
// positive gastos+ingresos totals, and both execution ratios in (0, 110].
// This drops the OLD PDF layouts the parser can't fully read (empty/implausible
// figures) so we never publish untrustworthy execution numbers on a public
// accountability page.
function isPlausiblePeriod(p: BudgetExecutionPeriod): boolean {
  return (
    p.year > 0 &&
    p.gastos.total.actual > 0 &&
    p.ingresos.total.actual > 0 &&
    p.ejecucionPct.gastos > 0 &&
    p.ejecucionPct.gastos <= 110 &&
    p.ejecucionPct.ingresos > 0 &&
    p.ejecucionPct.ingresos <= 110
  )
}

async function main() {
  const index = await fetchExecutionIndex()
  const periods: BudgetExecutionPeriod[] = []
  for (const it of index) {
    // Best-effort per period: any throw (network error, corrupt/blocked PDF,
    // parser failure) skips THIS period and continues with the rest.
    try {
      const { gastos: gUrl, ingresos: iUrl } = await pdfUrlsFor(it.href)
      if (!gUrl && !iUrl) {
        console.warn(`skip (no PDFs): ${it.label}`)
        continue
      }
      const [gText, iText] = await Promise.all([
        gUrl ? fetchPdfText(gUrl) : Promise.resolve(null),
        iUrl ? fetchPdfText(iUrl) : Promise.resolve(null),
      ])
      if (!gText && !iText) {
        console.warn(`skip (PDF fetch failed): ${it.label}`)
        continue
      }
      const g = gText
        ? parseBudgetExecutionPdf(gText)
        : {
            kind: 'gastos' as const,
            year: 0,
            fechaListado: null,
            chapters: [],
            total: { inicial: 0, modificaciones: 0, actual: 0, ejecutado: 0 },
          }
      const i = iText
        ? parseBudgetExecutionPdf(iText)
        : {
            kind: 'ingresos' as const,
            year: 0,
            fechaListado: null,
            chapters: [],
            total: { inicial: 0, modificaciones: 0, actual: 0, ejecutado: 0 },
          }
      periods.push(mergeExecutionPeriod(g, i, { trimestre: trimestreOf(it.label) }))
    } catch (err) {
      console.warn(`skip (error): ${it.label} · ${(err as Error).message}`)
      continue
    } finally {
      await sleep(400)
    }
  }
  // Validation gate: keep only plausible periods; log + drop the rest.
  const survivors = periods.filter((p) => {
    if (isPlausiblePeriod(p)) return true
    console.warn(
      `drop (implausible): year ${p.year} T${p.trimestre ?? '-'} · gastos ${p.ejecucionPct.gastos}% (actual ${p.gastos.total.actual}) · ingresos ${p.ejecucionPct.ingresos}% (actual ${p.ingresos.total.actual})`,
    )
    return false
  })
  survivors.sort((a, b) => a.year - b.year || (a.trimestre ?? 0) - (b.trimestre ?? 0))
  const latest = survivors[survivors.length - 1] ?? null
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: EXEC_INDEX_URL,
        periods: survivors,
        latest,
      },
      null,
      2,
    ),
  )
  console.log(
    `wrote ${survivors.length}/${periods.length} periods · latest ${latest?.year} T${latest?.trimestre ?? '-'} · ejecución gastos ${latest?.ejecucionPct.gastos ?? '-'}%`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
