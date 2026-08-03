#!/usr/bin/env tsx
/**
 * Does the published editorial contract still describe the system we run?
 *
 *   LLM_BACKEND=claude-code npm run check:contract-drift
 *   npm run check:contract-drift -- --since 60      # look further back
 *   npm run check:contract-drift -- /metodologia    # one page
 *   npm run check:contract-drift -- --json
 *
 * Requires the preview server (`npm run preview`) and a $0 backend. Expect it
 * to take MINUTES per page, not seconds — see the timeout note below.
 *
 * ## Why this exists, and why it took a second commit
 *
 * `src/scraper/contract-drift-llm.ts` shipped in 1480e39 with tests, whose
 * message says the semantic layer «queda lista pero sin cablear a ningún cron:
 * se ejecuta a mano cuando cambia un pipeline». There was no way to run it by
 * hand — no CLI, no prompt, no schema. So it sat for a day as a tested module
 * nothing could reach, which reads as coverage on every audit and is not.
 *
 * ## Not in scrape-all, on purpose
 *
 * It needs a model, and CI has none. A guard that runs nightly in an
 * environment where it can never find anything reports health it did not
 * measure — the exact shape `check:guards` exists to catch. This is a manual
 * check, run when a pipeline changes, which is when it has something to say.
 *
 * NEVER edits. `/metodologia` and `/aviso-legal` are published prose about how
 * claims about named people get made; corrections go through the corrections
 * flow, which leaves a record.
 */
import { execFileSync } from 'node:child_process'
import { chromium } from '@playwright/test'
import {
  driftCacheInput,
  findContractDriftDetailed,
  type ContractDriftInput,
  type DriftFlag,
  type DroppedFlag,
} from '../src/scraper/contract-drift-llm'
import { callLLM } from '../src/llm/client'
import {
  buildContractDriftSystemPrompt,
  buildContractDriftUserPrompt,
  CONTRACT_DRIFT_PROMPT_VERSION,
} from '../src/llm/prompts'
import { ContractDriftSchema } from '../src/llm/schemas'

// `localhost`, not `127.0.0.1`: vite preview binds IPv6 by default, so the
// literal v4 address refuses every connection and each page renders empty —
// which this would report as "nothing to review" rather than as a fault.
const BASE = process.env.REVIEW_BASE_URL || 'http://localhost:4173'

/**
 * This workload is SLOW, and the client's 180 s default is below its floor.
 *
 * Measured 2026-08-03 on claude-code: a minimal structured call returns in 11 s,
 * but a real contract-drift prompt — /metodologia is ~24 000 characters of
 * dense prose plus the commit list — took **184 s** even when the page was
 * truncated to 4 000. Every full run before this line hit the 180 s ceiling,
 * three attempts each, then fell through to gemini and timed out there too. The
 * symptom was indistinguishable from "no backend configured".
 *
 * So the default here is 10 minutes. Still overridable, and the pages this
 * reads are the two longest on the site, which is exactly why nobody re-reads
 * them by hand.
 */
if (!process.env.LLM_CLI_TIMEOUT_MS) process.env.LLM_CLI_TIMEOUT_MS = '600000'

/** The two pages CLAUDE.md calls the published editorial contract. */
const CONTRACT_PAGES = ['/metodologia', '/aviso-legal']

/**
 * Paths whose behaviour those pages describe.
 *
 * Deliberately narrow. Feeding every commit would bury the model in UI churn
 * and invite it to pattern-match; these are the directories where a change can
 * make a published sentence false.
 */
const PIPELINE_PATHS = [
  'src/scraper',
  'src/llm',
  'scripts',
  'src/hooks',
  '.github/workflows',
  'bot/src',
]

