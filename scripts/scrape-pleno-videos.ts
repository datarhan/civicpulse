/**
 * Fetch the Ajuntament de Riba-roja YouTube channel via yt-dlp, extract pleno
 * videos, and write public/data/pleno-videos.json.
 *
 * yt-dlp is expected to be on PATH (brew install yt-dlp). Network error → exit 1.
 *
 * It does not write blindly: `decideEscrituraIndice` compares the run with the
 * published index, names every video that left it and why, and refuses to
 * write (exit 1, the published file untouched) when too many leave at once or
 * the listing came back empty. `--aceptar-bajas` writes anyway, once the
 * operator has read the list and the losses are real.
 *
 *   npm run scrape:pleno-videos
 *   npm run scrape:pleno-videos -- --aceptar-bajas
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  argumentosYtdlp,
  decideEscrituraIndice,
  grabacionMasHonda,
  MARGEN_AVISO,
  parseChannelFeed,
  VENTANA_CANAL,
} from '../src/scraper/pleno-videos'

const CHANNEL_URL = 'https://www.youtube.com/@ajuntam_riba_roja_de_turia'
const OUT_PATH = resolve('public/data/pleno-videos.json')
const PLENOS_PATH = resolve('public/data/plenos.json')

function run(): string {
  try {
    const raw = execFileSync('yt-dlp', argumentosYtdlp(CHANNEL_URL, VENTANA_CANAL), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    })
    return raw
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[pleno-videos] yt-dlp failed: ${msg}\n`)
    process.stderr.write('Install via: brew install yt-dlp\n')
    process.exit(1)
  }
}

function fechasDeSesiones(): Set<string> | null {
  try {
    const items = JSON.parse(readFileSync(PLENOS_PATH, 'utf8')).items as { date?: string }[]
    return new Set(items.map((p) => p.date).filter((d): d is string => typeof d === 'string'))
  } catch {
    return null
  }
}

function main() {
  process.stdout.write(
    `[pleno-videos] fetching channel feed (ventana=${VENTANA_CANAL} por pestaña)…\n`,
  )
  const jsonl = run()
  const snap = parseChannelFeed(jsonl, { channelUrl: CHANNEL_URL })
  const anteriorRaw = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, 'utf8') : null
  const d = decideEscrituraIndice({
    nuevo: snap,
    jsonl,
    anteriorRaw,
    aceptarBajas: process.argv.includes('--aceptar-bajas'),
  })

  // Lo leído, lo casado y lo que se quedó sin fecha van por separado, y por
  // pestaña lo que la ventana dejó sin leer: «no hay más» y «no lo pedí» no
  // pueden sonar igual.
  process.stdout.write(
    `[pleno-videos] leídas ${d.leidas} · con fecha ${d.conFecha} ` +
      `(ordinario ${snap.stats.byKind.ordinario}, extraordinario ${snap.stats.byKind.extraordinario}, ` +
      `urgente ${snap.stats.byKind.urgente}, otro ${snap.stats.byKind.otro}) · ` +
      `sin fecha legible ${d.sinFecha} · resto ${d.leidas - d.conFecha - d.sinFecha} (no son plenos, o repetidas)\n`,
  )
  for (const p of snap.stats.pestanas) {
    // yt-dlp sólo da el total de una pestaña que leyó entera.
    const estado =
      p.total != null
        ? `entera: ${p.leidas} de ${p.total}`
        : p.leidas >= VENTANA_CANAL
          ? `${p.leidas}, cortada por la ventana: lo de detrás no se pidió`
          : `${p.leidas}, sin total`
    process.stdout.write(`[pleno-videos]   «${p.pestana}»: ${estado}\n`)
  }

  // El margen se gasta en el canal vivo, no en la fixture: se dice en cada
  // pasada cuánto queda hasta que la grabación de sesión más honda se salga.
  const fechas = fechasDeSesiones()
  const honda = fechas ? grabacionMasHonda(jsonl, snap, fechas) : null
  if (honda) {
    const margen = VENTANA_CANAL - honda.posicion
    const linea =
      `la grabación de sesión más honda es la ${honda.posicion}.ª de «${honda.pestana}» ` +
      `(${honda.ytId}, ${honda.plenoDate}): quedan ${margen} hasta el borde de la ventana`
    if (margen < MARGEN_AVISO) {
      process.stderr.write(`[pleno-videos] AVISO: ${linea} — sube VENTANA_CANAL\n`)
    } else {
      process.stdout.write(`[pleno-videos]   ${linea}\n`)
    }
  } else {
    process.stdout.write(
      `[pleno-videos]   margen sin medir: ${fechas ? 'ninguna grabación del listado es de una sesión de plenos.json' : 'plenos.json ilegible'}\n`,
    )
  }

  for (const b of d.bajas) {
    process.stderr.write(
      `[pleno-videos] BAJA (${b.causa}): ${b.ytId} ${b.plenoDate} «${b.title}»` +
        (b.tituloAhora != null ? ` → ahora «${b.tituloAhora}»` : '') +
        '\n',
    )
  }

  if (!d.escribir) {
    process.stderr.write(`[pleno-videos] ${d.motivo}\n`)
    process.exit(1)
  }

  writeFileSync(OUT_PATH, JSON.stringify(snap, null, 2) + '\n', 'utf8')
  process.stdout.write(
    `[pleno-videos] ${d.motivo} · conservadas ${d.conservadas} · nuevas ${d.nuevas} → ${OUT_PATH}\n`,
  )
  // Un pleno sin fecha no se ata a una sesión (eso lo hace regmeet): se nombra
  // para que el hueco se vea y no se lea como «el canal no tiene ese vídeo».
  for (const s of snap.sinFecha) {
    process.stdout.write(`[pleno-videos]   sin fecha (${s.motivo}): ${s.ytId} «${s.title}»\n`)
  }
}

main()
