#!/usr/bin/env tsx
/**
 * rendimiento:plenos — el renglón de rendimiento de la tubería de plenos: cuánta
 * atribución produce (paso 0.3, 22-11-2026). La regla y el porqué de cada cifra
 * están en src/scraper/rendimiento-plenos.ts.
 *
 *   npm run --silent rendimiento:plenos                   # el renglón
 *   npm run --silent rendimiento:plenos -- --json         # el objeto
 *   npm run --silent rendimiento:plenos -- --comparar .cache/rendimiento-plenos.json \
 *       [--errores-manifiesto N|?]
 *
 * Con `--comparar` imprime dos renglones —el de rendimiento y `veredicto: …`— y
 * guarda la pasada en esa ruta para la siguiente. Es lo que llama
 * hallazgos-pipeline.sh al terminar; sale 0 siempre, porque corre después del
 * push y un parte no puede tumbar una pasada ya publicada. Lo que no pudo leer
 * lo dice («?», «sin comparar»), nunca como un cero.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { transcriptKind } from '../src/lib/transcript-kind.js'
import {
  compararConPrevia,
  hoyEnMadrid,
  leerPrevia,
  lineaRendimiento,
  medirRendimiento,
  type Entradas,
  type Mapa,
  type Rendimiento,
  type Transcripcion,
} from '../src/scraper/rendimiento-plenos'
import { isMapComplete, writtenOffChunks, type FailedChunk } from '../src/scraper/speaker-map'

const DATA = 'public/data'
const MAPAS = 'pleno-speaker-map'

function json(ruta: string): unknown {
  try {
    return JSON.parse(readFileSync(resolve(ruta), 'utf8'))
  } catch {
    return null
  }
}

const lista = (j: unknown): Record<string, unknown>[] | null => {
  const items = (j as { items?: unknown } | null)?.items
  return Array.isArray(items) ? (items as Record<string, unknown>[]) : null
}

function transcripciones(): Transcripcion[] | null {
  const dir = resolve(DATA, 'pleno-transcripts')
  if (!existsSync(dir)) return null
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.txt'))
      .map((f) => ({
        id: f.slice(0, -4),
        tipo: transcriptKind(readFileSync(resolve(dir, f), 'utf8')) as Transcripcion['tipo'],
      }))
  } catch {
    return null
  }
}

function mapas(): Mapa[] | null {
  const dir = resolve(MAPAS)
  if (!existsSync(dir)) return null
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const m = json(`${MAPAS}/${f}`)
        const fallidos = (m as { stats?: { failedChunks?: unknown } } | null)?.stats?.failedChunks
        return {
          id: f.slice(0, -5),
          legible: m !== null,
          completo: isMapComplete(m),
          huecos: Array.isArray(fallidos) ? writtenOffChunks(fallidos as FailedChunk[]).size : 0,
        }
      })
  } catch {
    return null
  }
}

function publicadas(): Entradas['publicadas'] {
  const dir = resolve(DATA, 'pleno-claims')
  if (!existsSync(dir)) return null
  const out: { speakerGroup?: unknown }[] = []
  try {
    // index.json es el manifiesto de los trozos, no un trozo.
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && x !== 'index.json')) {
      const items = lista(json(`${DATA}/pleno-claims/${f}`))
      // Un trozo que no se deja leer deja la cifra entera sin saber: sumar los
      // demás daría un total menor que parece real.
      if (!items) return null
      for (const it of items) out.push((it?.claim ?? {}) as { speakerGroup?: unknown })
    }
  } catch {
    return null
  }
  return out
}

export function medirEnDisco(ahora = new Date()): Rendimiento {
  return medirRendimiento({
    extraidas: lista(json(`${DATA}/pleno-claims-suggestions.json`)),
    publicadas: publicadas(),
    transcripciones: transcripciones(),
    mapas: mapas(),
    hallazgos: lista(json(`${DATA}/pleno-findings.json`)),
    hoy: hoyEnMadrid(ahora),
  })
}

function valorDe(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function main() {
  const r = medirEnDisco()
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(r, null, 2) + '\n')
    return
  }
  process.stdout.write(lineaRendimiento(r) + '\n')

  const ruta = valorDe('--comparar')
  if (!ruta) return
  const crudo = valorDe('--errores-manifiesto')
  const errores = crudo !== undefined && /^\d+$/.test(crudo) ? Number(crudo) : null
  const hay = existsSync(resolve(ruta))
  const previa = hay ? leerPrevia(json(ruta)) : null
  const v = compararConPrevia(
    r,
    previa,
    errores,
    new Date().toISOString(),
    hay && !previa ? 'ilegible' : 'no-hay',
  )
  process.stdout.write(`veredicto: ${v.texto}\n`)
  try {
    // tmp + rename: una pasada que muere a media escritura no deja una previa
    // rota que la siguiente leería como «no hay».
    mkdirSync(dirname(resolve(ruta)), { recursive: true })
    const tmp = `${resolve(ruta)}.tmp`
    writeFileSync(tmp, JSON.stringify(v.siguiente) + '\n')
    renameSync(tmp, resolve(ruta))
  } catch (err) {
    process.stderr.write(
      `[rendimiento:plenos] no pude guardar ${ruta}: ${(err as Error).message}\n`,
    )
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main()
  } catch (err) {
    process.stdout.write(
      `rendimiento · sin leer (${(err as Error).message})\nveredicto: sin comparar (el cálculo falló)\n`,
    )
  }
}
