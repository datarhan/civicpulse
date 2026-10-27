#!/usr/bin/env tsx
/**
 * Lee el vídeo que incrusta la página de cada sesión de pleno en regmeet y escribe
 *   public/data/pleno-videos-regmeet.json
 *
 * Es la segunda fuente de vídeo, al lado del canal de YouTube
 * (`scrape-pleno-videos.ts`): la única que ata un vídeo a una sesión y no a la
 * fecha de un título, y la única que no lo pierde cuando el canal sube otras
 * cosas (cabecera de `src/scraper/regmeet-video.ts`). Cómo se juntan las dos, y
 * qué pasa cuando no dicen lo mismo: `src/scraper/pleno-video-fuentes.ts`.
 *
 * No pide nada a regmeet. Lee las páginas que `scrape:pleno-actas` descarga cada
 * día y guarda en `.cache/regmeet-sesiones/` (scripts/lib/regmeet-paginas.ts):
 * una pasada propia por las mismas páginas encontraba la conexión cerrada
 * (cabecera de `src/scraper/pleno-videos-regmeet-pasada.ts`). Así que corre
 * DETRÁS de la de actas, en `scripts/scrape-ci-blocked.sh`, y una sesión cuya
 * página aún no está en la caché queda como estaba: con su fila anterior, o sin
 * leer — que no es «sin vídeo».
 *
 * Este fichero NO alimenta la cola de transcripción: un vídeo que sólo da regmeet
 * se enseña en /plenos/:id, pero no se transcribe sin que el operador lo decida.
 *
 * Uso: npm run scrape:pleno-videos-regmeet
 */
import { existsSync } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { paginaDeSesion } from './lib/regmeet-paginas'
import { parseRegmeetVideo } from '../src/scraper/regmeet-video'
import {
  desenlaceVideo,
  puedeEscribirVideos,
  type FilaVideoRegmeet,
} from '../src/scraper/pleno-videos-regmeet-pasada'
import { discrepanciasDeVideo, type VideoCanal } from '../src/scraper/pleno-video-fuentes'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')
const PLENOS = join(PROJECT_ROOT, 'public/data/plenos.json')
const CANAL = join(PROJECT_ROOT, 'public/data/pleno-videos.json')
const OUT = join(PROJECT_ROOT, 'public/data/pleno-videos-regmeet.json')

async function leerJson<T>(ruta: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(ruta, 'utf8')) as T
  } catch {
    return null
  }
}

