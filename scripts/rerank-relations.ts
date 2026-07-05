/**
 * Curator-only LLM rerank of Tier-B queja↔contract candidates.
 *
 *   LLM_BACKEND=claude-code npm run rerank-relations
 *
 * For each queja, joins its gated Tier-B links to the contract rows, lexically
 * shortlists, and asks the LLM to pick the single most plausible relation.
 * Writes public/data/queja-contract-rerank.json — EVERY row is
 * `requiresHumanApproval: true` and is NEVER rendered publicly; it only helps a
 * curator decide what to promote via `npm run promote-relation`. Skipped under a
 * LOREG freeze. Use a $0 backend (claude-code / gemini) — NOT metered OpenAI.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  shortlistCandidates,
  rerankTierB,
  type RerankQueja,
  type RerankCandidate,
  type RerankedLink,
} from '../src/scraper/queja-contract-rerank'
import { normalizeQueja } from './scrape-queja-contract-relations'
import { validatePromisesSnapshot, isFrozen } from '../src/scraper/promises'
import { resetBudget } from '../src/llm/client'

const RELATIONS = resolve('public/data/queja-contract-relations.json')
const TENDERS = resolve('public/data/tenders.json')
const QUEJAS = resolve('public/data/quejas.json')
const PROMISES = resolve('public/data/promises.json')
const OUT = resolve('public/data/queja-contract-rerank.json')

const SHORTLIST_N = Number(process.env.RERANK_SHORTLIST ?? 8)

function s(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

function write(payload: unknown): void {
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n')
}

async function main(): Promise<void> {
  resetBudget()
  const source = 'queja-contract rerank v1 (LLM, curator-only)'

  const frozen = existsSync(PROMISES)
    ? isFrozen(validatePromisesSnapshot(readFileSync(PROMISES, 'utf8')))
    : false
  if (frozen) {
    write({ generatedAt: new Date().toISOString(), source, frozen: true, stats: {}, links: [] })
    process.stdout.write('[rerank] LOREG freeze active — no rerank\n')
    return
  }

  const rel = existsSync(RELATIONS)
    ? (JSON.parse(readFileSync(RELATIONS, 'utf8')) as { links?: Array<Record<string, unknown>> })
    : { links: [] }
  const tierB = (rel.links ?? []).filter((l) => l.requiresHumanApproval)

  const tendersFile = existsSync(TENDERS)
    ? (JSON.parse(readFileSync(TENDERS, 'utf8')) as { contracts?: Array<Record<string, unknown>> })
    : { contracts: [] }
  const contractsById = new Map((tendersFile.contracts ?? []).map((c) => [s(c.id), c] as const))

  const quejasRaw = existsSync(QUEJAS)
    ? ((JSON.parse(readFileSync(QUEJAS, 'utf8')) as { items?: Record<string, unknown>[] }).items ??
      [])
    : []
  const quejaById = new Map(quejasRaw.map((q) => [s(q.service_request_id), q] as const))

  const byQueja = new Map<string, Array<Record<string, unknown>>>()
  for (const l of tierB) {
    const id = s(l.quejaId)
    const arr = byQueja.get(id) ?? []
    arr.push(l)
    byQueja.set(id, arr)
  }

  const links: RerankedLink[] = []
  const stats = { quejas: byQueja.size, shortlisted: 0, llmCalls: 0, picks: 0 }

  for (const [quejaId, group] of byQueja) {
    const rawQ = quejaById.get(quejaId)
    if (!rawQ) continue
    const rq = normalizeQueja(rawQ)
    if (!rq) continue
    const queja: RerankQueja = {
      id: rq.id,
      serviceCode: rq.serviceCode,
      placeSlug: rq.placeSlug,
      description: rq.description,
      createdAt: rq.createdAt,
    }
    const candidates = group
      .map((l): RerankCandidate | null => {
        const c = contractsById.get(s(l.tenderId))
        const permalink = s(c?.permalink)
        if (!c || !permalink.startsWith('http')) return null
        return {
          permalink,
          tenderId: s(l.tenderId),
          title: s(c.title),
          contractor: s(c.contractor) || undefined,
          assignee: s(c.assignee) || undefined,
          awardDate: c.awardDate ? s(c.awardDate) : undefined,
          amount: typeof c.finalAmount === 'number' ? c.finalAmount : undefined,
          categoryTitle: s(c.categoryTitle) || undefined,
        }
      })
      .filter((c): c is RerankCandidate => c !== null)

    const shortlist = shortlistCandidates(queja, candidates, SHORTLIST_N)
    if (shortlist.length === 0) continue
    stats.shortlisted += shortlist.length
    stats.llmCalls += 1
    const pick = await rerankTierB(queja, shortlist)
    if (pick) {
      links.push(pick)
      stats.picks += 1
    }
  }

  write({
    generatedAt: new Date().toISOString(),
    source,
    requiresHumanApproval: true,
    stats,
    links,
  })
  process.stdout.write(
    `[rerank] quejas=${stats.quejas} llmCalls=${stats.llmCalls} picks=${stats.picks} ` +
      `(curator-only · gated)\n`,
  )
}

main().catch((err) => {
  process.stderr.write(`[rerank] FATAL: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
