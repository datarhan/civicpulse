/**
 * Scrapes the estados-de-ejecución index → per-period gastos+ingresos PDFs →
 * public/data/budget-execution.json. Idempotent; polite (throttled). Best-effort
 * per period: a period whose PDFs 404, fail to fetch, or throw is skipped
 * (logged), never fatal — one bad PDF can't abort the whole run.
 *
 * Un periodo es un AÑO Y UN TRIMESTRE, no una página del índice: la página de
 * cada año cuelga sus trimestres, y leer una hoja por página dejaba de 2025 sólo
 * el cierre y del 1T de 2026 nada (budget-execution.ts, `periodosDelIndice`).
 *
 * La pasada cuenta lo que hizo (docs/DATA_INTEGRITY.md, regla 2): periodos
 * encontrados, publicados y descartados con su motivo, y las hojas sin texto
 * —PDF escaneados, que este parser no puede leer—. Lo escribe también en el
 * snapshot, en `lectura`, para que no haga falta el log para saberlo.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseBudgetExecutionPdf,
  mergeExecutionPeriod,
  elegirDocumento,
  enlacesPdf,
  hojasDePagina,
  periodosDelIndice,
  motivoDeDescarte,
  ultimoCierre,
  unirPartes,
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
const UA = 'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Menos que esto, una vez quitados los espacios, es un PDF sin capa de texto. */
const SIN_TEXTO = 40

const emptyDoc = (kind: ExecKind): ExecDoc => ({
  kind,
  year: 0,
  fechaListado: null,
  fechaImpresion: null,
  chapters: [],
  total: { inicial: 0, modificaciones: 0, actual: 0, ejecutado: 0 },
  pctImpreso: null,
  definitivo: 'a-la-fecha',
})

interface Lectura {
  /** Hojas descargadas y con texto. */
  leidas: number
  /** Hojas escaneadas: el PDF no trae texto que leer. */
  sinTexto: string[]
  /** Hojas que no se pudieron descargar. */
  fallidas: string[]
}

// Fetch + parse every candidate PDF for one side, join the two halves of a
// Ministry form (`unirPartes`: 2T 2023 publishes current and capital
// operations as separate sheets) and pick the best ExecDoc (`elegirDocumento`:
// valid total, latest cut, most chapters, never a lone half). Candidates are
// fetched serially with the shared throttle; a throwing candidate is skipped,
// not fatal. Returns an empty doc when nothing usable was found (the gate then
// drops the period, saying why).
async function selectBestDoc(
  urls: string[],
  kind: ExecKind,
  nombre: Map<string, string>,
  lectura: Lectura,
): Promise<ExecDoc> {
  const docs: ExecDoc[] = []
  for (const url of urls) {
    try {
      const text = await fetchPdfText(url)
      if (!text || text.replace(/\s+/g, '').length < SIN_TEXTO) {
        lectura.sinTexto.push(nombre.get(url) ?? url)
        continue
      }
      lectura.leidas++
      const doc = parseBudgetExecutionPdf(text)
      if (doc.kind === kind) docs.push(doc)
    } catch (err) {
      lectura.fallidas.push(nombre.get(url) ?? url)
      console.warn(`skip candidate (${kind}): ${url} · ${(err as Error).message}`)
    } finally {
      await sleep(400)
    }
  }
  return elegirDocumento(unirPartes(docs)) ?? emptyDoc(kind)
}

async function main() {
  const index = await fetchExecutionIndex()
  const paginas: Array<{ label: string; enlaces: string[] }> = []
  for (const it of index) {
    try {
      const res = await fetch(it.href, { headers: { 'User-Agent': UA } })
      paginas.push({ label: it.label, enlaces: res.ok ? enlacesPdf(await res.text()) : [] })
    } catch (err) {
      console.warn(`skip page (error): ${it.label} · ${(err as Error).message}`)
    }
    await sleep(400)
  }
  const nombre = new Map(
    paginas.flatMap((p) => hojasDePagina(p)).map((h) => [h.href, `${h.texto} (${h.href})`]),
  )
  const grupos = periodosDelIndice(paginas)
  const lectura: Lectura = { leidas: 0, sinTexto: [], fallidas: [] }
  const survivors: BudgetExecutionPeriod[] = []
  const descartados: Array<{ year: number; trimestre: number; motivo: string }> = []
  for (const grupo of grupos) {
    try {
      const g = await selectBestDoc(grupo.gastos, 'gastos', nombre, lectura)
      const i = await selectBestDoc(grupo.ingresos, 'ingresos', nombre, lectura)
      const p = mergeExecutionPeriod(g, i, { trimestre: grupo.trimestre })
      const motivo = motivoDeDescarte(p, grupo)
      if (motivo) {
        descartados.push({ year: grupo.year, trimestre: grupo.trimestre, motivo })
        console.warn(`drop: ${grupo.year} T${grupo.trimestre} · ${motivo}`)
      } else survivors.push(p)
    } catch (err) {
      const motivo = `error: ${(err as Error).message}`
      descartados.push({ year: grupo.year, trimestre: grupo.trimestre, motivo })
      console.warn(`drop: ${grupo.year} T${grupo.trimestre} · ${motivo}`)
    }
  }
  survivors.sort((a, b) => a.year - b.year || (a.trimestre ?? 0) - (b.trimestre ?? 0))
  const latest = survivors[survivors.length - 1] ?? null
  const cierre = ultimoCierre(survivors)
  // Anti-shrink guard (same reasoning as scrape-paro): an unreachable or
  // reshuffled upstream page is NOT a data state. 2026-07-30 the nightly
  // overwrote a healthy snapshot with periods:[] and the /presupuesto
  // «Ejecución presupuestaria» section vanished (caught by e2e). Refuse
  // to replace a non-empty snapshot with an empty one; exit non-zero so
  // the best-effort wrapper logs a soft failure and yesterday's data
  // stays live.
  if (survivors.length === 0 && existsSync(OUT)) {
    try {
      const prev = JSON.parse(await readFile(OUT, 'utf8')) as { periods?: unknown[] }
      if ((prev.periods?.length ?? 0) > 0) {
        console.error(
          `[budget-execution] parsed 0 plausible periods but the existing snapshot has ` +
            `${prev.periods!.length} — upstream layout change or WAF; keeping the existing ` +
            `snapshot untouched and failing the run`,
        )
        process.exit(1)
      }
    } catch {
      /* unreadable previous snapshot → fall through and write */
    }
  }
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: EXEC_INDEX_URL,
        periods: survivors,
        latest,
        ultimoCierre: cierre,
        lectura: {
          periodos: grupos.length,
          publicados: survivors.length,
          descartados,
          hojasLeidas: lectura.leidas,
          hojasSinTexto: lectura.sinTexto,
          hojasFallidas: lectura.fallidas,
        },
      },
      null,
      2,
    ),
  )
  console.log(
    `wrote ${survivors.length}/${grupos.length} periods · latest ${latest?.year} T${latest?.trimestre ?? '-'} ` +
      `(gastos ${latest?.ejecucionPct.gastos ?? '-'} %) · último cierre ${cierre?.year ?? '—'} · ` +
      `${descartados.length} descartado(s) · ${lectura.leidas} hoja(s) leída(s), ` +
      `${lectura.sinTexto.length} sin texto, ${lectura.fallidas.length} fallida(s)`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
