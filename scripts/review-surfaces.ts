#!/usr/bin/env tsx
/**
 * Read the site as a visitor would, and ask whether the page says something the
 * data does not support.
 *
 *   npm run review:surfaces -- /            # one route
 *   npm run review:surfaces                 # the default set, unbounded
 *   npm run review:surfaces -- --json
 *   npm run review:surfaces -- --budget-seconds 60
 *
 * Requires the preview server (`npm run preview`) and a $0 LLM backend:
 *   LLM_BACKEND=claude-code npm run review:surfaces
 *
 * `--budget-seconds N` (or `REVIEW_BUDGET_SECONDS`) caps the WALL CLOCK, for
 * callers that cannot wait — the pre-push hook, which measured 568s unbounded
 * and was killed by git at ten minutes. The budget buys time, NEVER silence: a
 * fragment the clock cut off is a PARCIAL, a route never reached is named as
 * SIN REVISAR, neither is cached, and the run exits non-zero. Without the flag
 * nothing is bounded and the full review is exactly what it was.
 *
 * `--rotate` ordena por «hace más que no se lee» antes de gastar el
 * presupuesto. Sólo tiene sentido junto a `--budget-seconds`, y existe para el
 * gancho de pre-push: le pasa las rutas que ese push puede haber roto y, si no
 * caben todas, las últimas de la lista no pueden ser siempre las mismas. Sin él
 * un conjunto explícito conserva el orden de quien llama.
 *
 * Renders with Playwright rather than reading JSX, because the defect being
 * hunted only exists once the page is assembled: two true numbers side by side
 * whose juxtaposition implies something false. You cannot see that in source.
 *
 * THE WHOLE PAGE IS REVIEWED, and the output says how much of it was. A page
 * larger than one call is split into fragments and each one is reviewed; a run
 * that could not review every fragment reports PARCIAL, is not cached, and exits
 * non-zero. It used to slice silently at 12.000 characters — 34% of
 * /metodologia — and print «nada que señalar». See `chunkRenderedText`.
 *
 * NEVER edits. Output is a lead for a human, exactly like every other
 * LLM-touching path in this repo.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { committedAwardYearSpan } from '../src/lib/contract-status'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { construirGrafoRutas, rutasRevisables } from './lib/route-graph'
import {
  reviewSurfaceDetailed,
  cabeElFragmento,
  chunkRenderedText,
  parseReviewArgs,
  readCacheEntry,
  sirveElVeredictoCacheado,
  huellaDeHechos,
  clasificarFalloDeNavegacion,
  pasadaHabla,
  REINTENTOS_SERVIDOR,
  ESPERA_SERVIDOR_MS,
  type SurfaceInput,
  type ReaderFinding,
  type ReviewCacheEntry,
  rutaBase,
  estadoDe,
} from '../src/scraper/reader-review'
import {
  sinDescartar,
  descartesHuerfanos,
  validarDescartes,
  type RegistroDescartes,
} from '../src/scraper/surface-dismissals'
import { authorshipBreakdown } from '../src/scraper/finding-authorship'
import { callLLM, llmCacheHas, getRunStats } from '../src/llm/client'
import {
  buildReaderReviewSystemPrompt,
  buildReaderReviewUserPrompt,
  READER_REVIEW_PROMPT_VERSION,
} from '../src/llm/prompts'
import { ReaderReviewSchema } from '../src/llm/schemas'

// `localhost`, not `127.0.0.1`: a plain `npm run preview` binds IPv6 by default,
// so the literal v4 address refuses the connection and every route fails to
// render — which this script would report as "nothing to review" rather than as
// a fault. The pre-push hook overrides this, and must: it starts its own preview
// on its own free port with an explicit `--host 127.0.0.1`, so it passes the v4
// URL that matches. Whoever starts the server picks the address.
const BASE = process.env.REVIEW_BASE_URL || 'http://localhost:4173'

// Sólo para que la inyección de fallo recorra el camino entero en milisegundos.
// Los defaults —los que rigen de verdad— viven en reader-review.ts y tienen su
// propio test: puestos a cero, el vigilante del barrido queda en adorno.
const num0 = (v: string | undefined, porDefecto: number) => {
  const n = Number(v)
  return v !== undefined && Number.isFinite(n) && n >= 0 ? n : porDefecto
}
const reintentosServidor = num0(process.env.REVIEW_SERVER_RETRIES, REINTENTOS_SERVIDOR)
const esperaServidorMs = num0(process.env.REVIEW_SERVER_RETRY_MS, ESPERA_SERVIDOR_MS)

/**
 * route → { hash of the rendered text last reviewed, what that review found }.
 *
 * The anti-decay mechanism, and the reason this can be automated at all. A model
 * asked repeatedly about UNCHANGED prose will eventually produce a plausible
 * wrong flag, and from that point the check gets ignored — which is how a check
 * dies. So a route whose rendered output is byte-identical to last time is not
 * asked about again: no call, no chance of a new opinion about old text.
 *
 * THE FINDINGS ARE STORED WITH THE HASH, and that is the difference between
 * skipping a call and forgetting a defect. The cache used to hold the hash
 * alone, so a route retired after ANY complete pass — including one that had
 * just flagged two misleading juxtapositions. The next run printed «sin cambios,
 * se omite» and the summary printed «0 señalamiento(s)» about a page whose flags
 * were still live and still unfixed. A skip now REPLAYS what the last review
 * found, and those findings still count toward the total and the exit code. The
 * page changed or it did not; a flag does not expire because a clock ran.
 *
 * HASHED OVER THE WHOLE PAGE, and that is load-bearing. It used to hash the same
 * truncated prefix the review was given, so an edit past the cut changed nothing
 * the cache could see: /metodologia grew three new paragraphs at offsets 13.819,
 * 16.186 and 17.303 and the tool answered «sin cambios» three runs in a row. A
 * cache must be keyed on what was actually reviewed, and the fix for that is to
 * review all of it — see `chunkRenderedText`.
 *
 * Gitignored ON PURPOSE, and the reasoning is the opposite of the committed
 * baselines elsewhere in this repo. Those detect drift, so a missing baseline
 * makes them unable to fail. This is a CACHE: a missing one means MORE review,
 * never less. It fails safe, so do not "fix" it by committing it — the rendered
 * text depends on local data state and it would churn on every run.
 */
const CACHE = resolve('.review-cache.json')
const loadCache = (): Record<string, string | ReviewCacheEntry> =>
  existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {}

/**
 * El registro de descartes ya existía — y esta herramienta lo ignoraba.
 *
 * `surface-dismissals.ts` se escribió el 13-08-2026 para que un falso positivo
 * revisado por una persona dejara de repetirse, y `check:surfaces` lo honra
 * desde entonces. Pero el barrido que IMPRIME los señalamientos nunca lo leyó,
 * así que un descarte silenciaba el parte de salud y no la salida que lee un
 * humano: el señalamiento seguía saliendo en cada pasada, que es justo lo que
 * el registro venía a evitar. Se vio con el falso positivo de `/gestion` del
 * 24-08-2026, que iba a reimprimirse indefinidamente.
 *
 * Un registro ilegible NO se trata como «sin descartes»: eso silenciaría el
 * hecho de que alguien lo rompió — misma disciplina que `check-surfaces.ts`.
 */
const DESCARTES = resolve('review-dismissals.json')
const loadDescartes = (): RegistroDescartes | null =>
  existsSync(DESCARTES) ? validarDescartes(JSON.parse(readFileSync(DESCARTES, 'utf8'))) : null
