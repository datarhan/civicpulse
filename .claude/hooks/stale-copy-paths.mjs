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

/**
 * Qué páginas describen con palabras cada snapshot.
 *
 * Se amplía cuando una página empieza a explicar un dato nuevo. Un snapshot que
 * no aparece aquí no dispara nada: la lista dice «esto lleva prosa detrás», no
 * «esto es importante».
 */
export const PROSA_POR_SNAPSHOT = [
  { snapshot: 'indicadores.json', rutas: ['/eficiencia', '/metodologia'] },
  { snapshot: 'coste-efectivo.json', rutas: ['/eficiencia', '/metodologia'] },
  { snapshot: 'pmp.json', rutas: ['/eficiencia', '/metodologia'] },
  { snapshot: 'budget.json', rutas: ['/presupuesto'] },
  { snapshot: 'budget-execution.json', rutas: ['/presupuesto', '/eficiencia'] },
  { snapshot: 'tenders.json', rutas: ['/', '/presupuesto', '/eficiencia'] },
  { snapshot: 'quejas.json', rutas: ['/quejas'] },
  { snapshot: 'promises.json', rutas: ['/promesas'] },
  { snapshot: 'pleno-findings.json', rutas: ['/hallazgos'] },
]

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
  const fila = PROSA_POR_SNAPSHOT.find((f) => f.snapshot === snap)
  return fila ? fila.rutas : []
}

/**
 * El recordatorio, o null si no toca.
 *
 * @param {{tool_name?: string, tool_input?: Record<string, unknown>}} payload
 */
export function decideRecordatorio(payload) {
  const tool = payload?.tool_name
  if (tool !== 'Write' && tool !== 'Edit' && tool !== 'MultiEdit') return null
  const ruta = payload?.tool_input?.file_path
  const rutas = rutasAfectadas(typeof ruta === 'string' ? ruta : '')
  if (!rutas.length) return null
  const snap = snapshotDe(ruta)
  return (
    `[prosa] ${snap} ha cambiado. Estas páginas lo describen con palabras: ${rutas.join(', ')}.\n` +
    `        La prosa no la comprueba ningún test —los datos sí—, así que si alguna frase afirmaba\n` +
    `        algo sobre este dato, vuelve a leerla:  npm run review:surfaces -- ${rutas[0]}`
  )
}
