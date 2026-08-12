/**
 * Decision logic for the PostToolUse reminder: la prosa se queda vieja cuando
 * el dato se mueve.
 *
 * ## Los tres incidentes que esto codifica (2026-08-12, en una sola sesión)
 *
 *  1. `/eficiencia` explicaba un 30,4 % de ejecución diciendo «es una foto del
 *     listado, no el cierre del ejercicio». El listado estaba fechado el 31 de
 *     diciembre: era el cierre. La frase excusaba la cifra con un motivo falso.
 *  2. `/metodologia` decía «hoy no hay serie temporal» un commit después de que
 *     la página publicara diez entregas.
 *  3. El panel municipal decía «sólo el periodo medio de pago lleva
 *     comparación» justo cuando el gasto por habitante estrenaba la suya.
 *
 * Las tres las cazó `review:surfaces`, siempre al final y siempre después de
 * varios cambios acumulados. Ninguna la cazó un test: los datos estaban bien y
 * las guardas comprueban datos. Lo que estaba mal era la frase de al lado.
 *
 * ## Por qué un recordatorio y no una denegación
 *
 * La revisión cuesta un par de minutos de modelo por ruta y no toda edición la
 * merece. Un bloqueo obligaría a saltárselo, y una guarda que se salta por
 * costumbre deja de ser una guarda. Esto sólo dice, en el momento exacto en que
 * el dato se mueve, qué rutas describen ese dato con palabras.
 *
 * ## Por qué se dispara al ESCRIBIR el snapshot y no al editar la página
 *
 * Editando la prosa uno ya está pensando en la prosa. El fallo aparece cuando
 * cambia el dato y la prosa se queda quieta — ahí nadie la está mirando.
 *
 * Módulo puro y sin estado, como curated-paths.mjs: el runner sólo lee la
 * llamada e imprime el veredicto, y así esto se puede probar sin hooks.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * Qué páginas describen con palabras cada snapshot.
 *
 * NO se mantiene a mano. Lo deriva `scripts/build-prose-map.ts` del código —
 * qué hook declara qué fichero, qué módulos llegan a ese hook siguiendo los
 * imports, y qué ruta monta cada página en App.jsx— y una prueba lo regenera y
 * lo compara con lo committeado.
 *
 * La primera versión de este fichero SÍ traía la tabla escrita a mano, con
 * nueve entradas. El código tenía sesenta y cuatro. Una tabla a mano dentro de
 * un control contra el desfase es la broma que este repositorio ya se ha
 * gastado dos veces.
 */
function cargarMapa() {
  try {
    const aqui = dirname(fileURLToPath(import.meta.url))
    return JSON.parse(readFileSync(join(aqui, 'prosa-map.json'), 'utf8')).snapshots ?? {}
  } catch {
    return null
  }
}

const cargado = cargarMapa()

/**
 * `true` si el mapa se leyó de verdad.
 *
 * Sin esto, un mapa que no carga y un mapa sin nada que avisar dan exactamente
 * el mismo silencio — que es el defecto que el propio curated-paths.mjs
 * describe en su cabecera: «un control que no se puede distinguir de su propia
 * ausencia no es un control». Hay una prueba que exige que esto sea cierto.
 */
export const MAPA_CARGADO = cargado !== null

export const PROSA_POR_SNAPSHOT = cargado ?? {}

/** `public/data/x.json` → `x.json`; cualquier otra cosa → null. */
export function snapshotDe(ruta) {
  if (typeof ruta !== 'string') return null
  const norm = ruta.replace(/\\/g, '/')
  const m = /(?:^|\/)public\/data\/([^/]+\.json)$/.exec(norm)
  return m ? m[1] : null
}

/**
 * Rutas cuya prosa habla de este fichero. Vacío si no hay prosa que envejecer.
 */
export function rutasAfectadas(ruta) {
  const snap = snapshotDe(ruta)
  if (!snap) return []
  return PROSA_POR_SNAPSHOT[snap] ?? []
}

/**
 * El recordatorio, o null si no toca.
 *
 * @param {{tool_name?: string, tool_input?: Record<string, unknown>}} payload
 */
const MAX_RUTAS = 4

export function decideRecordatorio(payload) {
  const tool = payload?.tool_name
  if (tool !== 'Write' && tool !== 'Edit' && tool !== 'MultiEdit') return null
  const ruta = payload?.tool_input?.file_path
  const rutas = rutasAfectadas(typeof ruta === 'string' ? ruta : '')
  if (!rutas.length) return null
  const snap = snapshotDe(ruta)
  // Con más de un puñado de rutas el aviso deja de señalar y pasa a ser ruido,
  // así que se nombran unas pocas y se dice cuántas quedan.
  const muestra = rutas.slice(0, MAX_RUTAS)
  const resto = rutas.length - muestra.length
  return (
    `[prosa] ${snap} ha cambiado. Lo describen con palabras: ${muestra.join(', ')}` +
    `${resto > 0 ? ` y ${resto} ruta(s) más` : ''}.\n` +
    `        Ningún test comprueba la prosa —los datos sí—, así que si alguna frase afirmaba algo\n` +
    `        sobre este dato, vuelve a leerla:  npm run review:surfaces -- ${muestra.join(' ')}`
  )
}