async function main() {
  const index = await leerJson<{ items?: Array<{ id: string; date: string; link?: string }> }>(
    PLENOS,
  )
  const sesiones = (index?.items ?? [])
    .filter((p) => {
      try {
        return new URL(p.link ?? '').host === 'regmeet.com'
      } catch {
        return false
      }
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))
  const anterior = (await leerJson<{ items?: FilaVideoRegmeet[] }>(OUT))?.items ?? []
  const anteriorPorPleno = new Map(anterior.map((f) => [f.plenoId, f]))

  const stats = {
    sesiones: sesiones.length,
    // Sesiones con su página en la caché, leídas en esta pasada.
    leidas: 0,
    conVideo: 0,
    sinVideo: 0,
    // Lecturas que no observan nada: ni «sin vídeo» ni fila nueva.
    sinMarcador: 0,
    ilegibles: 0,
    // Tenía vídeo y la página ya no incrusta ninguno: se conserva y se dice.
    desaparecidos: 0,
    // Incrustaba un vídeo y ahora otro: se escribe y se dice.
    cambiados: 0,
    // Sin página en la caché: `scrape:pleno-actas` aún no la ha descargado.
    sinPagina: 0,
    // De ellas, las que conservan la fila de una pasada anterior…
    conservadas: 0,
    // …y las que no se han leído nunca.
    pendientes: 0,
    // De las leídas que no observan nada, cuántas conservan la fila anterior.
    arrastradas: 0,
  }
  const contador = {
    'con-video': 'conVideo',
    'sin-video': 'sinVideo',
    'sin-marcador': 'sinMarcador',
    ilegible: 'ilegibles',
    desaparecido: 'desaparecidos',
  } as const
  const items: FilaVideoRegmeet[] = []

  for (let i = 0; i < sesiones.length; i++) {
    const p = sesiones[i]
    const prev = anteriorPorPleno.get(p.id) ?? null
    process.stdout.write(`[${i + 1}/${sesiones.length}] ${p.date} ${p.id} … `)
    const ruta = paginaDeSesion(p.id)
    if (!existsSync(ruta)) {
      stats.sinPagina += 1
      if (prev) {
        items.push(prev)
        stats.conservadas += 1
        console.log(`sin página en la caché — se conserva la fila del ${prev.comprobadoEl}`)
      } else {
        stats.pendientes += 1
        console.log('sin página en la caché — sin leer')
      }
      continue
    }

    stats.leidas += 1
    const descargadaEl = (await stat(ruta)).mtime.toISOString().slice(0, 10)
    const lectura = parseRegmeetVideo(await readFile(ruta, 'utf8'))
    const r = desenlaceVideo({
      plenoId: p.id,
      fecha: p.date,
      descargadaEl,
      lectura: lectura.lectura,
      ytId: lectura.ytId,
      url: lectura.url,
      anterior: prev,
    })
    if (r.fila) items.push(r.fila)
    if (r.fila && r.fila === prev) stats.arrastradas += 1
    if (r.cambiado) stats.cambiados += 1
    stats[contador[r.desenlace]] += 1
    const detalle =
      r.desenlace === 'con-video'
        ? ` ${r.fila?.ytId}`
        : r.desenlace === 'ilegible'
          ? ` «${lectura.crudo}»`
          : ''
    console.log(`${r.desenlace}${detalle} (página del ${descargadaEl})`)
    if (r.motivo) console.error(`\n[pleno-videos-regmeet] ${p.id} (${p.date}): ${r.motivo}`)
  }

  const resumen =
    `[pleno-videos-regmeet] ${stats.sesiones} sesiones · leídas de la caché ${stats.leidas} · ` +
    `con vídeo ${stats.conVideo} · sin vídeo ${stats.sinVideo} · sin marcador ${stats.sinMarcador} · ` +
    `ilegibles ${stats.ilegibles} · desaparecidos ${stats.desaparecidos} · cambiados ${stats.cambiados} · ` +
    `sin página ${stats.sinPagina} (conservadas ${stats.conservadas}, sin leer ${stats.pendientes}) · ` +
    `arrastradas ${stats.arrastradas}`
  console.log(resumen)

  const puerta = puedeEscribirVideos(stats)
  if (!puerta.ok) {
    console.error(`[pleno-videos-regmeet] ${puerta.motivo} — se deja ${OUT} como estaba`)
    process.exit(1)
  }

  items.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      baseUrl: 'https://regmeet.com',
      description:
        'Vídeo que incrusta la página de cada sesión de pleno del Ayuntamiento de Riba-roja de Túria en regmeet.com (aytoribarroja): el `#videoId` que su reproductor de YouTube lee. Una fila por sesión leída, con el día en que se descargó su página; una sesión sin fila no se ha leído, que no es «sin vídeo». No alimenta la cola de transcripción.',
    },
    stats,
    items,
  }
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[pleno-videos-regmeet] escrito ${OUT} — ${items.length} fila(s)`)

  // El cotejo con el canal, para quien lee el registro. La guarda que lo vigila es
  // `check:relations` (`video-fuentes`), que corre en monitor:health.
  const canal = (await leerJson<{ items?: VideoCanal[] }>(CANAL))?.items ?? []
  const ds = discrepanciasDeVideo(index?.items ?? [], canal, items)
  console.log(
    `[pleno-videos-regmeet] cotejo con el canal: ${ds.length === 0 ? 'ninguna discrepancia' : `${ds.length} discrepancia(s)`}`,
  )
  for (const d of ds) console.log(`  · ${d.plenoId} (${d.fecha}) ${d.tipo}: ${d.detalle}`)
}

main().catch((err) => {
  console.error('[pleno-videos-regmeet] falló:', err)
  process.exit(1)
})
