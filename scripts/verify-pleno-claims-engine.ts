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
 *   LLM_BACKEND=claude-code LLM_ZERO_COST_ONLY=1 CLAUDE_CODE_BIN=/nonexistent-disabled \
 *     npm run verify:pleno-claims:engine -- --ids <fichero> --recortar [--dry-run]
 *
 * DOWNGRADE-ONLY, and only to sin-datos: a sin-datos asserts nothing, so a
 * retraction to it can only remove a claim — which is why it runs unattended
 * (tier A) and why we trust ONLY its sin-datos calls, as retractions of LLM
 * verificado/parcial. The rule was taken in June 2026 on the gold eval: the
 * engine's sin-datos agreed with the gold's label ~92% of the time (36 of 39)
 * and its verificado/parcial much less. That was agreement with a MODEL's
 * labels — in June every row of tests/fixtures/verifier-gold.json had been
 * labelled by ai-opus-4.8, with no human review recorded — measured with
 * gpt-5.4-mini. Neither model of the August 2026 run (below) was ever scored.
 * The figures, with their real samples, are in .automation-measurements.json.
 *
 * La pasada del 02-08-2026 NO corrió sólo por claude-code, aunque se configuró
 * así y así la rotuló este guion. Con el `.env` cargado, la cadena del cliente
 * ponía openai detrás de claude-code (sin OPENAI_MODEL, gpt-4o-mini), y cada vez
 * que `claude -p` fallaba contestaba gpt-4o-mini. El cliente guardaba esa
 * respuesta bajo la clave de claude-code, y aquí se rotulaba con lo configurado
 * (`OPENAI_MODEL || LLM_BACKEND`). Medido el 05-10-2026 contra una copia de la
 * caché, sin llamadas: de las 920 retractaciones de esa pasada que siguen en el
 * overlay con su explicación, 457 las contestó gpt-4o-mini (321 servidas), todas
 * rotuladas `verdict-engine:claude-code`.
 *
 * Desde entonces no puede volver a pasar. El motor corre sin respaldo de pago
 * diga lo que diga el entorno (`configDelMotor`), escribe a nombre del backend
 * que CONTESTÓ (`rotuloDelMotor`, con la procedencia que da
 * `callLLMConProcedencia`) y, si contestó otro que el primario, no escribe: la
 * cuenta y se reintenta en la siguiente pasada. El rótulo sale del backend
 * configurado, nunca de OPENAI_MODEL: esa variable en el `.env` habría firmado
 * lo que escribe Claude como de un modelo de OpenAI.
 *
 * Writes `source:'verdict-engine'` overlay entries (replacing the `llm` entry);
 * curator-downgrade entries are untouched (different source). Resumable: claims
 * already re-derived (a verdict-engine overlay entry exists) are skipped.
 * Requires a backend that answers (the engine calls callLLM) — the eval gate
 * lives in docs/superpowers/specs/2026-06-24-factcheck-rebuild-p3-results.md.
 *
 * `--ids <fichero>` (un id por línea; `#` comenta) RE-DERIVA retractaciones del
 * motor ya publicadas, las que el modo normal se salta porque ya tienen su
 * entrada. Lo trajo la charla de la tarea que el 02-08-2026 se guardó como
 * resumen (src/lib/resumenes-retirados.js). La decisión es
 * `decidirRederivacion`: reescribe la explicación sólo si el modelo juzgó y
 * sigue sin ver respaldo; nunca sube un veredicto; lo que no juzgó no se toca.
 *
 * Un `sin-datos` que pone la regla del título (el modelo citó sólo el título del
 * registro y su razonamiento ve respaldo; claim-verifier-engine.ts) no retracta
 * ni reescribe en ningún modo: se aparta, con su id, para un curador
 * (`APARTADA`), y el parte lo cuenta aparte.
 *
 * `--ids <fichero> --recortar` no juzga nada: corta en la última frase entera,
 * desde el razonamiento que las produjo, las explicaciones que el motor guardó
 * como `reasoning.slice(0, 300)` (858 a media frase el 04-10-2026). Ese
 * razonamiento está en `.llm-cache` bajo la clave del prompt de entonces, que la
 * vía `--ids` no lee: para ella serían fallos de caché, y re-juzgarlas ~1.480
 * llamadas. Lee la caché con `llmCacheGet`, que no llama nunca, y sólo escribe lo
 * que `decidirRecorte` prueba que es un recorte de lo publicado.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PlenoClaim } from '../src/scraper/pleno-claim'
