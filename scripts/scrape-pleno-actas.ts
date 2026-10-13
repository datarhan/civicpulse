#!/usr/bin/env tsx
/**
 * Indexa las actas firmadas que regmeet publica en la pestaña «Documentos» de
 * cada sesión de pleno, y escribe
 *   public/data/pleno-actas.json   — URL, fechas, páginas y hash. NINGÚN texto.
 *   .cache/pleno-actas/<plenoId>.txt — el texto (pdftotext, sin `-layout`), gitignorado.
 *
 * El texto no se publica: un acta nombra a cada concejal y a particulares, y lo
 * que se publica de ella pasa por un curador. Lo usa `check:votos-acta`, que
 * coteja cada desglose publicado contra la votación de fondo.
 *
 * Hasta el 2026-10-13 creíamos que las actas de 2025-2026 no estaban publicadas;
 * estaban aquí desde el 30-07-2026 (cabecera de `src/scraper/regmeet-documentos.ts`).
 *
 * Educado: el UA de siempre, 1,5 s entre peticiones, 15 s de tiempo máximo, sin
 * paralelismo. regmeet bloquea los runners de GitHub: este adaptador sólo se
 * refresca desde `scripts/scrape-ci-blocked.sh`.
 *
 * Uso: npm run scrape:pleno-actas
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchConCookies } from './lib/regmeet-fetch'
import {
  clasificarDocumento,
  parseRegmeetDocumentos,
  type RegmeetDocumento,
} from '../src/scraper/regmeet-documentos'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')
const PLENOS = join(PROJECT_ROOT, 'public/data/plenos.json')
const OUT = join(PROJECT_ROOT, 'public/data/pleno-actas.json')
const CACHE = join(PROJECT_ROOT, '.cache/pleno-actas')

// El mismo UA que scrape-pleno-agendas.ts: el WAF de regmeet rechaza el «CivicPulse/…» pelado.
const UA = 'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'

/**
 * Tras tantos fallos de red SEGUIDOS, regmeet está caído o bloqueando esta IP:
 * se deja de pagar el tiempo máximo en cada sesión y el resto se cuenta como
 * «sin intentar», que no es «fallida» (DATA_INTEGRITY, regla 2).
 */
const MAX_FALLOS_SEGUIDOS = 3

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Hash de los BYTES del PDF. `sha256Short` toma texto: un PDF pasado a string se corrompe. */
const sha256CortoDeBytes = (b: Buffer) => createHash('sha256').update(b).digest('hex').slice(0, 12)

export interface ActaIndexada {
  plenoId: string
  fecha: string
  url: string
  etiqueta: string
  subidoEl: string | null
  /** Del `Pages:` de pdfinfo; null si pdfinfo no está o no lo dice. Nunca 0. */
  paginas: number | null
  sha256Short: string
}

