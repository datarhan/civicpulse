#!/usr/bin/env node
/**
 * PostToolUse runner. La decisión vive en ./stale-copy-paths.mjs; esto lee la
 * llamada, mira el árbol cuando hace falta, recuerda lo que ya ha contado y
 * entrega el aviso.
 *
 * ## Por dónde llega
 *
 * Por stdout, como JSON con `hookSpecificOutput.additionalContext`, que Claude
 * Code pone junto al resultado de la herramienta. Hasta el 2026-09-27 salía por
 * stderr con código 0, y ese stderr Claude Code lo manda sólo al log de
 * depuración: el modelo no lo leía nunca, y la prueba seguía en verde porque
 * leía justo ese canal. El código 2 sí llegaría, pero como error, y esto no
 * bloquea nunca: sale 0 pase lo que pase. Un recordatorio que puede tumbar una
 * edición se acaba desactivando, y entonces deja de recordar nada.
 *
 * ## Qué escrituras ve
 *
 * - Un Write, Edit o MultiEdit sobre `public/data/<x>.json`: por la ruta.
 * - Un Bash, que es el camino habitual: un snapshot se regenera con un script, y
 *   un PostToolUse sobre Edit|Write no ve lo que escribe un Bash. Tras cada
 *   comando pregunta a `git status` qué snapshots con prosa difieren de HEAD y
 *   avisa de los que este contexto no ha oído todavía con ese contenido. Un
 *   `npm test` detrás no repite el aviso, y un adaptador idempotente que
 *   reescribe lo mismo no avisa: para git no ha cambiado nada.
 *
 * Lo que no ve, dicho para que nadie lo dé por cubierto:
 *
 * - QUÉ comando escribió el fichero. Dice «ha cambiado», no «lo has cambiado»:
 *   en el checkout principal, lo que un agente de launchd ha escrito y todavía
 *   no ha commiteado aparece igual.
 * - Un comando en segundo plano, o uno que acaba en error (eso dispara
 *   PostToolUseFailure, no esto), se cuenta en el siguiente Bash que acabe bien.
 * - FileChanged vería a cualquier escritor, pero lo que devuelve no llega al
 *   modelo, sólo a la terminal. Y un gancho `async` entrega en el turno
 *   siguiente, con el trabajo ya hecho.
 *
 * Cuesta unos 40–50 ms por comando, medidos de punta a punta: el arranque de
 * node y un `git status` acotado a `public/data/*.json`.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  avisoPara,
  decideRecordatorio,
  GIT_STATUS_SNAPSHOTS,
  novedades,
  rutasAfectadas,
  snapshotDe,
  snapshotsDeEstado,
} from './stale-copy-paths.mjs'

/**
 * Lo ya contado, por sesión y por subagente: cada contexto que puede escribir
 * prosa necesita su propio aviso. Vive en el temporal, fuera del repositorio.
 */
function archivoDeMemoria(payload) {
  const dir = process.env.CIVICPULSE_PROSA_ESTADO || join(tmpdir(), 'civicpulse-prosa')
  const quien = [payload.session_id || 'sin-sesion', payload.agent_id]
    .filter(Boolean)
    .join('-')
    .replace(/[^\w-]/g, '_')
  return join(dir, `${quien}.json`)
}

function leerMemoria(archivo) {
  try {
    const m = JSON.parse(readFileSync(archivo, 'utf8'))
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {}
  } catch {
    return {} // sin memoria se repite un aviso, nada peor
  }
}

function guardarMemoria(archivo, memoria) {
  mkdirSync(dirname(archivo), { recursive: true })
  const provisional = `${archivo}.${process.pid}`
  writeFileSync(provisional, JSON.stringify(memoria))
  renameSync(provisional, archivo) // dos Bash en paralelo no se leen a medias
}

const huella = (ruta) => createHash('sha1').update(readFileSync(ruta)).digest('hex')

const git = (cwd, args) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: 3000,
    stdio: ['ignore', 'pipe', 'ignore'],
  })

function trasEdicion(payload, archivo) {
  const aviso = decideRecordatorio(payload)
  if (!aviso) return null
  try {
    // Que el Bash siguiente no repita lo que acaba de decirse. La ruta, resuelta:
    // git contesta con la real (/private/var/… donde el Edit dice /var/…).
    const ruta = realpathSync(payload.tool_input.file_path)
    const memoria = leerMemoria(archivo)
    memoria[ruta] = huella(ruta)
    guardarMemoria(archivo, memoria)
  } catch {
    // Sin memoria, el próximo Bash repite este aviso. El aviso sale igual.
  }
  return aviso
}

function trasBash(payload, archivo) {
  const cwd = payload.cwd || process.cwd()
  const raiz = realpathSync(git(cwd, ['rev-parse', '--show-toplevel']).trim())
  const cambiados = {}
  for (const rel of snapshotsDeEstado(git(raiz, GIT_STATUS_SNAPSHOTS))) {
    if (!rutasAfectadas(rel).length) continue // sin prosa detrás, ni se lee
    const ruta = join(raiz, rel)
    cambiados[ruta] = huella(ruta)
  }
  const antes = leerMemoria(archivo)
  const { nuevos, memoria } = novedades(cambiados, antes, raiz)
  if (JSON.stringify(memoria) !== JSON.stringify(antes)) guardarMemoria(archivo, memoria)
  return avisoPara(nuevos.map(snapshotDe))
}

function main() {
  let payload
  try {
    payload = JSON.parse(readFileSync(0, 'utf8') || '{}')
  } catch {
    return null // sin payload legible no hay nada que decir
  }
  if (!payload || typeof payload !== 'object') return null
  const archivo = archivoDeMemoria(payload)
  return payload.tool_name === 'Bash' ? trasBash(payload, archivo) : trasEdicion(payload, archivo)
}

let aviso = null
try {
  aviso = main()
} catch {
  // Un recordatorio roto no puede romper una edición.
}
if (aviso) {
  try {
    // Sólo el objeto: cualquier otra cosa en stdout lo convierte en texto plano.
    const salida = {
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: aviso },
    }
    writeSync(1, JSON.stringify(salida))
  } catch {
    // Ni siquiera esto puede romperla.
  }
}
process.exit(0)