import type { ClaimVerification, ClaimVerdict } from '../src/scraper/claim-verifier'
import { makeEngineVerifier, loadVerifierContext } from '../src/scraper/verifier-runner'
import { RazonamientoConCharla, type SinDatosPorque } from '../src/scraper/claim-verifier-engine'
import {
  anotarEnElParte,
  decidirRecorte,
  decidirRederivacion,
  decidirRetractacion,
  MOTIVO_SIN_RECORTE_EN_EL_PARTE,
  type MotivoSinJuicio,
  type MotivoSinRecorte,
} from '../src/scraper/decision-del-motor'
import { entradaDelMotor } from '../src/scraper/entrada-de-pasada'
import {
  configDelMotor,
  primarioDelMotor,
  rotuloDelMotor,
  type PasoDelMotor,
} from '../src/scraper/procedencia-del-motor'
import {
  resetBudget,
  getRunStats,
  llmCacheGet,
  loadConfigFromEnv,
  buildBackendChain,
} from '../src/llm/client'
import { EngineReasoningSchema } from '../src/llm/schemas'
import { ENGINE_REASON_VERSION, ENGINE_REASON_VERSIONES_ANTERIORES } from '../src/llm/prompts'
import { startRun, formatManifest } from '../src/scraper/run-manifest'
import { loadOverlay, rebuildVerified, OVERLAY } from './verified-rebuild'
import { applyOverlayEntries, type ApplyEntry, type Overlay } from '../src/scraper/verified-merge'

const VERIFIED = resolve('public/data/pleno-claims-verified.json')
/** Cómo se llama en el parte una declaración que se aparta (`decidirRederivacion`). */
const APARTADA = 'apartada: sólo cita el título, el razonamiento ve respaldo → curador'
// Sin respaldo de pago, diga lo que diga el entorno, y el rótulo del backend
// configurado, no de OPENAI_MODEL (ver la cabecera y procedencia-del-motor.ts).
const CONFIG = configDelMotor(loadConfigFromEnv())
const PRIMARIO = primarioDelMotor(CONFIG)
const MODEL = PRIMARIO.rotulo
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
  recortar: boolean
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    plenoId: null,
    max: Infinity,
    dryRun: false,
    base: false,
    ids: null,
    recortar: false,
  }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--plenoId') out.plenoId = argv[++i]
    else if (argv[i] === '--max') out.max = Number(argv[++i])
    else if (argv[i] === '--dry-run') out.dryRun = true
    else if (argv[i] === '--base') out.base = true
    else if (argv[i] === '--ids') out.ids = argv[++i]
    else if (argv[i] === '--recortar') out.recortar = true
    else {
      process.stderr.write(`[verify-engine] unknown flag ${argv[i]}\n`)
      process.exit(2)
    }
  }
  return out
}

/**
 * Los ids de `fichero` (uno por línea; `#` comenta) que son retractaciones del
 * motor. Re-derivar o recortar otra cosa sería tocar con una vía pensada para
 * corregir una explicación del motor lo que escribió otra etapa.
 */
