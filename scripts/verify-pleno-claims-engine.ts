/**
 * Verdict-engine re-derivation (P3) — re-judges the LLM second-pass verdicts with
 * the reason-then-format engine (local cite-grounding + NEI-default) and RETRACTS
 * the over-claims it confidently flags `sin-datos`.
 *
 *   set -a; source <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env); set +a
 *   LLM_BACKEND=openai OPENAI_MODEL=gpt-5.4-mini VERIFIER_SHORTLIST=lexical \
 *     npm run verify:pleno-claims:engine -- [--max N] [--plenoId ID] [--dry-run]
 *     npm run verify:pleno-claims:engine -- --ids <fichero> [--dry-run]
 *
 * DOWNGRADE-ONLY, and only to sin-datos: on the 64-row gold the engine's sin-datos
 * precision is ~92% (reliable) while its verificado/parcial precision is weak — so
 * we trust ONLY its sin-datos calls, as retractions of LLM verificado/parcial.
 * Writes `source:'verdict-engine'` overlay entries (replacing the `llm` entry);
 * curator-downgrade entries are untouched (different source). Resumable: claims
 * already re-derived (a verdict-engine overlay entry exists) are skipped.
 * Requires a working metered backend (the engine calls callLLM) — the eval gate
 * lives in docs/superpowers/specs/2026-06-24-factcheck-rebuild-p3-results.md.
 *
 * `--ids <fichero>` (un id por línea; `#` comenta) RE-DERIVA retractaciones del
 * motor ya publicadas, las que el modo normal se salta porque ya tienen su
 * entrada. Lo trajo la charla de la tarea que el 02-08-2026 se guardó como
 * resumen (src/lib/resumenes-retirados.js). La decisión es
 * `decidirRederivacion`: reescribe la explicación sólo si el modelo juzgó y
 * sigue sin ver respaldo; nunca sube un veredicto; lo que no juzgó no se toca.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PlenoClaim } from '../src/scraper/pleno-claim'
import type { ClaimVerification, ClaimVerdict } from '../src/scraper/claim-verifier'
import { makeEngineVerifier, loadVerifierContext } from '../src/scraper/verifier-runner'
import { RazonamientoConCharla } from '../src/scraper/claim-verifier-engine'
import { decidirRederivacion } from '../src/scraper/decision-del-motor'
import { entradaDelMotor } from '../src/scraper/entrada-de-pasada'
import { resetBudget, getRunStats } from '../src/llm/client'
import { startRun, formatManifest } from '../src/scraper/run-manifest'
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
  base: boolean
  ids: string | null
}

function parseArgs(argv: string[]): Args {
  const out: Args = { plenoId: null, max: Infinity, dryRun: false, base: false, ids: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--plenoId') out.plenoId = argv[++i]
    else if (argv[i] === '--max') out.max = Number(argv[++i])
    else if (argv[i] === '--dry-run') out.dryRun = true
    else if (argv[i] === '--base') out.base = true
    else if (argv[i] === '--ids') out.ids = argv[++i]
    else {
      process.stderr.write(`[verify-engine] unknown flag ${argv[i]}\n`)
      process.exit(2)
    }
  }
  return out
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  // Arms the circuit breaker (and the token budget). Without this call
  // `currentCircuit` stays null and `notifyResult` returns early, so the
  // breaker is INERT — which is how a run once made 190 consecutive calls to a
  // backend that had stopped answering. The telemetry is unmistakable in
  // hindsight: after one genuine failure, every subsequent envelope reported
  // duration_api_ms 0, input_tokens 0, output_tokens 0, cost 0. No request was
  // being made at all, and nothing stopped the loop.
  //
  // This is the heaviest LLM consumer in the repo (it walks every claim), and
  // it was the one script of eighteen that never armed the guard.
  resetBudget()
  // Counts are recorded here but MEASURED in the llm client, so the manifest
  // cannot inherit this script's beliefs about what it did.
  const run = startRun('verify-pleno-claims-engine', {
    mode: args.ids ? 'rederivar' : args.base ? 'base' : 'llm-overclaims',
    getStats: getRunStats,
    model: MODEL,
  })
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
  const targets: string[] = []
  if (args.ids) {
    // Sólo retractaciones del motor: re-derivar otra cosa sería juzgar por
    // primera vez con una vía pensada para corregir una explicación.
    const pedidos = readFileSync(args.ids, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
    for (const id of pedidos) {
      if (overlay.entries[id]?.source !== 'verdict-engine') {
        process.stderr.write(`[verify-engine] --ids: ${id} no es una retractación del motor\n`)
        continue
      }
      targets.push(id)
    }
    process.stderr.write(
      `[verify-engine] --ids: ${targets.length} de ${pedidos.length} retractaciones del motor a re-derivar (model ${MODEL})\n`,
    )
  } else if (args.base) {
    // --base: re-judge the pure deterministic-base verificado/parcial that no
    // overlay entry has ever touched (the LLM ones are handled by the default
    // mode). Same downgrade-to-sin-datos-only policy. Resume: a verdict-engine
    // entry already exists ⇒ the claimId is in the overlay ⇒ skipped below.
    const ovIds = new Set(Object.keys(overlay.entries))
    for (const it of snap.items) {
      const v = it.verification.verdict
      if (v !== 'verificado' && v !== 'parcial') continue
      if (ovIds.has(it.claim.id)) continue // overlay-sourced (already vetted) or already re-judged
      if (args.plenoId && !it.claim.id.startsWith(args.plenoId)) continue
      targets.push(it.claim.id)
    }
    process.stderr.write(
      `[verify-engine] --base: ${targets.length} pure-base verificado/parcial verdicts to re-judge (model ${MODEL})\n`,
    )
  } else {
    // Default: claims the LLM second pass upgraded to verificado/parcial — the
    // over-claim pool. Skip any already re-derived by the engine (resume).
    for (const [id, e] of Object.entries(overlay.entries)) {
      if (e.source !== 'llm') continue
      if (e.verification.verdict !== 'verificado' && e.verification.verdict !== 'parcial') continue
      if (args.plenoId && !id.startsWith(args.plenoId)) continue
      targets.push(id)
    }
    process.stderr.write(
      `[verify-engine] ${targets.length} LLM verificado/parcial verdicts to re-judge (model ${MODEL})\n`,
    )
  }

  // `withCorpus` was hardcoded false, which silently disabled the semantic
  // half of VERIFIER_SHORTLIST=hybrid — and the lexical half only retrieves via
  // a euro figure, so 813 of the 1017 `--base` targets had NO candidates at
  // all. Load it when the mode asks for it; loadVerifierContext degrades to
  // lexical on its own if the corpus file is missing.
  const wantsCorpus = ['hybrid', 'semantic'].includes(process.env.VERIFIER_SHORTLIST ?? 'hybrid')
  const ctx = await loadVerifierContext({ withCorpus: wantsCorpus })
  // `--base` re-judges verdicts the DETERMINISTIC pass asserted, so the engine
  // must not short-circuit on "deterministic already decided".
  // Keep the two skip reasons APART. With `always` on, `not-attempted` means
  // the claim is one the LLM path skips by policy (an opinion-accusation) —
  // the design, not a gap; `no-candidates` means retrieval returned nothing,
  // which always is one. Folding them together once made the manifest report
  // a healthy run as 67% "never reached the model" — the same conflation that
  // let "never attempted" hide inside "unchanged" elsewhere in this repo.
  const skippedIds = new Set<string>()
  const skipReason = new Map<string, 'no-candidates' | 'not-attempted'>()
  const engine = makeEngineVerifier({
    consistency: false,
    // Siempre, en los tres modos. Sin esto, `makeEngineVerifier` devuelve el
    // veredicto DETERMINISTA cuando el motor juzga `sin-datos` (su `upgraded`
    // es falso), y el modo por defecto lo escribía como retractación del motor:
    // 301 entradas publicadas llevan de resumen el del cotejo determinista.
    // `entradaDelMotor` ya no firma como del motor lo que el motor no produjo.
    // Re-derivar y `--base` lo necesitaban además por otra razón: algunas de
    // sus filas el determinista las da por verificadas.
    always: true,
    onSkip: (id, reason) => {
      skippedIds.add(id)
      skipReason.set(id, reason)
    },
  })

  const pending: ApplyEntry[] = []
  let done = 0
  let retracted = 0
  let kept = 0
  let skipped = 0
  // Claims the model was never actually ASKED about — no retrieval candidates,
  // or an opinion-accusation the LLM path skips by policy. Folding these into
  // `kept` made "the model agreed with everything" and "the model was never
  // called" print identically, which is exactly what happened: a run reported
  // `re-judged 1017 · kept 1017` having made zero LLM calls.
  let unjudged = 0
  // Respuestas que hablan de la tarea y no de la declaración: el modelo contestó,
  // pero no juzgó. Ni «juzgada» ni «error del motor»: se reintentan.
  let charla = 0
  // --ids: explicación reescrita; el modelo ya ve respaldo (para un curador);
  // no la juzgó. Tres cuentas separadas, con sus ids.
  const rederivadas: string[] = []
  const yaNoLaRetractaria: string[] = []
  const sinJuicio: string[] = []

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
    run.attempt()
    if (!claim) {
      skipped++
      run.skip('claim not in snapshot')
      continue
    }
    done++
    let r: ClaimVerification
    try {
      r = await engine(claim, ctx)
    } catch (err) {
      if (err instanceof RazonamientoConCharla) {
        process.stderr.write(`[verify-engine] ${err.message}\n`)
        charla++
        run.skip('razonamiento con charla de la tarea')
        continue
      }
      process.stderr.write(`[verify-engine] ${id} engine error: ${String(err).slice(0, 120)}\n`)
      skipped++
      run.skip('engine error')
      continue
    }
    const cur = currentVerdict.get(id) ?? 'sin-datos'
    if (args.ids) {
      const decision = decidirRederivacion({ juzgada: !skippedIds.has(id), veredicto: r.verdict })
      if (decision.accion === 'reescribir') {
        pending.push(entradaDelMotor({ verification: r, modelo: MODEL, tipo: 'rederivacion' }))
        rederivadas.push(id)
        run.judge()
        run.record('rederivada')
      } else if (decision.motivo === 'ya-no-la-retractaria') {
        yaNoLaRetractaria.push(id)
        run.judge()
        run.record('ya no la retractaría')
      } else {
        sinJuicio.push(id)
        if (skipReason.get(id) === 'not-attempted') run.skip('fuera de la política del LLM')
        else run.neverAttempt()
      }
      if (pending.length >= CHECKPOINT_EVERY) flush()
      continue
    }
    // Lo que el motor no juzgó, primero: entonces `r` es el veredicto
    // determinista, y escribirlo como retractación del motor contaba un «nunca
    // preguntado» como juicio (regla 2).
    if (skippedIds.has(id)) {
      unjudged++
      if (skipReason.get(id) === 'not-attempted') run.skip('fuera de la política del LLM')
      else run.neverAttempt()
    } else if (r.verdict === 'sin-datos' && (cur === 'verificado' || cur === 'parcial')) {
      // Trust ONLY the engine's high-precision sin-datos verdict, as a retraction.
      pending.push(
        entradaDelMotor({ verification: r, modelo: MODEL, tipo: 'retractacion', desde: cur }),
      )
      retracted++
      run.judge()
      run.record('retracted')
    } else {
      kept++
      run.judge()
      run.record('kept')
    }
    if (done % 10 === 0)
      process.stderr.write(`[verify-engine] ${done}/${targets.length} · ${retracted} retracted\n`)
    if (pending.length >= CHECKPOINT_EVERY) flush()
  }
  flush()
  if (done > 0 && retracted + kept + rederivadas.length + yaNoLaRetractaria.length === 0) {
    process.stderr.write(
      `[verify-engine] WARNING: ${done} claim(s) processed and the model was consulted for NONE ` +
        `of them. Check the shortlist (VERIFIER_SHORTLIST=${process.env.VERIFIER_SHORTLIST ?? 'hybrid'}, ` +
        `corpus ${wantsCorpus ? 'requested' : 'disabled'}) and the backend — a run like this looks ` +
        `identical to "the model agreed with everything".\n`,
    )
    process.exitCode = 1
  }

  process.stderr.write(
    `[verify-engine] DONE: seen ${done} · JUDGED ${retracted + kept} ` +
      `(retracted ${retracted} → sin-datos · kept ${kept}) · ` +
      `never asked ${unjudged} · charla de la tarea ${charla} · skipped ${skipped}` +
      `${args.dryRun ? ' (DRY-RUN, nothing written)' : ''}\n`,
  )

  if (args.ids) {
    process.stderr.write(
      `[verify-engine] --ids: rederivadas ${rederivadas.length} · ya no la retractaría ` +
        `${yaNoLaRetractaria.length} · sin juicio ${sinJuicio.length}\n`,
    )
    if (yaNoLaRetractaria.length)
      process.stderr.write(
        `  el modelo ya ve respaldo; la retractación se queda, para un curador:\n    ${yaNoLaRetractaria.join('\n    ')}\n`,
      )
    if (sinJuicio.length)
      process.stderr.write(`  sin juicio, sin tocar:\n    ${sinJuicio.join('\n    ')}\n`)
    if (rederivadas.length && !args.dryRun)
      process.stderr.write(
        `  su explicación nueva se imprime sola; quita estas entradas de src/lib/resumenes-retirados.js:\n    ${rederivadas.join('\n    ')}\n`,
      )
  }

  const { manifest, findings } = run.finish({ exitCode: process.exitCode ? 1 : 0 })
  process.stderr.write(`\n${formatManifest(manifest)}\n`)
  for (const f of findings) {
    process.stderr.write(`  ${f.level.toUpperCase()} [${f.code}] ${f.message}\n`)
  }
  if (findings.some((f) => f.level === 'error')) process.exitCode = 1
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
