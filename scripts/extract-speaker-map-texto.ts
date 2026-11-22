#!/usr/bin/env tsx
/**
 * El mapa de hablantes de un pleno sacado del TEXTO publicado, sin audio ni Gemini.
 *
 *   npx tsx scripts/extract-speaker-map-texto.ts <plenoId> [--out DIR] [--reemplazar]
 *        [--max-calls N] [--turnos pyannote.json] [--ventanas 0,3 --out DIR]
 *        [--crudo DIR]
 *   SPEAKER_MAP_BACKEND=texto npm run extract:speaker-map -- <plenoId>   (lo mismo)
 *
 * Escribe un mapa con la MISMA forma que el de Gemini, así que `alignSpeakerMap` y
 * `blocResolverFor` lo leen igual. El porqué y las puertas: `speaker-map-texto.ts`.
 *
 * ## Dónde escribe, y por qué no en `pleno-speaker-map/` por defecto
 *
 * `pleno-speaker-map/` es lo que el nocturno lee, añade y empuja, y un mapa
 * completo de cualquier camino pasa `isMapComplete`: Gemini no volvería a esa
 * sesión. Así que por defecto escribe en `.cache/speaker-map-texto/` (ignorado), y
 * sólo escribe en `pleno-speaker-map/` con `--out pleno-speaker-map`. Y aun así se
 * niega a pisar un mapa de otro backend o de otra versión del prompt sin
 * `--reemplazar`: cambiar de camino es una decisión, no un efecto secundario.
 *
 * ## Lo que no hace
 *
 * - No gasta: la config se fuerza (`configTexto`) a claude-code con `zeroCostOnly`.
 *   La cadena de respaldo NUNCA cae a un backend de pago.
 * - No corre en veda electoral (`frozenUntil` en `promises.json`): un camino de $0
 *   podría re-mapear todas las sesiones en una noche, y el mapa decide a qué
 *   bloque se atribuye una cita.
 * - No nombra etiquetas enteras: una prueba nombra el tramo que abre o cierra
 *   (`acotarATramos`), y una retro-referencia, que no tiene tramo, nunca avala —
 *   así que tampoco se adjudica.
 * - No sigue si `claude` no contesta al sondeo (`scripts/lib/claude-probe.sh`): las
 *   ventanas quedan como NUNCA INTENTADAS, con el motivo, no como «sin respuesta».
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  callLLMConProcedencia,
  getCircuitState,
  getRunStats,
  loadConfigFromEnv,
  type Procedencia,
} from '../src/llm/client'
import {
  seatsFromOfficials,
  type OfficialLike,
  type OfficialsDoc,
} from '../src/scraper/corporation-seats'
import { vedaActiva } from './lib/veda'
import { startRun, formatManifest } from '../src/scraper/run-manifest'
import { decideSnapshotWrite } from '../src/scraper/snapshot-write'
import {
  isUsableReference,
  referenceCoverage,
  speechSeconds,
  type FailedChunk,
  type RawSegment,
  type SpeakerCandidate,
  type SpeakerMap,
} from '../src/scraper/speaker-map'
import {
  acotarATramos,
  buildTextSpeakerMapPrompt,
  buildUserPromptVentana,
  candidatasDeRespuesta,
  configTexto,
  construirFilas,
  reetiquetarConTurnos,
  RespuestaTextoSchema,
  SEGUNDOS_MAXIMOS_DE_VENTANA,
  SEGUNDOS_POR_VENTANA,
  SPEAKER_MAP_TEXT_PROMPT_VERSION,
  ventanas,
  ventanasDemasiadoLargas,
  type Separacion,
  type Turno,
} from '../src/scraper/speaker-map-texto'
import { parseDiarizedTranscript } from '../src/scraper/voice-id'

const DIR_PUBLICABLE = resolve('pleno-speaker-map')
const DIR_POR_DEFECTO = resolve('.cache/speaker-map-texto')

interface Args {
  plenoId: string
  out: string
  outExplicito: boolean
  reemplazar: boolean
  maxCalls: number
  turnos: string | null
  soloVentanas: Set<number> | null
  crudo: string | null
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    plenoId: '',
    out: DIR_POR_DEFECTO,
    outExplicito: false,
    reemplazar: false,
    maxCalls: Infinity,
    turnos: null,
    soloVentanas: null,
    crudo: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]
    if (x === '--out') {
      a.out = resolve(argv[++i])
      a.outExplicito = true
    } else if (x === '--reemplazar') a.reemplazar = true
    else if (x === '--max-calls') a.maxCalls = Number(argv[++i])
    else if (x === '--turnos') a.turnos = resolve(argv[++i])
    else if (x === '--ventanas') a.soloVentanas = new Set(argv[++i].split(',').map(Number))
    else if (x === '--crudo') a.crudo = resolve(argv[++i])
    else if (x === '--no-adjudicar') continue
    // Banderas del camino Gemini que aquí no significan nada: se aceptan para que
    // el interruptor de entorno no rompa la llamada del nocturno.
    else if (x === '--chunks' || x === '--audio') i++
    else if (x === '--keep-audio' || x === '--restart') continue
    else if (!x.startsWith('--') && !a.plenoId) a.plenoId = x
    else {
      process.stderr.write(`[speaker-map-texto] bandera desconocida ${x}\n`)
      process.exit(2)
    }
  }
  return a
}

/** El sondeo del repo, que conserva el motivo. `null` si contestó. */
function sondearClaude(bin: string, modelo: string): string | null {
  if (process.env.SPEAKER_MAP_TEXTO_SONDEO === '0') return null
  const r = spawnSync(
    'bash',
    [
      '-c',
      '. scripts/lib/claude-probe.sh; if claude_probe "$1" "$2"; then exit 0; fi; printf %s "$CLAUDE_PROBE_MOTIVO"; exit 1',
      'sondeo',
      bin,
      modelo,
    ],
    { encoding: 'utf8' },
  )
  return r.status === 0 ? null : (r.stdout || r.stderr || `exit ${r.status}`).trim()
}

