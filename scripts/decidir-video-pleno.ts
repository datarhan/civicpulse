#!/usr/bin/env tsx
/**
 * video:decidir — la ÚNICA puerta de escritura de
 * `public/data/pleno-video-decisiones.json`: qué vídeo es el de un pleno cuando
 * el canal de YouTube y la página de la sesión en regmeet no dicen lo mismo.
 *
 *   npm run video:decidir -- --lista
 *   npm run video:decidir -- <plenoId> --elige <ytId> --razon "…" --evidencia "…" [--evidencia "…"]
 *   npm run video:decidir -- --retirar <plenoId>
 *
 * Sólo decide lo que hoy discrepa, entre los vídeos que hoy da alguna fuente, y
 * apunta lo que decía cada una: si cualquiera cambia, la decisión deja de valer y
 * `check:relations` vuelve a avisar. Una sesión decidida no se re-decide por
 * encima: se retira primero, y las dos cosas quedan en git.
 *
 * Lo que se decide aquí lo pinta /plenos/:id y lo baja el transcriptor
 * (`resolve-pleno-video.ts`), así que la razón y la evidencia se publican: que
 * cualquiera pueda comprobar por qué ese vídeo es el de esa sesión.
 *
 * Reglas y porqués: src/scraper/pleno-video-decisiones.ts.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { writeSnapshot } from './lib/snapshot-io'
import { rechazarOpcionesDesconocidas } from '../src/scraper/opciones-cli'
import {
  prepararDecision,
  validarDecisiones,
  type DecisionVideo,
} from '../src/scraper/pleno-video-decisiones'

const DATA = resolve('public/data')
const OUT = resolve(DATA, 'pleno-video-decisiones.json')

interface Archivo {
  nota: string
  items: DecisionVideo[]
}

const NOTA =
  'Qué vídeo es el de un pleno cuando el canal de YouTube y la página de la sesión en regmeet dan vídeos distintos. Lo decide una persona con la evidencia que se cita; deja de valer si cualquiera de las dos fuentes cambia. Sólo lo escribe `npm run video:decidir`.'

const leer = <T>(f: string): T => JSON.parse(readFileSync(resolve(DATA, f), 'utf8')) as T

function cargar(): Archivo {
  if (!existsSync(OUT)) return { nota: NOTA, items: [] }
  const json = JSON.parse(readFileSync(OUT, 'utf8'))
  const { items, errores } = validarDecisiones(json)
  if (errores.length > 0) throw new Error(`el fichero no valida: ${errores.join('; ')}`)
  return { nota: NOTA, items }
}

function escribir(a: Archivo) {
  const items = [...a.items].sort(
    (x, y) => x.fecha.localeCompare(y.fecha) || x.plenoId.localeCompare(y.plenoId),
  )
  writeSnapshot(OUT, { nota: a.nota, items }, (texto) => {
    const json = JSON.parse(texto)
    const { errores } = validarDecisiones(json)
    if (errores.length > 0) throw new Error(errores.join('; '))
    return json as Archivo
  })
}

/** Hoy en Riba-roja, AAAA-MM-DD. */
const hoy = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date())

function valores(args: string[], flag: string): string[] {
  const out: string[] = []
  args.forEach((a, i) => {
    if (a === flag && args[i + 1] && !args[i + 1].startsWith('--')) out.push(args[i + 1])
  })
  return out
}

function main(args: string[]) {
  // Antes de leer nada: una opción que no conoce (un `--dry-run` supuesto) no
  // puede colarse y dejar que la orden escriba (tests/opciones-desconocidas-cli.test.ts).
  rechazarOpcionesDesconocidas(
    'video:decidir',
    { banderas: ['--lista'], conValor: ['--elige', '--razon', '--evidencia', '--retirar'] },
    args,
  )
  const a = cargar()
  if (args.includes('--lista')) {
    if (a.items.length === 0) console.log('[video:decidir] ninguna decisión')
    for (const d of a.items)
      console.log(`${d.plenoId} (${d.fecha}) → ${d.elegido} · ${d.decididoEl} · ${d.razon}`)
    return
  }
  const retirar = valores(args, '--retirar')[0]
  if (retirar) {
    if (!a.items.some((d) => d.plenoId === retirar))
      throw new Error(`${retirar} no tiene ninguna decisión`)
    escribir({ ...a, items: a.items.filter((d) => d.plenoId !== retirar) })
    console.log(`[video:decidir] retirada la decisión de ${retirar}`)
    return
  }
  const plenoId = args.find((x, i) => !x.startsWith('--') && !args[i - 1]?.startsWith('--'))
  const elegido = valores(args, '--elige')[0]
  const razon = valores(args, '--razon')[0]
  const evidencia = valores(args, '--evidencia')
  if (!plenoId || !elegido || !razon || evidencia.length === 0)
    throw new Error(
      'uso: npm run video:decidir -- <plenoId> --elige <ytId> --razon "…" --evidencia "…" [--evidencia "…"]',
    )
  const decision = prepararDecision(
    { plenoId, elegido, razon, evidencia, hoy: hoy() },
    {
      plenos: leer<{ items: Array<{ id: string; date: string }> }>('plenos.json').items,
      canal: leer<{ items: [] }>('pleno-videos.json').items,
      regmeet: leer<{ items: [] }>('pleno-videos-regmeet.json').items,
      existentes: a.items,
    },
  )
  escribir({ ...a, items: [...a.items, decision] })
  console.log(
    `[video:decidir] ${decision.plenoId} (${decision.fecha}) → ${decision.elegido} · canal ${decision.canal.join(', ') || '—'} · regmeet ${decision.regmeet ?? '—'}`,
  )
}

try {
  main(process.argv.slice(2))
} catch (err) {
  console.error(`[video:decidir] ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
