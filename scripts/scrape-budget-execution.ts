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
 * encontrados, publicados y descartados con su motivo, y las hojas sin texto.
 * Lo escribe también en el snapshot, en `lectura`, para que no haga falta el
 * log para saberlo.
 *
 * Una hoja sin capa de texto —«Print To PDF» dibujó las letras como trazos: las
 * del 3T de 2025 y la de ingresos del cierre de 2024— se lee por OCR, y entra
 * sólo si su lectura cuadra (budget-execution-ocr.ts). Cada una sale en
 * `lectura.hojasOcr` con lo que pasó: leída, usada para cotejar, descartada con
 * el motivo o sin lector. Los mismos bytes de la descarga van al OCR: la hoja
 * no se pide dos veces.
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
  type BudgetExecutionPeriod,
  type ExecDoc,
  type ExecKind,
} from '../src/scraper/budget-execution'
import {
  fetchPdf,
  textoDePdf,
  fetchExecutionIndex,
  EXEC_INDEX_URL,
} from '../src/scraper/budget-execution-fetch'
import {
  cotejarDesglose,
  lecturaAceptable,
  type DesgloseLeido,
  type LecturaValida,
} from '../src/scraper/budget-execution-ocr'
import { crearLectorOcr, type LectorOcr } from '../src/scraper/budget-execution-ocr-fetch'

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
})

interface HojaOcr {
  hoja: string
  plantilla: string | null
  /**
   * leida: cuadra y es candidata a su periodo · cotejo: un desglose, que no se
   * publica y coteja el resumen · descartada: no cuadró, con el motivo ·
   * sin-lector: el OCR no pudo arrancar, con el motivo.
   */
  resultado: 'leida' | 'cotejo' | 'descartada' | 'sin-lector'
  /** Con qué ajuste de página salió la lectura que se usa. */
  ajuste: string | null
  motivo: string | null
  /** Resumen o desglose: si se cotejaron entre sí. */
  cotejo?: 'coincide' | 'contradice' | 'sin-desglose' | 'sin-resumen'
}

interface Lectura {
  /** Hojas descargadas y con texto. */
  leidas: number
  /** Hojas sin capa de texto: «Print To PDF» dibujó las letras como trazos. Van al OCR. */
  sinTexto: string[]
  /** Hojas que no se pudieron descargar. */
  fallidas: string[]
  /** Lo que el OCR hizo con cada hoja sin texto. */
  ocr: HojaOcr[]
}

// El lector OCR se arranca la primera vez que hace falta, y una sola vez: si no
// arranca, cada hoja sin texto lo dice con el motivo, en vez de contarse vacía.
let lector: LectorOcr | null = null
let sinLector: string | null = null
async function lectorOcr(): Promise<LectorOcr | null> {
  if (lector || sinLector) return lector
  try {
    lector = await crearLectorOcr()
  } catch (err) {
    sinLector = `el lector OCR no arranca: ${(err as Error).message}`
  }
  return lector
}

