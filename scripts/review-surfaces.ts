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
 * NEVER edits. Output is a lead for a human, exactly like every other
 * LLM-touching path in this repo.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { reviewSurface, type SurfaceInput, type ReaderFinding } from '../src/scraper/reader-review'
import { callLLM } from '../src/llm/client'
import {
  buildReaderReviewSystemPrompt,
  buildReaderReviewUserPrompt,
  READER_REVIEW_PROMPT_VERSION,
} from '../src/llm/prompts'
import { ReaderReviewSchema } from '../src/llm/schemas'

const BASE = process.env.REVIEW_BASE_URL || 'http://127.0.0.1:4173'
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
      'hallazgos: escritos por una máquina (auto-curation-v1 / civicpulse-auto)': (
        findings?.items ?? []
      ).filter((f: { curatorName?: string }) => (f.curatorName ?? '').startsWith('auto')).length,
    }
  return common
}

const DEFAULT_ROUTES = ['/', '/presupuesto', '/plenos', '/hallazgos', '/promesas', '/quejas']

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const routes = args.length ? args : DEFAULT_ROUTES
  const asJson = process.argv.includes('--json')

  const browser = await chromium.launch()
  const page = await browser.newPage()
  const all: Array<{ route: string; findings: ReaderFinding[] }> = []

  for (const route of routes) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
    // Give the snapshot store a beat to resolve before reading the text.
    await page.waitForTimeout(1200)
    const renderedText = (await page.locator('body').innerText()).slice(0, 12_000)

    const input: SurfaceInput = { route, renderedText, facts: factsFor(route) }
    const findings = await reviewSurface(input, async (i) => {
      const r = await callLLM({
        systemPrompt: buildReaderReviewSystemPrompt(),
        userPrompt: buildReaderReviewUserPrompt(i),
        schema: ReaderReviewSchema,
        promptVersion: READER_REVIEW_PROMPT_VERSION,
        input: { route: i.route },
      })
      return r?.findings ?? []
    })
    all.push({ route, findings })
    if (!asJson) {
      console.log(`\n── ${route} ${'─'.repeat(Math.max(0, 50 - route.length))}`)
      if (findings.length === 0) console.log('   nada que señalar.')
      for (const f of findings) {
        console.log(`   ${f.severity === 'misleading' ? '⚠︎' : '·'} «${f.quote.slice(0, 110)}»`)
        console.log(`      un lector concluiría: ${f.inference}`)
        console.log(`      pero los datos dicen: ${f.contradictedBy}`)
      }
    }
  }

  await browser.close()
  if (asJson) console.log(JSON.stringify(all, null, 2))
  const total = all.reduce((n, r) => n + r.findings.length, 0)
  if (!asJson)
    console.log(
      `\n[review] ${routes.length} ruta(s) · ${total} señalamiento(s) para revisión humana`,
    )
  if (total > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e))
  process.exit(1)
})