const hashOf = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const DATA = resolve('public/data')
const read = (f: string) =>
  existsSync(`${DATA}/${f}`) ? JSON.parse(readFileSync(`${DATA}/${f}`, 'utf8')) : null

/**
 * The facts each route is judged against. Deliberately small and hand-picked:
 * dumping whole snapshots would bury the model and invite it to pattern-match
 * rather than check. These are the figures a reader is being asked to trust.
 */
/** La adjudicación más grande del registro, con su título, sin IVA. */
function mayorAdjudicacion(tenders: {
  contracts?: {
    status?: string
    title?: string
    finalAmountNoTaxes?: number
    finalAmount?: number
  }[]
}): string | undefined {
  const adj = (tenders?.contracts ?? []).filter((c) =>
    ['awarded', 'formalized'].includes(c.status ?? ''),
  )
  if (!adj.length) return undefined
  const imp = (c: { finalAmountNoTaxes?: number; finalAmount?: number }) =>
    Number(c.finalAmountNoTaxes) || Number(c.finalAmount) || 0
  const top = adj.reduce((a, b) => (imp(b) > imp(a) ? b : a))
  return `${(imp(top) / 1e6).toFixed(2)} M€ — ${String(top.title ?? '').slice(0, 90)}`
}

/**
 * Lo que el ayuntamiento lleva ejecutado del ejercicio, que es OTRA cifra que
 * la de arriba y la que el revisor daba por buena al leer «gasto total».
 * Viene del estado de ejecución municipal, no del ministerio: son dos fuentes
 * y por eso el crédito no coincide entre ellas.
 */
function ejecucionFacts(
  ej: {
    latest?: { year?: number; fechaListado?: string; gastos?: { total?: Record<string, number> } }
  } | null,
): Record<string, unknown> {
  const g = ej?.latest?.gastos?.total
  if (!g) return {}
  const cuando = ej?.latest?.fechaListado ?? String(ej?.latest?.year ?? '')
  return {
    [`ejecución municipal a ${cuando}: crédito INICIAL de gasto`]: g.inicial,
    [`ejecución municipal a ${cuando}: crédito ACTUAL de gasto (inicial + modificaciones)`]:
      g.actual,
    [`ejecución municipal a ${cuando}: gasto RECONOCIDO (lo efectivamente ejecutado)`]: g.ejecutado,
  }
}

function factsFor(clave: string): Record<string, unknown> {
  // Los hechos van por RUTA: el estado cambia lo que se renderiza, no de qué
  // trata la página.
  const route = rutaBase(clave)
  const tenders = read('tenders.json')
  const budget = read('budget.json')
  const plenos = read('plenos.json')
  const votes = read('pleno-votes.json')
  const findings = read('pleno-findings.json')
  const common = {
    'contratos: total adjudicado (acumulado, todos los años)': tenders?.stats?.awardedTotalEuros,
    // Las dos cifras, y ETIQUETADAS. Decía «contratos: nº de contratos: 699»,
    // que es el recuento de ADJUDICADOS con nombre de total — y el primer
    // barrido completo lo cobró: señaló «805 contratos» en /datos, que es un
    // catálogo de snapshots donde 805 es exactamente el número de filas del
    // fichero. Un falso positivo nacido de una premisa mal rotulada, en la
    // herramienta cuyo trabajo entero es cazar rótulos que no cuadran con su
    // cifra. Con las dos delante, el modelo puede distinguir de cuál habla la
    // página en vez de suponer.
    'contratos: nº ADJUDICADOS (awarded + formalized)': tenders?.stats?.awardedContracts,
    'contratos: nº de FILAS del snapshot (incluye anulados, renuncias, desistidos y SIN CLASIFICAR)':
      tenders?.contracts?.length,
    // CALCULADO, no escrito. Esto decía literalmente «2017 → 2026» a mano, en
    // la herramienta cuyo trabajo entero es cazar rótulos que no cuadran con
    // sus datos: en cuanto el raspador traiga una adjudicación de 2027, el
    // reviewer estaría contrastando la página contra una premisa falsa suya.
    // Es la regla de CLAUDE.md —«computed, never typed»— aplicada al que
    // vigila. Mismo tramo y mismas filas que publica la ficha de /datos.
    'contratos: rango de fechas de adjudicación': (() => {
      const span = committedAwardYearSpan(tenders?.contracts)
      return span ? `${span.from} → ${span.to} (acumulado, NO anual)` : null
    })(),
    // La mayor adjudicación suelta, porque una pieza puede legítimamente
    // excluirla y el modelo no tenía cómo saberlo.
    //
    // /reportajes/reconstruccion-dana publica 68,00 M€ «sin contar la concesión
    // del agua». Sin este hecho, el reviewer veía 68,00 contra los 123,68 del
    // total y tenía que decidir sin datos si la exclusión cuadra — una pregunta
    // genuinamente difícil que le costaba MÁS de tres minutos y acababa en
    // timeout: la página se quedaba SIN REVISAR con el backend sano (`claude -p
    // ok` en 4 s). Medido: 9.959 caracteres sin la frase → 4 s; 9.987 con ella
    // → colgado. No era longitud ni puntuación, era la pregunta.
    'contratos: mayor adjudicación individual (una concesión se adjudica por todo su plazo de una vez, así que una pieza puede excluirla del denominador)':
      mayorAdjudicacion(tenders),
    // Tercera vez que un rótulo de esta tabla fabrica el señalamiento que
    // luego hay que desmentir a mano, y la más cara: decía «gasto total», que
    // se lee como dinero salido, cuando la cifra es el CRÉDITO de gasto del
    // presupuesto definitivo que el ayuntamiento rinde al ministerio
    // (CONPREL, `TipoDato=Presupuestos&TipoPublicacion=Definitiva`). Con ese
    // rótulo el revisor señaló la portada por «hacer pasar el gasto ejecutado
    // por presupuesto» —siendo la portada correcta— y volvió a señalar
    // /gestion y /presupuesto por lo mismo en barridos distintos. Cuatro
    // falsos positivos de una premisa mal rotulada, en la herramienta cuyo
    // trabajo entero es cazar rótulos que no cuadran con su cifra.
    //
    // Mismo remedio que con los contratos: las cifras que se confunden, las
    // dos, y ETIQUETADAS. El estado de ejecución municipal es justo la
    // magnitud que el revisor creía estar viendo, así que va delante.
    'presupuesto: CRÉDITO de gasto del ejercicio (presupuesto definitivo rendido al ministerio — lo autorizado, NO lo gastado)':
      budget?.snapshot?.totalExpense,
    'presupuesto: ejercicio': budget?.snapshot?.year,
    ...ejecucionFacts(read('budget-execution.json')),
  }
  if (route.startsWith('/plenos')) {
    const claims = read('pleno-claims-verified.json')
    // La cifra que faltaba, y por la que el revisor señaló la página dos
    // barridos seguidos. Con «votaciones transcritas: 7» como único hecho, ve
    // nueve marcas «N ✓» en el listado y concluye que hay votaciones en nueve
    // sesiones. El ✓ cuenta DECLARACIONES VERIFICADAS, que es otra cosa.
    //
    // Mismo remedio que con los contratos más arriba: dos cifras etiquetadas
    // delante, para que pueda distinguir de cuál habla la página en vez de
    // suponer. Sin esto, la leyenda nueva del listado tampoco le serviría —
    // seguiría sin tener contra qué comprobarla.
    const conVerificada = new Set(
      ((claims?.items ?? []) as { claim: { plenoId: string }; verification: { verdict: string } }[])
        .filter((i) => i.verification?.verdict === 'verificado')
        .map((i) => i.claim.plenoId),
    ).size
    return {
      ...common,
      'plenos: sesiones registradas': plenos?.stats?.total,
      'plenos: sesiones con votaciones transcritas': new Set(
        (votes?.items ?? []).map((v: { plenoId: string }) => v.plenoId),
      ).size,
      'plenos: el resto NO tiene votaciones transcritas (no significa que no votaran)': true,
      'plenos: sesiones con al menos una declaración VERIFICADA — es lo que cuenta la marca «N ✓» del listado, y NO son votaciones':
        conVerificada,
    }
  }
  // Las capas opcionales del mapa, cuando la clave pide encenderlas.
  //
  // Sin esto la prosa se renderiza pero sigue sin revisarse de verdad: la
  // regla 2 del sistema dice «si ningún hecho contradice la frase, no la
  // señales», así que una leyenda sin cifras detrás es tan inauditable como
  // una que no está en el DOM. Cada línea de aquí es exactamente una cifra que
  // esa prosa puede equivocar.
  if (estadoDe(clave) === 'capas') {
    const inc = read('incendios.json')
    const poi = read('civic-poi.json')
    const quejas = read('quejas.json')
    const u = inc?.universe
    return {
      ...common,
      'incendios: perímetros DIBUJADOS (los que cruzan el término)': u?.dibujados,
      'incendios: filas del snapshot (incluye los que NO se pintan)': u?.totalIncendios,
      'incendios: atribuidos a Riba-roja pero cartografiados FUERA del término (no se pintan)':
        u?.atribuidosSinPerimetroAqui,
      'incendios: hectáreas de lo dibujado (superficie del incendio COMPLETO, sin recortar por la frontera)':
        u?.superficieHaTotal,
      'incendios: primer año cartografiado': u?.anyoMin,
      'incendios: ÚLTIMO año cartografiado — la serie termina aquí, los posteriores existen y no están dibujados':
        u?.anyoMax,
      'incendios: partes SIN causa determinada (fuera del denominador de cualquier porcentaje de causas)':
        u?.sinClasificar,
      'incendios: advertencia de la propia fuente (ICV)': u?.aviso,
      'incendios: reparto por causa': inc?.stats?.porCausa,
      'servicios (POI): total en el mapa': poi?.stats?.total,
      'quejas: total registradas': quejas?.stats?.total ?? (quejas?.items ?? []).length,
    }
  }

  if (route.startsWith('/hallazgos'))
    return {
      ...common,
      'hallazgos: total publicados': (findings?.items ?? []).length,
      // Via the shared predicate, NOT a local `startsWith('auto')`: that copy
      // matched `auto-curation-v1` and missed `civicpulse-auto`, so the model
      // judging whether /hallazgos over-claims human curation was handed 44
      // where the truth was 49 — an under-count, in the flattering direction.
      'hallazgos: escritos por una máquina': authorshipBreakdown(findings?.items ?? []).machine,
    }
  // Un reportaje CONGELA sus cifras: cada pieza se publica con la foto de los
  // datos del día que se firmó, y por eso `public/data/reportajes/<slug>.json`
  // existe. El revisor no lo sabía y se le entregaba el snapshot de HOY como
  // si fuera la verdad contra la que juzgar: señaló «699 contratos» en
  // /reportajes/coste-efectivo porque el registro vivo ya va por 701 — dos
  // adjudicaciones que entraron después de firmar la pieza.
  //
  // Es un falso positivo que crece solo: cada adjudicación nueva vuelve a
  // señalar todos los reportajes, y no hay prosa que arreglar porque la pieza
  // dice su fecha. Lo que faltaba era decírselo al que juzga.
  if (route.startsWith('/reportajes/')) {
    const slug = route.slice('/reportajes/'.length).replace(/\/$/, '')
    const pieza = read(`reportajes/${slug}.json`)
    const fecha = pieza?.meta?.fechaDatos
    if (fecha)
      return {
        ...common,
        'AVISO — esta pieza CONGELA sus cifras': `Es un reportaje firmado con los datos a ${fecha}. Sus cifras NO se actualizan y no tienen por qué coincidir con los snapshots de arriba, que son los de hoy. Una diferencia entre una cifra de la pieza y una de esta lista sólo es un defecto si la pieza se contradice a sí misma o si la fecha que declara es falsa.`,
      }
  }
  return common
}

