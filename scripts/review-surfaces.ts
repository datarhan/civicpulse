#!/usr/bin/env tsx
/**
 * Read the site as a visitor would, and ask whether the page says something the
 * data does not support.
 *
 *   npm run review:surfaces -- /            # one route
 *   npm run review:surfaces                 # the default set
 *   npm run review:surfaces -- --json
 *
 * Requires the preview server (`npm run preview`) and a $0 LLM backend:
 *   LLM_BACKEND=claude-code npm run review:surfaces
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
import {
  reviewSurfaceDetailed,
  chunkRenderedText,
  type SurfaceInput,
  type ReaderFinding,
} from '../src/scraper/reader-review'
import { authorshipBreakdown } from '../src/scraper/finding-authorship'
import { callLLM } from '../src/llm/client'
import {
  buildReaderReviewSystemPrompt,
  buildReaderReviewUserPrompt,
  READER_REVIEW_PROMPT_VERSION,
} from '../src/llm/prompts'
import { ReaderReviewSchema } from '../src/llm/schemas'

// `localhost`, not `127.0.0.1`: vite preview binds IPv6 by default, so the
// literal v4 address refuses the connection and every route fails to render —
// which this script would report as "nothing to review" rather than as a fault.
const BASE = process.env.REVIEW_BASE_URL || 'http://localhost:4173'

/**
 * route → hash of the rendered text last reviewed.
 *
 * The anti-decay mechanism, and the reason this can be automated at all. A model
 * asked repeatedly about UNCHANGED prose will eventually produce a plausible
 * wrong flag, and from that point the check gets ignored — which is how a check
 * dies. So a route whose rendered output is byte-identical to last time is
 * skipped outright: no call, no chance of a new opinion about old text.
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
const loadCache = (): Record<string, string> =>
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
    'contratos: nº de contratos': tenders?.stats?.awardedContracts,
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
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const routes = args.length ? args : DEFAULT_ROUTES
  const asJson = process.argv.includes('--json')

  const force = process.argv.includes('--force')
  const cache = force ? {} : loadCache()
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
  const unreviewed: string[] = []
  /** Routes where SOME fragments were reviewed and some were not. */
  const partial: string[] = []
  const pct = (n: number) => `${Math.round(n * 100)}%`
  const num = (n: number) => n.toLocaleString('es-ES')

  for (const route of routes) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
    // Give the snapshot store a beat to resolve before reading the text.
    await page.waitForTimeout(1200)
    // The WHOLE page. No `.slice()` here, ever — see `chunkRenderedText`.
    const renderedText = await page.locator('body').innerText()

    const h = hashOf(renderedText)
    if (cache[route] === h) {
      skipped += 1
      if (!asJson) console.log(`\n── ${route} · sin cambios desde la última revisión, se omite`)
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
      const input: SurfaceInput = { route, renderedText: chunk, facts }
      const r = await reviewSurfaceDetailed(input, async (i) => {
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
      })
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
    if (complete) cache[route] = h
    else delete cache[route]
    // Tracked here, not inside the printing branch: `--json` must reach the same
    // exit code as the human output, or CI and a person disagree about the run.
    if (consulted && !complete) partial.push(route)

    if (!consulted) {
      unreviewed.push(route)
      if (!asJson) {
        console.log(`\n── ${route} ${'─'.repeat(Math.max(0, 50 - route.length))}`)
        console.log(
          `   ⓘ SIN REVISAR: ${
            reason === 'empty-page'
              ? 'la página renderizó vacía — ¿está levantado el preview?'
              : 'ningún backend respondió'
          }`,
        )
      }
      continue
    }
    if (!asJson) {
      console.log(`\n── ${route} ${'─'.repeat(Math.max(0, 50 - route.length))}`)
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
            `${reason === 'no-answer' ? 'Ningún backend respondió a esos.' : ''}`.trim(),
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
      for (const f of findings) {
        console.log(`   ${f.severity === 'misleading' ? '⚠︎' : '·'} «${f.quote.slice(0, 110)}»`)
        console.log(`      un lector concluiría: ${f.inference}`)
        console.log(`      pero los datos dicen: ${f.contradictedBy}`)
      }
    }
  }

  await browser.close()
  writeFileSync(CACHE, JSON.stringify(cache, null, 2) + '\n')
  if (asJson) console.log(JSON.stringify(all, null, 2))
  const total = all.reduce((n, r) => n + r.findings.length, 0)
  if (!asJson) {
    const chars = all.reduce((n, r) => n + r.chars, 0)
    const read = all.reduce((n, r) => n + r.charsReviewed, 0)
    console.log(
      `\n[review] ${routes.length} ruta(s) · ${skipped} sin cambios · ` +
        `${all.filter((r) => r.consulted && r.chunksReviewed === r.chunks).length} revisada(s) ` +
        `al completo · ` +
        `${total} señalamiento(s) para revisión humana` +
        (totalDropped > 0 ? ` · ${totalDropped} descartado(s) por no citar literalmente` : '') +
        (partial.length > 0 ? ` · ${partial.length} PARCIAL(ES)` : '') +
        (unreviewed.length > 0 ? ` · ${unreviewed.length} SIN REVISAR` : ''),
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
  }
  if (total > 0 || unreviewed.length > 0 || partial.length > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e))
  process.exit(1)
})
