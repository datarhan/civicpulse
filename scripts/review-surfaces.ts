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
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { construirGrafoRutas, rutasPublicas } from './lib/route-graph'
import {
  reviewSurfaceDetailed,
  chunkRenderedText,
  parseReviewArgs,
  readCacheEntry,
  type SurfaceInput,
  type ReaderFinding,
  type ReviewCacheEntry,
} from '../src/scraper/reader-review'
import { authorshipBreakdown } from '../src/scraper/finding-authorship'
import { callLLM } from '../src/llm/client'
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
const hashOf = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)
const DATA = resolve('public/data')
const read = (f: string) =>
  existsSync(`${DATA}/${f}`) ? JSON.parse(readFileSync(`${DATA}/${f}`, 'utf8')) : null

/**
 * The facts each route is judged against. Deliberately small and hand-picked:
 * dumping whole snapshots would bury the model and invite it to pattern-match
 * rather than check. These are the figures a reader is being asked to trust.
 */
function factsFor(route: string): Record<string, unknown> {
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
    'contratos: nº de FILAS del snapshot (incluye anulados, revocados, desistidos)':
      tenders?.contracts?.length,
    'contratos: rango de fechas de adjudicación': '2017 → 2026 (acumulado, NO anual)',
    'presupuesto: gasto total (UN año)': budget?.snapshot?.totalExpense,
    'presupuesto: ejercicio': budget?.snapshot?.year,
  }
  if (route.startsWith('/plenos'))
    return {
      ...common,
      'plenos: sesiones registradas': plenos?.stats?.total,
      'plenos: sesiones con votaciones transcritas': new Set(
        (votes?.items ?? []).map((v: { plenoId: string }) => v.plenoId),
      ).size,
      'plenos: el resto NO tiene votaciones transcritas (no significa que no votaran)': true,
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
    all: todas,
  } = parseReviewArgs(process.argv.slice(2), process.env.REVIEW_BUDGET_SECONDS)
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
  const publicas = rutasPublicas(construirGrafoRutas(resolve('src')))
  const base = named.length ? named : todas ? publicas : DEFAULT_ROUTES
  const routes = !budgetSeconds ? base : rotar || !named.length ? porAntiguedad(base) : base
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
   * "Is there time to START another fragment?" — not "has the clock run out?".
   *
   * A call cannot be interrupted once it is in flight, so a plain deadline check
   * makes the budget a floor rather than a ceiling: measured, `--budget-seconds
   * 15` returned in 65s, because at t=1s the clock had not run out and the call
   * that started then took the other 64. Refusing to start a fragment that
   * probably cannot finish is what turns the number into a promise.
   *
   * THE FIRST CALL ALWAYS RUNS: `slowestCallMs` is 0 until something has been
   * measured, and a budget too small for even one fragment must still review one
   * fragment. Reviewing nothing and saying so is honest but useless; the real
   * bound is therefore `budget + the first call`, and the summary prints the
   * time actually spent so nobody has to take this comment's word for it.
   */
  const noTimeToStart = () => Date.now() + slowestCallMs >= deadline
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
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
    // Give the snapshot store a beat to resolve before reading the text.
    await page.waitForTimeout(1200)

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
    if (aterrizaje !== route) {
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

    // The WHOLE page. No `.slice()` here, ever — see `chunkRenderedText`.
    const renderedText = await page.locator('body').innerText()

    const h = hashOf(renderedText)
    const prev = readCacheEntry(cache[route])
    if (!force && prev && prev.hash === h) {
      skipped += 1
      remembered += prev.findings.length
      if (!asJson) {
        if (prev.findings.length === 0) {
          console.log(`\n── ${route} · sin cambios desde la última revisión, se omite`)
        } else {
          // A skip must never look cleaner than the review it is standing in for.
          header(route)
          console.log(
            `   sin cambios desde la última revisión (no se vuelve a llamar al modelo), ` +
              `pero ${prev.findings.length} señalamiento(s) SIGUEN EN PIE:`,
          )
          for (const f of prev.findings) printFinding(f)
        }
      }
      continue
    }

    const facts = factsFor(route)
    const chunks = chunkRenderedText(renderedText)
    const findings: ReaderFinding[] = []
    const dropped: ReaderFinding[] = []
    let charsReviewed = 0
    let chunksReviewed = 0
    let reason: string | undefined = chunks.length ? undefined : 'empty-page'

    for (const [index, chunk] of chunks.entries()) {
      // `break`, not `continue`: once the clock is gone it stays gone, and the
      // fragments left behind make this route PARCIAL — reported, uncached, and
      // retried next run. A budget may cost coverage; it may not hide the cost.
      if (noTimeToStart()) {
        reason ??= 'budget'
        break
      }
      const input: SurfaceInput = { route, renderedText: chunk, facts }
      const calledAt = Date.now()
      const r = await reviewSurfaceDetailed(
        input,
        async (i) => {
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
            input: { route: i.route, fragment: hashOf(chunk) },
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
    totalDropped += dropped.length
    // Only a route reviewed END TO END may be remembered as reviewed. Caching a
    // partial pass would retire the unread part of the page permanently.
    if (complete) cache[route] = { hash: h, findings, at: new Date().toISOString() }
    else delete cache[route]
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
          `(${pct(coverage)}) · ${chunksReviewed}/${chunks.length} fragmento(s)`,
      )
      if (!complete) {
        console.log(
          `   ⚠︎ REVISIÓN PARCIAL: ${chunks.length - chunksReviewed} fragmento(s) SIN REVISAR ` +
            `(${pct(1 - coverage)} de la página). ` +
            `${
              reason === 'budget'
                ? `Se agotó el presupuesto de ${budgetSeconds}s.`
                : reason === 'no-answer'
                  ? 'Ningún backend respondió a esos.'
                  : ''
            }`.trim(),
        )
        console.log(
          `      Lo de abajo NO cubre la página entera. No se guarda en caché: se reintenta.`,
        )
      }
      if (findings.length === 0 && dropped.length === 0)
        console.log(complete ? '   nada que señalar.' : '   nada que señalar en lo revisado.')
      // "nothing to flag" and "I threw three away" must not print the same line.
      // Not necessarily a defect: the filter exists to discard a model that
      // paraphrases the page and then objects to its own paraphrase. But it
      // must be visible, and inspectable, rather than read as a clean page.
      for (const f of dropped)
        console.log(
          `   ✗ descartado (no cita la página literalmente): «${String(f?.quote ?? '—').slice(0, 90)}»`,
        )
      for (const f of findings) printFinding(f)
    }
  }

  await browser.close()
  writeFileSync(CACHE, JSON.stringify(cache, null, 2) + '\n')
  if (asJson) console.log(JSON.stringify(all, null, 2))
  // Findings replayed from an unchanged page COUNT. They are live defects on a
  // live page; the only thing the cache saved was the call, not the problem.
  const total = all.reduce((n, r) => n + r.findings.length, 0) + remembered
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
        // Se dice. Una pasada que necesitó dos intentos no es lo mismo que una
        // limpia a la primera, y callarlo escondería que el backend flaquea.
        (reintentos > 0 ? ` · ${reintentos} reintento(s) de backend` : '') +
        (partial.length > 0 ? ` · ${partial.length} PARCIAL(ES)` : '') +
        (unreviewed.length > 0 ? ` · ${unreviewed.length} SIN REVISAR` : '') +
        (ranOut.length > 0 ? ` · ${ranOut.length} NO ALCANZADA(S) POR TIEMPO` : '') +
        (noMontadas.length > 0 ? ` · ${noMontadas.length} NO MONTADA(S) EN ESTA BUILD` : ''),
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
  }
  // `ranOut` is in here deliberately: a run that skipped routes did not review
  // the site, and must not exit 0 as though it had. The pre-push hook ignores
  // this code by construction — nothing here may block a push — but a person or
  // a CI job reading it gets the truth.
  // `noMontadas` entra por el mismo motivo: se pidió una ruta y no se revisó.
  // Que la causa sea una bandera apagada no la convierte en revisada, y salir 0
  // haría que un CI sin las banderas diera por leídas las páginas que no montó
  // — exactamente el verde que este bloque existe para no dar.
  if (
    total > 0 ||
    unreviewed.length > 0 ||
    partial.length > 0 ||
    ranOut.length > 0 ||
    noMontadas.length > 0
  )
    process.exitCode = 1
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e))
  process.exit(1)
})