function recentChanges(days: number): Array<{ sha: string; subject: string; body?: string }> {
  const raw = execFileSync(
    'git',
    [
      'log',
      `--since=${days}.days.ago`,
      '--no-merges',
      '--format=%h%x1f%s%x1f%b%x1e',
      '--',
      ...PIPELINE_PATHS,
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
  return raw
    .split('\x1e')
    .map((rec) => rec.trim())
    .filter(Boolean)
    .map((rec) => {
      const [sha, subject, body] = rec.split('\x1f')
      return { sha, subject, body: (body ?? '').trim() || undefined }
    })
}

async function main() {
  const argv = process.argv.slice(2)
  const asJson = argv.includes('--json')
  const sinceIdx = argv.indexOf('--since')
  const days = sinceIdx >= 0 ? Number(argv[sinceIdx + 1]) : 30
  const routes = argv.filter((a) => a.startsWith('/'))
  const pages = routes.length ? routes : CONTRACT_PAGES

  const changes = recentChanges(days)
  if (changes.length === 0) {
    console.log(`[contract-drift] ningún commit de pipeline en ${days} días — nada que comparar`)
    return
  }

  const browser = await chromium.launch()
  const page = await browser.newPage()
  const all: Array<{
    page: string
    flags: DriftFlag[]
    dropped: DroppedFlag[]
    consulted: boolean
    reason?: string
  }> = []

  for (const route of pages) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    const prose = (await page.locator('main, body').first().innerText()).slice(0, 24_000)

    const input: ContractDriftInput = { page: route, prose, changes }
    const { flags, dropped, consulted, reason } = await findContractDriftDetailed(
      input,
      async (i) => {
        // `callLLM` returns null when every backend is exhausted. Coercing that
        // to `[]` here is what made the first real run print «el contrato sigue
        // al día» for both pages after claude-code AND gemini had failed.
        const r = await callLLM({
          systemPrompt: buildContractDriftSystemPrompt(),
          userPrompt: buildContractDriftUserPrompt(i),
          schema: ContractDriftSchema,
          promptVersion: CONTRACT_DRIFT_PROMPT_VERSION,
          // NOT `{ page: i.page }` — that keyed the cache on the route name, so
          // the second run replayed the first run's verdict forever. See
          // `driftCacheInput`.
          input: driftCacheInput(i),
        })
        return r ? r.flags : null
      },
    )
    all.push({ page: route, flags, dropped, consulted, reason })

    if (asJson) continue
    console.log(`\n── ${route} ${'─'.repeat(Math.max(0, 50 - route.length))}`)
    if (!consulted) {
      const why = {
        'empty-page': 'la página renderizó vacía — ¿está levantado el preview?',
        'no-changes': 'no había commits que comparar',
        'no-answer': 'NINGÚN backend respondió — esta página NO se ha revisado',
      }[reason ?? 'no-answer']
      console.log(`   ⓘ sin revisar: ${why}`)
      process.exitCode = 1
      continue
    }
    if (flags.length === 0 && dropped.length === 0) console.log('   el contrato sigue al día.')
    // "nothing to flag" and "I threw three away" must not print the same line.
    for (const d of dropped) {
      const why = {
        'no-sentence': 'aviso incompleto',
        'too-short': 'frase demasiado corta para ser una afirmación',
        'not-on-page': 'no cita la página literalmente',
        'unknown-sha': 'nombra un commit que no está en la lista',
      }[d.reason]
      console.log(`   ✗ descartado (${why}): «${String(d.flag?.sentence ?? '—').slice(0, 80)}»`)
    }
    for (const f of flags) {
      console.log(`   ⚠︎ «${f.sentence.slice(0, 120)}»`)
      console.log(`      contradicha por ${f.sha}: ${f.why}`)
    }
  }

  await browser.close()
  if (asJson) {
    console.log(JSON.stringify({ since: `${days}d`, changes: changes.length, pages: all }, null, 2))
    return
  }

  const total = all.reduce((n, p) => n + p.flags.length, 0)
  const totalDropped = all.reduce((n, p) => n + p.dropped.length, 0)
  const reviewed = all.filter((p) => p.consulted)
  const unreviewed = all.filter((p) => !p.consulted).map((p) => p.page)
  console.log(
    `\n[contract-drift] ${pages.length} página(s) · ${reviewed.length} revisada(s) · ` +
      `${changes.length} commit(s) de los últimos ${days} días · ` +
      `${total} aviso(s) para revisión humana` +
      (totalDropped > 0 ? ` · ${totalDropped} descartado(s)` : '') +
      (unreviewed.length > 0 ? ` · ${unreviewed.length} SIN REVISAR` : ''),
  )
  // Named, not just counted: «2 páginas · 0 avisos» with both unreviewed is an
  // all-clear nobody measured, which is the failure this check exists to avoid.
  if (unreviewed.length > 0) {
    console.log(`                 sin revisar: ${unreviewed.join(', ')}`)
    process.exitCode = 1
  }
  if (total > 0) {
    console.log(
      '\n  Esto NO pide editar la página: pide decidir si la frase sigue siendo\n' +
        '  cierta. /metodologia y /aviso-legal son el contrato editorial publicado,\n' +
        '  y se corrigen a mano, en el mismo PR que cambió el comportamiento.',
    )
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e))
  process.exit(1)
})