export async function mainTexto(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv)
  if (!args.plenoId) {
    process.stderr.write(
      'uso: extract-speaker-map-texto.ts <plenoId> [--out DIR] [--max-calls N]\n',
    )
    process.exit(2)
  }
  // Un mapa de unas pocas ventanas no es un mapa de la sesión: no puede caer donde
  // se leen los mapas de verdad.
  if (args.soloVentanas && !args.outExplicito) {
    process.stderr.write(
      '[speaker-map-texto] --ventanas exige --out (un mapa parcial no va al sitio de los completos)\n',
    )
    process.exit(2)
  }
  const config = configTexto(loadConfigFromEnv())
  const modelo = `claude-code:${config.claudeCodeModel}`
  const separacion: Separacion = args.turnos ? 'pyannote-sesion' : 'openai-diarize-por-trozo'
  const publicable = args.out === DIR_PUBLICABLE

  const runLog = startRun('extract-speaker-map', {
    // Modo propio: si compartiera manifiesto con Gemini, una pasada de texto
    // «superaría» los fallos de Gemini en `check:runs` y al revés.
    mode: publicable ? 'texto' : 'texto-medida',
    backend: 'claude-code',
    model: modelo,
    getStats: getRunStats,
  })

  try {
    // La regla compartida, que falla cerrado también con una fecha ilegible.
    const veda = vedaActiva()
    if (veda) {
      runLog.owe(1)
      runLog.attempt(1)
      runLog.neverAttempt(1)
      runLog.skip('loreg-freeze')
      process.stdout.write(`[speaker-map-texto] veda electoral hasta ${veda}: no se mapea nada\n`)
      return
    }

    const doc = JSON.parse(
      readFileSync(resolve('public/data/officials.json'), 'utf8'),
    ) as OfficialsDoc
    const officials = (doc.officials ?? []) as OfficialLike[]
    const seats = seatsFromOfficials(doc)

    const transcriptPath = resolve('public/data/pleno-transcripts', `${args.plenoId}.txt`)
    const published: RawSegment[] = existsSync(transcriptPath)
      ? parseDiarizedTranscript(readFileSync(transcriptPath, 'utf8'))
      : []
    // Lo mismo que el camino de audio: un fichero de acta con sellos 0.0 parsea a
    // cero líneas y no es una sesión sin hablantes, es una sesión sin transcribir.
    if (!isUsableReference(published)) {
      throw new Error(
        `no hay transcripción diarizada utilizable para ${args.plenoId} (${published.length} línea(s))`,
      )
    }
    let segments = published
    if (args.turnos) {
      const turnos = JSON.parse(readFileSync(args.turnos, 'utf8')) as Turno[]
      segments = reetiquetarConTurnos(published, turnos)
      const sinTurno = segments.filter((s) => s.speaker === 'UNKNOWN').length
      process.stdout.write(
        `[speaker-map-texto] pyannote: ${new Set(turnos.map((t) => t.speaker)).size} clúster(es) · ` +
          `${sinTurno}/${segments.length} línea(s) sin clúster mayoritario → UNKNOWN\n`,
      )
    }

    const todas = ventanas(segments, separacion)
    runLog.owe(todas.length)
    runLog.attempt(todas.length)
    // Una ventana por trozo más larga que un trozo es que el esquema de etiquetas
    // de aguas arriba cambió (PR #567 corta en silencios): mejor parar que mezclar.
    const largas =
      separacion === 'openai-diarize-por-trozo' ? ventanasDemasiadoLargas(segments, todas) : []
    if (largas.length) {
      throw new Error(
        `${largas.length} ventana(s) de más de ${SEGUNDOS_MAXIMOS_DE_VENTANA} s (${largas.map((v) => v.indice).join(', ')}): ` +
          `las etiquetas ya no marcan trozos de 1200 s`,
      )
    }
    const fueraDePlan = todas.filter((v) => args.soloVentanas && !args.soloVentanas.has(v.indice))
    const plan = todas.filter((v) => !fueraDePlan.includes(v))
    const failedChunks: FailedChunk[] = fueraDePlan.map((v) => ({
      chunk: v.indice,
      why: 'never attempted (--ventanas)',
    }))
    if (fueraDePlan.length) {
      runLog.neverAttempt(fueraDePlan.length)
      runLog.skip('excluded-by-flag', fueraDePlan.length)
    }
    process.stdout.write(
      `[speaker-map-texto] ${args.plenoId} · ${segments.length} línea(s) · ${todas.length} ventana(s) · ` +
        `${plan.length} a pedir · ${modelo} · ${separacion} · techo ${args.maxCalls === Infinity ? '—' : args.maxCalls} llamada(s)\n`,
    )

    const motivo = sondearClaude(config.claudeCodeBin, config.claudeCodeModel)
    if (motivo) {
      runLog.neverAttempt(plan.length)
      runLog.skip(`claude-no-responde`, plan.length)
      process.stdout.write(
        `[speaker-map-texto] claude no contesta al sondeo: ${motivo}\n  nada intentado; no se escribe nada\n`,
      )
      process.exitCode = 1
      return
    }

    const system = buildTextSpeakerMapPrompt()
    const candidatas: SpeakerCandidate[] = []
    const respondidas = new Set<number>()
    const procedencias: Array<Procedencia & { ventana: number; segundos: number }> = []
    if (args.crudo) mkdirSync(args.crudo, { recursive: true })

    for (const [k, v] of plan.entries()) {
      // Antes de gastar, no después: lo que no cabe es NUNCA INTENTADO, con su causa.
      const parar =
        getRunStats().calls >= args.maxCalls
          ? 'call-budget-spent'
          : getCircuitState()?.tripped
            ? 'circuit-open'
            : null
      if (parar) {
        const resto = plan.slice(k)
        runLog.neverAttempt(resto.length)
        runLog.skip(parar, resto.length)
        for (const r of resto)
          failedChunks.push({ chunk: r.indice, why: `never attempted (${parar})` })
        process.stdout.write(
          `[speaker-map-texto] ${parar}: ${resto.length} ventana(s) sin intentar\n`,
        )
        break
      }
      const userPrompt = buildUserPromptVentana(segments, v)
      const t0 = Date.now()
      process.stdout.write(`[speaker-map-texto]   ventana ${v.indice + 1}/${todas.length}… `)
      let r: { result: { hablantes: string } | null; procedencia: Procedencia | null }
      try {
        r = await callLLMConProcedencia({
          systemPrompt: system,
          userPrompt,
          promptVersion: SPEAKER_MAP_TEXT_PROMPT_VERSION,
          schema: RespuestaTextoSchema,
          input: { plenoId: args.plenoId, separacion, userPrompt },
          config,
        })
      } catch (err) {
        r = { result: null, procedencia: null }
        process.stdout.write(`error: ${err instanceof Error ? err.message : err} · `)
      }
      const segundos = (Date.now() - t0) / 1000
      if (!r.result) {
        // Sin respuesta no es «nadie identificado». Va como hueco, con su motivo.
        // Sin cuenta de noches para darla por perdida: este camino no tiene cuota
        // diaria y la siguiente pasada vuelve a pedirla.
        failedChunks.push({ chunk: v.indice, why: 'no-model-answer (claude-code)', attempts: 1 })
        runLog.skip('no-model-answer')
        process.stdout.write(`SIN RESPUESTA (${segundos.toFixed(0)} s)\n`)
        continue
      }
      respondidas.add(v.indice)
      runLog.judge()
      if (r.procedencia) procedencias.push({ ...r.procedencia, ventana: v.indice, segundos })
      if (args.crudo) {
        writeFileSync(join(args.crudo, `${args.plenoId}-v${v.indice}.txt`), r.result.hablantes)
      }
      const cs = candidatasDeRespuesta(r.result.hablantes)
      candidatas.push(...cs)
      process.stdout.write(
        `${cs.length} candidata(s) · ${segundos.toFixed(0)} s${r.procedencia?.deCache ? ' (caché)' : ''}\n`,
      )
    }

    const filas = construirFilas({ candidatas, segments, separacion, officials, seats })
    // Una prueba nombra el TRAMO que abre o cierra, nunca la etiqueta entera; ver
    // `acotarATramos`. Sin adjudicación de retro-referencias: en este camino no
    // tienen tramo y nunca avalan, así que preguntar por ellas sería gastar.
    const acotado = acotarATramos(filas.rows, segments)
    const rows = acotado.rows
    const rechazos = [...filas.rejected, ...acotado.rejected]

    const enRespondidas = new Set(
      todas
        .filter((v) => respondidas.has(v.indice))
        .flatMap((v) => segments.slice(v.desde, v.hasta)),
    )
    const total = segments[segments.length - 1].end
    const segundosDeModelo = procedencias.reduce((a, p) => a + p.segundos, 0)
    const tally: Record<string, number> = {}
    for (const r of rechazos) tally[r.reason] = (tally[r.reason] ?? 0) + 1

    const map: SpeakerMap & Record<string, unknown> = {
      plenoId: args.plenoId,
      generatedAt: new Date().toISOString(),
      model: modelo,
      promptVersion: SPEAKER_MAP_TEXT_PROMPT_VERSION,
      backend: 'claude-code',
      separacion,
      // No hay trozos de audio: es el tope de una ventana. Un mapa de Gemini se
      // reanuda sólo si coincide con su propio 600, así que nunca se confunden.
      chunkSeconds: SEGUNDOS_POR_VENTANA,
      segments: acotado.segments,
      rows,
      rejected: rechazos,
      procedencias,
      stats: {
        chunksExpected: todas.length,
        chunksTranscribed: respondidas.size,
        failedChunks,
        labelsSeen: new Set(segments.map((s) => s.speaker)).size,
        tramosNombrados: rows.filter((r) => !r.weak).length,
        rowsAccepted: rows.length,
        rowsRejected: rechazos.length,
        rejectedBy: tally,
        attemptedThisRun: plan.length,
        apiCalls: getRunStats().calls,
        // Parte del HABLA publicada que cae en ventanas con respuesta. No mide
        // ninguna transcripción contra otra (aquí la transcripción ES la
        // publicada): mide cuánto de la sesión miró el modelo.
        coverage: referenceCoverage([...enRespondidas], published, 0, total),
        reubicadas: filas.reubicadas,
        segundosDeModelo,
      } as SpeakerMap['stats'],
    }

    mkdirSync(args.out, { recursive: true })
    const out = join(args.out, `${args.plenoId}.json`)
    if (respondidas.size === 0) {
      process.stdout.write(`[speaker-map-texto] NO SE ESCRIBE ${out}: ninguna ventana respondió\n`)
      process.exitCode = 1
      return
    }
    const existente = existsSync(out) ? readFileSync(out, 'utf8') : null
    if (existente && !args.reemplazar) {
      let previo: { model?: string; promptVersion?: string } = {}
      try {
        previo = JSON.parse(existente)
      } catch {
        /* ilegible: cuenta como distinto */
      }
      if (previo.model !== modelo || previo.promptVersion !== SPEAKER_MAP_TEXT_PROMPT_VERSION) {
        process.stdout.write(
          `[speaker-map-texto] NO SE ESCRIBE ${out}: ya hay un mapa de ${previo.model ?? '¿?'} / ` +
            `${previo.promptVersion ?? '¿?'}. Cambiar de camino es una decisión: --reemplazar.\n`,
        )
        process.exitCode = 1
        return
      }
    }
    let previoFilas: string | null = null
    try {
      previoFilas = existente ? JSON.stringify({ items: JSON.parse(existente).rows ?? [] }) : null
    } catch {
      previoFilas = null
    }
    const d = decideSnapshotWrite({
      incomingCount: rows.length,
      unresolvedCount: failedChunks.length,
      existingRaw: previoFilas,
      itemNoun: 'speaker row',
    })
    if (!d.write) {
      process.stdout.write(`[speaker-map-texto] NO SE ESCRIBE ${out}: ${d.reason}\n`)
      process.exitCode = 1
      return
    }
    writeFileSync(`${out}.tmp`, JSON.stringify(map, null, 2) + '\n')
    renameSync(`${out}.tmp`, out)
    process.stdout.write(
      `\n[speaker-map-texto] ${out}\n` +
        `  ventanas      ${respondidas.size}/${todas.length} con respuesta` +
        `${failedChunks.length ? ` · ${failedChunks.length} hueco(s): ${failedChunks.map((f) => f.chunk).join(', ')}` : ''}\n` +
        `  habla         ${Math.round(speechSeconds(published, 0, total))} s publicados · ${(map.stats.coverage * 100).toFixed(1)}% en ventanas con respuesta\n` +
        `  candidatas    ${candidatas.length} · ${filas.reubicadas} cita(s) reubicada(s)\n` +
        `  filas         ${rows.length} (${rows.filter((r) => r.weak).length} débiles, ${rows.filter((r) => r.namesIndividual).length} nombran a una persona)\n` +
        `  rechazadas    ${rechazos.length} ${JSON.stringify(tally)}\n` +
        `  modelo        ${getRunStats().calls} llamada(s) · ${getRunStats().cacheHits} de caché · ${segundosDeModelo.toFixed(0)} s de reloj en ventanas\n`,
    )
  } catch (err) {
    process.exitCode = 1
    runLog.skip('unclassified-error')
    throw err
  } finally {
    const { manifest, findings } = runLog.finish({
      exitCode: typeof process.exitCode === 'number' ? process.exitCode : 0,
    })
    process.stdout.write(`\n${formatManifest(manifest)}\n`)
    for (const f of findings)
      process.stdout.write(`  ${f.level.toUpperCase()} [${f.code}] ${f.message}\n`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mainTexto().catch((err) => {
    process.stderr.write(`[speaker-map-texto] FALLÓ: ${err instanceof Error ? err.message : err}\n`)
    process.exit(1)
  })
}
