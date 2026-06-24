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
import { loadOverlay, rebuildVerified, OVERLAY } from './verified-rebuild'
import { applyOverlayEntries, type ApplyEntry } from '../src/scraper/verified-merge'

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

  const candidates = snap.items.filter((it) => {
    if (it.verification.verdict !== 'sin-datos') return false
    if (shouldSkipLlmVerification(it.claim)) return false
    if (opts.plenoId && it.claim.plenoId !== opts.plenoId) return false
    return true
  })
  const queue = candidates.slice(0, Math.min(candidates.length, opts.max))
  process.stdout.write(
    `[verify-nli] ${queue.length} sin-datos claims eligible (corpus=${ctx.corpus ? 'preloaded' : 'lexical-only'}, model=${opts.model ?? 'mDeBERTa-xnli'})\n`,
  )

  const stats = { upgraded: 0, kept: 0, contradictionFlags: 0 }
  const flaggedIds: string[] = []
  // Upgrades go to the OVERLAY (so a deterministic re-run can't clobber them);
  // verified.json is rebuilt as base ⊕ overlay at the end. No nliAttempted marker
  // — NLI is local/$0, so a re-run just re-scans (idempotent into the overlay).
  let overlay = loadOverlay()
  const flushOverlay = () => writeFileSync(OVERLAY, JSON.stringify(overlay, null, 2) + '\n')

  let interrupted = false
  const onSignal = (sig: string) => {
    if (interrupted) return
    interrupted = true
    process.stderr.write(`\n[verify-nli] ${sig} — saving overlay…\n`)
    try {
      flushOverlay()
    } catch (err) {
      process.stderr.write(`[verify-nli] overlay save FAILED: ${(err as Error).message}\n`)
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

      // 3. Assign verdicts; collect upgrades as overlay entries (no snap mutation).
      const chunkEntries: ApplyEntry[] = []
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
        if (!r) {
          stats.kept += 1
          continue
        }
        if (r.nliContradictionFlag) {
          stats.contradictionFlags += 1
          flaggedIds.push(it.claim.id)
        }
        if (r.upgraded) {
          chunkEntries.push({
            claimId: it.claim.id,
            verification: { ...r.verification, checkedAgainst: ['nli-grounding'] },
            source: 'nli',
          })
          stats.upgraded += 1
        } else {
          stats.kept += 1
        }
      }

      if (chunkEntries.length > 0) {
        overlay = applyOverlayEntries(overlay, chunkEntries, new Date().toISOString())
        flushOverlay()
      }
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

  flushOverlay()
  if (flaggedIds.length > 0) {
    process.stderr.write(
      `[verify-nli] ${flaggedIds.length} claims flagged with an NLI contradiction (curator review, NOT auto-published): ${flaggedIds.slice(0, 20).join(', ')}${flaggedIds.length > 20 ? ' …' : ''}\n`,
    )
  }
  const rebuilt = await rebuildVerified()
  process.stdout.write(
    `[verify-nli] done. upgraded=${stats.upgraded} (→ overlay) kept=${stats.kept} contra-flags=${stats.contradictionFlags} · ` +
      Object.entries(rebuilt.byVerdict)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}:${n}`)
        .join(' · ') +
      `\n[verify-nli]   merged base ⊕ overlay → verified.json + chunks\n`,
  )
}

main().catch((err) => {
  process.stderr.write(`[verify-nli] FATAL: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
