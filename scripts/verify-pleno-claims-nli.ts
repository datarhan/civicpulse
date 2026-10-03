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
 *
 * Una fila se juzga con TODAS sus puntuaciones o no se juzga. Hasta el
 * 30-09-2026 no le llegaba ninguna al verificador: el tramo se puntúa con el id
 * global del par (`idDelPar`), el `lookup` de cada fila las devolvía con ese id
 * y `verifyClaimWithNli` las pide por el índice. Toda fila salía «sin respaldo»
 * —un juicio que nadie hizo— y la corrida terminaba bien, desde el primer
 * commit (325a1c62). Por eso el parte dice cuántas puntuaciones leyó de
 * cuántas pidió, y un par sin la suya hace salir la corrida con error (regla 2).
 *
 * Tampoco propone subir lo que una retractación bajó: las filas cuyo veredicto
 * publicado entró por el motor o por un curador se apartan antes de puntuar, y
 * la corrida dice cuántas y de quién (`motivoParaNoProponer`).
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
import { loadOverlay } from './verified-rebuild'
import {
  actualizarCola,
  validarCola,
  sugerenciaDelAnclaje,
  motivoParaNoProponer,
  COLA_SUGERENCIAS_NLI,
  type ColaDeSugerencias,
  type SugerenciaDeVeredicto,
} from '../src/scraper/entrada-de-pasada'

const VERIFIED = resolve('public/data/pleno-claims-verified.json')
const COLA = resolve(COLA_SUGERENCIAS_NLI)
const CHUNK_CLAIMS = 400 // claims per NLI spawn (model reloads per chunk; checkpoint boundary)

