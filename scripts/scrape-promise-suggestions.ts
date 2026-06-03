#!/usr/bin/env tsx
/**
 * Run the promise inference engine against the curated promises.json +
 * the latest press + plenos snapshots, and write the results to
 *   public/data/promise-suggestions.json
 *
 * This script NEVER mutates public/data/promises.json. Curators apply
 * suggestions by editing promises.json via a normal PR.
 *
 * Freeze mode: when promises.json's frozenUntil is in the future, the
 * script writes an empty suggestion set and leaves a banner note. The
 * UI honours this.
 *
 * Usage: npm run scrape:promise-suggestions
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inferPromiseSuggestions } from '../src/scraper/promise-inference'
import { validatePromisesSnapshot, isFrozen } from '../src/scraper/promises'
import { minePromiseEvidence } from '../src/scraper/promise-llm-inference'
import { resetBudget } from '../src/llm/client'
import type { RetrievalInput } from '../src/llm/retriever'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/promise-suggestions.json')

async function readJson(path: string): Promise<any> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

async function main() {
  const promisesPath = join(PROJECT_ROOT, 'public/data/promises.json')
  const promisesText = await readFile(promisesPath, 'utf8')
  const snap = validatePromisesSnapshot(promisesText)
  const frozen = isFrozen(snap)

  const press = await readJson(join(PROJECT_ROOT, 'public/data/press.json'))
  const plenos = await readJson(join(PROJECT_ROOT, 'public/data/plenos.json'))
  const agendas = await readJson(join(PROJECT_ROOT, 'public/data/plenos-agendas.json'))

  // Denormalise agenda items into synthetic pleno records so the inference
  // engine matches against the full ORDEN DEL DÍA text, not just the session
  // titles ("Pleno ordinario 9 de marzo"). Each agenda item becomes one
  // virtual pleno with { title = expediente + dept + item title, link back
  // to the session convocatoria, date from the session }.
  const enrichedPlenosItems: Array<{ id: string; title: string; date: string; link: string }> = []
  if (plenos?.items) enrichedPlenosItems.push(...plenos.items)
  if (agendas?.plenos) {
    for (const sess of agendas.plenos) {
      for (const it of sess.agenda || []) {
        enrichedPlenosItems.push({
          id: `${sess.id}-${it.number}`,
          title: `${it.department ? it.department + ' · ' : ''}${it.title}`,
          date: sess.date,
          link: sess.link,
        })
      }
    }
  }
  const enrichedPlenos = { items: enrichedPlenosItems }

  const regexSuggestions = frozen
    ? []
    : inferPromiseSuggestions(snap.items, { press, plenos: enrichedPlenos })

  // LLM evidence mining pass — optional, enabled when `--llm` flag is passed.
  // Falls back to regex-only when the LLM backend is offline or the flag is
  // absent (keeps the nightly cron working even if Ollama isn't running on
  // the CI runner).
  const enableLlm = process.argv.includes('--llm') && !frozen
  const llmEvidence: Array<{
    promiseId: string
    evidenceUrl: string
    publisher: string
    date: string
    quote: string
    reasoning: string
    confidence: number
    corpus: string
  }> = []
  const llmStats = { processed: 0, emitted: 0, frozen: 0, hallucinated: 0, invalidStatus: 0 }

  if (enableLlm) {
    resetBudget()
    const tenders = await readJson(join(PROJECT_ROOT, 'public/data/tenders.json'))
    const bdns = await readJson(join(PROJECT_ROOT, 'public/data/bdns.json'))
    const budget = await readJson(join(PROJECT_ROOT, 'public/data/budget.json'))
    const plenoVideos = await readJson(join(PROJECT_ROOT, 'public/data/pleno-videos.json'))

    // Load every cached Whisper transcript as a corpus entry. One document
    // per pleno session, with the full text. The LLM is explicitly forbidden
    // (see prompts.ts PROMISE_EVIDENCE_PROMPT_VERSION v2) from naming any
    // speaker — Whisper WER on proper nouns is ~10% and attributed citations
    // are a defamation risk.
    const transcriptDir = join(PROJECT_ROOT, 'public/data/pleno-transcripts')
    const { readdirSync, readFileSync: readFileSyncImpl, existsSync } = await import('node:fs')
    const transcripts: Array<{
      url: string
      title: string
      date: string
      publisher: string
      text: string
    }> = []
    if (existsSync(transcriptDir) && plenoVideos?.items) {
      const videosByPlenoDate = new Map<string, { url: string; title: string; plenoDate: string }>()
      for (const v of plenoVideos.items) videosByPlenoDate.set(v.plenoDate, v)
      const plenosById = new Map<string, { id: string; date: string; title: string }>()
      for (const p of plenos?.items ?? []) plenosById.set(p.id, p)
      for (const f of readdirSync(transcriptDir)) {
        if (!f.endsWith('.txt')) continue
        const id = f.replace(/\.txt$/, '')
        const pleno = plenosById.get(id)
        if (!pleno) continue
        const video = videosByPlenoDate.get(pleno.date)
        const text = readFileSyncImpl(join(transcriptDir, f), 'utf8')
        if (text.length < 500) continue // empty or tiny → skip
        transcripts.push({
          url:
            video?.url ??
            (pleno as { link?: string }).link ??
            `https://civicpulse-virid.vercel.app/plenos`,
          title: pleno.title,
          date: pleno.date,
          publisher: 'Ayuntamiento Riba-roja de Túria · transcripción automática',
          text: text.slice(0, 120_000), // cap per-document size so the retriever BM25 scoring isn't dominated by one huge transcript
        })
      }
    }

    for (const promise of snap.items) {
      llmStats.processed += 1
      const input: RetrievalInput = {
        promise: {
          id: promise.id,
          title: promise.title,
          quote: promise.quote,
          topic: promise.topic,
        },
        corpora: [
          press?.items
            ? {
                corpus: 'press' as const,
                documents: press.items.map(
                  (i: { link: string; title: string; date: string; source: string }) => ({
                    url: i.link,
                    title: i.title,
                    date: i.date,
                    publisher: i.source,
                    text: i.title,
                  }),
                ),
              }
            : null,
          agendas?.plenos
            ? {
                corpus: 'pleno_agenda' as const,
                documents: agendas.plenos.flatMap(
                  (s: {
                    id: string
                    date: string
                    link: string
                    agenda?: { title: string; department?: string; expediente?: string }[]
                  }) =>
                    (s.agenda || []).map((a) => ({
                      url: s.link,
                      title: `${a.department ?? ''} · ${a.title}`,
                      date: s.date,
                      publisher: 'Ayuntamiento Riba-roja',
                      text: `${a.department ?? ''} ${a.title} ${a.expediente ?? ''}`,
                    })),
                ),
              }
            : null,
          tenders?.contracts
            ? {
                corpus: 'tender' as const,
                documents: tenders.contracts
                  .slice(0, 500)
                  .map(
                    (c: {
                      permalink: string
                      title: string
                      awardDate: string | null
                      assignee: string
                      categoryTitle: string
                    }) => ({
                      url: c.permalink,
                      title: c.title,
                      date: c.awardDate || '2020-01-01',
                      publisher: c.assignee,
                      text: `${c.title} ${c.categoryTitle}`,
                    }),
                  ),
              }
            : null,
          bdns?.items
            ? {
                corpus: 'bdns' as const,
                documents: bdns.items.map(
                  (b: { sourceUrl: string; description: string; date: string; organ: string }) => ({
                    url: b.sourceUrl,
                    title: b.description,
                    date: b.date,
                    publisher: b.organ,
                    text: b.description,
                  }),
                ),
              }
            : null,
          budget?.snapshot
            ? {
                corpus: 'budget' as const,
                documents: [
                  {
                    url: budget.source?.url ?? 'https://hacienda.gob.es/conprel',
                    title: `Presupuesto municipal ${budget.snapshot.year}`,
                    date: `${budget.snapshot.year}-01-01`,
                    publisher: 'MinHac CONPREL',
                    text: `Presupuesto ${budget.snapshot.year} · ${budget.snapshot.totalExpense}€ gasto total`,
                  },
                ],
              }
            : null,
          transcripts.length > 0
            ? { corpus: 'pleno_transcript' as const, documents: transcripts }
            : null,
        ].filter((x): x is NonNullable<typeof x> => x !== null),
      }
      const result = await minePromiseEvidence(input, {
        snapshot: { frozenUntil: snap.frozenUntil },
      })
      if (result.stats.frozen) {
        llmStats.frozen += 1
        continue
      }
      llmStats.emitted += result.items.length
      llmStats.hallucinated += result.stats.itemsRejected.hallucinatedUrl
      llmStats.invalidStatus += result.stats.itemsRejected.invalidStatus
      for (const ev of result.items) llmEvidence.push({ ...ev })
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    frozen,
    frozenUntil: snap.frozenUntil,
    notice: frozen
      ? 'Estado congelado durante el periodo electoral oficial (LOREG art. 50). El motor de sugerencias no actualiza estados hasta la proclamación definitiva.'
      : 'Sugerencias generadas automáticamente. Requieren aprobación humana antes de aplicarse al estado de cada promesa.',
    counts: {
      total: regexSuggestions.length,
      byProposedStatus: regexSuggestions.reduce<Record<string, number>>((a, s) => {
        a[s.proposedStatus] = (a[s.proposedStatus] || 0) + 1
        return a
      }, {}),
      llmEvidence: llmEvidence.length,
    },
    suggestions: regexSuggestions,
    llmEvidence,
    llmStats: enableLlm ? llmStats : null,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(
    `[promise-suggestions] wrote ${OUT}${frozen ? ' (frozen)' : ''} — ${regexSuggestions.length} propuestas`,
  )
}

main().catch((err) => {
  console.error('[promise-suggestions] failed:', err)
  process.exit(1)
})
