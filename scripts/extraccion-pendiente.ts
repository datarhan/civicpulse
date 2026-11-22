#!/usr/bin/env tsx
/**
 * extraccion:pendiente — las sesiones transcritas de audio que siguen sin
 * ninguna declaración, una por línea, la más reciente primero. Es una CONSULTA
 * para hallazgos-pipeline.sh, que las extrae con un tope por pasada.
 *
 *   npm run --silent extraccion:pendiente           # ids
 *   npm run --silent extraccion:pendiente -- --why  # y por qué las demás no
 *
 * La regla está en src/scraper/extraccion-pendiente.ts. Sale 1 si no puede leer
 * lo que necesita: «no pude mirar» no es «no hay nada pendiente».
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import {
  colaDeExtraccion,
  RUTA_EXTRAIDAS_VACIAS,
  RUTA_PARCIALES,
  type Candidata,
} from '../src/scraper/extraccion-pendiente'

const TRANSCRIPCIONES = resolve('public/data/pleno-transcripts')
const SUGERENCIAS = resolve('public/data/pleno-claims-suggestions.json')
const PLENOS = resolve('public/data/plenos.json')

function main() {
  const porQue = process.argv.includes('--why')
  const fechas = new Map<string, string>()
  for (const p of (JSON.parse(readFileSync(PLENOS, 'utf8')).items ?? []) as {
    id: string
    date?: string
  }[])
    if (p.date) fechas.set(p.id, p.date)

  // Sin el fichero, o con otra forma, no se sabe qué está extraído, y «no lo sé»
  // pondría en cola TODAS las de audio (~465 llamadas cada una). Falla cerrado.
  const sugerencias = JSON.parse(readFileSync(SUGERENCIAS, 'utf8')) as { items?: unknown }
  if (!Array.isArray(sugerencias.items))
    throw new Error(`${SUGERENCIAS} no trae una lista items[]: no se sabe qué está extraído`)
  const conDeclaraciones = new Set<string>()
  for (const c of sugerencias.items as { plenoId?: string }[])
    if (c?.plenoId) conDeclaraciones.add(c.plenoId)

  const leerLista = (ruta: string) =>
    new Set(
      existsSync(ruta)
        ? readFileSync(ruta, 'utf8')
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
        : [],
    )
  const vacias = leerLista(resolve(RUTA_EXTRAIDAS_VACIAS))
  const parciales = leerLista(resolve(RUTA_PARCIALES))

  const candidatas: Candidata[] = readdirSync(TRANSCRIPCIONES)
    .filter((f) => f.endsWith('.txt'))
    .map((f) => {
      const id = basename(f, '.txt')
      return {
        id,
        texto: readFileSync(resolve(TRANSCRIPCIONES, f), 'utf8'),
        fecha: fechas.get(id) ?? null,
      }
    })

  const cola = colaDeExtraccion(candidatas, conDeclaraciones, vacias, parciales)
  for (const id of cola.pendientes) process.stdout.write(`${id}\n`)
  if (porQue) {
    const cuenta: Record<string, number> = {}
    for (const f of cola.fuera) cuenta[f.motivo] = (cuenta[f.motivo] ?? 0) + 1
    process.stderr.write(
      `[extraccion:pendiente] ${candidatas.length} transcripción(es) · ${cola.pendientes.length} pendiente(s) · ` +
        Object.entries(cuenta)
          .map(([m, n]) => `${m}=${n}`)
          .join(' · ') +
        '\n',
    )
    for (const f of cola.fuera.filter((x) => x.motivo !== 'ya-extraida'))
      process.stderr.write(`  ${f.id}: ${f.motivo}${f.detalle ? ` (${f.detalle})` : ''}\n`)
  }
}

try {
  main()
} catch (err) {
  process.stderr.write(`[extraccion:pendiente] ${(err as Error).message}\n`)
  process.exitCode = 1
}
