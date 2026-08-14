/**
 * Would a reasonable reader conclude something from this page that the data
 * does not support?
 *
 * This is the one class of defect no deterministic check reached. The five
 * cross-checks answer "is the data right?"; none answers "does the page say
 * something true?". Those diverge constantly, and today every instance was
 * found by a person reading a rendered page rather than inspecting a snapshot:
 *
 *   · «Presup. 2025 €41,6M» beside «Contratos adj. €68,0M» — one annual, one a
 *     decade cumulative, so the pair invited the reader to conclude the town
 *     awards more than its whole budget.
 *   · «0 votaciones» on 54 sessions nobody had transcribed — asserting a pleno
 *     held no votes.
 *   · «El grupo Otro afirma…» beside a seat map showing Otro holds one seat,
 *     naming that councillor by elimination.
 *   · «hallazgos verificados manualmente» where 44 of 52 are machine-written.
 *   · «Sin lagunas detectadas» after examining zero candidates.
 *
 * Not one is a data error. Every snapshot behind them was correct. The defect
 * lives in the gap between a true number and the sentence wrapped around it,
 * and that gap is a language problem — which is the whole reason a model is the
 * right tool here, and the only place in this codebase where I would say so.
 *
 * Pure orchestration: the render and the model call are both injected.
 */

export interface SurfaceInput {
  /** Route under review, e.g. `/`. */
  route: string
  /** Visible text as a browser rendered it — NOT the JSX source. */
  renderedText: string
  /** Compact facts from the snapshots this route reads, for the model to check against. */
  facts: Record<string, unknown>
}

export interface ReaderFinding {
  /** Verbatim span from `renderedText`. Dropped if it is not literally present. */
  quote: string
  /** What a reader would wrongly conclude. */
  inference: string
  /** The fact that contradicts it, drawn from `facts`. */
  contradictedBy: string
  severity: 'misleading' | 'unclear'
}

export type ReaderCaller = (input: SurfaceInput) => Promise<ReaderFinding[] | null>

/**
 * Characters of rendered text handed to the model in one call.
 *
 * Not a page limit — a CALL limit. The caller splits and reviews every fragment;
 * see `chunkRenderedText`.
 *
 * El tamaño lo fija el VIGILANTE, no el modelo. `src/llm/client.ts` mata la
 * llamada a los 180 s, así que un fragmento que no quepa en ese reloj no falla
 * a veces: no puede terminar nunca. Medido el 2026-08-13 sobre las 84 llamadas
 * reales del día (la caché guarda `latencyMs`):
 *
 *     segundos ≈ 4,6 + 10,5 · miles de tokens   →   ~95 tokens/s
 *     techo de 180 s  ⇒  ~16.700 tokens por llamada
 *
 * A 12.000 caracteres un fragmento denso pasa de ese techo. Se vio en
 * `/reportajes/reconstruccion-dana`: 10.101 caracteres en UNA llamada tardan
 * 206 s medidos contra el CLI pelado —termina, y bien— pero el vigilante la
 * mata a los 180 s, así que la ruta salía «ningún backend respondió» todas las
 * veces. Cuatro de las 84 llamadas de hoy pasaron de 150 s: la herramienta
 * estaba corriendo pegada a su propio techo.
 *
 * 6.000 deja el fragmento denso peor en ~105 s, un tercio por debajo del reloj.
 * Sale más caro en llamadas y no en tokens —el texto se reparte, no se repite—
 * y el coste fijo de 4,6 s por llamada es ruido al lado de un timeout que se
 * come la cobertura entera de una ruta.
 */
export const REVIEW_CHUNK_CHARS = 6_000

/**
 * ¿Se ha caído el servidor que estamos leyendo, o ha fallado ESTA ruta?
 *
 * La diferencia decide si la pasada sigue o para. Tratar todo fallo como una
 * caída interrumpiría la lectura entera por una página lenta; tratar una caída
 * como un fallo de ruta hace lo que pasó el 2026-08-14, que fue peor: la
 * excepción escapó del bucle, se perdió el resumen y veintiséis rutas quedaron
 * sin leer y sin nombrar.
 *
 * Deliberadamente conservador. Sólo los errores que significan «no hay nadie
 * escuchando en ese puerto» cuentan como caída; cualquier otra cosa —un
 * timeout, una pestaña cerrada, un abort— es un problema de esa ruta y la
 * siguiente merece su intento.
 */
