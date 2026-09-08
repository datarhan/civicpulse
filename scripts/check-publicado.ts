#!/usr/bin/env tsx
/**
 * ¿Recibe el lector lo que main dice haber publicado?
 *
 *   npm run check:publicado
 *   npm run check:publicado -- --json
 *   npm run check:publicado -- --base https://civicpulse.es --cuantos 12
 *
 * Sale 1 SÓLO cuando el sitio va por detrás del repositorio, que es el único
 * desenlace que sufre quien entra a leer. Un repositorio atrasado (un worktree
 * viejo) o un fichero ilegible avisan y no bloquean: una puerta que se equivoca
 * es una puerta que se salta todo el mundo.
 *
 * POR QUÉ EXISTE. El 8-09-2026 la portada llevaba cuatro días con la misma
 * noticia. El raspado estaba sano, los datos frescos estaban comiteados en main
 * —`press.json` con titulares de ese mismo día— y el despliegue no había
 * corrido, porque la puerta de salud mira `npm test` y una prueba se pasó de
 * reloj por 463 ms. Las dos mitades estaban bien y el lector veía anteayer.
 *
 * Ninguna guarda podía verlo: `check:cadence` lee `public/data` del disco y
 * `monitor:health` mira el `newestItemAt` del mismo fichero local. Las dos
 * miden el REPOSITORIO. Mientras el despliegue funcione eso es lo mismo que
 * medir el sitio, y el día que no funciona es exactamente cuando dejan de
 * serlo. Encima el umbral de prensa de `monitor:health` es de 5 días: la
 * portada llevaba cuatro y ni siquiera estaba cerca de saltar.
 *
 * QUÉ COMPARA. No una lista escrita a mano —esa es la broma que este
 * repositorio ya se ha gastado dos veces—, sino los N snapshots que MÁS
 * RECIENTEMENTE se generaron en el árbol. Son, por construcción, los que el
 * último despliegue tenía que haber movido: si el sitio sirve sellos viejos de
 * ésos, no ha desplegado. Y como Vercel sube `dist/` entero, con una muestra
 * pequeña basta para detectar un despliegue que no ocurrió.
 *
 * LO QUE NO DISTINGUE, dicho aquí y no descubierto por quien lo lea: compara el
 * ÁRBOL DE TRABAJO con el sitio, no `origin/main` con el sitio. Un árbol con
 * datos recién raspados y todavía sin empujar se lee igual que un despliegue
 * pendiente. Se ha dejado así a propósito —el remedio de los dos casos es el
 * mismo, «haz que main llegue al sitio»— pero si algún día hace falta separarlos,
 * la diferencia está en leer `git show origin/main:public/data/<f>` en vez del
 * disco, y no en tocar la comparación, que es pura.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import {
  compararPublicado,
  resumirPublicado,
  TOLERANCIA_MINUTOS,
  type EstadoPublicado,
} from '../src/scraper/publicado'

const DATA = resolve('public/data')
const args = process.argv.slice(2)
const opcion = (nombre: string): string | undefined => {
  const i = args.indexOf(`--${nombre}`)
  return i === -1 ? undefined : args[i + 1]
}
const BASE = (opcion('base') ?? 'https://www.civicpulse.es').replace(/\/$/, '')
const CUANTOS = Number(opcion('cuantos') ?? 8)
const JSON_OUT = args.includes('--json')
const UA = 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) freshness-check'

/** Los snapshots del árbol que llevan sello, del más reciente al más viejo. */
function candidatos(): { fichero: string; repo: unknown; sello: number }[] {
  const filas: { fichero: string; repo: unknown; sello: number }[] = []
  for (const f of readdirSync(DATA)) {
    if (!f.endsWith('.json')) continue
    let repo: unknown
    try {
      repo = JSON.parse(readFileSync(join(DATA, f), 'utf8'))
    } catch {
      continue
    }
    const bruto = (repo as { generatedAt?: unknown })?.generatedAt
    if (typeof bruto !== 'string') continue
    const sello = Date.parse(bruto)
    if (Number.isNaN(sello)) continue
    filas.push({ fichero: f, repo, sello })
  }
  return filas.sort((a, b) => b.sello - a.sello)
}

async function leerDelSitio(fichero: string): Promise<unknown> {
  try {
    const res = await fetch(`${BASE}/data/${fichero}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(25_000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    // Devolver null es correcto y es DELIBERADO que caiga en «ilegible»: no
    // haber podido mirar no es haber mirado y no encontrar nada mal.
    return null
  }
}

async function main() {
  const muestra = candidatos().slice(0, Math.max(1, CUANTOS))
  if (muestra.length === 0) {
    console.error(
      '[check:publicado] ningún snapshot del árbol lleva generatedAt — nada que comparar',
    )
    process.exit(1)
  }

  const filas: EstadoPublicado[] = []
  for (const c of muestra) {
    filas.push(compararPublicado(c.fichero, c.repo, await leerDelSitio(c.fichero)))
  }
  const resumen = resumirPublicado(filas)

  if (JSON_OUT) {
    console.log(JSON.stringify({ base: BASE, resumen, filas }, null, 2))
  } else {
    console.log(
      `[check:publicado] ${BASE} · ${resumen.comparados} snapshot(s) · tolerancia ${TOLERANCIA_MINUTOS} min`,
    )
    for (const f of filas) {
      const marca = {
        coincide: '✓',
        'sitio-por-detras': '✗',
        'repo-por-detras': '·',
        ilegible: '?',
      }[f.desenlace]
      console.log(`  ${marca} ${f.fichero.padEnd(28)} ${f.desenlace.padEnd(16)} ${f.detalle}`)
    }
    const d = resumen.porDesenlace
    console.log(
      `  — ${d.coincide} al día · ${d['sitio-por-detras']} sin desplegar · ${d['repo-por-detras']} con el árbol viejo · ${d.ilegible} ilegible(s)`,
    )
  }

  if (!resumen.concluyente) {
    console.error('[check:publicado] no se comparó nada: eso no es un visto bueno')
    process.exit(1)
  }
  if (resumen.bloquea) {
    console.error(
      '[check:publicado] el sitio sirve datos más viejos que main — hay un despliegue pendiente o bloqueado',
    )
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('[check:publicado] falló:', e instanceof Error ? e.message : e)
  process.exit(1)
})