// Fetch + parse every candidate PDF for one side and pick the best ExecDoc
// (`elegirDocumento`: valid total, latest cut, most chapters). Candidates are
// fetched serially with the shared throttle; a throwing candidate is skipped,
// not fatal. Returns an empty doc when nothing usable was found (the gate then
// drops the period, saying why) and, if OCR'd sheets failed, why they did.
async function selectBestDoc(
  urls: string[],
  kind: ExecKind,
  nombre: Map<string, string>,
  lectura: Lectura,
): Promise<{ doc: ExecDoc; motivoOcr: string | null }> {
  const docs: ExecDoc[] = []
  const porOcr: Array<{ l: LecturaValida; hoja: HojaOcr }> = []
  const desgloses: Array<{ l: DesgloseLeido; hoja: HojaOcr }> = []
  const fallosOcr: string[] = []
  for (const url of urls) {
    const hoja = nombre.get(url) ?? url
    try {
      const pdf = await fetchPdf(url)
      if (!pdf) {
        lectura.fallidas.push(hoja)
        continue
      }
      const text = await textoDePdf(pdf)
      if (text.replace(/\s+/g, '').length >= SIN_TEXTO) {
        lectura.leidas++
        const doc = parseBudgetExecutionPdf(text)
        if (doc.kind === kind) docs.push(doc)
        continue
      }
      lectura.sinTexto.push(hoja)
      const l = await lectorOcr()
      if (!l) {
        lectura.ocr.push({
          hoja,
          plantilla: null,
          resultado: 'sin-lector',
          ajuste: null,
          motivo: sinLector,
        })
        fallosOcr.push(sinLector!)
        continue
      }
      // Su propio try: si el OCR se cuelga o revienta en esta hoja, la hoja ya
      // está en `sinTexto` y tiene que salir en `ocr` con el motivo, no
      // contarse como una descarga fallida.
      let leida: Awaited<ReturnType<LectorOcr['leerPdf']>>
      try {
        leida = await l.leerPdf(pdf)
      } catch (err) {
        const motivo = `el OCR no terminó: ${(err as Error).message}`
        lectura.ocr.push({ hoja, plantilla: null, resultado: 'descartada', ajuste: null, motivo })
        fallosOcr.push(motivo)
        continue
      }
      const { lectura: r, ajuste } = leida
      const registro: HojaOcr = {
        hoja,
        plantilla: r.plantilla,
        resultado: 'leida',
        ajuste,
        motivo: null,
      }
      lectura.ocr.push(registro)
      if (!lecturaAceptable(r)) {
        registro.resultado = 'descartada'
        registro.motivo = r.motivo ?? 'no se lee su fila «Total»'
        fallosOcr.push(registro.motivo)
      } else if (r.plantilla === 'desglose') {
        registro.resultado = 'cotejo'
        if (r.kind === kind) desgloses.push({ l: r, hoja: registro })
      } else if (r.doc.kind !== kind) {
        registro.resultado = 'descartada'
        registro.motivo = `la hoja es de ${r.doc.kind} y el enlace dice ${kind}`
        fallosOcr.push(registro.motivo)
      } else porOcr.push({ l: r, hoja: registro })
    } catch (err) {
      lectura.fallidas.push(hoja)
      console.warn(`skip candidate (${kind}): ${url} · ${(err as Error).message}`)
    } finally {
      await sleep(400)
    }
  }
  // Un resumen leído por OCR se coteja con los desgloses de su periodo, que son
  // otras hojas del mismo listado: si uno lo contradice, no entra.
  for (const { l, hoja } of porOcr) {
    if (l.plantilla === 'resumen') {
      const cotejos = desgloses.map((d) => ({ d, c: cotejarDesglose(l, d.l) }))
      const contra = cotejos.find((x) => x.c.estado === 'contradice')
      for (const { d, c } of cotejos)
        d.hoja.cotejo = c.estado === 'coincide' ? 'coincide' : 'contradice'
      if (contra && contra.c.estado === 'contradice') {
        hoja.resultado = 'descartada'
        hoja.cotejo = 'contradice'
        hoja.motivo = contra.c.motivo
        fallosOcr.push(contra.c.motivo)
        continue
      }
      hoja.cotejo = cotejos.length ? 'coincide' : 'sin-desglose'
    }
    docs.push(l.doc)
  }
  for (const d of desgloses) d.hoja.cotejo ??= 'sin-resumen'
  return {
    doc: elegirDocumento(docs) ?? emptyDoc(kind),
    motivoOcr: fallosOcr.length ? fallosOcr.join('; ') : null,
  }
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
  const lectura: Lectura = { leidas: 0, sinTexto: [], fallidas: [], ocr: [] }
  const survivors: BudgetExecutionPeriod[] = []
  const descartados: Array<{ year: number; trimestre: number; motivo: string }> = []
  for (const grupo of grupos) {
    try {
      const g = await selectBestDoc(grupo.gastos, 'gastos', nombre, lectura)
      const i = await selectBestDoc(grupo.ingresos, 'ingresos', nombre, lectura)
      const p = mergeExecutionPeriod(g.doc, i.doc, { trimestre: grupo.trimestre })
      let motivo = motivoDeDescarte(p, grupo)
      // Si el lado que falta venía de una hoja sin texto, el motivo dice por qué
      // no se leyó: «ingresos sin total legible» a secas no lo distingue.
      const ocr = motivo?.startsWith('gastos')
        ? g.motivoOcr
        : motivo?.startsWith('ingresos')
          ? i.motivoOcr
          : null
      if (motivo && ocr) motivo = `${motivo} (OCR: ${ocr})`
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
  await lector?.cerrar()
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
          motorOcr: lector?.motor ?? null,
          hojasOcr: lectura.ocr,
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
      `${lectura.sinTexto.length} sin texto (${lectura.ocr.filter((h) => h.resultado === 'leida').length} leída(s) por OCR, ` +
      `${lectura.ocr.filter((h) => h.resultado === 'cotejo').length} para cotejar, ` +
      `${lectura.ocr.filter((h) => h.resultado === 'descartada').length} descartada(s), ` +
      `${lectura.ocr.filter((h) => h.resultado === 'sin-lector').length} sin lector), ` +
      `${lectura.fallidas.length} fallida(s)`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
