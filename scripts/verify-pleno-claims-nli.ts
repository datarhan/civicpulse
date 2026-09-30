/**
 * NLI grounding second pass (P1) — the local, $0, no-quota replacement for
 * verify:pleno-claims:llm. PROPONE; no publica.
 *
 *   npm run verify:pleno-claims:nli                      # all sin-datos
 *   npm run verify:pleno-claims:nli -- --plenoId 1tgd1h4
 *   npm run verify:pleno-claims:nli -- --max 200 --model minicheck
 *
 * Runs ONLY on sin-datos claims (skips opinativa), so a re-run re-scans. Loads
 * the embedding corpus ONCE (audit B1 fix), builds each claim's shortlist, then
 * scores every (snippet, claim) pair through the local NLI sidecar in chunked
 * batches. Never emits contradicho. Requires the NLI venv —
 * `bash scripts/bootstrap-nli.sh` — and fails loud if it is missing.
 *
 * Lo que el modelo ve respaldado NO se publica. Lo automático sólo baja
 * (docs/DATA_INTEGRITY.md, regla 4), así que cada subida se escribe como
 * sugerencia con `requiresHumanApproval: true` en `COLA_SUGERENCIAS_NLI`
 * —editorial/, gitignorado, fuera de public/—, y el overlay la rechaza con la
 * marca y sin ella (`exigeFirma` en src/scraper/trinquete.ts). Este runner no
 * toca el overlay ni recompone pleno-claims-verified.json. Hasta el 29-09-2026
 * escribía sus subidas en el overlay con la marca de la pasada en
 * `checkedAgainst`, y el suelo de evidencia las tiraba todas: ninguna llegó a
 * publicarse.
 *
 * La cola dice lo que opinó la última corrida de cada fila que juzgó: una fila
 * re-juzgada sin subida sale; una que no se miró se queda con su sello. Qué
 * construye cada fila está en src/scraper/entrada-de-pasada.ts.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
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
import {
  actualizarCola,
  validarCola,
  sugerenciaDelAnclaje,
  COLA_SUGERENCIAS_NLI,
  type ColaDeSugerencias,
  type SugerenciaDeVeredicto,
} from '../src/scraper/entrada-de-pasada'

const VERIFIED = resolve('public/data/pleno-claims-verified.json')
const COLA = resolve(COLA_SUGERENCIAS_NLI)
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
  /**
   * Re-fundamentar un conjunto CONCRETO, cueste lo que cueste su veredicto
   * actual.
   *
   * El modo normal corre sólo sobre `sin-datos`, que es lo correcto para una
   * pasada de barrido. Pero las filas que se apoyaban en una pasada retirada
   * están en `parcial`/`verificado`, y el barrido no las tocaría nunca. Con una
   * lista explícita se juzgan igual; lo que salga es una sugerencia para la
   * cola, como cualquier otra.
   */
  claimIds: Set<string> | null
}