const DEFAULT_ROUTES = ['/', '/presupuesto', '/plenos', '/hallazgos', '/promesas', '/quejas']

async function main() {
  const {
    routes: named,
    budgetSeconds,
    json: asJson,
    force,
    rotate: rotar,
    rotateDesde,
    all: todas,
    desconocidas,
  } = parseReviewArgs(process.argv.slice(2), process.env.REVIEW_BUDGET_SECONDS)

  // Una bandera que no existe se descartaba entera. `--rutas /` no se parseaba
  // nunca: funcionó por casualidad, porque `/` se leyó como ruta posicional.
  // Un `--budget-second 60` mal tecleado corre SIN techo con la misma cara de
  // haber obedecido.
  if (desconocidas.length > 0) {
    console.error(`[review] bandera(s) que no existen: ${desconocidas.join(', ')}`)
    console.error('[review] no se ejecuta nada: corrige el mando o quítalas.')
    process.exit(2)
  }
  // `--force` significa «vuelve a leer ESTAS rutas», no «olvida el fichero».
  //
  // Era `force ? {} : loadCache()`, y como al final se escribe la caché
  // entera, un `--force /eficiencia` borraba de un plumazo el registro de las
  // otras veintiséis: hash, señalamientos vivos y fecha. Se descubrió al
  // estrenar `check:surfaces` — la caché tenía dos entradas donde había habido
  // once, y las nueve que faltaban se las había llevado un `--force` de dos
  // rutas media hora antes. Con el barrido nocturno alimentando el digest,
  // eso equivale a borrar la memoria de qué páginas se han leído.
  //
  // Ahora se carga siempre y lo que `--force` salta es el atajo de «sin
  // cambios», más abajo, sólo para las rutas de esta pasada.
  const cache = loadCache()
  const descartes = loadDescartes()
  let silenciados = 0
  const persistirCache = () => writeFileSync(CACHE, JSON.stringify(cache, null, 2) + '\n')
  // Oldest first, but ONLY under a budget. A budget starves whatever sits at the
  // end of the list, and a fixed order starves the same routes every time —
  // which is a route that is never reviewed and nobody notices, the exact
  // failure this whole file exists to avoid.
  //
  // Un conjunto explícito conserva el orden de quien llama, porque quien nombra
  // rutas a mano las quiere en ese orden — salvo que pida `--rotate`, que es lo
  // que hace el gancho de pre-push: le pasa las rutas que este push puede haber
  // roto, y si no caben en el presupuesto tiene que empezar por las que lleven
  // más tiempo sin leerse, o las últimas de la lista no se leen NUNCA.
  const porAntiguedad = (lista: string[]) =>
    [...lista].sort((a, b) =>
      (readCacheEntry(cache[a])?.at ?? '').localeCompare(readCacheEntry(cache[b])?.at ?? ''),
    )
  // Las claves con estado entran en la pasada COMPLETA. `check:surfaces` lee
  // la misma constante, así que una clave que el barrido lee y el parte no
  // conoce —invisible, nunca rancia— no puede existir.
  const publicas = rutasRevisables(construirGrafoRutas(resolve('src')))
  const base = named.length ? named : todas ? publicas : DEFAULT_ROUTES
  // Con `--rotate-desde N`: la cabeza en el orden de quien llama, la cola
  // rotada. Es lo que permite leer primero lo que el push reescribió sin perder
  // la equidad en lo que no cabe.
  const rotarCola = (lista: string[], desde: number) => [
    ...lista.slice(0, desde),
    ...porAntiguedad(lista.slice(desde)),
  ]
  const routes = !budgetSeconds
    ? base
    : rotateDesde > 0
      ? rotarCola(base, rotateDesde)
      : rotar || !named.length
        ? porAntiguedad(base)
        : base
  /** Wall clock, not a per-call timeout: the caller's patience is the budget. */
  const startedAt = Date.now()
  const deadline = budgetSeconds ? startedAt + budgetSeconds * 1000 : Infinity
  const spent = () => Math.round((Date.now() - startedAt) / 1000)
  /**
   * Longest model call seen this run. Measured, not assumed — one fragment cost
   * 65s here and 44s in the run before, and a hard-coded guess would be wrong in
   * whichever direction hurt.
   */
  let slowestCallMs = 0
  /**
   * Suelo del techo por llamada. Con menos que esto no merece la pena arrancar
   * —ninguna lectura medida bajó de ~40 s—, pero dejar el mínimo en cero haría
   * que una llamada arrancase con un plazo de milisegundos y muriese siempre.
   */
  const TECHO_MINIMO_MS = 20_000
  /**
   * "Is there time to START another fragment?" — not "has the clock run out?".
   *
   * Ésta es la PRIMERA de las dos mitades: no arrancar un fragmento que
   * previsiblemente no cabe. Sola no bastaba, porque una llamada ya en vuelo
   * seguía corriendo hasta su propio plazo de 180 s: medido,
   * `--budget-seconds 15` volvía a los 65 s, y en el gancho de pre-push tres
   * pasadas contra un presupuesto de 180 s costaron 474 s, 367 s y 380 s —una
   * llamada colgada, matada a los 180 s, por dos con el reintento— y tiraron el
   * push dos veces con «Connection to github.com closed by remote host».
   *
   * La segunda mitad está en el callback de abajo: cada llamada arranca con
   * `LLM_CLI_TIMEOUT_MS` puesto a lo que QUEDA, y bajo presupuesto sin
   * reintentos de cliente. Lo que esta guarda evita es gastar el hueco en algo
   * que se va a matar; lo que el techo evita es que un cuelgue se lleve el
   * presupuesto entero.
   *
   * NO es un techo perfecto, y conviene decir cuál es: el reintento de ESTA capa
   * se decide antes de la primera llamada, cuando `slowestCallMs` todavía vale
   * 0, así que el primer fragmento siempre tiene derecho a un segundo intento.
   * La cota real queda en `presupuesto + TECHO_MINIMO_MS`. Medido con un backend
   * que se cuelga (`sleep 600`) y `--budget-seconds 40`: **60 s**, con las dos
   * llamadas acotadas a 38 s y 20 s. Antes de esto, la misma inyección pasaba de
   * diez minutos, y en el gancho de pre-push tres pasadas reales contra 180 s
   * costaron 474 s, 367 s y 380 s.
   *
   * THE FIRST CALL ALWAYS RUNS: `slowestCallMs` is 0 until something has been
   * measured, and a budget too small for even one fragment must still review one
   * fragment. Reviewing nothing and saying so is honest but useless; the real
   * bound is therefore `budget + the first call`, and the summary prints the
   * time actually spent so nobody has to take this comment's word for it.
   */
  const noTimeToStart = () =>
    !cabeElFragmento({ gratis: false, ahora: Date.now(), slowestCallMs, deadline })
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const all: Array<{
    route: string
    findings: ReaderFinding[]
    dropped: ReaderFinding[]
    consulted: boolean
    reason?: string
    /** Coverage, always reported. See `chunkRenderedText` for why. */
    chars: number
    charsReviewed: number
    chunks: number
    chunksReviewed: number
    /** Share of the rendered page actually handed to the model, 0–1. */
    coverage: number
  }> = []
  let skipped = 0
  let totalDropped = 0
  /** Llamadas de más gastadas en rescatar fragmentos que fallaron a la primera. */
  let reintentos = 0
  const unreviewed: string[] = []
  /** Routes where SOME fragments were reviewed and some were not. */
  const partial: string[] = []
  /** Routes the clock never reached. Named, never folded into "unchanged". */
  const ranOut: string[] = []
  /** Rutas que la build no monta: se pidió una y el navegador acabó en otra. */
  const noMontadas: Array<{ route: string; aterrizaje: string }> = []
  /**
   * Rutas que no se pudieron cargar. La categoría que faltaba el 2026-08-14,
   * cuando el preview del barrido nocturno se murió a los diecinueve minutos:
   * la excepción de `page.goto` escapó del bucle hasta el `catch` de `main()`,
   * que imprime una línea y sale. Sin resumen, sin nombrar las veintiséis rutas
   * que quedaban, y con el mismo código de salida que una pasada sana con
   * señalamientos. El envoltorio registró «terminado (salió 1)» y el parte del
   * día quedó indistinguible de uno bueno.
   */
  const inalcanzables: Array<{ route: string; motivo: string }> = []
  /** Live findings from a previous review of byte-identical text. */
  let remembered = 0
  const pct = (n: number) => `${Math.round(n * 100)}%`
  const num = (n: number) => n.toLocaleString('es-ES')
  const header = (route: string) =>
    console.log(`\n── ${route} ${'─'.repeat(Math.max(0, 50 - route.length))}`)
  const printFinding = (f: ReaderFinding) => {
    console.log(`   ${f.severity === 'misleading' ? '⚠︎' : '·'} «${f.quote.slice(0, 110)}»`)
    console.log(`      un lector concluiría: ${f.inference}`)
    console.log(`      pero los datos dicen: ${f.contradictedBy}`)
  }

  for (const route of routes) {
    // Checked BEFORE the render, so an exhausted budget costs nothing and the
    // route is reported as unreached rather than as anything else.
    if (noTimeToStart()) {
      ranOut.push(route)
      all.push({
        route,
        findings: [],
        dropped: [],
        consulted: false,
        reason: 'budget',
        chars: 0,
        charsReviewed: 0,
        chunks: 0,
        chunksReviewed: 0,
        coverage: 0,
      })
      // The cache is left ALONE: this route was not reviewed, but the previous
      // review of its previous text is still true. Deleting would be safe too;
      // writing anything would not.
      continue
    }
    // Navegar puede fallar, y hasta hoy fallar aquí tiraba la pasada entera.
    // Se distinguen los dos casos porque llevan a decisiones opuestas: si el
    // servidor se ha caído no tiene sentido intentar las veintiséis siguientes
    // —se nombran todas y se para—, y si ha fallado esta ruta, la siguiente
    // merece su intento.
    //
    // Antes de darlo por muerto se insiste: el barrido nocturno relanza su
    // preview a los diez segundos, así que la caída que hoy costó veintiséis
    // páginas dura menos que este bucle de reintentos.
    // La cabecera de la ruta, una sola vez: la imprime el primer reintento si
    // los hubo, y el fallo si no.
    let cabeceraPuesta = false
    /** `null` si se logró navegar; el fallo, si no. */
    const navegar = async (): Promise<{
      motivo: string
      clase: 'servidor-caido' | 'ruta'
    } | null> => {
      let ultimo = ''
      for (let intento = 0; ; intento += 1) {
        try {
          await page.goto(`${BASE}${rutaBase(route)}`, { waitUntil: 'networkidle' })
          // Give the snapshot store a beat to resolve before reading the text.
          await page.waitForTimeout(1200)
          if (intento > 0 && !asJson)
            console.log(`   el servidor volvió al reintento ${intento}; se sigue leyendo.`)
          return null
        } catch (e) {
          ultimo = e instanceof Error ? e.message.split('\n')[0] : String(e)
          if (clasificarFalloDeNavegacion(e) === 'ruta') return { motivo: ultimo, clase: 'ruta' }
          if (intento >= reintentosServidor) return { motivo: ultimo, clase: 'servidor-caido' }
          if (!asJson) {
            if (!cabeceraPuesta) {
              console.log(`\n── ${route}`)
              cabeceraPuesta = true
            }
            console.log(
              `   ${BASE} no responde — reintento ${intento + 1}/${reintentosServidor} en ` +
                `${Math.round(esperaServidorMs / 1000)}s`,
            )
          }
          await page.waitForTimeout(esperaServidorMs)
        }
      }
    }
    const fallo = await navegar()
    if (fallo) {
      inalcanzables.push({ route, motivo: fallo.motivo })
      if (!asJson) {
        if (!cabeceraPuesta) console.log(`\n── ${route}`)
        console.log(`   NO ALCANZADA: ${fallo.motivo}`)
      }
      if (fallo.clase === 'servidor-caido') {
        // Las que quedaban se nombran una a una. «26 sin revisar» sin la lista
        // es la truncadura silenciosa que este fichero entero existe para no
        // cometer: quien lee el parte tiene que poder saber QUÉ no se leyó.
        const pendientes = routes.slice(routes.indexOf(route) + 1)
        for (const r of pendientes)
          inalcanzables.push({ route: r, motivo: 'el servidor dejó de responder antes de llegar' })
        if (!asJson && pendientes.length > 0) {
          console.log(
            `\n   El servidor de ${BASE} dejó de responder. NO se han intentado las ` +
              `${pendientes.length} ruta(s) restantes: ${pendientes.join(', ')}`,
          )
        }
        break
      }
      continue
    }

    // ¿Sigue el navegador donde le pedimos que fuera?
    //
    // App.jsx manda cualquier ruta desconocida a `/`, y una ruta tras bandera no
    // existe en una build sin la bandera. El gancho de pre-push construía sin
    // ellas, así que pedía /eficiencia, aterrizaba en la portada, la leía entera
    // y publicaba «cobertura 100% · nada que señalar» sobre una página que no
    // era la pedida. Verde por haber medido otra cosa, que es el modo de fallo
    // nº2 de docs/DATA_INTEGRITY.md con otro disfraz.
    //
    // No se cachea y cuenta como SIN REVISAR: decir «no está montada» es un
    // resultado, decir «limpia» es mentira.
    const aterrizaje = new URL(page.url()).pathname
    // Contra la ruta BASE: una clave con estado —`/ [capas]`— aterriza en `/`,
    // y compararla entera marcaría como NO MONTADA toda entrada con estado.
    if (aterrizaje !== rutaBase(route)) {
      noMontadas.push({ route, aterrizaje })
      if (!asJson) {
        console.log(`\n── ${route}`)
        console.log(
          `   NO ESTÁ MONTADA en esta build: la navegación acabó en ${aterrizaje}. ` +
            'No se ha revisado (¿falta una bandera de lanzamiento en el build?).',
        )
      }
      continue
    }

    // Los apartados en pestaña se abren ANTES de leer, y no es un atajo.
    //
    // `innerText` no ve lo que está oculto. Desde que /eficiencia reparte sus
    // seis apartados en pestañas, un `innerText` a secas leía 3.160 caracteres
    // de los 16.000 que la página publica: cinco sextos de la prosa —la
    // cobertura, la declaración, los hallazgos firmados, las preguntas— se
    // quedaban sin revisar Y el parte decía «cobertura 100 %», porque el 100 %
    // era sobre lo que había leído. Verde por no mirar, que es exactamente el
    // defecto que esta puerta existe para no cometer.
    //
    // Publicado no es «visible ahora mismo»: los seis paneles están en el DOM,
    // cualquiera los abre con un clic y los seis se imprimen en papel. Se
    // revisan los seis.
    // El estado, si la clave lo pide, ANTES de leer.
    //
    // Aquí sí hace falta pulsar: las capas opcionales no están ocultas, no
    // existen —`{layers.x && <Capa/>}`—, así que ningún `hidden = false` las
    // alcanza. Se pulsa por `data-capa`, que es la clave de la capa y no
    // cambia con el idioma, a diferencia de la etiqueta.
    const estado = estadoDe(route)
    if (estado === 'capas') {
      const encendidas = await page.evaluate(() => {
        const chips = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-capa]'))
        const tocadas: string[] = []
        for (const c of chips) {
          if (c.getAttribute('aria-pressed') === 'false') {
            c.click()
            tocadas.push(c.getAttribute('data-capa') ?? '?')
          }
        }
        return tocadas
      })
      // Las capas piden sus propios datos al encenderse (los perímetros de
      // incendios son un fichero aparte), así que hay que darles tiempo o se
      // lee la leyenda a medio poblar.
      await page.waitForTimeout(2500)
      if (!asJson && encendidas.length > 0) {
        if (!cabeceraPuesta) {
          console.log(`\n── ${route}`)
          cabeceraPuesta = true
        }
        console.log(`   capas encendidas para leer su prosa: ${encendidas.join(', ')}`)
      }
    }

    const abiertos = await page.evaluate(() => {
      const ocultos = Array.from(
        document.querySelectorAll<HTMLElement>('[role="tabpanel"][hidden]'),
      )
      for (const p of ocultos) p.hidden = false
      return ocultos.length
    })
    if (abiertos > 0) console.log(`   (${abiertos} apartado(s) en pestaña abiertos para leerlos)`)

    // The WHOLE page. No `.slice()` here, ever — see `chunkRenderedText`.
    const renderedText = await page.locator('body').innerText()

    const h = hashOf(renderedText)
    // Los hechos se calculan ANTES del acierto de caché, no después: son parte
    // de lo que se le pone delante al modelo, así que son parte de la pregunta.
    // Con el texto igual y estas cifras movidas, reutilizar el veredicto sería
    // servir el juicio de ayer sobre los números de hoy.
    const facts = factsFor(route)
    const fh = huellaDeHechos(facts)
    const prev = readCacheEntry(cache[route])
    if (!force && sirveElVeredictoCacheado(prev, h, READER_REVIEW_PROMPT_VERSION, fh)) {
      skipped += 1
      // Se REESCRIBE la entrada: mismo hash, mismos señalamientos, `at` a ahora.
      // Saltarse la llamada no es lo mismo que no haber comprobado nada — se ha
      // renderizado la página y se ha visto que es idéntica, y eso es
      // exactamente lo que `check:surfaces` quiere saber. Sin esta línea, el
      // barrido leía 30 de 30 rutas al 100 % y el digest seguía diciendo «9
      // rutas sin leer desde hace más de 3 días» el mismo día.
      //
      // Los `findings` se copian tal cual: actualizar la fecha NO puede perder
      // un hallazgo vivo, que sería cambiar un aviso falso por uno silenciado.
      cache[route] = {
        hash: prev!.hash,
        findings: prev!.findings,
        at: new Date().toISOString(),
        promptVersion: READER_REVIEW_PROMPT_VERSION,
        factsHash: fh,
      }
      persistirCache()
      // Se guardan CRUDOS y se filtran al imprimir: quitar un descarte del
      // registro tiene que devolver el señalamiento sin volver a llamar al
      // modelo. Un veredicto humano se revoca leyendo un fichero, no gastando
      // tres minutos de backend.
      const vivos = sinDescartar(route, prev.findings, descartes)
      const callados = prev.findings.length - vivos.length
      silenciados += callados
      remembered += vivos.length
      if (!asJson) {
        if (vivos.length === 0) {
          console.log(
            `\n── ${route} · sin cambios desde la última revisión, se omite` +
              (callados > 0 ? ` (${callados} descartado(s) por revisión humana)` : ''),
          )
        } else {
          // A skip must never look cleaner than the review it is standing in for.
          header(route)
          console.log(
            `   sin cambios desde la última revisión (no se vuelve a llamar al modelo), ` +
              `pero ${vivos.length} señalamiento(s) SIGUEN EN PIE:` +
              (callados > 0 ? ` (+${callados} descartado(s))` : ''),
          )
          for (const f of vivos) printFinding(f)
        }
      }
      continue
    }

    const chunks = chunkRenderedText(renderedText)
    const findings: ReaderFinding[] = []
    const dropped: ReaderFinding[] = []
    let charsReviewed = 0
    let chunksReviewed = 0
    let deCache = 0
    /** Fragmentos que el reloj no pudo pagar. Se cuentan; nunca se pliegan. */
    let sinPresupuesto = 0
    let reason: string | undefined = chunks.length ? undefined : 'empty-page'

    for (const [index, chunk] of chunks.entries()) {
      // CONTENT-ADDRESSED, y calculada UNA vez: la usan la sonda de aquí abajo y
      // la llamada de más abajo, y si se derivaran por separado acabarían
      // preguntando por entradas distintas — la sonda diría «está en caché» de
      // algo que no lo está, el fragmento se saltaría el presupuesto y la
      // llamada se haría igual.
      const claveDeCache = { route, fragment: hashOf(chunk), facts: fh }
      /**
       * Un fragmento que ya está en `.llm-cache` cuesta abrir un fichero.
       *
       * `noTimeToStart()` tasa TODOS los fragmentos a `slowestCallMs`, que es la
       * llamada más lenta medida, y para lo que la guarda existe —no arrancar
       * algo que el reloj va a matar— está bien. Pero cobrarle ese precio a una
       * respuesta que ya está en disco no es prudencia: es dejar la página sin
       * leer teniendo el veredicto guardado.
       *
       * Lo que costaba, medido el 4-09-2026: `/hallazgos` son 69 fragmentos, y
       * una edición normal —un contador que sube, un hallazgo nuevo, una palabra
       * del pie— cambia UNO. Los otros 68 estaban en caché y el gancho de
       * pre-push no leía ninguno: con 180 s de presupuesto y 80 s por llamada se
       * plantaba en el tercero y la ruta salía SIN REVISAR. La página no era
       * cara; el presupuesto la tasaba mal.
       */
      const gratis = llmCacheHas({
        schema: ReaderReviewSchema,
        promptVersion: READER_REVIEW_PROMPT_VERSION,
        input: claveDeCache,
      })
      // `continue`, no `break`, y el cambio es deliberado: desde que la sonda
      // existe los fragmentos que quedan ya no son todos iguales, y pararse en
      // el primero que no cabe tiraría la cobertura que YA está pagada más
      // abajo en la página. Lo que el reloj rechaza se cuenta, deja la ruta
      // PARCIAL, no se cachea y se reintenta a la siguiente — igual que antes.
      // Un presupuesto puede costar cobertura; no puede esconder lo que cuesta,
      // ni tirar la que no cuesta nada.
      if (!cabeElFragmento({ gratis, ahora: Date.now(), slowestCallMs, deadline })) {
        reason ??= 'budget'
        sinPresupuesto += 1
        continue
      }
      const input: SurfaceInput = { route, renderedText: chunk, facts }
      const calledAt = Date.now()
      // `callLLM` no dice si contestó la caché; lo dice su contador. Se mira
      // antes y después porque es lo único que distingue «lo he leído» de «ya
      // lo tenía leído», y esa distinción es justo la que hay que imprimir.
      const aciertosAntes = getRunStats().cacheHits
      const r = await reviewSurfaceDetailed(
        input,
        async (i) => {
          // El techo de ESTA llamada es lo que queda de presupuesto.
          //
          // Va DENTRO del callback y no fuera porque el reintento pasa por aquí
          // otra vez: puesto fuera, los dos intentos heredarían el mismo plazo y
          // entre los dos se saldrían del presupuesto.
          //
          // `cliTimeoutMs()` lee esta variable en cada spawn (src/llm/client.ts),
          // así que basta con dejarla puesta. El suelo evita pedirle al modelo
          // que conteste en un parpadeo cuando ya no queda casi nada: por debajo
          // de eso la llamada no iba a servir de todos modos y el fragmento se
          // reporta sin revisar, que es el desenlace honesto.
          if (budgetSeconds) {
            const queda = deadline - Date.now()
            process.env.LLM_CLI_TIMEOUT_MS = String(Math.max(TECHO_MINIMO_MS, queda))
          }
          const res = await callLLM({
            systemPrompt: buildReaderReviewSystemPrompt(),
            userPrompt: buildReaderReviewUserPrompt({
              ...i,
              part: { index: index + 1, total: chunks.length },
            }),
            schema: ReaderReviewSchema,
            promptVersion: READER_REVIEW_PROMPT_VERSION,
            // CONTENT-ADDRESSED, and it has to be: `cacheKey` in src/llm/client.ts
            // hashes this `input` and NOT the prompt text, so keying on the route
            // alone would serve fragment 1's answer for every other fragment of
            // the same page — an entire page "reviewed" by one cached call.
            // …y las CIFRAS, que es la mitad que faltaba. `cacheKey` hashea
            // este `input`, así que sin la huella de hechos un cambio de dato
            // seguía sirviendo la respuesta calculada contra el dato viejo:
            // arreglar sólo la caché de RUTA hacía que el bucle se reejecutara
            // y los 7 fragmentos salieran igualmente de caché — medido, «0
            // leído(s) ahora, 7 de caché» con un total adjudicado movido.
            input: claveDeCache,
            // Bajo presupuesto, UN intento por llamada.
            //
            // El techo de arriba acota una llamada; sin esto no acota la
            // pasada, porque `callLLM` reintenta 2 veces por su cuenta y mete
            // espera entre intentos. Medido con un backend que se cuelga
            // (`sleep 600`) y un techo de 5 s: con los reintentos por defecto la
            // llamada se comía DIEZ MINUTOS; con `maxRetries: 0`, cinco
            // segundos y «timed out after 5s (no output; killed)».
            //
            // Reintentar una llamada colgada es justo el cambio malo cuando hay
            // reloj: cuesta otro hueco entero para volver a colgarse. La capa de
            // arriba ya guarda su propio reintento, y sólo lo pide cuando cabe.
            ...(budgetSeconds ? { maxRetries: 0 } : {}),
          })
          // `callLLM` returns null once every backend is exhausted. Coercing that
          // to `[]` here — which this line did — made an unreviewable run print
          // «nada que señalar» for all six routes. Nobody looked is not a clean
          // page, and this check runs on pre-push, where that reads as approval.
          return res ? res.findings : null
        },
        // Un reintento, y sólo si cabe. `noTimeToStart` estima con la llamada MÁS
        // LENTA vista, no con la media, justo para no empezar lo que no termina;
        // un segundo intento consume otro hueco de ésos, así que se pide sólo
        // cuando queda sitio para él.
        { retries: noTimeToStart() ? 0 : 1 },
      )
      // The slowest, not the average: the budget is a promise about the worst
      // case, and averaging a fast cached fragment with a slow live one is how
      // an estimate ends up cheerfully starting the call that blows it.
      slowestCallMs = Math.max(slowestCallMs, Date.now() - calledAt)
      if (r.attempts > 1) reintentos += r.attempts - 1
      if (!r.consulted) {
        reason ??= r.reason
        continue
      }
      chunksReviewed += 1
      if (getRunStats().cacheHits > aciertosAntes) deCache += 1
      charsReviewed += chunk.length
      findings.push(...r.findings)
      dropped.push(...r.dropped)
    }

    const coverage = renderedText.length ? charsReviewed / renderedText.length : 0
    const consulted = chunksReviewed > 0
    const complete = consulted && chunksReviewed === chunks.length
    all.push({
      route,
      findings,
      dropped,
      consulted,
      reason,
      chars: renderedText.length,
      charsReviewed,
      chunks: chunks.length,
      chunksReviewed,
      coverage,
    })
    // Filtrado al IMPRIMIR, no al buscar: el crudo va a la caché (ver arriba).
    const vivosDeRuta = sinDescartar(route, findings, descartes)
    const calladosDeRuta = findings.length - vivosDeRuta.length
    silenciados += calladosDeRuta
    totalDropped += dropped.length
    // Only a route reviewed END TO END may be remembered as reviewed. Caching a
    // partial pass would retire the unread part of the page permanently.
    if (complete) {
      cache[route] = {
        hash: h,
        findings,
        at: new Date().toISOString(),
        promptVersion: READER_REVIEW_PROMPT_VERSION,
        factsHash: fh,
      }
    }
    // Y si NO fue completa, no se toca nada. Antes había un `delete cache[route]`
    // aquí, y bastaba un push para perder la lectura completa de esa madrugada:
    // el gancho tiene 180 s, empieza una ruta larga, se queda a medias y borra
    // la entrada buena. `check:surfaces` pasaba entonces a decir «sin revisar
    // nunca» —lo dijo de /plenos y /laboratorio durante días— en vez de «tiene
    // un señalamiento abierto», que era la verdad.
    //
    // No borrar es seguro: si la página cambió, el `hash` de la entrada vieja ya
    // no casa y `sirveElVeredictoCacheado` la manda a re-revisar igual. Lo único
    // que conseguía el borrado era tirar la fecha y los señalamientos.
    // Y se baja al disco AHORA, ruta a ruta, en vez de sólo al terminar el
    // bucle. El 2026-08-14 el barrido leyó cinco páginas en diecinueve minutos
    // y murió en la sexta: como la única escritura estaba después del bucle, se
    // tiraron las cinco. Diecinueve minutos de llamadas al modelo repetidas a
    // la mañana siguiente, y la caché es lo que `check:surfaces` lee para saber
    // qué se ha leído — así que además el parte del día no se enteró.
    // Un fichero de ~10 KB por ruta es barato al lado de eso.
    persistirCache()
    // Tracked here, not inside the printing branch: `--json` must reach the same
    // exit code as the human output, or CI and a person disagree about the run.
    if (consulted && !complete) partial.push(route)

    if (!consulted) {
      unreviewed.push(route)
      if (!asJson) {
        header(route)
        console.log(
          `   ⓘ SIN REVISAR: ${
            reason === 'empty-page'
              ? 'la página renderizó vacía — ¿está levantado el preview?'
              : reason === 'budget'
                ? `se agotó el presupuesto de ${budgetSeconds}s antes de leer ningún fragmento`
                : 'ningún backend respondió'
          }`,
        )
      }
      continue
    }
    if (!asJson) {
      header(route)
      // Coverage FIRST, on every route, whether or not it is complete. The bug
      // this line exists for was not that the tool reviewed a third of the page;
      // it was that nothing in the output said so.
      console.log(
        `   cobertura: ${num(charsReviewed)} de ${num(renderedText.length)} caracteres ` +
          `(${pct(coverage)}) · ${chunksReviewed}/${chunks.length} fragmento(s)` +
          // Un fragmento servido de `.llm-cache` está CUBIERTO pero no se ha
          // leído ahora, y las dos cosas no son la misma. Callarlo sería el
          // `consulted: true` que sale de una caché: cobertura del 100% sin una
          // sola llamada, que es exactamente la forma de todos los verdes huecos
          // que documenta docs/DATA_INTEGRITY.md. Se cuentan por separado.
          (deCache > 0 ? ` (${chunksReviewed - deCache} leído(s) ahora, ${deCache} de caché)` : ''),
      )
      if (!complete) {
        console.log(
          `   ⚠︎ REVISIÓN PARCIAL: ${chunks.length - chunksReviewed} fragmento(s) SIN REVISAR ` +
            `(${pct(1 - coverage)} de la página). ` +
            `${
              reason === 'budget'
                ? `Se agotó el presupuesto de ${budgetSeconds}s ` +
                  `(${sinPresupuesto} fragmento(s) no cabían; los que ya estaban en caché sí se ` +
                  `han servido).`
                : reason === 'no-answer'
                  ? 'Ningún backend respondió a esos.'
                  : ''
            }`.trim(),
        )
        console.log(
          `      Lo de abajo NO cubre la página entera. No se guarda en caché: se reintenta.`,
        )
      }
      if (vivosDeRuta.length === 0 && dropped.length === 0)
        console.log(
          (complete ? '   nada que señalar.' : '   nada que señalar en lo revisado.') +
            (calladosDeRuta > 0 ? ` (${calladosDeRuta} descartado(s) por revisión humana)` : ''),
        )
      else if (calladosDeRuta > 0)
        console.log(`   ${calladosDeRuta} descartado(s) por revisión humana, no se repiten.`)
      // "nothing to flag" and "I threw three away" must not print the same line.
      // Not necessarily a defect: the filter exists to discard a model that
      // paraphrases the page and then objects to its own paraphrase. But it
      // must be visible, and inspectable, rather than read as a clean page.
      for (const f of dropped)
        console.log(
          `   ✗ descartado (no cita la página literalmente): «${String(f?.quote ?? '—').slice(0, 90)}»`,
        )
      for (const f of vivosDeRuta) printFinding(f)
    }
  }

  await browser.close()
  persistirCache()
  if (asJson) console.log(JSON.stringify(all, null, 2))
  // Findings replayed from an unchanged page COUNT. They are live defects on a
  // live page; the only thing the cache saved was the call, not the problem.
  // Los descartados NO cuentan ni para el total ni para el código de salida —
  // ese es el sentido del registro—, pero SÍ se dicen: un silencio sin recuento
  // es otra vez un control que no cuenta lo que no enseñó.
  const total =
    all.reduce((n, r) => n + sinDescartar(r.route, r.findings, descartes).length, 0) + remembered
  if (!asJson) {
    const chars = all.reduce((n, r) => n + r.chars, 0)
    const read = all.reduce((n, r) => n + r.charsReviewed, 0)
    console.log(
      `\n[review] ${routes.length} de ${publicas.length} ruta(s) públicas · ${spent()}s` +
        (budgetSeconds ? ` de un presupuesto de ${budgetSeconds}s` : ' (sin límite de tiempo)') +
        ` · ${skipped} sin cambios · ` +
        `${all.filter((r) => r.consulted && r.chunksReviewed === r.chunks).length} revisada(s) ` +
        `al completo · ` +
        `${total} señalamiento(s) para revisión humana` +
        (remembered > 0 ? ` (${remembered} heredado(s) de una revisión anterior)` : '') +
        (totalDropped > 0 ? ` · ${totalDropped} descartado(s) por no citar literalmente` : '') +
        // Se dice, aunque no cuente. Un registro de descartes que silencia sin
        // decir cuánto es indistinguible de una página limpia, y entonces nadie
        // revisa nunca si los descartes siguen mereciéndolo.
        (silenciados > 0 ? ` · ${silenciados} descartado(s) por revisión humana` : '') +
        // Se dice. Una pasada que necesitó dos intentos no es lo mismo que una
        // limpia a la primera, y callarlo escondería que el backend flaquea.
        (reintentos > 0 ? ` · ${reintentos} reintento(s) de backend` : '') +
        (partial.length > 0 ? ` · ${partial.length} PARCIAL(ES)` : '') +
        (unreviewed.length > 0 ? ` · ${unreviewed.length} SIN REVISAR` : '') +
        (ranOut.length > 0 ? ` · ${ranOut.length} NO ALCANZADA(S) POR TIEMPO` : '') +
        (noMontadas.length > 0 ? ` · ${noMontadas.length} NO MONTADA(S) EN ESTA BUILD` : '') +
        (inalcanzables.length > 0
          ? ` · ${inalcanzables.length} NO ALCANZADA(S): EL SERVIDOR NO RESPONDÍA`
          : ''),
    )
    // The total is stated even when everything went fine. «revisada» without a
    // figure is what let 66% of /metodologia go unread for three runs.
    if (all.length > 0) {
      console.log(
        `           texto leído por el modelo: ${num(read)} de ${num(chars)} caracteres ` +
          `(${pct(chars ? read / chars : 0)})`,
      )
    }
    // Named, not just counted. «6 rutas · 0 señalamientos» with every route
    // unreviewed is the shape of an all-clear nobody measured.
    if (partial.length > 0) {
      console.log(`           revisadas SÓLO EN PARTE: ${partial.join(', ')}`)
    }
    if (unreviewed.length > 0) {
      console.log(`           sin revisar: ${unreviewed.join(', ')}`)
    }
    if (noMontadas.length > 0) {
      console.log(
        '           NO MONTADAS (no se han revisado, y una build sin su bandera es ' +
          'la causa más probable): ' +
          noMontadas.map((n) => `${n.route} → ${n.aterrizaje}`).join(', '),
      )
    }
    // The sentence the whole budget mechanism has to be able to say out loud.
    // A bounded check that does not name what it left out is the truncation bug
    // again, wearing a clock instead of a `.slice(0, 12000)`.
    if (ranOut.length > 0) {
      console.log(
        `           el presupuesto de ${budgetSeconds}s se agotó y NO se llegó a: ` +
          `${ranOut.join(', ')} — ejecuta \`npm run review:surfaces\` para leerlas enteras.`,
      )
    }
    // Nombradas, como todo lo demás que no se leyó. La avería del 2026-08-14 no
    // fue que el servidor se muriera —eso pasa—, fue que nadie pudo saber qué
    // había quedado sin leer.
    if (inalcanzables.length > 0) {
      console.log(
        `           NO ALCANZADAS (el servidor de ${BASE} no respondía): ` +
          inalcanzables.map((i) => i.route).join(', '),
      )
      console.log(
        `           el primer fallo fue: ${inalcanzables[0].motivo} — ` +
          'sus entradas de caché se dejan como estaban: no se han revisado, ' +
          'pero lo que se supiera de ellas sigue siendo cierto.',
      )
    }
  }
  // Descartes que hoy no corresponden a ningún señalamiento vivo. Siguen
  // ARMADOS por si esa frase vuelve un día por otro motivo. Se nombran, no se
  // borran solos — quitar un veredicto humano lo decide un humano.
  //
  // Y ya no se dice «sobran», que era un veredicto y no se seguía de lo que
  // esto sabe: un descarte sin señalamiento vivo puede ser que la frase
  // desapareciera, o que siga publicada y el modelo no la haya vuelto a
  // señalar. Medido el 2026-08-29 sobre los tres que llevaban semanas
  // anunciándose como sobrantes: los tres seguían publicados palabra por
  // palabra. Borrarlos habría tirado tres juicios humanos y devuelto los tres
  // avisos en el siguiente barrido. La nota de abajo ya contaba que la
  // primera versión de esto llamó «sobrante» a un descarte que estaba
  // trabajando; la palabra volvió a hacer lo mismo por otra vía.
  if (!asJson) {
    // SÓLO sobre las rutas que esta pasada ha examinado, y leyendo los
    // señalamientos de la CACHÉ, no de `all`. Dos motivos, los dos medidos
    // aquí mismo: una ruta servida de caché hace `continue` y nunca entra en
    // `all`, y una ruta que este comando ni siquiera visitó no tiene
    // señalamientos vivos por definición. Sin ninguna de las dos cosas, el
    // primer intento llamó «sobrante» al descarte que acababa de silenciar un
    // aviso, y a los dos de rutas que no se habían mirado.
    const examinadas = new Set(routes)
    const vivosPorRuta = new Map(routes.map((r) => [r, readCacheEntry(cache[r])?.findings ?? []]))
    const huerfanos = descartesHuerfanos(
      descartes
        ? { ...descartes, items: descartes.items.filter((d) => examinadas.has(d.route)) }
        : null,
      vivosPorRuta,
    )
    if (huerfanos.length > 0) {
      console.log(
        `           ${huerfanos.length} descarte(s) sin señalamiento vivo hoy ` +
          `(siguen armados; comprueba si la frase sigue publicada antes de quitarlos): ` +
          huerfanos
            .map((d) => `${d.route} «${d.quote.slice(0, 40).replace(/\n/g, ' ')}»`)
            .join(', '),
      )
    }
  }

  // `ranOut` is in here deliberately: a run that skipped routes did not review
  // the site, and must not exit 0 as though it had. The pre-push hook ignores
  // this code by construction — nothing here may block a push — but a person or
  // a CI job reading it gets the truth.
  // `noMontadas` entra por el mismo motivo: se pidió una ruta y no se revisó.
  // Que la causa sea una bandera apagada no la convierte en revisada, y salir 0
  // haría que un CI sin las banderas diera por leídas las páginas que no montó
  // — exactamente el verde que este bloque existe para no dar.
  //
  // Era un `if` de cinco términos escritos a mano, y el defecto del 2026-08-14
  // fue una sexta categoría que no estaba en él. Ahora la lista vive exportada
  // en `reader-review.ts` y un test la recorre, así que una categoría nueva sin
  // cablear se pone roja sola en vez de esperar a que un barrido se muera.
  if (
    pasadaHabla({
      senalamientos: total,
      sinRevisar: unreviewed.length,
      parciales: partial.length,
      sinTiempo: ranOut.length,
      noMontadas: noMontadas.length,
      inalcanzables: inalcanzables.length,
    })
  )
    process.exitCode = 1
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e))
  process.exit(1)
})