function retractacionesDelMotor(
  fichero: string,
  overlay: Overlay,
): { pedidos: number; targets: string[] } {
  const pedidos = readFileSync(fichero, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
  const targets: string[] = []
  for (const id of pedidos) {
    if (overlay.entries[id]?.source !== 'verdict-engine') {
      process.stderr.write(`[verify-engine] --ids: ${id} no es una retractación del motor\n`)
      continue
    }
    targets.push(id)
  }
  return { pedidos: pedidos.length, targets }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.recortar) return recortar(args)
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
    const pedidas = retractacionesDelMotor(args.ids, overlay)
    targets.push(...pedidas.targets)
    process.stderr.write(
      `[verify-engine] --ids: ${targets.length} de ${pedidas.pedidos} retractaciones del motor a re-derivar (model ${MODEL})\n`,
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
  // Every claim the model was not asked about, with WHY. What the verifier
  // returns for these is the deterministic verdict, so it is never read as a
  // judgement (decidirRetractacion) and never counted as one (anotarEnElParte).
  // The reasons stay apart too: «sin candidatos» is a retrieval gap, the other
  // two are decisions. Folding them together made the manifest report a
  // healthy default run as 67% "never reached the model" — the same
  // conflation that let "never attempted" hide inside "unchanged" elsewhere.
  const saltos = new Map<string, MotivoSinJuicio>()
  // De qué salida del motor viene cada `sin-datos`: sólo dos son del modelo.
  const porqueSinDatos = new Map<string, SinDatosPorque>()
  // Quién contestó cada paso de cada declaración: la retractación se firma con
  // esto, no con lo configurado.
  const procedencias = new Map<string, PasoDelMotor[]>()
  process.stderr.write(
    `[verify-engine] backends: ${buildBackendChain(CONFIG).join(' → ')} (sin respaldo de pago)\n`,
  )
  const engine = makeEngineVerifier({
    consistency: false,
    // Re-derivar juzga siempre: algunas de estas filas las retractó `--base`,
    // y el determinista las da por verificadas.
    always: args.base || Boolean(args.ids),
    onSkip: (id, motivo) => {
      saltos.set(id, motivo)
    },
    onSinDatos: (id, porque) => {
      porqueSinDatos.set(id, porque)
    },
    config: CONFIG,
    onProcedencia: (id, paso) => {
      procedencias.set(id, [...(procedencias.get(id) ?? []), paso])
    },
  })

  const pending: ApplyEntry[] = []
  let done = 0
  let retracted = 0
  let kept = 0
  let skipped = 0
  // Claims the model was never actually ASKED about — no retrieval candidates,
  // an opinion-accusation the LLM path skips by policy, or (default mode) one
  // the deterministic pass already decided. Folding these into `kept` made "the
  // model agreed with everything" and "the model was never called" print
  // identically: a run reported `re-judged 1017 · kept 1017` having made zero
  // LLM calls. Folding them into `retracted` wrote them as the model's verdict:
  // the June run did that to every claim it had no candidates for.
  let unjudged = 0
  // Respuestas que hablan de la tarea y no de la declaración: el modelo contestó,
  // pero no juzgó. Ni «juzgada» ni «error del motor»: se reintentan.
  let charla = 0
  // Juicios que contestó otro backend que el primario (un respaldo gratuito: el
  // de pago ya no está en la cadena). No se escriben a nombre de nadie: se
  // reintentan cuando el primario conteste.
  const deOtroBackend: string[] = []
  // --ids: explicación reescrita; el modelo ya ve respaldo (para un curador);
  // no la juzgó. Tres cuentas separadas, con sus ids.
  const rederivadas: string[] = []
  const yaNoLaRetractaria: string[] = []
  const sinJuicio: string[] = []
  // Las dos vías: un `sin-datos` de la regla del título, para un curador.
  const apartadas: string[] = []

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
    // Primero si hubo juicio; el veredicto, después y sólo entonces.
    const salto = saltos.get(id)
    // Y a nombre de quién: de quien CONTESTÓ cada paso, no de lo configurado.
    // Si no fue el primario, no se escribe ni cuenta como juzgada: se reintenta.
    let rotulo = MODEL
    if (!salto) {
      const firma = rotuloDelMotor({ primario: PRIMARIO, pasos: procedencias.get(id) ?? [] })
      if (firma.accion === 'dejar' && firma.porque === 'otro-backend') {
        process.stderr.write(
          `[verify-engine] ${id}: no se escribe — lo contestó ${firma.quien}, no ${PRIMARIO.rotulo}\n`,
        )
        deOtroBackend.push(id)
        run.skip('contestó otro backend')
        continue
      }
      if (firma.accion === 'dejar') {
        process.stderr.write(
          `[verify-engine] ${id}: no se escribe — sin la procedencia de su respuesta\n`,
        )
        skipped++
        run.skip('sin procedencia de la respuesta')
        continue
      }
      rotulo = firma.rotulo
    }
    anotarEnElParte(run, salto)
    if (args.ids) {
      const decision = decidirRederivacion({
        juzgada: !salto,
        veredicto: r.verdict,
        sinDatosPorque: porqueSinDatos.get(id),
      })
      if (decision.accion === 'reescribir') {
        pending.push(entradaDelMotor({ verification: r, modelo: rotulo, tipo: 'rederivacion' }))
        rederivadas.push(id)
        run.record('rederivada')
      } else if (decision.accion === 'apartar') {
        apartadas.push(id)
        run.record(APARTADA)
      } else if (decision.motivo === 'ya-no-la-retractaria') {
        yaNoLaRetractaria.push(id)
        run.record('ya no la retractaría')
      } else {
        sinJuicio.push(id)
      }
      if (pending.length >= CHECKPOINT_EVERY) flush()
      continue
    }
    // Trust ONLY the engine's sin-datos verdict, as a retraction — the one
    // output of its that cannot add a claim — and only when the engine judged:
    // without a judgement, the sin-datos that comes back is the deterministic one.
    const decision = decidirRetractacion({
      salto,
      veredicto: r.verdict,
      publicado: cur,
      sinDatosPorque: porqueSinDatos.get(id),
    })
    if (decision.accion === 'retractar') {
      // Tal cual la dio el motor: los corpus de su evidencia en `checkedAgainst`,
      // su pasada en `derivedBy`. Antes se pisaba `checkedAgainst` con la marca.
      pending.push(
        entradaDelMotor({ verification: r, modelo: rotulo, tipo: 'retractacion', desde: cur }),
      )
      retracted++
      run.record('retracted')
    } else if (decision.accion === 'mantener') {
      kept++
      run.record('kept')
    } else if (decision.accion === 'apartar') {
      apartadas.push(id)
      run.record(APARTADA)
    } else {
      unjudged++
    }
    if (done % 10 === 0)
      process.stderr.write(`[verify-engine] ${done}/${targets.length} · ${retracted} retracted\n`)
    if (pending.length >= CHECKPOINT_EVERY) flush()
  }
  flush()
  if (deOtroBackend.length > 0) {
    // Una pasada que no escribe lo que le contestó un respaldo no sale limpia:
    // el primario está fallando y hay que saberlo antes de la siguiente.
    process.stderr.write(
      `[verify-engine] ${deOtroBackend.length} juicio(s) los contestó otro backend que ` +
        `${PRIMARIO.rotulo} y no se han escrito; se reintentan en la siguiente pasada:\n` +
        `    ${deOtroBackend.join('\n    ')}\n`,
    )
    process.exitCode = 1
  }
  if (
    done > 0 &&
    retracted +
      kept +
      rederivadas.length +
      yaNoLaRetractaria.length +
      apartadas.length +
      deOtroBackend.length ===
      0
  ) {
    process.stderr.write(
      `[verify-engine] WARNING: ${done} claim(s) processed and the model was consulted for NONE ` +
        `of them. Check the shortlist (VERIFIER_SHORTLIST=${process.env.VERIFIER_SHORTLIST ?? 'hybrid'}, ` +
        `corpus ${wantsCorpus ? 'requested' : 'disabled'}) and the backend — a run like this looks ` +
        `identical to "the model agreed with everything".\n`,
    )
    process.exitCode = 1
  }

  // En `--ids` las apartadas van en su línea, abajo.
  const apartadasAqui = args.ids ? 0 : apartadas.length
  process.stderr.write(
    `[verify-engine] DONE: seen ${done} · JUDGED ${retracted + kept + apartadasAqui} ` +
      `(retracted ${retracted} → sin-datos · kept ${kept}` +
      `${apartadasAqui ? ` · apartadas ${apartadasAqui}` : ''}) · ` +
      `never asked ${unjudged} · charla de la tarea ${charla} · ` +
      `de otro backend ${deOtroBackend.length} · skipped ${skipped}` +
      `${args.dryRun ? ' (DRY-RUN, nothing written)' : ''}\n`,
  )
  if (apartadasAqui) process.stderr.write(`  ${APARTADA}:\n    ${apartadas.join('\n    ')}\n`)

  if (args.ids) {
    process.stderr.write(
      `[verify-engine] --ids: rederivadas ${rederivadas.length} · ya no la retractaría ` +
        `${yaNoLaRetractaria.length} · apartadas ${apartadas.length} · sin juicio ${sinJuicio.length}\n`,
    )
    if (yaNoLaRetractaria.length)
      process.stderr.write(
        `  el modelo ya ve respaldo; la retractación se queda, para un curador:\n    ${yaNoLaRetractaria.join('\n    ')}\n`,
      )
    if (sinJuicio.length)
      process.stderr.write(`  sin juicio, sin tocar:\n    ${sinJuicio.join('\n    ')}\n`)
    if (apartadas.length) process.stderr.write(`  ${APARTADA}:\n    ${apartadas.join('\n    ')}\n`)
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

/**
 * `--ids <fichero> --recortar`: recorta, sin llamar a ningún modelo, las
 * explicaciones del motor publicadas a media frase (`decidirRecorte`).
 *
 * No carga el corpus ni el contexto del verificador: no juzga, lee lo que el
 * modelo ya razonó. Lo lee con `llmCacheGet`, que no llama nunca, así que la
 * promesa de cero llamadas no depende de cómo esté el entorno. Escribe una sola
 * vez y ESPERA al rebuild, para que lo publicado sea esto al salir.
 */
async function recortar(args: Args): Promise<void> {
  if (!args.ids) {
    process.stderr.write(
      '[verify-engine] --recortar va con --ids <fichero>: recorta una lista medida, no el overlay entero\n',
    )
    process.exit(2)
  }
  resetBudget()
  const run = startRun('verify-pleno-claims-engine', {
    mode: 'recortar',
    getStats: getRunStats,
    model: MODEL,
  })
  let overlay = loadOverlay()
  const { pedidos, targets } = retractacionesDelMotor(args.ids, overlay)
  process.stderr.write(
    `[verify-engine] --recortar: ${targets.length} de ${pedidos} retractaciones del motor, sin llamadas\n`,
  )

  // La versión de hoy primero; `decidirRecorte` elige por el contenido.
  const versiones = [ENGINE_REASON_VERSION, ...ENGINE_REASON_VERSIONES_ANTERIORES]
  const pending: ApplyEntry[] = []
  const recortadas: string[] = []
  const dejadas = new Map<MotivoSinRecorte, string[]>()
  for (const id of targets) {
    run.attempt()
    const razonamientos: string[] = []
    for (const promptVersion of versiones) {
      const r = llmCacheGet({
        promptVersion,
        schema: EngineReasoningSchema,
        input: { claimId: id },
      })
      if (typeof r?.reasoning === 'string') razonamientos.push(r.reasoning)
    }
    const d = decidirRecorte({ claimId: id, entrada: overlay.entries[id], razonamientos })
    if (d.accion === 'recortar') {
      pending.push(d.entrada)
      recortadas.push(id)
      run.judge()
      run.record('recortada')
    } else {
      dejadas.set(d.porque, [...(dejadas.get(d.porque) ?? []), id])
      run.skip(MOTIVO_SIN_RECORTE_EN_EL_PARTE[d.porque])
    }
  }

  // Cero llamadas por construcción. Si el cliente contó alguna, algo cambió por
  // debajo de esta función, y no se escribe nada de lo recortado.
  const llamadas = getRunStats().calls
  if (llamadas > 0) {
    process.stderr.write(
      `[verify-engine] --recortar: el cliente contó ${llamadas} llamada(s) — no se escribe nada\n`,
    )
    process.exitCode = 1
  } else if (!args.dryRun && pending.length > 0) {
    overlay = applyOverlayEntries(overlay, pending, new Date().toISOString())
    writeOverlay(overlay)
    await rebuildVerified({ refreshChunks: true })
  }

  const nDejadas = targets.length - recortadas.length
  const porMotivo = [...dejadas]
    .map(([motivo, ids]) => `${MOTIVO_SIN_RECORTE_EN_EL_PARTE[motivo]} ${ids.length}`)
    .join(' · ')
  process.stderr.write(
    `[verify-engine] --recortar: recortadas ${recortadas.length} · dejadas ${nDejadas}` +
      `${porMotivo ? ` (${porMotivo})` : ''}${args.dryRun ? ' (DRY-RUN, nothing written)' : ''}\n`,
  )
  for (const [motivo, ids] of dejadas) {
    process.stderr.write(
      `  ${MOTIVO_SIN_RECORTE_EN_EL_PARTE[motivo]}:\n    ${ids.join('\n    ')}\n`,
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
