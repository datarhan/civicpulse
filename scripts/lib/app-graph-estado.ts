/**
 * «Ahora mismo»: qué está haciendo cada pieza, medido del disco.
 *
 * Es la única capa del despiece que no puede quedarse vieja, porque no se
 * escribe — se mide en cada petición. Y es la que más cuidado necesita con el
 * TERCER desenlace: `no-medido` va aparte de `ok` y de `malo` en todas partes,
 * porque «esta pieza no lleva parte de ejecución» no es «va bien» ni es «falla».
 *
 * Se apoya en lo que el repositorio ya sabe medir en vez de volver a medirlo:
 * `classifyFreshness` para la frescura y `readManifests` para las pasadas.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { classifyFreshness } from '../../src/scraper/snapshot-cadence'
import { readManifests } from '../../src/scraper/run-manifest'
import type { RunManifest } from '../../src/scraper/run-manifest'
import type { GrafoApp } from '../../src/scraper/app-graph'

export type TonoEstado = 'ok' | 'aviso' | 'malo' | 'no-medido'

export interface EstadoNodo {
  tono: TonoEstado
  lineas: string[]
}

const DIA = 86_400_000

function edad(ms: number): string {
  const horas = Math.round(ms / 3_600_000)
  if (horas < 48) return horas === 1 ? '1 hora' : `${horas} horas`
  const dias = Math.round(horas / 24)
  return dias === 1 ? '1 día' : `${dias} días`
}

/**
 * Qué dice el último parte de ejecución de un guion.
 *
 * Cuatro desenlaces, no dos. `neverAttempted` sale a la superficie en vez de
 * plegarse dentro de «sin cambios»: plegarlo es exactamente lo que dejó a una
 * pasada declarando «re-juzgados 1017» sin haber hecho una sola llamada.
 */
export function veredictoDeParte(partes: RunManifest[]): EstadoNodo {
  if (partes.length === 0) {
    return {
      tono: 'no-medido',
      lineas: ['sin parte de ejecución — este guion nunca se ha instrumentado'],
    }
  }
  const ultimo = [...partes].sort((a, b) => (a.runId < b.runId ? 1 : -1))[0]
  const llm = ultimo.llm ?? { calls: 0, costUSD: 0 }
  const lineas = [
    `última pasada ${ultimo.runId.slice(0, 10)}`,
    `intentados ${ultimo.attempted ?? 0} · hechos ${ultimo.judged ?? 0} · ` +
      `nunca intentados ${ultimo.neverAttempted ?? 0}`,
  ]
  if (llm.calls > 0) {
    lineas.push(`${llm.calls} llamadas al modelo · ${(llm.costUSD ?? 0).toFixed(4)} USD`)
  }
  if ((ultimo.exitCode ?? 0) !== 0) {
    return { tono: 'malo', lineas: [...lineas, `salió con código ${ultimo.exitCode}`] }
  }
  if ((ultimo.neverAttempted ?? 0) > 0) {
    return {
      tono: 'aviso',
      lineas: [...lineas, 'quedó trabajo sin intentar: no es una pasada limpia'],
    }
  }
  return { tono: 'ok', lineas }
}

/** El tono de frescura de `check:cadence`, traducido al de aquí. */
function tonoFrescura(estado: string): TonoEstado {
  if (estado === 'stale') return 'aviso'
  if (estado === 'unknown') return 'no-medido'
  return 'ok'
}

/** Los `.json` de un directorio, con su tamaño y su fecha. No recursivo. */
function hojasJson(dir: string): { size: number; mtimeMs: number }[] {
  try {
    return readdirSync(dir)
      .filter((e) => e.endsWith('.json'))
      .map((e) => statSync(join(dir, e)))
      .filter((st) => st.isFile())
  } catch {
    return []
  }
}

