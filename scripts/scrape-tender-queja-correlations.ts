/**
 * Run the tender↔queja correlator against the current JSON snapshots and
 * write suggestions to public/data/tender-queja-correlations.json.
 *
 *   npm run scrape:tender-queja-correlations
 *
 * Emits a payload shaped for the UI hook useTenderQuejaCorrelations. If
 * quejas.json is empty (no citizen complaints captured yet), writes an
 * empty snapshot honestly — no synthetic correlations.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  correlateQuejasToTenders,
  type PlenoAgendaItem,
  type QuejaForCorrelation,
  type TenderCandidate,
} from '../src/scraper/tender-queja-correlator'
import { resetBudget } from '../src/llm/client'
import { validatePromisesSnapshot } from '../src/scraper/promises'

const OUT_PATH = resolve('public/data/tender-queja-correlations.json')
const PROMISES = resolve('public/data/promises.json')
const QUEJAS = resolve('public/data/quejas.json')
const TENDERS = resolve('public/data/tenders.json')
const AGENDAS = resolve('public/data/plenos-agendas.json')

interface QuejaItem {
  id: string
  category: string
  neighborhood?: string
  description?: string
  createdAt?: string
}

async function main() {
  if (!existsSync(QUEJAS)) {
    process.stderr.write('[correlator] quejas.json not found — nothing to correlate\n')
    writeEmpty('quejas_missing')
    return
  }

  const quejasFile = JSON.parse(readFileSync(QUEJAS, 'utf8')) as { items?: QuejaItem[] }
  const rawQuejas = quejasFile.items ?? []
  if (rawQuejas.length === 0) {
    process.stdout.write('[correlator] quejas.json is empty — writing empty correlations\n')
    writeEmpty('quejas_empty')
    return
  }

  const tendersFile = existsSync(TENDERS)
    ? JSON.parse(readFileSync(TENDERS, 'utf8')) as { contracts?: Array<Record<string, unknown>> }
    : { contracts: [] }
  const agendasFile = existsSync(AGENDAS)
    ? JSON.parse(readFileSync(AGENDAS, 'utf8')) as { plenos?: Array<Record<string, unknown>> }
    : { plenos: [] }
  const snap = existsSync(PROMISES) ? validatePromisesSnapshot(readFileSync(PROMISES, 'utf8')) : { frozenUntil: null }

  const quejas: QuejaForCorrelation[] = rawQuejas
    .filter((q) => q.category && q.createdAt)
    .map((q) => ({
      id: q.id,
      category: q.category as QuejaForCorrelation['category'],
      neighborhood: q.neighborhood ?? null,
      description: q.description ?? '',
      createdAt: q.createdAt as string,
    }))

  const tenders: TenderCandidate[] = (tendersFile.contracts ?? []).map((c) => ({
    permalink: String(c.permalink ?? ''),
    title: String(c.title ?? ''),
    contractor: c.contractor ? String(c.contractor) : undefined,
    assignee: c.assignee ? String(c.assignee) : undefined,
    awardDate: c.awardDate ? String(c.awardDate) : null,
    amount: typeof c.finalAmount === 'number' ? c.finalAmount : (typeof c.initialAmount === 'number' ? c.initialAmount : null),
    categoryTitle: c.categoryTitle ? String(c.categoryTitle) : undefined,
    cpvs: Array.isArray(c.cpvs) ? (c.cpvs as unknown[]).map(String) : [],
    id: c.id ? String(c.id) : undefined,
    expediente: c.expediente ? String(c.expediente) : undefined,
  }))

  const agendaItems: PlenoAgendaItem[] = (agendasFile.plenos ?? []).flatMap((sess) => {
    const items = ((sess.agenda ?? []) as Array<{ title?: string; department?: string; expediente?: string | null }>)
    return items.map((it) => ({
      sessionId: String(sess.id ?? ''),
      sessionLink: String(sess.link ?? ''),
      sessionDate: String(sess.date ?? ''),
      department: it.department,
      title: String(it.title ?? ''),
      expediente: it.expediente ?? null,
    }))
  })

  resetBudget()
  const result = await correlateQuejasToTenders(quejas, tenders, agendaItems, {
    snapshot: { frozenUntil: snap.frozenUntil ?? null },
  })

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      description:
        'Correlaciones generadas automáticamente entre quejas ciudadanas y contratos municipales. ' +
        'Dos vías: (a) coincidencia de expediente entre agenda de pleno y adjudicación, (b) ' +
        'reranking LLM sobre una shortlist filtrada por CPV + ventana temporal. ' +
        'Todas las correlaciones requieren verificación humana antes de ser tomadas como causales.',
      contract: 'Machine-written; never claims causation. Human review required.',
    },
    stats: result.stats,
    items: result.items,
  }
  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8')
  process.stdout.write(
    `[correlator] wrote ${result.items.length} correlation(s) · ` +
      `expediente=${result.stats.expedienteMatches} llm=${result.stats.llmMatches} · → ${OUT_PATH}\n`,
  )
}

function writeEmpty(reason: string) {
  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      description:
        'Correlaciones generadas automáticamente entre quejas ciudadanas y contratos municipales.',
      contract: 'Machine-written; never claims causation. Human review required.',
    },
    stats: {
      frozen: false, quejasScanned: 0, expedienteMatches: 0, fuzzyShortlistsConsidered: 0,
      llmCalls: 0, llmMatches: 0, llmRejectedHallucinated: 0, llmRejectedLowConfidence: 0,
      reason,
    },
    items: [],
  }
  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8')
}

main().catch((err) => {
  process.stderr.write(`[correlator] FATAL: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