export function clasificarFalloDeNavegacion(err: unknown): 'servidor-caido' | 'ruta' {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  return /ECONNREFUSED|ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE|ERR_CONNECTION_CLOSED|socket hang up/i.test(
    msg,
  )
    ? 'servidor-caido'
    : 'ruta'
}

/**
 * Cada forma que tiene una pasada de tener algo que decir.
 *
 * Se recorre, no se repite. La decisión de salida vivía como un `if` de cinco
 * términos escritos a mano dentro del script, y el defecto que este bloque
 * arregla fue precisamente una sexta categoría —una ruta que no se pudo
 * alcanzar— que ese `if` no contemplaba: la pasada murió, salió 1, y ese 1 es
 * el mismo con el que sale una pasada sana que encontró señalamientos.
 *
 * Con la lista exportada, añadir un motivo y olvidarse de cablearlo pone
 * `tests/reader-review-resiliencia.test.ts` en rojo, porque el test recorre
 * esto en vez de copiarlo (regla nº1 de docs/DATA_INTEGRITY.md).
 */
export const MOTIVOS_PARA_HABLAR = [
  /** Señalamientos vivos para revisión humana. */
  'senalamientos',
  /** Rutas de las que no se revisó ni un fragmento. */
  'sinRevisar',
  /** Rutas de las que se revisó una parte. */
  'parciales',
  /** Rutas a las que el presupuesto de tiempo no llegó. */
  'sinTiempo',
  /** Rutas que esta build no monta (una bandera apagada, casi siempre). */
  'noMontadas',
  /** Rutas que no se pudieron cargar: el servidor no respondía. */
  'inalcanzables',
] as const

export type Recuento = Record<(typeof MOTIVOS_PARA_HABLAR)[number], number>

/** ¿Tiene esta pasada algo que contar? Entonces no puede salir 0. */
export const pasadaHabla = (r: Recuento): boolean =>
  MOTIVOS_PARA_HABLAR.some((m) => (r[m] ?? 0) > 0)

/**
 * What `review-surfaces` remembers about a route between runs.
 *
 * The findings travel WITH the hash. Storing the hash alone retired a route
 * after any complete pass, including one that had just flagged two misleading
 * juxtapositions — the next run printed «sin cambios, se omite» and summarised
 * «0 señalamiento(s)» about live, unfixed flags.
 */
export interface ReviewCacheEntry {
  hash: string
  findings: ReaderFinding[]
  /** ISO timestamp of the last real review. Drives oldest-first ordering. */
  at?: string
}

/**
 * Read either cache shape; callers write the new one.
 *
 * Earlier caches held a bare hash string. Returning `null` for those would be
 * safe (a missed cache means MORE review, never less) but would silently throw
 * away every remembered finding on upgrade, so they are read as an entry with
 * no findings — which is exactly what they recorded.
 */
export function readCacheEntry(v: string | ReviewCacheEntry | undefined): ReviewCacheEntry | null {
  if (typeof v === 'string') return { hash: v, findings: [] }
  if (v && typeof v.hash === 'string') return { hash: v.hash, findings: v.findings ?? [], at: v.at }
  return null
}

/**
 * `--budget-seconds N`, `--budget-seconds=N`, or `REVIEW_BUDGET_SECONDS`.
 *
 * Written as a real parser rather than the old `filter(a => !a.startsWith('--'))`,
 * which keeps a flag's VALUE and would have sent the tool off to review a route
 * named `60`. A non-positive or unparseable budget means NO budget: this file's
 * whole subject is checks that quietly do less than they claim, and a typo that
 * silently shrinks coverage to nothing would be one more.
 */