export function medirEstado(
  root: string,
  grafo: GrafoApp,
  ahora = Date.now(),
): Record<string, EstadoNodo> {
  const salida: Record<string, EstadoNodo> = {}

  // ── snapshots ────────────────────────────────────────────────────────────
  const hechos = []
  const edadDe = new Map<string, number | null>()
  for (const n of grafo.nodos) {
    if (n.carril !== 'snapshot' || !n.ruta) continue
    const ruta = resolve(root, n.ruta)
    if (!existsSync(ruta)) {
      salida[n.id] = { tono: 'no-medido', lineas: ['no está en el disco de esta máquina'] }
      continue
    }
    const st = statSync(ruta)
    // Un directorio no es un snapshot. Las cinco tablas del bot declaran
    // `bot/data/` —el volumen vive en Fly.io— y `statSync` devolvía la fecha y
    // el tamaño de la CARPETA: la ficha decía «ok · 33 días · 0 KB» de algo que
    // no está en esta máquina, que es una medición del objeto equivocado
    // vestida de medición buena.
    if (!st.isFile()) {
      // Una COLECCIÓN sí se puede medir: sus ficheros están en esta máquina.
      // `bot/data/` no —el volumen vive en Fly.io—, y ésa es toda la
      // diferencia. Decir «no medido» de lo que se puede medir es el mismo
      // defecto por el otro lado.
      const hojas = hojasJson(ruta)
      if (hojas.length === 0) {
        salida[n.id] = {
          tono: 'no-medido',
          lineas: [`${n.ruta} no tiene ficheros de datos en esta máquina`],
        }
        continue
      }
      const bytes = hojas.reduce((a, h) => a + h.size, 0)
      const nuevo = Math.max(...hojas.map((h) => h.mtimeMs))
      salida[n.id] = {
        tono: 'ok',
        lineas: [
          `${hojas.length} ficheros · ${edad(ahora - nuevo)} el más reciente · ${(bytes / 1024).toFixed(0)} KB`,
        ],
      }
      continue
    }
    const ms = ahora - st.mtimeMs
    edadDe.set(n.nombre, ms / DIA)
    hechos.push({ file: n.nombre, ageDays: ms / DIA })
    salida[n.id] = {
      tono: 'ok',
      lineas: [`${edad(ms)} · ${(st.size / 1024).toFixed(0)} KB`],
    }
  }
  // La clasificación la hace `snapshot-cadence`, que es quien conoce el plazo
  // de cada clase. Aquí sólo se traduce el tono.
  for (const fila of classifyFreshness(hechos)) {
    const id = `snapshot:${fila.file}`
    if (!salida[id]) continue
    salida[id] = {
      tono: tonoFrescura(fila.status),
      // La nota puede venir vacía; concatenarla igual deja un separador
      // colgando que se lee como un dato que falta.
      lineas: [...salida[id].lineas, fila.note ? `${fila.cls} · ${fila.note}` : fila.cls],
    }
  }

  // ── guiones ──────────────────────────────────────────────────────────────
  let partes: RunManifest[] = []
  try {
    partes = readManifests(resolve(root, '.run-manifests'))
  } catch {
    partes = []
  }
  const porGuion = new Map<string, RunManifest[]>()
  for (const p of partes) porGuion.set(p.script, [...(porGuion.get(p.script) ?? []), p])
  for (const n of grafo.nodos) {
    if (!n.id.startsWith('script:')) continue
    const clave = n.nombre.replace(/\.(ts|sh|mjs)$/, '')
    salida[n.id] = veredictoDeParte(porGuion.get(clave) ?? [])
  }

  // ── crones ───────────────────────────────────────────────────────────────
  for (const n of grafo.nodos) {
    if (n.carril !== 'proceso' || !n.detalle?.startsWith('launchd')) continue
    // El log dice cuándo corrió DE VERDAD, que es distinto de cuándo tocaba.
    const log = n.detalle.includes('sin horario') ? null : buscarLog(root, n.nombre)
    if (!log) {
      salida[n.id] = { tono: 'no-medido', lineas: ['no se encontró su registro en esta máquina'] }
      continue
    }
    const ms = ahora - statSync(log).mtimeMs
    salida[n.id] = {
      tono: ms > 2 * DIA ? 'aviso' : 'ok',
      lineas: [`su registro se escribió hace ${edad(ms)}`],
    }
  }

  return salida
}

/** El registro de un agente, por convención `scripts/logs/<sufijo>.log`. */
function buscarLog(root: string, etiqueta: string): string | null {
  const sufijo = etiqueta.replace(/^com\.civicpulse\./, '')
  for (const cand of [`scripts/logs/${sufijo}.log`, `scripts/logs/${sufijo}-pipeline.log`]) {
    const ruta = resolve(root, cand)
    if (existsSync(ruta)) return ruta
  }
  return null
}
