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
 * Incremental desde el 25-10-2026: cada pasada pide sólo las sesiones que le
 * tocan (`tocaPedir`: las más recientes y una ventana rotatoria del resto) y
 * conserva sin petición las demás. Pedir las 63 a diario hacía que regmeet
 * cerrase la conexión (ECONNREFUSED) a mitad de pasada desde el 16-10, y el
 * índice se quedó diez días sin escribirse. `--completo` fuerza la pasada entera.
 *
 * Uso: npm run scrape:pleno-actas [-- --completo]
 */
import { sha256Short } from '../src/scraper/hash'
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
import { desenlaceSesion, puedeEscribirIndice, tocaPedir } from '../src/scraper/pleno-actas-pasada'

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

/** Hash de los BYTES del PDF, con la primitiva compartida: nunca una copia local. */
const sha256CortoDeBytes = (b: Buffer) => sha256Short(b)

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
    // «fetch failed» a secas escondió diez días que regmeet nos rechazaba la
    // conexión (ECONNREFUSED): la causa va en `cause`, y se dice.
    const e = err as Error & { cause?: { code?: string; message?: string } }
    const causa = e.cause ? ` (${e.cause.code ?? e.cause.message ?? 'sin código'})` : ''
    console.warn(`\n[pleno-actas] ${url} falló: ${e.message}${causa}`)
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
    // Las que hoy no tocaba pedir (`tocaPedir`), y de ellas cuántas tenían acta.
    conservadas: 0,
    conservadasConActa: 0,
    // PDF que no hizo falta volver a bajar: el de .cache tiene el hash indexado.
    pdfReutilizados: 0,
  }
  const items: ActaIndexada[] = []
  const completo = process.argv.includes('--completo')
  const dia = Math.floor(Date.now() / 86_400_000)
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
    const toca = tocaPedir({
      indice: i,
      sesiones: sesiones.length,
      dia,
      completo,
      faltaTexto: anteriorPorPleno.has(p.id) && !existsSync(join(CACHE, `${p.id}.txt`)),
    })
    if (!toca) {
      const prev = anteriorPorPleno.get(p.id)
      console.log(prev ? 'conservada (hoy no toca)' : 'sin acta, hoy no toca')
      stats.conservadas += 1
      if (prev) {
        items.push(prev)
        stats.conservadasConActa += 1
      }
      continue
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

    const {
      desenlace,
      arrastrar: hayQueArrastrar,
      motivo,
    } = desenlaceSesion({
      documentos: documentos.length,
      hayActa: elegida !== null,
      algunaFallo,
      algunaActaOtraFecha,
      teniaActa: anteriorPorPleno.has(p.id),
    })
    if (motivo) console.error(`\n[pleno-actas] ${p.id} (${p.date}) fallida: ${motivo}`)
    if (hayQueArrastrar) arrastrar()
    if (elegida) {
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
    }
    stats[desenlace === 'fallida' ? 'fallidas' : desenlace] += 1
    console.log(`${documentos.length} documento(s) → ${desenlace}`)
  }

  const tocaban = stats.sesiones - stats.conservadas
  const resumen =
    `[pleno-actas] ${completo ? 'pasada completa · ' : ''}` +
    `tocaban ${tocaban} de ${stats.sesiones} · intentadas ${tocaban - stats.sinIntentar} · ` +
    `conservadas sin pedir ${stats.conservadas} (${stats.conservadasConActa} con acta) · ` +
    `con acta ${stats.conActa} · sin documentos ${stats.sinDocumentos} · ` +
    `sólo otros ${stats.soloOtros} · fecha no coincide ${stats.fechaNoCoincide} · ` +
    `fallidas ${stats.fallidas} · sin intentar ${stats.sinIntentar} · ` +
    `arrastradas ${stats.arrastradas} · PDF reutilizados ${stats.pdfReutilizados}`
  console.log(resumen)

  // El cortacircuitos de scrape-pleno-agendas, más uno propio: con media pasada
  // perdida, o con menos de la mitad de las actas que había, el fichero anterior
  // vale más que uno nuevo a medias, y no se toca (`puedeEscribirIndice`).
  const puerta = puedeEscribirIndice({ ...stats, tocaban, previas: anterior.length })
  if (!puerta.ok) {
    console.error(`[pleno-actas] ${puerta.motivo} — se deja ${OUT} como estaba`)
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