export function parseReviewArgs(argv: string[], budgetEnv?: string) {
  const routes: string[] = []
  let budgetSeconds = Number(budgetEnv ?? 0)
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--budget-seconds') {
      budgetSeconds = Number(argv[i + 1])
      i += 1
    } else if (a.startsWith('--budget-seconds=')) {
      budgetSeconds = Number(a.slice('--budget-seconds='.length))
    } else if (!a.startsWith('--')) {
      routes.push(a)
    }
  }
  if (!Number.isFinite(budgetSeconds) || budgetSeconds <= 0) budgetSeconds = 0
  return {
    routes,
    budgetSeconds,
    json: argv.includes('--json'),
    force: argv.includes('--force'),
    // Ordena por «hace más que no se lee» antes de gastar el presupuesto. Sólo
    // significa algo junto a `--budget-seconds`: sin techo se leen todas.
    rotate: argv.includes('--rotate'),
    // Todas las rutas públicas montadas, sacadas del grafo de rutas en vez de
    // la lista escrita a mano. `DEFAULT_ROUTES` son 6 de las 28 que existen:
    // quien creía estar haciendo «la pasada completa» leía menos de un cuarto
    // del sitio. Lo usa el barrido nocturno.
    all: argv.includes('--all'),
  }
}

/**
 * Split a rendered page into review-sized fragments, LOSING NOTHING.
 *
 * This function exists because of a silent-truncation bug that is the exact
 * shape of every incident in docs/DATA_INTEGRITY.md. `review-surfaces` sliced
 * the rendered text to the first 12.000 characters and reviewed that, with no
 * mention anywhere that it had done so. On /metodologia — 34.909 characters, the
 * published editorial contract — that is 34% of the page, and the three edits
 * that shipped on the branch that found this all sat past the cut. Worse, the
 * change-detection hash was computed over the same truncated prefix, so an edit
 * beyond it could not even mark the route as changed: the tool reported "sin
 * cambios" about prose it had never read, then "nada que señalar" when forced.
 *
 * Two thirds of the page had never been reviewed by the check built to review it.
 *
 * So: no default truncation anywhere. A page too big for one call is reviewed in
 * several, and the caller reports how much of it was actually reviewed.
 *
 * Splits on line boundaries (`innerText` is newline-separated blocks) so a
 * fragment does not cut a sentence in half — a model cannot judge the meaning of
 * half a claim, and the grounding filter would drop any quote spanning the seam.
 * A single line longer than `size` is hard-split rather than dropped: losing
 * text is the one thing this must never do.
 *
 * Las fronteras las decide el CONTENIDO, no el reparto. Ésta es la parte que
 * hace útil a la caché por fragmento, que ya existía y no servía de nada:
 * `client.ts` teclea cada llamada con `{route, fragment: hashOf(chunk)}`, así
 * que un fragmento idéntico vuelve de `.llm-cache` al instante. Con el reparto
 * voraz eso casi nunca pasaba —insertar un párrafo arriba corría todas las
 * fronteras de abajo y ninguno era ya idéntico—, de modo que tocar dos párrafos
 * de una pieza costaba releerla entera. Medido el 13-08-2026 sobre una página
 * de 28k en cinco fragmentos: una inserción de 40 caracteres dejaba 4 de 5
 * intactos (cabía en la holgura), una de 400 dejaba CERO. Que aguante o no
 * según quepa en el hueco sobrante no es estabilidad, es suerte.
 *
 * Así que se corta después de una línea que `esFrontera` acepta —cosa que
 * depende sólo de esa línea—, con un mínimo para no fabricar migajas (cada
 * llamada cuesta ~4,6 s fijos) y el máximo de siempre, que lo manda el vigilante
 * de 180 s. Las líneas de más abajo deciden su frontera por su propio contenido,
 * no por cuánto se acumuló antes, así que una inserción perturba su fragmento y
 * el resto vuelve a cuadrar.
 *
 * Medido sobre el texto renderizado de verdad, insertando un párrafo arriba:
 *
 *     reparto voraz          0 de 5 fragmentos intactos
 *     fronteras por contenido  3 de 4     (y 4 de 6 en una página sintética de 28k)
 *
 * El mínimo es el precio: suprime la frontera que habría vuelto a cuadrar y por
 * eso no sobrevive el 100%. Con mínimo 45% sobrevivían 2 de 8; con 12%, dos
 * tercios. Bajarlo más sólo compra migajas.
 *
 * El fallo es hacia MÁS relectura, nunca hacia menos: si una frontera se mueve,
 * el fragmento se relee. Nada se deja de mirar por culpa de esto, y por eso los
 * parámetros se pueden tocar sin que nadie se quede sin revisar.
 */
