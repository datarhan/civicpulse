/**
 * NLI grounding second pass (P1) — the local, $0, no-quota replacement for
 * verify:pleno-claims:llm.
 *
 *   npm run verify:pleno-claims:nli                      # all sin-datos
 *   npm run verify:pleno-claims:nli -- --plenoId 1tgd1h4
 *   npm run verify:pleno-claims:nli -- --max 200 --model minicheck
 *
 * Runs ONLY on sin-datos claims (skips opinativa + already-nliAttempted), so a
 * re-run resumes. Loads the embedding corpus ONCE (audit B1 fix), builds each
 * claim's shortlist, then scores every (snippet, claim) pair through the local
 * NLI sidecar in chunked batches. Upgrade-only: never downgrades a deterministic
 * verdict and never emits contradicho. Requires the NLI venv —
 * `bash scripts/bootstrap-nli.sh` — and fails loud if it is missing.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PlenoClaim } from '../src/scraper/pleno-claim'
import {
  getShortlist,
  type CandidateShortlist,
  type ClaimVerification,
  type ClaimVerdict,
  type VerifierInputs,
} from '../src/scraper/claim-verifier'
import { shouldSkipLlmVerification } from '../src/scraper/claim-verifier-llm'
import { verifyClaimWithNli, type NliScorer } from '../src/scraper/claim-verifier-nli'
import { scoreNliPairs, NliUnavailableError, type NliPair } from '../src/scraper/nli-client'
import { loadVerifierContext, type VerifierContext } from '../src/scraper/verifier-runner'

const VERIFIED = resolve('public/data/pleno-claims-verified.json')
const CHUNK_CLAIMS = 400 // claims per NLI spawn (model reloads per chunk; checkpoint boundary)

interface VerifiedSnapshot {
  generatedAt: string
  source?: unknown
  stats: { total: number; byVerdict: Record<ClaimVerdict, number> }
  items: { claim: PlenoClaim; verification: ClaimVerification }[]
}

interface Args {
  plenoId: string | null
  max: number
  model: string | undefined
}

function parseArgs(argv: string[]): Args {
  const out: Args = { plenoId: null, max: Infinity, model: undefined }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--plenoId') out.plenoId = argv[++i]
    else if (argv[i] === '--max') out.max = Number(argv[++i])
    else if (argv[i] === '--model') out.model = argv[++i]
    else {
      process.stderr.write(`[verify-nli] unknown flag ${argv[i]}\n`)
      process.exit(2)
    }
  }
  return out
}

function inputsFor(claim: PlenoClaim, ctx: VerifierContext): VerifierInputs {
  return {
    claim,
    tenders: ctx.tenders,
    tendersTed: ctx.tendersTed,
    bdns: ctx.bdns,
    budget: ctx.budget,
    promises: ctx.promises,
    priorClaims: ctx.priorClaims,
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!existsSync(VERIFIED)) {
    process.stderr.write(`[verify-nli] ${VERIFIED} missing — run verify:pleno-claims first\n`)
    process.exit(1)
  }

  const snap = JSON.parse(readFileSync(VERIFIED, 'utf8')) as VerifiedSnapshot
  const ctx = await loadVerifierContext({ withCorpus: true })
  const corpusOpt = ctx.corpus ? { corpus: ctx.corpus } : {}

  const indexById = new Map<string, number>()
  snap.items.forEach((it, i) => indexById.set(it.claim.id, i))

  const candidates = snap.items.filter((it) => {
    if (it.verification.verdict !== 'sin-datos') return false
    if (shouldSkipLlmVerification(it.claim)) return false
    if (it.verification.nliAttempted) return false
    if (opts.plenoId && it.claim.plenoId !== opts.plenoId) return false
    return true
  })
  const queue = candidates.slice(0, Math.min(candidates.length, opts.max))
  process.stdout.write(
    `[verify-nli] ${queue.length} sin-datos claims eligible (corpus=${ctx.corpus ? 'preloaded' : 'lexical-only'}, model=${opts.model ?? 'mDeBERTa-xnli'})\n`,
  )

  const stats = { upgraded: 0, kept: 0, contradictionFlags: 0 }
  const flaggedIds: string[] = []

  function flush() {
    const byVerdict: Record<ClaimVerdict, number> = {
      verificado: 0,
      parcial: 0,
      contradicho: 0,
      'sin-datos': 0,
      'promesa-repetida': 0,
    }
    for (const it of snap.items) byVerdict[it.verification.verdict] += 1
    snap.stats = { total: snap.items.length, byVerdict }
    snap.generatedAt = new Date().toISOString()
    writeFileSync(VERIFIED, JSON.stringify(snap, null, 2) + '\n')
  }

  let interrupted = false
  const onSignal = (sig: string) => {
    if (interrupted) return
    interrupted = true
    process.stderr.write(`\n[verify-nli] ${sig} — flushing partial snapshot…\n`)
    try {
      flush()
    } catch (err) {
      process.stderr.write(`[verify-nli] flush FAILED: ${(err as Error).message}\n`)
    }
    process.exit(130)
  }
  process.on('SIGINT', () => onSignal('SIGINT'))
  process.on('SIGTERM', () => onSignal('SIGTERM'))

  try {
    for (let start = 0; start < queue.length; start += CHUNK_CLAIMS) {
      const chunk = queue.slice(start, start + CHUNK_CLAIMS)

      // 1. Build shortlists (corpus is preloaded — no per-call disk reparse).
      const shortlists = new Map<string, CandidateShortlist[]>()
      for (const it of chunk) {
        shortlists.set(it.claim.id, await getShortlist(inputsFor(it.claim, ctx), 8, corpusOpt))
      }

      // 2. ONE NLI spawn for every (snippet, claim) pair in this chunk.
      const pairs: NliPair[] = []
      for (const it of chunk) {
        const sl = shortlists.get(it.claim.id)!
        sl.forEach((c, i) =>
          pairs.push({
            id: `${it.claim.id}#${i}`,
            premise: c.snippet,
            hypothesis: it.claim.verbatim,
          }),
        )
      }
      const globalScores = await scoreNliPairs(pairs, opts.model ? { model: opts.model } : {})

      // 3. Assign verdicts per claim from the precomputed scores (no extra spawn).
      for (const it of chunk) {
        const sl = shortlists.get(it.claim.id)!
        const lookup: NliScorer = async (ps) =>
          new Map(
            ps
              .map((p) => globalScores.get(`${it.claim.id}#${p.id}`))
              .filter((s): s is NonNullable<typeof s> => Boolean(s))
              .map((s) => [s.id, s]),
          )
        const r = await verifyClaimWithNli({ claim: it.claim, candidates: sl }, lookup)
        const idx = indexById.get(it.claim.id)
        if (idx == null || !r) {
          it.verification.nliAttempted = true
          stats.kept += 1
          continue
        }
        if (r.nliContradictionFlag) {
          stats.contradictionFlags += 1
          flaggedIds.push(it.claim.id)
        }
        if (r.upgraded) {
          snap.items[idx] = {
            claim: it.claim,
            verification: {
              ...r.verification,
              nliAttempted: true,
              checkedAgainst: [
                'nli-grounding',
                ...it.verification.checkedAgainst.filter((x) => x !== 'nli-grounding'),
              ],
            },
          }
          stats.upgraded += 1
        } else {
          it.verification = {
            ...it.verification,
            nliAttempted: true,
            confidence: r.verification.confidence,
          }
          stats.kept += 1
        }
      }

      flush()
      process.stdout.write(
        `[verify-nli]   ${Math.min(start + CHUNK_CLAIMS, queue.length)}/${queue.length} · upgraded=${stats.upgraded} kept=${stats.kept} contra-flags=${stats.contradictionFlags}\n`,
      )
    }
  } catch (err) {
    if (err instanceof NliUnavailableError) {
      process.stderr.write(`[verify-nli] ${err.message}\n`)
      process.exit(1)
    }
    throw err
  }

  flush()
  if (flaggedIds.length > 0) {
    process.stderr.write(
      `[verify-nli] ${flaggedIds.length} claims flagged with an NLI contradiction (curator review, NOT auto-published): ${flaggedIds.slice(0, 20).join(', ')}${flaggedIds.length > 20 ? ' …' : ''}\n`,
    )
  }
  process.stdout.write(
    `[verify-nli] done. upgraded=${stats.upgraded} kept=${stats.kept} contra-flags=${stats.contradictionFlags} · ` +
      Object.entries(snap.stats.byVerdict)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}:${n}`)
        .join(' · ') +
      `\n`,
  )

  try {
    const { rewriteChunksFromMonolith } = await import('./chunk-pleno-claims')
    const r = rewriteChunksFromMonolith()
    process.stdout.write(
      `[verify-nli]   chunks: ${r.written} written · ${r.removed} stale pruned · manifest=${r.manifestBytes}B\n`,
    )
  } catch (err) {
    process.stderr.write(
      `[verify-nli]   chunk refresh FAILED: ${err instanceof Error ? err.message : String(err)}\n`,
    )
  }
}

main().catch((err) => {
  process.stderr.write(`[verify-nli] FATAL: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
