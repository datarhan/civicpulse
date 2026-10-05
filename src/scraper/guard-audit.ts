/**
 * The bookkeeping behind `check:guards`: is each guard invoked, exercised by a
 * test, and proven to fire on its own fault?
 *
 * Pure. `scripts/check-guards.ts` owns the filesystem, the `git` calls and the
 * actual corruption; this owns the three questions that have a wrong answer
 * available — and the last time one was answered by hand it was wrong by 4×.
 */

/**
 * Does `body` invoke this guard?
 *
 * The boundary matters more than it looks. `check:transcripts` must not match
 * inside `check:transcription-health`, and a guard named as a prefix of another
 * would otherwise report itself wired everywhere the longer one is.
 */
export function invokesGuard(body: string, guard: string): boolean {
  return new RegExp(`\\b${guard.replace(':', '\\:')}\\b(?![:\\w-])`).test(body)
}

/**
 * El cuerpo sin comentarios.
 *
 * `invokesGuard` casa TEXTO, así que un comentario que nombre una guarda la
 * declararía enchufada. En un `.sh` da igual —ahí un nombre suelto no compila
 * nada— pero un orquestador `.ts` documenta sus decisiones al lado de la lista
 * que ejecuta: `monitor-health.ts` dedica seis líneas de comentario a por qué
 * corre `check:stamps`. Un falso «enchufado» es peor que un falso huérfano:
 * dice que alguien lo corre cuando no lo corre nadie.
 *
 * Copia local a propósito: `scripts/lib/route-graph.ts` tiene la suya para el
 * grafo de importaciones, y `src/` no puede importar de `scripts/` sin invertir
 * la dirección de la dependencia.
 */
export function sinComentarios(cuerpo: string): string {
  return cuerpo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/gm, '$1')
}

export function wiringFor(guard: string, sites: Map<string, string>): string[] {
  const hits: string[] = []
  for (const [path, body] of sites) if (invokesGuard(body, guard)) hits.push(path)
  return hits
}

/**
 * Three states for wiring too — and this one caught the author.
 *
 * `check:contract-drift` is deliberately NOT in any pipeline: it needs a model
 * and CI has none, so running it nightly would report health it never measured.
 * The audit had no way to say that, so it flagged the guard as an orphan and
 * exited 1. Same collapse as the injection column before it was split: "nobody
 * wired this" and "this is a manual tool on purpose" are different facts, and
 * an audit that cannot tell them apart trains you to ignore its red.
 *
 * `manual` requires a REASON. A guard with no call sites and no stated reason
 * is still an orphan and still fails.
 */
export type WiringState = 'wired' | 'manual' | 'orphan'

export function classifyWiring(wiredIn: string[], manualReason?: string): WiringState {
  if (wiredIn.length > 0) return 'wired'
  return manualReason ? 'manual' : 'orphan'
}

/** `from '../src/foo/bar'` → `src/foo/bar`, extension stripped. */
export function importedModules(scriptSource: string): string[] {
  return [...scriptSource.matchAll(/from ['"]\.\.\/(src\/[^'"]+)['"]/g)].map((m) =>
    m[1].replace(/\.(ts|js)$/, ''),
  )
}

/**
 * The script files an npm command actually runs.
 *
 * Returns more than one because a guard can be a shell orchestrator: `check:corpus`
 * is `bash scripts/verify-transcript-corpus.sh`, which runs `scripts/corpus-delta.ts`,
 * which is where the logic lives. Stopping at the `.sh` reported the guard as
 * untested when its arithmetic has ten tests — the same off-by-a-layer mistake
 * as grepping for the guard's name.
 */
