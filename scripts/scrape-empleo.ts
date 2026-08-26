#!/usr/bin/env tsx
/**
 * Scrape the Riba-roja municipal employment agency (ADL — Agència de
 * Col·locació) job board at ribaocupacio.portalemp.com → public/data/empleo.json.
 *
 * The offer list is NOT in the static HTML: it loads via an AJAX POST guarded
 * by OWASP CSRFProtector. Verified-live handshake:
 *   1. GET  /ofertas.html                      → sets PHPSESSID + CSRFPTOKEN cookies
 *   2. POST /ofertas.html?acc=tableData        → returns the <table> fragment; the
 *          body must echo the cookie's token back in a same-named CSRFPTOKEN
 *          field (a naive POST is 403'd: "Access Forbidden by CSRFProtector!").
 *   3. GET  /ofertas.html?fo=<id>  (per offer) → server-rendered detail "ficha"
 *
 * Per-offer detail fetches run sequentially with a short delay (polite — no
 * tight loop; ~40s for a full board). On a detail failure the list-level row is
 * kept and the previous snapshot's detail for that offer is reused, so one
 * flaky page never drops an offer.
 *
 * Usage: npm run scrape:empleo
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseOfertasList,
  parseOfertaDetail,
  isOfferClosed,
  type OfertaItem,
  type OfertaDetail,
} from '../src/scraper/empleo'
import { buildEmpleoRss } from '../src/scraper/empleo-rss'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/empleo.json')
const OUT_RSS = join(PROJECT_ROOT, 'public/data/empleo-rss.xml')
// Canonical site origin for the RSS channel <link>; overridable via env. Item
// links always point at the source portal, so this is cosmetic.
const SITE_URL = process.env.SITE_URL || 'https://civicpulse.vercel.app'

const ORIGIN = 'https://ribaocupacio.portalemp.com'
const LIST_URL = `${ORIGIN}/ofertas.html`
// Most upstream hosts behind a WAF reject bare "CivicPulse/0.1" UAs; the
// Mozilla-compatible envelope keeps us attributable without tripping the filter.
const UA = 'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'
const DETAIL_DELAY_MS = 350

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function parseCookies(setCookies: string[]): Record<string, string> {
  const jar: Record<string, string> = {}
  for (const sc of setCookies) {
    const m = sc.match(/^([^=]+)=([^;]*)/)
    if (m) jar[m[1].trim()] = m[2].trim()
  }
  return jar
}

/** Reuse prior detail so one flaky offer page never drops the row. */
async function loadPriorDetail(): Promise<Map<number, OfertaDetail>> {
  const map = new Map<number, OfertaDetail>()
  if (!existsSync(OUT)) return map
  try {
    const snap = JSON.parse(await readFile(OUT, 'utf8')) as { items?: OfertaItem[] }
    for (const it of snap.items || []) {
      if (typeof it.fo === 'number' && it.detail) map.set(it.fo, it.detail)
    }
  } catch (err) {
    // No id-orphan risk here (nothing downstream cites empleo ids), so a
    // corrupt prior file just means "no reuse", not a hard abort.
    console.warn(
      `[empleo] prior snapshot unparseable (${(err as Error).message}) — no detail reuse`,
    )
  }
  return map
}

async function main() {
  // 1) session + CSRF token
  const g = await fetch(LIST_URL, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!g.ok) throw new Error(`GET ${LIST_URL} → HTTP ${g.status} ${g.statusText}`)
  await g.text() // drain
  const setCookies =
    (g.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? []
  const jar = parseCookies(setCookies)
  const token = jar['CSRFPTOKEN']
  if (!token) throw new Error('no CSRFPTOKEN cookie from initial GET — portal changed?')
  const cookieHeader = Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')

  // 2) list fragment via the CSRF-guarded POST (empty filters = all open offers)
  const body = new URLSearchParams({
    'filtro[titulo]': '',
    'filtro[cnae]': '',
    'filtro[municipio]': '',
    CSRFPTOKEN: token,
  })
  const p = await fetch(`${LIST_URL}?acc=tableData`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: LIST_URL,
      Cookie: cookieHeader,
    },
    body,
    signal: AbortSignal.timeout(30_000),
  })
  if (!p.ok) throw new Error(`POST tableData → HTTP ${p.status} ${p.statusText}`)
  const rows = parseOfertasList(await p.text(), { baseUrl: ORIGIN })
  console.log(`[empleo] ${rows.length} open offers listed`)
  if (rows.length === 0) {
    throw new Error('list fragment yielded 0 offers — aborting (likely CSRF/markup change)')
  }

  // 3) per-offer detail — sequential, polite, reuse-on-failure
  const prior = await loadPriorDetail()
  const items: OfertaItem[] = []
  let fetched = 0
  let reused = 0
  let missing = 0
  for (const row of rows) {
    let detail: OfertaDetail | null = null
    try {
      const d = await fetch(row.url, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html',
          Referer: LIST_URL,
          Cookie: cookieHeader,
        },
        signal: AbortSignal.timeout(30_000),
      })
      if (!d.ok) throw new Error(`HTTP ${d.status}`)
      detail = parseOfertaDetail(await d.text())
      fetched++
    } catch (err) {
      detail = prior.get(row.fo) ?? null
      if (detail) reused++
      else missing++
      console.warn(
        `[empleo] detail fo=${row.fo} failed (${(err as Error).message}) — ${detail ? 'reused prior' : 'no prior'}`,
      )
    }
    items.push({ ...row, detail })
    await sleep(DETAIL_DELAY_MS)
  }

  // stats
  const now = Date.now()
  const closingSoon = items.filter((it) => {
    if (!it.deadline) return false
    const days = (Date.parse(it.deadline) - now) / 86_400_000
    return days >= 0 && days <= 14
  }).length
  const byMonth: Record<string, number> = {}
  for (const it of items) {
    const ym = it.publishedAt.slice(0, 7)
    byMonth[ym] = (byMonth[ym] || 0) + 1
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      origin: ORIGIN,
      platform:
        'portalemp — ribaocupacio · Agència de Col·locació (ADL), Ajuntament de Riba-roja de Túria',
      listEndpoint: `${LIST_URL}?acc=tableData`,
    },
    stats: {
      total: items.length,
      // El campo `status` del portal NO se mantiene: hay ofertas en «Abierta»
      // con el plazo vencido hace meses. Contarlas publicaba «67 ofertas
      // abiertas» en tres sitios —/empleo, la portada y /datos— mientras la
      // propia tarjeta las pintaba «Cerrada». Mismo predicado que el SPA.
      openTotal: items.filter((it) => !isOfferClosed(it, now)).length,
      inRibaRoja: items.filter((it) => it.inRibaRoja).length,
      closingSoon,
      withDetail: items.filter((it) => it.detail).length,
      byMonth,
    },
    items,
  }
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(
    `[empleo] wrote ${OUT} — ${items.length} offers (detail: ${fetched} fetched, ${reused} reused, ${missing} missing)`,
  )

  // Companion RSS 2.0 feed (newest-published first, capped) for job-seekers
  // who want new vacancies pushed to a reader.
  const rss = buildEmpleoRss(items, {
    siteUrl: SITE_URL,
    generatedAt: payload.generatedAt,
    limit: 60,
  })
  await writeFile(OUT_RSS, rss)
  console.log(`[empleo] wrote ${OUT_RSS} — RSS feed (${Math.min(items.length, 60)} items)`)
}

main().catch((err) => {
  console.error('[empleo] failed:', err)
  process.exit(1)
})