const CORTE_MINIMO = 0.12 // del máximo: por debajo no se corta, para no hacer migajas
const OBJETIVO_FRONTERA = 3_000 // caracteres esperados entre fronteras

/**
 * ¿Termina aquí un fragmento? Lo decide ESTA línea y nada más.
 *
 * La probabilidad es proporcional a la longitud de la línea, y ese detalle es
 * el que hace que funcione en páginas reales. Una regla del tipo «una de cada N
 * líneas» parece equivalente y no lo es: la mediana de línea en la pieza DANA
 * renderizada son 10 caracteres —etiquetas de KPI, cifras sueltas— frente a los
 * ~70 de un texto corrido, así que la misma N daba fronteras cada 1.200
 * caracteres en una página y cada 4.000 en otra. Ponderando por longitud, los
 * caracteres esperados entre cortes salen ≈ OBJETIVO_FRONTERA en las dos.
 */
function esFrontera(linea: string): boolean {
  // fnv-1a sobre la línea. Barato, estable entre pasadas y entre máquinas: la
  // caché depende de que la misma página dé exactamente los mismos cortes hoy y
  // mañana, así que aquí no puede entrar nada aleatorio ni dependiente de orden.
  let h = 0x811c9dc5
  for (let i = 0; i < linea.length; i += 1) {
    h ^= linea.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return (h % 100_000) / 100_000 < linea.length / OBJETIVO_FRONTERA
}

export function chunkRenderedText(text: string, size = REVIEW_CHUNK_CHARS): string[] {
  if (!text.trim()) return []
  if (text.length <= size) return [text]
  const minimo = Math.floor(size * CORTE_MINIMO)
  const chunks: string[] = []
  let current: string[] = []
  let length = 0
  const flush = () => {
    if (current.length) chunks.push(current.join('\n'))
    current = []
    length = 0
  }
  for (const line of text.split('\n')) {
    if (line.length > size) {
      flush()
      for (let i = 0; i < line.length; i += size) chunks.push(line.slice(i, i + size))
      continue
    }
    // +1 for the newline this line will be rejoined with.
    if (length && length + line.length + 1 > size) flush()
    current.push(line)
    length += line.length + 1
    // Frontera por contenido, una vez pasado el mínimo. El máximo sigue siendo
    // el corte duro de arriba: esto adelanta la frontera, nunca la retrasa.
    if (length >= minimo && esFrontera(line)) flush()
  }
  flush()
  return chunks.filter((c) => c.trim())
}

function normalise(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Keep only findings that quote the page literally.
 *
 * The failure mode this exists for is specific and was observed today in a
 * different check: a model restates the page in its own words and then objects
 * to its own restatement. That produces confident, unfalsifiable complaints. If
 * the sentence is not on the page, there is nothing to fix — and requiring the
 * quote makes a false positive visible in one glance instead of arguable.
 */
export function partitionFindings(
  findings: ReaderFinding[],
  input: SurfaceInput,
): { kept: ReaderFinding[]; dropped: ReaderFinding[] } {
  const hay = normalise(input.renderedText)
  const kept: ReaderFinding[] = []
  const dropped: ReaderFinding[] = []
  for (const f of findings ?? []) {
    if (!f?.quote || !f?.inference || !f?.contradictedBy) {
      dropped.push(f)
      continue
    }
    const q = normalise(f.quote)
    // Long enough to identify a real claim; short enough that a model quoting a
    // whole section does not sneak past by including one true sentence.
    if (q.length < 12 || q.length > 400 || !hay.includes(q)) dropped.push(f)
    else kept.push(f)
  }
  return { kept, dropped }
}

export function groundFindings(findings: ReaderFinding[], input: SurfaceInput): ReaderFinding[] {
  return partitionFindings(findings, input).kept
}

/**
 * How many findings the grounding gate discarded.
 *
 * Reported, not just counted. `review-surfaces` used to print the number of
 * SURVIVORS and, at zero, "nada que señalar" — so "the page is clean" and "the
 * model produced three findings and I threw them all away" printed the same
 * line. That is the shape of every silent-failure incident in this repo: the
 * check's silence gets read as approval.
 *
 * A high drop count is not necessarily a bug — the gate exists to discard
 * findings that do not quote the page, and a model that paraphrases SHOULD be
 * discarded. It is a signal to look, not a defect.
 */
export async function reviewSurface(
  input: SurfaceInput,
  call: ReaderCaller,
): Promise<ReaderFinding[]> {
  return (await reviewSurfaceDetailed(input, call)).findings
}

export interface SurfaceResult {
  findings: ReaderFinding[]
  dropped: ReaderFinding[]
  /**
   * Did the model actually answer?
   *
   * `false` means nobody looked — an empty render, or every backend exhausted.
   * That is NOT "the page is clean", and `review:surfaces` printed exactly that
   * for both pages the first time a sibling check hit an exhausted backend.
   * A check that reports health it never measured is the failure this repo has
   * had four recorded instances of.
   */
  consulted: boolean
  /**
   * Llamadas gastadas en este fragmento. 1 salvo que hiciera falta reintentar.
   *
   * Se devuelve para que quien llama pueda DECIRLO. Una pasada que necesitó dos
   * intentos no es lo mismo que una limpia a la primera, y callarlo escondería
   * que el backend flaquea justo cuando eso es lo que hay que saber.
   */
  attempts: number
  reason?: 'empty-page' | 'no-answer'
}

export async function reviewSurfaceDetailed(
  input: SurfaceInput,
  call: ReaderCaller,
  opts: { retries?: number } = {},
): Promise<SurfaceResult> {
  if (!input.renderedText.trim()) {
    return { findings: [], dropped: [], consulted: false, reason: 'empty-page', attempts: 0 }
  }
  // Un reintento rescata un fallo TRANSITORIO del backend: el vigilante del CLI
  // mata a los 180 s y lanza un `Error` PLANO, así que el bucle de reintentos de
  // `callLLM` —que sólo honra `RetryableError`— no lo toca. Medido: «all
  // backends exhausted (claude-code) after 1 total attempts».
  //
  // Lo que este reintento NO arregla, y creí que sí: un fragmento demasiado
  // grande para el reloj. Ese timeout es determinista —el mismo texto vuelve a
  // tardar lo mismo— así que insistir cuesta 180 s más y falla igual. De eso se
  // ocupa `REVIEW_CHUNK_CHARS`, que ahora se dimensiona contra el vigilante.
  // Diagnostiqué el caso de `/reportajes/reconstruccion-dana` al revés: bisecar
  // el texto parecía señalar una frase, pero las respuestas «rápidas» de la
  // bisección eran ACIERTOS DE CACHÉ (`.llm-cache` es content-addressed y
  // `--force` sólo salta la caché de rutas, no la de respuestas). La llamada más
  // rápida real del día tardó 5,4 s; ningún fragmento de 10.000 caracteres
  // vuelve en 4. Una comparación contra una caché que no sabes que está ahí no
  // mide el contenido, mide la caché.
  //
  // Las llamadas fallidas NO se cachean, de modo que el segundo intento es un
  // intento de verdad y no la misma respuesta servida dos veces.
  //
  // Por defecto CERO: quien llama decide, porque sólo él sabe si le queda
  // presupuesto. Insistir sin límite convertiría «reintentar» en «insistir
  // hasta que salga algo», que es otra forma de no aceptar un no por respuesta.
  const intentos = Math.max(1, 1 + (opts.retries ?? 0))
  let raw: ReaderFinding[] | null = null
  let attempts = 0
  for (let i = 0; i < intentos; i += 1) {
    attempts = i + 1
    raw = await call(input)
    if (raw) break
  }
  if (!raw) return { findings: [], dropped: [], consulted: false, reason: 'no-answer', attempts }
  const { kept, dropped } = partitionFindings(raw, input)
  // The dropped ones travel with the result, not just their count. On the first
  // run that reported them, four of six routes had printed "nada que señalar"
  // while holding five discarded findings between them; a bare number tells you
  // something is hidden without letting you judge whether it mattered.
  return { findings: kept, dropped, consulted: true, attempts }
}
