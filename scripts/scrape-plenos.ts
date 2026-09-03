#!/usr/bin/env tsx
/**
 * Crawl the council's pleno index for the last few years, merge into one
 * newest-first list, write public/data/plenos.json.
 *
 * 2026-05-25: migrated source from ribarroja.es/plenos/<year> (HTTPS now
 * 404s for that path) to the Regmeet SaaS at
 * regmeet.com/aytoribarroja/sesiones_categorias/<entityHash>/<year>.
 * Existing plenoIds are preserved by matching on date so downstream files
 * (pleno-claims, pleno-findings, …) keep working without backfill.
 *
 * Usage: npm run scrape:plenos
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseRegmeetSessions, mergePlenoSessions, type PlenoItem } from '../src/scraper/plenos'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/plenos.json')

// Regmeet entity hash for Ajuntament de Riba-roja de Túria. Stable since
// the platform was wired in. Confirmed in the public nav at
// ribarroja.es/es/ayuntamiento — "Plenos" → external link.
const REGMEET_BASE = 'https://regmeet.com'
const REGMEET_ENTITY = '3b56be67439045acfbc7c1552d87a166'
// Most upstream hosts behind a WAF reject bare "CivicPulse/0.1" UAs with
// a TLS RST. The Mozilla-compatible envelope keeps us attributable but
// doesn't trip the filter.
const UA = 'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'

async function loadExisting(): Promise<{ items: PlenoItem[]; idByDate: Map<string, string> }> {
  const idByDate = await loadExistingIdByDate()
  if (!existsSync(OUT)) return { items: [], idByDate }
  try {
    const snap = JSON.parse(await readFile(OUT, 'utf8')) as { items?: PlenoItem[] }
    return { items: snap.items ?? [], idByDate }
  } catch {
    // `loadExistingIdByDate` ya se ha caído antes por esto mismo.
    return { items: [], idByDate }
  }
}

async function loadExistingIdByDate(): Promise<Map<string, string>> {
  // Absent file = first-run bootstrap (fine). A PRESENT-but-unparseable file
  // is different: regenerating every pleno id would silently orphan the
  // pleno-claims / pleno-findings rows that cite the old ids, so refuse.
  if (!existsSync(OUT)) return new Map()
  const buf = await readFile(OUT, 'utf8')
  let snap: { items?: PlenoItem[] }
  try {
    snap = JSON.parse(buf) as { items?: PlenoItem[] }
  } catch (err) {
    console.error(
      `[plenos] ${OUT} exists but is unparseable (${(err as Error).message}) — refusing to regenerate ids over a corrupt snapshot`,
    )
    process.exit(1)
  }
  const map = new Map<string, string>()
  for (const it of snap.items || []) {
    if (it.date && it.id) map.set(it.date, it.id)
  }
  return map
}

async function fetchYear(
  year: number,
  existingIdByDate: Map<string, string>,
): Promise<{ rows: PlenoItem[]; ok: boolean; motivo?: string }> {
  const url = `${REGMEET_BASE}/aytoribarroja/sesiones_categorias/${REGMEET_ENTITY}/${year}?idioma=castellano`
  // Un año que no se pudo leer y un año sin sesiones devolvían los dos una
  // lista vacía, así que eran indistinguibles y el fichero encogía en
  // silencio. Ahora el fallo viaja aparte del resultado.
  let res: Response
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(30_000),
    })
  } catch (err) {
    return { rows: [], ok: false, motivo: `${year}: ${(err as Error).message}` }
  }
  if (!res.ok) {
    return { rows: [], ok: false, motivo: `${year}: HTTP ${res.status} ${res.statusText}` }
  }
  return {
    rows: parseRegmeetSessions(await res.text(), {
      year,
      baseUrl: REGMEET_BASE,
      existingIdByDate,
    }),
    ok: true,
  }
}

async function main() {
  const { items: previas, idByDate: existingIdByDate } = await loadExisting()
  const nowYear = new Date().getFullYear()
  const years = [nowYear, nowYear - 1, nowYear - 2, nowYear - 3]
  const all: PlenoItem[] = []
  const fallidos: string[] = []
  for (const y of years) {
    console.log(`[plenos] fetching ${y}…`)
    const r = await fetchYear(y, existingIdByDate)
    if (!r.ok) {
      console.warn(`[plenos] ${r.motivo}`)
      fallidos.push(r.motivo!)
      continue
    }
    all.push(...r.rows)
  }

  // Dedup dentro de la pasada (la ventana solapa), y funde sobre lo publicado:
  // la ventana de cuatro años no puede tirar lo que ya se había visto.
  const byId = new Map<string, PlenoItem>()
  for (const it of all) if (!byId.has(it.id)) byId.set(it.id, it)
  const { items, carriedForward, refreshed } = mergePlenoSessions(previas, [...byId.values()])

  const byYear: Record<number, number> = {}
  for (const it of items) {
    const y = parseInt(it.date.slice(0, 4), 10)
    byYear[y] = (byYear[y] || 0) + 1
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      baseUrl: REGMEET_BASE,
      platform: `Regmeet — aytoribarroja/sesiones_categorias/${REGMEET_ENTITY}/<year>`,
    },
    stats: {
      total: items.length,
      byYear,
      latestDate: items[0]?.date ?? null,
      // Una pasada tiene que demostrar que hizo su trabajo: los años
      // intentados, los que respondieron, y los que no, por separado. Doblar
      // «no lo intenté» dentro de «sin cambios» es lo que dejó a una pasada
      // decir «re-juzgadas 1017» sin una sola llamada.
      ventana: { desde: years[years.length - 1], hasta: years[0] },
      aniosIntentados: years.length,
      aniosFallidos: fallidos.length,
      sesionesRefrescadas: refreshed,
      sesionesArrastradas: carriedForward,
    },
    items,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  const reused = items.filter((it) => existingIdByDate.get(it.date) === it.id).length
  console.log(
    `[plenos] wrote ${OUT} — ${items.length} sesiones ` +
      `(refrescadas ${refreshed}, arrastradas ${carriedForward}, ids reutilizados ${reused})`,
  )

  // Se sale 1 DESPUÉS de escribir, y eso es deliberado: arrastrar lo ya visto
  // deja el fichero íntegro, así que fallar en alto no publica un hueco. Antes
  // de fundir, un año caído encogía la lista y salía 0; las dos mitades tienen
  // que ir juntas o la ruidosa se vuelve destructiva.
  if (fallidos.length > 0) {
    console.error(
      `[plenos] ${fallidos.length}/${years.length} año(s) sin leer: ${fallidos.join(' · ')}`,
    )
    process.exit(1)
  }

  // Cuatro respuestas correctas y ni una sesión no es un pueblo que no se
  // reúne: es la portada servida en lugar del listado. Se descubrió probando
  // el camino de fallo de arriba — con un identificador de entidad inventado,
  // regmeet contesta 200 con la tabla vacía, así que `ok: true` cuatro veces y
  // salida 0 tan contenta. El adaptador hermano ya guarda esto mismo
  // (`itemCount === 0` en scrape-pleno-agendas); aquí faltaba.
  //
  // Va después de escribir por lo mismo que lo de arriba: lo publicado sigue
  // entero gracias al arrastre, y lo que se niega es dar la pasada por buena.
  if (refreshed === 0 && previas.length > 0) {
    console.error(
      `[plenos] 0 sesiones leídas en ${years.length} año(s) que respondieron — ` +
        `se conservan las ${items.length} publicadas, pero esta pasada no ha leído nada`,
    )
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[plenos] failed:', err)
  process.exit(1)
})
