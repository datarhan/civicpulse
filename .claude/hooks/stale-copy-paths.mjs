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
 * Módulo puro y sin estado, como curated-paths.mjs: el runner es quien lee la
 * llamada, pregunta a git y recuerda lo ya contado; aquí sólo se decide, y así
 * esto se puede probar sin hooks.
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

// Con más de un puñado de rutas el aviso deja de señalar y pasa a ser ruido,
// así que se nombran unas pocas y se dice cuántas quedan. Lo mismo con los
// snapshots, cuando un script reescribe muchos de una vez.
const MAX_RUTAS = 4
const MAX_SNAPSHOTS = 3

/** «a», «a y b», «a, b, c y 2 más». */
function enumerar(nombres, max) {
  if (nombres.length === 1) return nombres[0]
  const muestra = nombres.slice(0, max)
  const resto = nombres.length - muestra.length
  if (resto > 0) return `${muestra.join(', ')} y ${resto} más`
  return `${muestra.slice(0, -1).join(', ')} y ${muestra.at(-1)}`
}

/**
 * El recordatorio para unos snapshots que han cambiado, o null si ninguno lleva
 * prosa detrás. Uno o varios, es el mismo aviso venga de un Edit o de un Bash.
 *
 * @param {string[]} snaps  nombres como `budget.json`
 */
export function avisoPara(snaps) {
  const conProsa = [...new Set(snaps)].filter((s) => PROSA_POR_SNAPSHOT[s]?.length).sort()
  if (!conProsa.length) return null
  const rutas = [...new Set(conProsa.flatMap((s) => PROSA_POR_SNAPSHOT[s]))]
  const muestra = rutas.slice(0, MAX_RUTAS)
  const resto = rutas.length - muestra.length
  const uno = conProsa.length === 1
  return (
    `[prosa] ${enumerar(conProsa, MAX_SNAPSHOTS)} ${uno ? 'ha' : 'han'} cambiado. ` +
    `${uno ? 'Lo' : 'Los'} describen con palabras: ${muestra.join(', ')}` +
    `${resto > 0 ? ` y ${resto} ruta(s) más` : ''}.\n` +
    `        Ningún test comprueba la prosa —los datos sí—, así que si alguna frase afirmaba algo\n` +
    `        sobre ${uno ? 'este dato' : 'estos datos'}, vuelve a leerla:  npm run review:surfaces -- ${muestra.join(' ')}`
  )
}

/**
 * El recordatorio tras un Write o un Edit, o null si no toca.
 *
 * Un Bash no se decide aquí: su llamada no dice qué escribió, así que el runner
 * se lo pregunta al árbol (`GIT_STATUS_SNAPSHOTS`) y lo pasa por `novedades`.
 *
 * @param {{tool_name?: string, tool_input?: Record<string, unknown>}} payload
 */
export function decideRecordatorio(payload) {
  const tool = payload?.tool_name
  if (tool !== 'Write' && tool !== 'Edit' && tool !== 'MultiEdit') return null
  const snap = snapshotDe(payload?.tool_input?.file_path)
  return snap ? avisoPara([snap]) : null
}

/**
 * Lo que el runner le pregunta a git tras un Bash: qué snapshots difieren de
 * HEAD. `:(glob)` para que `*` no cruce carpetas y los troceados queden fuera.
 * `--no-optional-locks` para no tomar `index.lock`: en el checkout principal
 * los agentes de launchd hacen sus propios commits, y un `git status` de fondo
 * con el candado puesto les tumbaría el suyo. `--untracked-files=normal`
 * explícito para que una configuración global no esconda un snapshot nuevo.
 */
export const GIT_STATUS_SNAPSHOTS = [
  '--no-optional-locks',
  'status',
  '--porcelain',
  '-z',
  '--untracked-files=normal',
  '--',
  ':(glob)public/data/*.json',
]

/**
 * `git status --porcelain -z` → rutas, relativas a la raíz, de los snapshots
 * cambiados, nuevos o renombrados. Los borrados no: ya no queda dato que
 * describir. Con `-z`, un renombrado o copiado trae su origen en el campo
 * siguiente, que se salta.
 */
export function snapshotsDeEstado(salida) {
  const campos = String(salida ?? '').split('\0')
  const rutas = []
  for (let i = 0; i < campos.length; i++) {
    const campo = campos[i]
    if (campo.length < 4) continue
    const xy = campo.slice(0, 2)
    if (/[RC]/.test(xy)) i++
    if (xy.includes('D')) continue
    const ruta = campo.slice(3)
    if (snapshotDe(ruta)) rutas.push(ruta)
  }
  return rutas
}

/**
 * Qué snapshots hay que contar ahora: los cambiados con un contenido que este
 * contexto todavía no ha oído. Devuelve también la memoria siguiente, que olvida
 * lo que en este árbol ya no está cambiado —tras un commit, un dato que vuelve a
 * moverse se vuelve a contar— y no toca lo de otros árboles.
 *
 * @param {Record<string, string>} cambiados  ruta absoluta → huella, lo cambiado ahora bajo `raiz`
 * @param {Record<string, string>} contados   ruta absoluta → huella ya contada
 * @param {string} raiz
 */
export function novedades(cambiados, contados, raiz) {
  const nuevos = Object.keys(cambiados)
    .filter((k) => contados[k] !== cambiados[k])
    .sort()
  const bajo = raiz.endsWith('/') ? raiz : `${raiz}/`
  const memoria = Object.fromEntries(
    Object.entries(contados).filter(([k]) => !k.startsWith(bajo) || Object.hasOwn(cambiados, k)),
  )
  for (const k of nuevos) memoria[k] = cambiados[k]
  return { nuevos, memoria }
}