/** El id de un par en el lote de un tramo: su declaración y su índice en ella. */
const idDelPar = (claimId: string, i: number | string) => `${claimId}#${i}`

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

  const seleccionadas = snap.items.filter((it) => {
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

  // Lo que una retractación bajó no se propone subir: el motor o un curador lo
  // bajaron a propósito, y la cola le pediría a una persona deshacerlo sin
  // decírselo. Se lee del overlay —la fuente de las retractaciones—, no del
  // publicado, que puede ir por detrás de él. Se apartan ANTES de puntuar y se
  // cuentan aparte (regla 2): no son «sin respaldo» ni «sin juicio».
  const overlay = loadOverlay()
  const fuenteDe = (id: string) => overlay.entries[id]?.source
  const retractadas: { id: string; motivo: string }[] = []
  const candidates = seleccionadas.filter((it) => {
    const motivo = motivoParaNoProponer(fuenteDe(it.claim.id))
    if (motivo) retractadas.push({ id: it.claim.id, motivo })
    return !motivo
  })

  // Una pasada tiene que demostrar que hizo lo que le pidieron: si se piden 76
  // ids y aparecen 3, eso no es «ya está» — es una lista mal escrita o un
  // corpus que se movió. Regla 2 de docs/DATA_INTEGRITY.md.
  if (opts.claimIds) {
    const encontrados = new Set(seleccionadas.map((c) => c.claim.id))
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
  if (retractadas.length) {
    const porMotivo = new Map<string, number>()
    for (const { motivo } of retractadas) porMotivo.set(motivo, (porMotivo.get(motivo) ?? 0) + 1)
    process.stdout.write(
      `[verify-nli] ${retractadas.length} no se proponen: ` +
        [...porMotivo].map(([m, n]) => `${n} ${m}`).join(' · ') +
        '\n',
    )
    if (opts.claimIds) {
      process.stdout.write(
        `[verify-nli]   retractadas: ${retractadas
          .slice(0, 8)
          .map((x) => x.id)
          .join(', ')}${retractadas.length > 8 ? ' …' : ''}\n`,
      )
    }
  }
  // Lo mismo que con una lista que no existe: se pidieron filas concretas y
  // todas las que existen las retractó el motor o un curador. La guarda de
  // «ninguna juzgada» de abajo no lo ve —sin filas elegibles no hay nada que
  // juzgar—, y salir 0 sería el «ya está» de la regla 2.
  if (opts.claimIds && candidates.length === 0 && retractadas.length > 0) {
    process.stderr.write(
      '[verify-nli] todas las filas pedidas que existen están retractadas: no hay nada que proponer\n',
    )
    process.exit(1)
  }

  // Cuentas por separado (regla 2): «el modelo no vio respaldo», «no tenía
  // candidatos que puntuar» y «sus puntuaciones no volvieron» no pueden
  // imprimirse igual. Y los pares: cuántos se mandaron y de cuántos se leyó
  // la puntuación.
  const stats = {
    propuestas: 0,
    sinRespaldo: 0,
    sinJuicio: 0,
    sinPuntuar: 0,
    contradictionFlags: 0,
    paresEnviados: 0,
    paresLeidos: 0,
  }
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
            id: idDelPar(it.claim.id, i),
            premise: c.snippet,
            hypothesis: it.claim.verbatim,
          }),
        )
      }
      stats.paresEnviados += pairs.length
      const globalScores = await scoreNliPairs(pairs, opts.model ? { model: opts.model } : {})

      // 3. Judge each claim; an upgrade becomes a suggestion for the human queue.
      const juzgadas: string[] = []
      const sugerencias: SugerenciaDeVeredicto[] = []
      for (const it of chunk) {
        const sl = shortlists.get(it.claim.id)!
        // El verificador pide cada par por su índice: la puntuación se busca
        // por el id global y se devuelve con el que pidió. Y se cuenta.
        let leidas = 0
        const lookup: NliScorer = async (ps) => {
          const m = new Map(
            ps.flatMap((p) => {
              const s = globalScores.get(idDelPar(it.claim.id, p.id))
              return s ? [[p.id, s] as const] : []
            }),
          )
          leidas = m.size
          return m
        }
        const r = await verifyClaimWithNli({ claim: it.claim, candidates: sl }, lookup)
        if (!r) {
          // Sin candidatos que puntuar (o fuera de la política): no se juzgó, y
          // su fila de la cola —si la tenía— se queda como estaba.
          stats.sinJuicio += 1
          continue
        }
        stats.paresLeidos += leidas
        if (leidas < sl.length) {
          // Le falta alguna puntuación: no se juzgó, y su fila de la cola se
          // queda como estaba.
          stats.sinPuntuar += 1
          continue
        }
        juzgadas.push(it.claim.id)
        if (r.nliContradictionFlag) {
          stats.contradictionFlags += 1
          flaggedIds.push(it.claim.id)
        }
        const s = sugerenciaDelAnclaje({
          r,
          desde: it.verification.verdict,
          fuente: fuenteDe(it.claim.id),
        })
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
          `sin-juicio=${stats.sinJuicio} sin-puntuar=${stats.sinPuntuar} ` +
          `contra-flags=${stats.contradictionFlags}\n`,
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
      `sin juicio ${stats.sinJuicio} · sin puntuar ${stats.sinPuntuar} · ` +
      `contra-flags ${stats.contradictionFlags} · ` +
      `retractadas, no se proponen ${retractadas.length}\n` +
      `[verify-nli]   puntuaciones leídas ${stats.paresLeidos} de ${stats.paresEnviados} ` +
      `pares enviados al modelo\n` +
      (escrita
        ? `[verify-nli]   cola → ${COLA_SUGERENCIAS_NLI} (${Object.keys(cola?.entries ?? {}).length} fila(s) en total)\n`
        : `[verify-nli]   cola sin escribir: ninguna fila se juzgó en esta corrida\n`) +
      `[verify-nli]   publicado: nada. Una subida la firma una persona; esta pasada sólo propone.\n`,
  )
  // Un par cuya puntuación no volvió no es «sin respaldo»: el modelo no contestó
  // por él, o contestó con otro id. Regla 2.
  if (stats.paresLeidos < stats.paresEnviados) {
    process.stderr.write(
      `[verify-nli] ${stats.paresEnviados - stats.paresLeidos} de ${stats.paresEnviados} par(es) ` +
        `sin puntuación leída: ${stats.sinPuntuar} fila(s) sin juzgar, con su fila de la cola ` +
        'como estaba. El modelo no devolvió esas puntuaciones, o las devolvió con otro id.\n',
    )
    process.exitCode = 1
  } else if (queue.length > 0 && juzgadasTotal === 0) {
    // Cero juzgadas con filas elegibles no es un día tranquilo: el modelo no
    // llegó a ver ninguna (sin candidatos, corpus ausente). Regla 2.
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
