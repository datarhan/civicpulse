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
  type ExecDoc,
  type ExecKind,
} from '../src/scraper/budget-execution'
import {
  fetchPdfText,
  fetchExecutionIndex,
  EXEC_INDEX_URL,
} from '../src/scraper/budget-execution-fetch'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public/data/budget-execution.json')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// From a period content-page, collect ALL candidate gastos + ingresos PDF URLs,
// in page order. We no longer guess the right sheet from the filename/text
// (resumen vs detalle): the caller parses every candidate and selects the one
// with a valid grand total AND the most chapters, so a chapter-ful detalle
// sheet wins over a chapter-less summary.
async function pdfUrlsFor(pageUrl: string): Promise<{ gastos: string[]; ingresos: string[] }> {
  const res = await fetch(pageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CivicPulse/0.1)' },
  })
  if (!res.ok) return { gastos: [], ingresos: [] }
  const html = await res.text()
  const links = [...html.matchAll(/href="([^"]+\.pdf[^"]*)"[^>]*>([^<]*)</gi)].map((m) => ({
    href: m[1].startsWith('http') ? m[1] : `https://www.ribarroja.es${m[1]}`,
    text: m[2],
  }))
  const candidates = (rx: RegExp) =>
    links.filter((l) => rx.test(l.text) || rx.test(l.href)).map((l) => l.href)
  return { gastos: candidates(/gasto/i), ingresos: candidates(/ingreso/i) }
}

function trimestreOf(label: string): number | null {
  const m = label.match(/(\d)\s*[ºo]?\s*trimestre|trimestre\s*(\d)/i)
  return m ? Number(m[1] || m[2]) : null
}

const emptyDoc = (kind: ExecKind): ExecDoc => ({
  kind,
  year: 0,
  fechaListado: null,
  chapters: [],
  total: { inicial: 0, modificaciones: 0, actual: 0, ejecutado: 0 },
})

// Fetch + parse every candidate PDF for one side and pick the best ExecDoc:
// a valid grand total (total.actual > 0) AND the MOST chapters — so a
// chapter-ful detalle sheet beats a chapter-less summary. Candidates are
// fetched serially with the shared throttle; a throwing/empty candidate is
// skipped, not fatal. Returns an empty doc when nothing usable was found (the
// plausibility gate then drops the period).
async function selectBestDoc(urls: string[], kind: ExecKind): Promise<ExecDoc> {
  const docs: ExecDoc[] = []
  for (const url of urls) {
    try {
      const text = await fetchPdfText(url)
      if (text) docs.push(parseBudgetExecutionPdf(text))
    } catch (err) {
      console.warn(`skip candidate (${kind}): ${url} · ${(err as Error).message}`)
    } finally {
      await sleep(400)
    }
  }
  const best = docs
    .filter((d) => d.total.actual > 0)
    .sort((a, b) => b.chapters.length - a.chapters.length)[0]
  return best ?? emptyDoc(kind)
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
      const { gastos: gUrls, ingresos: iUrls } = await pdfUrlsFor(it.href)
      await sleep(400)
      if (gUrls.length === 0 && iUrls.length === 0) {
        console.warn(`skip (no PDFs): ${it.label}`)
        continue
      }
      // Parse every candidate per side, select the one with a valid total and
      // the most chapters (recovers per-capítulo detalle over a summary sheet).
      const g = await selectBestDoc(gUrls, 'gastos')
      const i = await selectBestDoc(iUrls, 'ingresos')
      if (g.total.actual <= 0 && i.total.actual <= 0) {
        console.warn(`skip (no usable PDF): ${it.label}`)
        continue
      }
      periods.push(mergeExecutionPeriod(g, i, { trimestre: trimestreOf(it.label) }))
    } catch (err) {
      console.warn(`skip (error): ${it.label} · ${(err as Error).message}`)
      continue
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