export function scriptTargets(
  npmCommand: string,
  readFile: (p: string) => string | null,
): string[] {
  const seen = new Set<string>()
  const queue: string[] = []
  const push = (p: string) => {
    if (p && !seen.has(p)) {
      seen.add(p)
      queue.push(p)
    }
  }
  for (const m of npmCommand.matchAll(/(?:tsx|node|bash|sh)\s+(scripts\/[^\s]+)/g)) push(m[1])

  const out: string[] = []
  while (queue.length) {
    const p = queue.shift()!
    out.push(p)
    if (!/\.(sh|bash)$/.test(p)) continue
    const body = readFile(p)
    if (!body) continue
    for (const m of body.matchAll(/(?:tsx|node)\s+(scripts\/[^\s"']+)/g)) push(m[1])
  }
  return out
}

/**
 * Which tests exercise a guard, resolved through the MODULE GRAPH, not by name.
 *
 * A grep for the guard's name answers a different question and answers it
 * wrongly: it said 12 of 13 guards had no test when 10 of 15 do. The reason is
 * that `scripts/check-relations.ts` is a thin CLI whose logic lives in
 * `src/scraper/relations-check.ts`, and the test imports the MODULE — never the
 * script, never the npm-script name.
 *
 * Each hit says whether it is `direct` or `via <module>`, because a bare tick
 * would overstate: `quote-match` is shared by three guards, so any test of it
 * would make all three look covered.
 */
export function testsForScript(
  scriptSource: string,
  scriptPathNoExt: string,
  tests: Map<string, string>,
): string[] {
  const modules = importedModules(scriptSource)
  const hits: string[] = []
  for (const [name, body] of tests) {
    if (body.includes(scriptPathNoExt)) {
      hits.push(`${name} (direct)`)
      continue
    }
    const via = modules.find((m) => body.includes(m))
    if (via) hits.push(`${name} (via ${via.split('/').pop()})`)
  }
  return hits
}

/**
 * Three states, not two — the same shape as `check:citations`'s
 * alive/dead/unverifiable.
 *
 * «No injection» used to cover both "nobody has written one" and "nobody can
 * write one here", which reads as negligence in the second case and as coverage
 * in neither. A guard that needs an embedding backend to fail is not the same
 * as a guard nobody got round to.
 */
export type InjectionState =
  | 'proven' // green without the injection, red with it
  | 'silent' // injected; the guard did NOT notice — a real defect
  | 'unproven' // its red proves nothing: red before any injection, or red for something else
  | 'not-run' // an injection exists but this run could not use it
  | 'undefined' // none written, no reason given
  | 'not-injectable' // deliberately none, with a stated reason

export interface InjectionVerdict {
  state: InjectionState
  detail: string
}

export function classifyInjection(input: {
  hasInjection: boolean
  fired: boolean | null
  note?: string
  /** Por qué su rojo no prueba nada (`juzgarInyeccion`), si es el caso. */
  unproven?: string
  notInjectableReason?: string
}): InjectionVerdict {
  if (input.hasInjection) {
    if (input.fired === true) return { state: 'proven', detail: 'FIRES' }
    if (input.fired === false) return { state: 'silent', detail: '⚠ SILENT on its own fault' }
    if (input.unproven) return { state: 'unproven', detail: input.unproven }
    return { state: 'not-run', detail: input.note ?? 'not exercised this run' }
  }
  if (input.notInjectableReason) {
    return { state: 'not-injectable', detail: input.notInjectableReason }
  }
  return { state: 'undefined', detail: 'ninguna definida' }
}

/** Una corrida de una guarda: cómo salió y qué imprimió. */
export interface CorridaDeGuarda {
  /**
   * El código de salida, o `null` si no salió por sí misma: la mató una señal,
   * desbordó el búfer o no llegó a arrancar.
   */
  status: number | null
  /** stdout y stderr juntos: donde se busca la `espera` de una inyección. */
  salida: string
}

const comoSalio = (c: CorridaDeGuarda): string =>
  c.status === null ? 'no terminó' : `sale ${c.status}`

/**
 * Lo que prueba UNA inyección, de dos corridas de su guarda: sobre el árbol
 * intacto y con la inyección puesta.
 *
 * Hasta el 05-10-2026 contaba sólo la segunda, y una guarda que ya salía roja
 * daba FIRES con cualquier inyección: entre #226 —que dejó check:veredictos
 * saliendo 1 por una entrada del overlay por encima de su base— y #228, donde
 * una persona la firmó a la baja, cualquiera se habría leído probada. Ese rojo
 * no lo pone la inyección, así que no prueba nada: `unproven`, y ni se inyecta.
 *
 * Una inyección puede además decir qué espera ver (`espera`): la marca con la
 * que su guarda nombra el fallo inyectado. Roja sin ella es roja por otra cosa
 * —la guarda reventó al cargar lo corrompido, o saltó por un fallo que no es el
 * inyectado—, y eso tampoco prueba nada. Sin `espera` decide el código de
 * salida, como siempre.
 */
export function juzgarInyeccion(input: {
  sinInyeccion: CorridaDeGuarda
  /** `null` si no se llegó a inyectar. */
  conInyeccion: CorridaDeGuarda | null
  espera?: RegExp
}): { fired: boolean | null; unproven?: string } {
  const { sinInyeccion, conInyeccion, espera } = input
  if (sinInyeccion.status !== 0) {
    return {
      fired: null,
      unproven:
        `la guarda ya sale roja sin inyección (${comoSalio(sinInyeccion)}): ` +
        'la inyección no prueba nada',
    }
  }
  if (conInyeccion == null) return { fired: null }
  if (conInyeccion.status === 0) return { fired: false }
  if (espera && !espera.test(conInyeccion.salida)) {
    return {
      fired: null,
      unproven:
        `sale roja con la inyección (${comoSalio(conInyeccion)}), pero no por lo ` +
        `inyectado: su salida no casa con ${espera}`,
    }
  }
  return { fired: true }
}

/** Una inyección ya juzgada, como la apunta el arnés. */
export interface RegistroDeInyeccion {
  describe: string
  fired: boolean | null
  /** Por qué no se pudo ejercitar. */
  note?: string
  /** Por qué su rojo no prueba nada. */
  unproven?: string
}

/**
 * Lo que dicen de una guarda todas sus inyecciones juntas.
 *
 * Una guarda con dos responsabilidades sólo está probada si disparan las dos,
 * y una muda la deja muda pase lo que pase con las demás. Hasta el 05-10-2026
 * se miraba antes si alguna no se había ejercitado: una muda junto a otra sin
 * fichero salía «no ejercitada», y la auditoría daba 0 con una guarda muda
 * delante. Entre las que no prueban nada, «sin prueba» pesa más que «no
 * ejercitada»: que la guarda ya sale roja es un hecho que hay que decir.
 */
export function juntarInyecciones(registros: RegistroDeInyeccion[]): {
  fired: boolean | null
  note?: string
  unproven?: string
} {
  const note = registros.find((r) => r.note)?.note
  if (registros.length === 0) return { fired: null, note }
  if (registros.some((r) => r.fired === false)) return { fired: false, note }
  if (registros.every((r) => r.fired === true)) return { fired: true, note }
  return { fired: null, note, unproven: registros.find((r) => r.unproven)?.unproven }
}

export interface GuardSummary {
  total: number
  /** Orphans only — a documented manual-only guard is not counted here. */
  notInvoked: number
  manual: number
  untested: number
  proven: number
  silent: number
  /** Su rojo no prueba nada: ya roja sin inyección, o roja por otra cosa. */
  unproven: number
  notRun: number
  undefinedInjection: number
  notInjectable: number
}

export function summarise(
  rows: Array<{
    wiredIn: string[]
    testedBy: string[]
    verdict: InjectionVerdict
    manualReason?: string
  }>,
): GuardSummary {
  const count = (s: InjectionState) => rows.filter((r) => r.verdict.state === s).length
  const wiring = (s: WiringState) =>
    rows.filter((r) => classifyWiring(r.wiredIn, r.manualReason) === s).length
  return {
    total: rows.length,
    notInvoked: wiring('orphan'),
    manual: wiring('manual'),
    untested: rows.filter((r) => r.testedBy.length === 0).length,
    proven: count('proven'),
    silent: count('silent'),
    unproven: count('unproven'),
    notRun: count('not-run'),
    undefinedInjection: count('undefined'),
    notInjectable: count('not-injectable'),
  }
}

/**
 * Only a guard that is unwired, or that stayed silent on its own injected
 * fault, is a failure. A missing test or a missing injection is REPORTED —
 * making either fatal would be a policy change, and a guard audit that blocks
 * the pipeline on its own to-do list is one people delete.
 *
 * Una guarda sin prueba (`unproven`) también se informa y no tumba: que ya
 * salga roja es un hecho suyo, que ella misma informa donde corre, y hay
 * guardas rojas a propósito — tumbar aquí por eso dejaría la auditoría roja
 * para siempre.
 */
export function auditFails(s: GuardSummary): boolean {
  return s.notInvoked > 0 || s.silent > 0
}
