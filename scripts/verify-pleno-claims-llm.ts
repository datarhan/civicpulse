/**
 * ⚠️ LEGACY / SUPERSEDED (P2). The production second pass is now the local,
 * $0, no-quota NLI runner — `npm run verify:pleno-claims:nli` — which writes
 * upgrades to the base/overlay split. This metered-LLM runner predates the split
 * and still writes pleno-claims-verified.json DIRECTLY, so its writes are NOT
 * overlay-protected and would be overwritten by the next `verify:pleno-claims`
 * rebuild. Kept for reference / A-B comparison only; do not use in the pipeline.
 *
 * LLM second-pass verifier — runs only on sin-datos claims and tries to
 * upgrade them by cross-referencing the open-data trail with the LLM's
 * semantic reasoning. Reads pleno-claims-verified.json (deterministic
 * pass), iterates each sin-datos claim, builds a top-K candidate
 * shortlist, calls gemini (default — Pro subscription, $0) or any other
 * LLM_BACKEND, and overwrites the verdict + evidence ONLY when the LLM
 * upgrades.
 *
 *   npm run verify:pleno-claims:llm
 *   npm run verify:pleno-claims:llm -- --plenoId 1tgd1h4
 *   npm run verify:pleno-claims:llm -- --max 50           # cap to 50 sin-datos
 *   npm run verify:pleno-claims:llm -- --concurrency 4
 *
 * Defaults to LLM_BACKEND=gemini if no backend is set, since this is the
 * cheap+free path. The runner script honors the same fallback chain as
 * any other LLM call (openai → anthropic → gemini → ollama).
 *
 * Libel safety (enforced by claim-verifier-llm):
 *   · LLM cites by candidateIndex only — refs come from our shortlist
 *   · contradicho needs ≥1 isContradiction:true citation
 *   · acusacion_publica with accusationSubtype=opinativa is skipped
 *   · LLM cannot DOWNGRADE a deterministic verdict — only upgrades land
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PlenoClaim } from '../src/scraper/pleno-claim'
import {
  getShortlist,
  type ClaimVerification,
  type ClaimVerdict,
  type VerifierInputs,
} from '../src/scraper/claim-verifier'
import { verifyClaimWithLlm, shouldSkipLlmVerification } from '../src/scraper/claim-verifier-llm'
import { resetBudget, loadConfigFromEnv } from '../src/llm/client'

const VERIFIED = resolve('public/data/pleno-claims-verified.json')
const DATA = resolve('public/data')

interface VerifiedSnapshot {
  generatedAt: string
  source?: { description?: string; contract?: string }
  stats: { total: number; byVerdict: Record<ClaimVerdict, number> }
  items: Array<{ claim: PlenoClaim; verification: ClaimVerification }>
}

function loadIfExists(name: string): unknown {
  const p = resolve(DATA, name)
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf8'))
}

interface CliArgs {
  plenoId: string | null
  max: number
  concurrency: number
  minConfidence: number
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { plenoId: null, max: Infinity, concurrency: 3, minConfidence: 0.6 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--plenoId') out.plenoId = argv[++i]
    else if (a === '--max') out.max = Number(argv[++i])
    else if (a === '--concurrency') out.concurrency = Number(argv[++i])
    else if (a === '--min-confidence') out.minConfidence = Number(argv[++i])
    else {
      process.stderr.write(`[verify-llm] unknown flag ${a}\n`)
      process.exit(2)
    }
  }
  if (!Number.isFinite(out.max) && out.max !== Infinity) out.max = Infinity
  if (out.concurrency < 1 || out.concurrency > 10) {
    process.stderr.write('[verify-llm] --concurrency must be 1..10\n')
    process.exit(2)
  }
  return out
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))

  if (!existsSync(VERIFIED)) {
    process.stderr.write(`[verify-llm] ${VERIFIED} missing — run verify:pleno-claims first\n`)
    process.exit(1)
  }

  // Default to agy when LLM_BACKEND is unset — this is the $0 path. It used to
  // name the gemini CLI, which agy replaced; that binary can no longer
  // authenticate non-interactively and burns the 180 s watchdog per call.
  if (!process.env.LLM_BACKEND) process.env.LLM_BACKEND = 'agy'
  resetBudget()
  const config = loadConfigFromEnv()
  process.stdout.write(
    `[verify-llm] backend=${config.backend} · concurrency=${opts.concurrency} · min-confidence=${opts.minConfidence}\n`,
  )

  const snap = JSON.parse(readFileSync(VERIFIED, 'utf8')) as VerifiedSnapshot
  const tenders = loadIfExists('tenders.json')
  const bdns = loadIfExists('bdns.json')
  const budget = loadIfExists('budget.json')
  const promises = loadIfExists('promises.json')

  // Filter to sin-datos rows we can sensibly upgrade.
  const candidates = snap.items.filter((it) => {
    if (it.verification.verdict !== 'sin-datos') return false
    if (shouldSkipLlmVerification(it.claim)) return false
    // Resume: skip claims a prior run already fully evaluated (kept). A
    // re-run thus only does new/failed work — no wasted LLM calls.
    if (it.verification.llmAttempted) return false
    if (opts.plenoId && it.claim.plenoId !== opts.plenoId) return false
    return true
  })
  process.stdout.write(
    `[verify-llm] ${candidates.length} sin-datos claims eligible for LLM second pass\n`,
  )

  const queue = candidates.slice(0, Math.min(candidates.length, opts.max))
  const stats = {
    upgraded: 0,
    kept: 0,
    rejected: 0,
    attempted: 0,
    rejectedOutOfRange: 0,
    rejectedMissingCite: 0,
    rejectedCiteNotInSnippet: 0,
  }
  // Map for fast in-place update at the end.
  const indexById = new Map<string, number>()
  snap.items.forEach((it, i) => indexById.set(it.claim.id, i))

  let lastReport = -1
  async function processOne(it: { claim: PlenoClaim; verification: ClaimVerification }) {
    const inputs: VerifierInputs = { claim: it.claim, tenders, bdns, budget, promises }
    const shortlist = await getShortlist(inputs, 8)
    if (shortlist.length === 0) {
      it.verification.llmAttempted = true // fully evaluated: nothing to cite
      stats.kept += 1
      return
    }
    const r = await verifyClaimWithLlm({ claim: it.claim, candidates: shortlist })
    stats.attempted += 1
    if (!r) {
      // transient LLM failure — leave unmarked so a re-run retries it
      stats.kept += 1
      return
    }
    if (r.upgraded) {
      // Replace the verification in the snapshot.
      const idx = indexById.get(it.claim.id)
      if (idx == null) return
      snap.items[idx] = {
        claim: it.claim,
        verification: {
          ...r.verification,
          // Tag the dataset list so audit shows this came from the LLM pass.
          checkedAgainst: [
            'llm-second-pass',
            ...r.verification.checkedAgainst.filter((x) => x !== 'llm-second-pass'),
          ],
        },
      }
      stats.upgraded += 1
    } else {
      it.verification.llmAttempted = true // attempted, kept sin-datos
      stats.kept += 1
    }
    if (r.rejectedIndexes.length > 0) stats.rejected += r.rejectedIndexes.length
    stats.rejectedOutOfRange += r.rejectedReasons.outOfRange
    stats.rejectedMissingCite += r.rejectedReasons.missingCite
    stats.rejectedCiteNotInSnippet += r.rejectedReasons.citeNotInSnippet
  }

  function flushSnapshot() {
    const byVerdict: Record<ClaimVerdict, number> = {
      verificado: 0,
      parcial: 0,
      contradicho: 0,
      'sin-datos': 0,
      'promesa-repetida': 0,
    }
    for (const it of snap.items) {
      byVerdict[it.verification.verdict] = (byVerdict[it.verification.verdict] ?? 0) + 1
    }
    snap.stats = { total: snap.items.length, byVerdict }
    snap.generatedAt = new Date().toISOString()
    writeFileSync(VERIFIED, JSON.stringify(snap, null, 2) + '\n')
  }
  // Graceful interrupt — flush partial snapshot on SIGINT/SIGTERM so a
  // long run doesn't lose progress when the user cancels.
  let interrupted = false
  const onSignal = (sig: string) => {
    if (interrupted) return
    interrupted = true
    process.stderr.write(`\n[verify-llm] ${sig} — flushing partial snapshot…\n`)
    try {
      flushSnapshot()
    } catch (err) {
      // The flush IS the checkpoint — if it failed, the operator must know
      // the on-disk snapshot is stale before deciding whether to re-run.
      process.stderr.write(`[verify-llm] flush FAILED: ${(err as Error).message}\n`)
    }
    process.exit(130)
  }
  process.on('SIGINT', () => onSignal('SIGINT'))
  process.on('SIGTERM', () => onSignal('SIGTERM'))

  // Bounded-concurrency batches with mid-run checkpoint every 100 claims.
  const CHECKPOINT_EVERY = 100
  let sinceCheckpoint = 0
  for (let i = 0; i < queue.length; i += opts.concurrency) {
    const batch = queue.slice(i, i + opts.concurrency)
    await Promise.all(batch.map(processOne))
    const done = Math.min(i + opts.concurrency, queue.length)
    sinceCheckpoint += batch.length
    const pct = Math.floor((done / queue.length) * 20) // 5% buckets
    if (pct > lastReport) {
      lastReport = pct
      process.stdout.write(
        `[verify-llm]   ${done}/${queue.length} (${pct * 5}%) · upgraded=${stats.upgraded} kept=${stats.kept} rejected_refs=${stats.rejected}\n`,
      )
    }
    if (sinceCheckpoint >= CHECKPOINT_EVERY) {
      flushSnapshot()
      sinceCheckpoint = 0
    }
  }

  // Final flush + summary.
  flushSnapshot()
  process.stdout.write(
    `[verify-llm] done. ` +
      `upgraded=${stats.upgraded} of ${stats.attempted} attempted (${queue.length} eligible). ` +
      `Rejected refs: ${stats.rejected} ` +
      `(out-of-range=${stats.rejectedOutOfRange} · ` +
      `missing-cite=${stats.rejectedMissingCite} · ` +
      `cite-not-in-snippet=${stats.rejectedCiteNotInSnippet}). ` +
      `New verdict mix: ` +
      Object.entries(snap.stats.byVerdict)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}:${n}`)
        .join(' · ') +
      `\n[verify-llm] wrote → ${VERIFIED}\n`,
  )
}

main().catch((err) => {
  process.stderr.write(`[verify-llm] FATAL: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
