/**
 * Verdict-engine re-derivation (P3) — re-judges the LLM second-pass verdicts with
 * the reason-then-format engine (local cite-grounding + NEI-default) and RETRACTS
 * the over-claims it confidently flags `sin-datos`.
 *
 *   set -a; source <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env); set +a
 *   LLM_BACKEND=openai OPENAI_MODEL=gpt-5.4-mini VERIFIER_SHORTLIST=lexical \
 *     npm run verify:pleno-claims:engine -- [--max N] [--plenoId ID] [--dry-run]
 *
 * DOWNGRADE-ONLY, and only to sin-datos: on the 64-row gold the engine's sin-datos
 * precision is ~92% (reliable) while its verificado/parcial precision is weak — so
 * we trust ONLY its sin-datos calls, as retractions of LLM verificado/parcial.
 * Writes `source:'verdict-engine'` overlay entries (replacing the `llm` entry);
 * curator-downgrade entries are untouched (different source). Resumable: claims
 * already re-derived (a verdict-engine overlay entry exists) are skipped.
 * Requires a working metered backend (the engine calls callLLM) — the eval gate
 * lives in docs/superpowers/specs/2026-06-24-factcheck-rebuild-p3-results.md.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PlenoClaim } from '../src/scraper/pleno-claim'
import type { ClaimVerification, ClaimVerdict } from '../src/scraper/claim-verifier'
import { makeEngineVerifier, loadVerifierContext } from '../src/scraper/verifier-runner'
import { loadOverlay, rebuildVerified, OVERLAY } from './verified-rebuild'
import { applyOverlayEntries, type ApplyEntry, type Overlay } from '../src/scraper/verified-merge'

const VERIFIED = resolve('public/data/pleno-claims-verified.json')
const MODEL = process.env.OPENAI_MODEL || process.env.LLM_BACKEND || 'engine'
const CHECKPOINT_EVERY = 25

interface VerifiedSnapshot {
  items: { claim: PlenoClaim; verification: ClaimVerification }[]
}
interface Args {
  plenoId: string | null
  max: number
  dryRun: boolean
}

function parseArgs(argv: string[]): Args {
  const out: Args = { plenoId: null, max: Infinity, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--plenoId') out.plenoId = argv[++i]
    else if (argv[i] === '--max') out.max = Number(argv[++i])
    else if (argv[i] === '--dry-run') out.dryRun = true
    else {
      process.stderr.write(`[verify-engine] unknown flag ${argv[i]}\n`)
      process.exit(2)
    }
  }
  return out
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!existsSync(VERIFIED)) {
    process.stderr.write('[verify-engine] verified.json missing — run verify:pleno-claims first\n')
    process.exit(1)
  }
  const snap = JSON.parse(readFileSync(VERIFIED, 'utf8')) as VerifiedSnapshot
  const claimById = new Map(snap.items.map((it) => [it.claim.id, it.claim]))
  const currentVerdict = new Map<string, ClaimVerdict>(
    snap.items.map((it) => [it.claim.id, it.verification.verdict]),
  )

  let overlay = loadOverlay()
  // Targets: claims the LLM second pass upgraded to verificado/parcial — the
  // over-claim pool. Skip any already re-derived by the engine (resume).
  const targets: string[] = []
  for (const [id, e] of Object.entries(overlay.entries)) {
    if (e.source !== 'llm') continue
    if (e.verification.verdict !== 'verificado' && e.verification.verdict !== 'parcial') continue
    if (args.plenoId && !id.startsWith(args.plenoId)) continue
    targets.push(id)
  }
  process.stderr.write(
    `[verify-engine] ${targets.length} LLM verificado/parcial verdicts to re-judge (model ${MODEL})\n`,
  )

  const ctx = await loadVerifierContext({ withCorpus: false })
  const engine = makeEngineVerifier({ consistency: false })

  const pending: ApplyEntry[] = []
  let done = 0
  let retracted = 0
  let kept = 0
  let skipped = 0

  const flush = () => {
    if (args.dryRun || pending.length === 0) return
    const stamp = new Date().toISOString()
    overlay = applyOverlayEntries(overlay, pending.splice(0), stamp)
    writeOverlay(overlay)
    rebuildVerified({ refreshChunks: true })
  }

  for (const id of targets) {
    if (done >= args.max) break
    const claim = claimById.get(id)
    if (!claim) {
      skipped++
      continue
    }
    done++
    let r: ClaimVerification
    try {
      r = await engine(claim, ctx)
    } catch (err) {
      process.stderr.write(`[verify-engine] ${id} engine error: ${String(err).slice(0, 120)}\n`)
      skipped++
      continue
    }
    const cur = currentVerdict.get(id) ?? 'sin-datos'
    // Trust ONLY the engine's high-precision sin-datos verdict, as a retraction.
    if (r.verdict === 'sin-datos' && (cur === 'verificado' || cur === 'parcial')) {
      const reason =
        `verdict-engine (${MODEL}) re-judged ${cur}→sin-datos: ${r.summary || 'no candidate genuinely supports the claim'}`.slice(
          0,
          400,
        )
      pending.push({
        claimId: id,
        verification: { ...r, checkedAgainst: ['verdict-engine'] },
        source: 'verdict-engine',
        reason: reason.length >= 20 ? reason : `${reason} (insufficient grounded evidence)`,
        editor: `verdict-engine:${MODEL}`,
      })
      retracted++
    } else {
      kept++
    }
    if (done % 10 === 0)
      process.stderr.write(`[verify-engine] ${done}/${targets.length} · ${retracted} retracted\n`)
    if (pending.length >= CHECKPOINT_EVERY) flush()
  }
  flush()

  process.stderr.write(
    `[verify-engine] DONE: re-judged ${done} · retracted ${retracted} → sin-datos · kept ${kept} · skipped ${skipped}${args.dryRun ? ' (DRY-RUN, nothing written)' : ''}\n`,
  )
}

function writeOverlay(o: Overlay) {
  writeFileSync(OVERLAY, JSON.stringify(o, null, 2) + '\n')
}

main().catch((err) => {
  process.stderr.write(
    `[verify-engine] FATAL: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