async function descargar(url: string, accept: string): Promise<Buffer | null> {
  try {
    // Con cookies: regmeet redirige cada página de sesión a sí misma poniendo
    // `humano=si`. Ver scripts/lib/regmeet-fetch.ts.
    const res = await fetchConCookies(url, {
      headers: { 'User-Agent': UA, Accept: accept },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      console.warn(`\n[pleno-actas] ${url} -> HTTP ${res.status}`)
      return null
    }
    return Buffer.from(await res.arrayBuffer())
  } catch (err) {
    // Un null mudo escondió una vez un bloqueo del WAF durante días: siempre deja rastro.
    console.warn(`\n[pleno-actas] ${url} falló: ${(err as Error).message}`)
    return null
  }
}

function paginasDe(pdf: string): number | null {
  const r = spawnSync('pdfinfo', [pdf], { encoding: 'utf8' })
  if (r.error || r.status !== 0) return null
  const m = /^Pages:\s+(\d+)/m.exec(r.stdout)
  const n = m ? Number(m[1]) : NaN
  return Number.isInteger(n) && n > 0 ? n : null
}

async function leerAnterior(): Promise<ActaIndexada[]> {
  try {
    const prev = JSON.parse(await readFile(OUT, 'utf8')) as { items?: ActaIndexada[] }
    return Array.isArray(prev.items) ? prev.items : []
  } catch {
    return []
  }
}

type Desenlace = 'conActa' | 'sinDocumentos' | 'soloOtros' | 'fechaNoCoincide' | 'fallida'

async function main() {
  const index = JSON.parse(await readFile(PLENOS, 'utf8')) as {
    items?: Array<{ id: string; date: string; link?: string }>
  }
  const sesiones = (index.items ?? [])
    .filter((p) => {
      try {
        return new URL(p.link ?? '').host === 'regmeet.com'
      } catch {
        return false
      }
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))
  const anterior = await leerAnterior()
  const anteriorPorUrl = new Map(anterior.map((a) => [a.url, a]))
  const anteriorPorPleno = new Map(anterior.map((a) => [a.plenoId, a]))
  await mkdir(CACHE, { recursive: true })

  const stats = {
    sesiones: sesiones.length,
    conActa: 0,
    sinDocumentos: 0,
    soloOtros: 0,
    fechaNoCoincide: 0,
    fallidas: 0,
    // Lo que esta pasada no llegó a pedir (regmeet caído): ni fallida ni vacía.
    sinIntentar: 0,
    // De las fallidas o sin intentar, cuántas conservan el acta de la pasada anterior.
    arrastradas: 0,
    // PDF que no hizo falta volver a bajar: el de .cache tiene el hash indexado.
    pdfReutilizados: 0,
  }
  const items: ActaIndexada[] = []
  let fallosSeguidos = 0
  let primera = true
  const pedir = async (url: string, accept: string) => {
    if (!primera) await sleep(1500)
    primera = false
    return descargar(url, accept)
  }

  for (let i = 0; i < sesiones.length; i++) {
    const p = sesiones[i]
    process.stdout.write(`[${i + 1}/${sesiones.length}] ${p.date} ${p.id} … `)
    const arrastrar = () => {
      const prev = anteriorPorPleno.get(p.id)
      if (prev) {
        items.push(prev)
        stats.arrastradas += 1
      }
    }
    if (fallosSeguidos >= MAX_FALLOS_SEGUIDOS) {
      console.log('sin intentar (regmeet no responde)')
      stats.sinIntentar += 1
      arrastrar()
      continue
    }

    const html = await pedir(p.link!, 'text/html')
    if (!html) {
      fallosSeguidos += 1
      stats.fallidas += 1
      console.log('fallida (página de sesión)')
      arrastrar()
      continue
    }
    fallosSeguidos = 0

    const documentos = parseRegmeetDocumentos(html.toString('utf8'))
    let desenlace: Desenlace = documentos.length === 0 ? 'sinDocumentos' : 'soloOtros'
    let algunaFallo = false
    let algunaActaOtraFecha = false
    let elegida: { doc: RegmeetDocumento; sha: string; pdf: string; txt: string } | null = null

    for (let d = 0; d < documentos.length && !elegida; d++) {
      const doc = documentos[d]
      const pdf = join(CACHE, `${p.id}-${d}.pdf`)
      const txt = join(CACHE, `${p.id}-${d}.txt`)
      let bytes: Buffer | null = null
      const prev = anteriorPorUrl.get(doc.url)
      if (prev && existsSync(pdf)) {
        const local = await readFile(pdf)
        if (sha256CortoDeBytes(local) === prev.sha256Short) {
          bytes = local
          stats.pdfReutilizados += 1
        }
      }
      if (!bytes) {
        bytes = await pedir(doc.url, 'application/pdf')
        if (!bytes) {
          algunaFallo = true
          continue
        }
        await writeFile(pdf, bytes)
      }
      const r = spawnSync('pdftotext', [pdf, txt], { encoding: 'utf8' })
      if (r.error || r.status !== 0) {
        // pdftotext roto o ausente es un fallo nuestro, nunca «sin documentos».
        console.warn(
          `\n[pleno-actas] pdftotext ${pdf}: ${r.error?.message ?? `salida ${r.status}`} ${r.stderr ?? ''}`,
        )
        algunaFallo = true
        continue
      }
      const { tipo, fechaCoincide } = clasificarDocumento(await readFile(txt, 'utf8'), p.date)
      if (tipo === 'acta' && fechaCoincide) {
        elegida = { doc, sha: sha256CortoDeBytes(bytes), pdf, txt }
      } else if (tipo === 'acta') {
        algunaActaOtraFecha = true
      }
    }

    if (elegida) {
      desenlace = 'conActa'
      await copyFile(elegida.txt, join(CACHE, `${p.id}.txt`))
      items.push({
        plenoId: p.id,
        fecha: p.date,
        url: elegida.doc.url,
        etiqueta: elegida.doc.etiqueta,
        subidoEl: elegida.doc.subidoEl,
        paginas: paginasDe(elegida.pdf),
        sha256Short: elegida.sha,
      })
    } else if (algunaFallo) {
      desenlace = 'fallida'
      arrastrar()
    } else if (algunaActaOtraFecha) {
      desenlace = 'fechaNoCoincide'
    }
    stats[desenlace === 'fallida' ? 'fallidas' : desenlace] += 1
    console.log(`${documentos.length} documento(s) → ${desenlace}`)
  }

  const resumen =
    `[pleno-actas] intentadas ${stats.sesiones - stats.sinIntentar} de ${stats.sesiones} · ` +
    `con acta ${stats.conActa} · sin documentos ${stats.sinDocumentos} · ` +
    `sólo otros ${stats.soloOtros} · fecha no coincide ${stats.fechaNoCoincide} · ` +
    `fallidas ${stats.fallidas} · sin intentar ${stats.sinIntentar} · ` +
    `arrastradas ${stats.arrastradas} · PDF reutilizados ${stats.pdfReutilizados}`
  console.log(resumen)

  // El cortacircuitos de scrape-pleno-agendas: con media pasada perdida, el
  // fichero anterior vale más que uno nuevo a medias, y no se toca.
  const perdidas = stats.fallidas + stats.sinIntentar
  if (stats.sesiones === 0 || perdidas >= stats.sesiones / 2) {
    console.error(
      `[pleno-actas] ${perdidas} de ${stats.sesiones} sesiones fallidas o sin intentar — ` +
        `se deja ${OUT} como estaba`,
    )
    process.exit(1)
  }

  items.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      baseUrl: 'https://regmeet.com',
      description:
        'Actas firmadas de pleno del Ayuntamiento de Riba-roja de Túria, publicadas en la pestaña «Documentos» de cada sesión en regmeet.com (aytoribarroja). Un PDF cuenta como acta por su texto («ACTA SESIÓN …» con la fecha del pleno), nunca por su etiqueta. Este índice no lleva texto del acta.',
    },
    stats,
    items,
  }
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[pleno-actas] escrito ${OUT} — ${items.length} acta(s)`)
}

main().catch((err) => {
  console.error('[pleno-actas] falló:', err)
  process.exit(1)
})