function parseArgs(argv: string[]): Args {
  const out: Args = { plenoId: null, max: Infinity, model: undefined, claimIds: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--plenoId') out.plenoId = argv[++i]
    else if (argv[i] === '--max') out.max = Number(argv[++i])
    else if (argv[i] === '--model') out.model = argv[++i]
    else if (argv[i] === '--claimIds') {
      const ruta = argv[++i]
      out.claimIds = new Set(
        readFileSync(ruta, 'utf8')
          .split(/\s+/)
          .map((x) => x.trim())
          .filter(Boolean),
      )
    } else {
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

/** La cola en disco, validada; `null` si todavía no existe. */
function leerCola(): ColaDeSugerencias | null {
  if (!existsSync(COLA)) return null
  const cola = JSON.parse(readFileSync(COLA, 'utf8')) as ColaDeSugerencias
  validarCola(cola)
  return cola
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
    // Con lista explícita manda la lista: son filas que YA tienen veredicto y
    // que se quieren volver a fundamentar. La puerta de `opinativa` sigue,
    // porque ésa es política y no un filtro de barrido.
    if (opts.claimIds) {
      if (!opts.claimIds.has(it.claim.id)) return false
      return !shouldSkipLlmVerification(it.claim)
    }
    if (it.verification.verdict !== 'sin-datos') return false
    if (shouldSkipLlmVerification(it.claim)) return false
    if (opts.plenoId && it.claim.plenoId !== opts.plenoId) return false
    return true
  })

  // Una pasada tiene que demostrar que hizo lo que le pidieron: si se piden 76
  // ids y aparecen 3, eso no es «ya está» — es una lista mal escrita o un
  // corpus que se movió. Regla 2 de docs/DATA_INTEGRITY.md.
  if (opts.claimIds) {
    const encontrados = new Set(candidates.map((c) => c.claim.id))
    const ausentes = [...opts.claimIds].filter((id) => !encontrados.has(id))
    process.stdout.write(
      `[verify-nli] lista explícita: ${opts.claimIds.size} pedida(s) · ${encontrados.size} ` +
        `encontrada(s) · ${ausentes.length} sin localizar\n`,
    )
    if (ausentes.length) {
      process.stdout.write(`[verify-nli]   sin localizar: ${ausentes.slice(0, 8).join(', ')}\n`)
    }
    if (encontrados.size === 0) {
      process.stderr.write(
        '[verify-nli] ninguna de las filas pedidas existe: no hay nada que hacer\n',
      )
      process.exit(1)
    }
  }
  const queue = candidates.slice(0, Math.min(candidates.length, opts.max))
  process.stdout.write(
    `[verify-nli] ${queue.length} claim(s) eligible (corpus=${ctx.corpus ? 'preloaded' : 'lexical-only'}, model=${opts.model ?? 'mDeBERTa-xnli'})\n`,
  )

  // Cuatro cuentas por separado (regla 2): «el modelo no vio respaldo» y «el
  // modelo no llegó a juzgarla» no pueden imprimirse igual.
  const stats = { propuestas: 0, sinRespaldo: 0, sinJuicio: 0, contradictionFlags: 0 }
  const flaggedIds: string[] = []
  let cola = leerCola()
  let escrita = false
  const flushCola = () => {
    if (!cola) return
    mkdirSync(dirname(COLA), { recursive: true })
    writeFileSync(COLA, JSON.stringify(cola, null, 2) + '\n')
    escrita = true
  }

  let interrupted = false
  const onSignal = (sig: string) => {
    if (interrupted) return
    interrupted = true
    process.stderr.write(`\n[verify-nli] ${sig} — saving the suggestion queue…\n`)
    try {
      flushCola()
    } catch (err) {
      process.stderr.write(`[verify-nli] queue save FAILED: ${(err as Error).message}\n`)
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

      // 3. Judge each claim; an upgrade becomes a suggestion for the human queue.
      const juzgadas: string[] = []
      const sugerencias: SugerenciaDeVeredicto[] = []
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
          // Sin candidatos que puntuar (o fuera de la política): no se juzgó, y
          // su fila de la cola —si la tenía— se queda como estaba.
          stats.sinJuicio += 1
          continue
        }
        juzgadas.push(it.claim.id)
        if (r.nliContradictionFlag) {
          stats.contradictionFlags += 1
          flaggedIds.push(it.claim.id)
        }
        const s = sugerenciaDelAnclaje({ r, desde: it.verification.verdict })
        if (s) {
          sugerencias.push(s)
          stats.propuestas += 1
        } else {
          stats.sinRespaldo += 1
        }
      }

      if (juzgadas.length > 0) {
        cola = actualizarCola(cola, juzgadas, sugerencias, new Date().toISOString())
        flushCola()
      }
      process.stdout.write(
        `[verify-nli]   ${Math.min(start + CHUNK_CLAIMS, queue.length)}/${queue.length} · ` +
          `propuestas=${stats.propuestas} sin-respaldo=${stats.sinRespaldo} ` +
          `sin-juicio=${stats.sinJuicio} contra-flags=${stats.contradictionFlags}\n`,
      )
    }
  } catch (err) {
    if (err instanceof NliUnavailableError) {
      process.stderr.write(`[verify-nli] ${err.message}\n`)
      process.exit(1)
    }
    throw err
  }

  if (flaggedIds.length > 0) {
    process.stderr.write(
      `[verify-nli] ${flaggedIds.length} claims flagged with an NLI contradiction (curator review, NOT auto-published): ${flaggedIds.slice(0, 20).join(', ')}${flaggedIds.length > 20 ? ' …' : ''}\n`,
    )
  }
  const juzgadasTotal = stats.propuestas + stats.sinRespaldo
  process.stdout.write(
    `[verify-nli] done. ${queue.length} elegible(s) · juzgadas ${juzgadasTotal} ` +
      `(propuestas ${stats.propuestas} · sin respaldo ${stats.sinRespaldo}) · ` +
      `sin juicio ${stats.sinJuicio} · contra-flags ${stats.contradictionFlags}\n` +
      (escrita
        ? `[verify-nli]   cola → ${COLA_SUGERENCIAS_NLI} (${Object.keys(cola?.entries ?? {}).length} fila(s) en total)\n`
        : `[verify-nli]   cola sin escribir: ninguna fila se juzgó en esta corrida\n`) +
      `[verify-nli]   publicado: nada. Una subida la firma una persona; esta pasada sólo propone.\n`,
  )
  // Cero juzgadas con filas elegibles no es un día tranquilo: el modelo no
  // llegó a ver ninguna (sin candidatos, corpus ausente). Regla 2.
  if (queue.length > 0 && juzgadasTotal === 0) {
    process.stderr.write(
      `[verify-nli] ${queue.length} fila(s) elegible(s) y NINGUNA juzgada: no es «nada que ` +
        'proponer», es que el modelo no vio ninguna. Mira la lista corta y el corpus.\n',
    )
    process.exitCode = 1
  }
}

main().catch((err) => {
  process.stderr.write(`[verify-nli] FATAL: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
