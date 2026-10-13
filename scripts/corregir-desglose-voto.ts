#!/usr/bin/env tsx
/**
 * CLI de curador: CORREGIR el desglose por grupos de una votación publicada,
 * dejando constancia firmada en `corrections[]` de public/data/pleno-votes.json.
 *
 *   npm run corregir-voto -- <voteId> \
 *     --votos "PSOE:a_favor:11,EU-Podem:a_favor:1,Compromís:a_favor:1,PP:en_contra:7,VOX:abstencion:1" \
 *     --fuente <url del acta> \
 *     --reason "<≥20 caracteres>" --editor "<nombre>" [--dry-run]
 *
 * POR QUÉ EXISTE. El 13-10-2026, con el acta de la sesión del 09-02 en la mano,
 * rx4hb4-10 y rx4hb4-11 publicaban el voto de PP y VOX al revés. No había vía
 * para corregirlo con rastro: `npm run pleno-vote` sustituía la fila en
 * silencio (ahora se niega y remite aquí) y `retract-vote --breakdown` seguido
 * de `--unretract` devuelve el desglose VIEJO. Esta orden sustituye el desglose
 * y su fuente, y anota en el libro lo que se publicaba antes, quién lo cambió y
 * por qué. El resultado de la votación y su fuente no se tocan.
 *
 * Es nivel C: nombra cómo votaron grupos con nombre —y uno de un solo escaño
 * nombra a su concejal—, así que la ejecuta y la firma un curador, nunca un
 * proceso. `--editor` tiene que nombrar a una PERSONA: rechaza, antes de leer
 * nada, la cuenta de rol, un identificador y el hueco de una orden preparada sin
 * rellenar (`rechazoDeFirma`, src/scraper/firma-de-persona.ts), como las demás
 * correcciones de afirmaciones publicadas.
 *
 * `--votos`: tuplas `<grupo>:<sentido>[:<escaños>]` separadas por comas. Para un
 * voto que el acta recoge sin decir de qué grupo es, `null` o `sin-identificar`.
 *
 * `--fuente`: la url del documento que publica el desglose. Su clase la decide
 * `voteSourceKindForUrl`, nunca quien teclea: una url que no sabe clasificar se
 * rechaza, y una que no publica desglose (el portal de regmeet) también.
 *
 * leer → validateSnapshot → mutar (pura) → revalidar la instantánea ENTERA → escribir.
 * `--dry-run` enseña el desglose viejo y el nuevo, uno al lado del otro, y no escribe.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { rechazoDeFirma } from '../src/scraper/firma-de-persona'
import {
  correctVoteBreakdown,
  validateSnapshot,
  voteSourceKindForUrl,
  ALLOWED_BLOCS,
  ALLOWED_DIRECTIONS,
  RETRACTION_REASON_MIN,
  type PlenoVotesSnapshot,
  type VoteBloc,
  type VoteByBloc,
  type VoteDirection,
  type VoteSourceRef,
} from '../src/scraper/pleno-votes'
import { rechazarOpcionesDesconocidas } from '../src/scraper/opciones-cli'

const DATA_PATH = resolve('public/data/pleno-votes.json')
const PUBLICADOR = 'Ayuntamiento de Riba-roja de Túria'
/** Las dos grafías de «el acta no dice de qué grupo», como en `pleno-vote`. */
const SIN_GRUPO = new Set(['null', 'sin-identificar'])

function getFlag(name: string): string | null {
  const i = process.argv.indexOf(name)
  if (i < 0) return null
  return process.argv[i + 1] ?? null
}

function bail(msg: string, code = 2): never {
  process.stderr.write(`[corregir-voto] ${msg}\n`)
  process.exit(code)
}

function usage(): never {
  process.stderr.write(
    'Uso:\n' +
      '  npm run corregir-voto -- <voteId> \\\n' +
      '    --votos "PSOE:a_favor:11,PP:en_contra:7,…" \\\n' +
      '    --fuente <url del acta> \\\n' +
      `    --reason "<≥${RETRACTION_REASON_MIN} caracteres>" --editor "<nombre>" [--dry-run]\n\n` +
      `Grupos:   ${ALLOWED_BLOCS.join(', ')}; ${[...SIN_GRUPO].join(' / ')} si el acta no lo dice\n` +
      `Sentidos: ${ALLOWED_DIRECTIONS.join(', ')}\n`,
  )
  process.exit(1)
}

/** Sólo traduce la grafía de la terminal; las reglas las aplica `validateSnapshot`. */
function parseVotos(spec: string): VoteByBloc[] {
  return spec.split(',').map((tramo) => {
    const [bloc, direction, seats, ...sobra] = tramo.split(':').map((s) => s.trim())
    if (!bloc || !direction || sobra.length > 0) {
      bail(`tupla mal formada "${tramo}" (se espera "<grupo>:<sentido>[:<escaños>]")`)
    }
    if (!SIN_GRUPO.has(bloc) && !(ALLOWED_BLOCS as readonly string[]).includes(bloc)) {
      bail(`grupo desconocido "${bloc}" (admitidos: ${ALLOWED_BLOCS.join(', ')})`)
    }
    if (!(ALLOWED_DIRECTIONS as readonly string[]).includes(direction)) {
      bail(`sentido desconocido "${direction}" (admitidos: ${ALLOWED_DIRECTIONS.join(', ')})`)
    }
    let escanos: number | undefined
    if (seats !== undefined && seats !== '') {
      escanos = Number(seats)
      if (!Number.isInteger(escanos) || escanos < 0) bail(`escaños no válidos en "${tramo}"`)
    }
    return {
      bloc: SIN_GRUPO.has(bloc) ? null : (bloc as VoteBloc),
      direction: direction as VoteDirection,
      ...(escanos !== undefined ? { seats: escanos } : {}),
    }
  })
}

/** Una línea por grupo: lo publicado y lo que lo sustituye, uno al lado del otro. */
function comparar(antes: VoteByBloc[], despues: VoteByBloc[]): string {
  const nombre = (b: VoteBloc | null) => b ?? '(sin grupo)'
  const texto = (v: VoteByBloc | undefined) =>
    v ? `${v.direction}${v.seats !== undefined ? ` (${v.seats})` : ''}` : '—'
  const grupos = [...new Set([...antes, ...despues].map((v) => v.bloc))]
  const ancho = Math.max(...grupos.map((g) => nombre(g).length))
  return grupos
    .map((g) => {
      const a = antes.find((v) => v.bloc === g)
      const d = despues.find((v) => v.bloc === g)
      const marca = texto(a) === texto(d) ? ' ' : '*'
      return `  ${marca} ${nombre(g).padEnd(ancho)}  ${texto(a)}  →  ${texto(d)}`
    })
    .join('\n')
}

function main() {
  // Antes de leer nada: una opción que este CLI no conoce no se ignora
  // (src/scraper/opciones-cli.ts).
  rechazarOpcionesDesconocidas('corregir-voto', {
    banderas: ['--dry-run'],
    conValor: ['--votos', '--fuente', '--reason', '--editor'],
  })
  const voteId = process.argv[2]
  if (!voteId || voteId.startsWith('--')) usage()

  const votosSpec = getFlag('--votos')
  const fuente = getFlag('--fuente')
  const reason = getFlag('--reason')
  const editor = getFlag('--editor')
  const dryRun = process.argv.includes('--dry-run')
  if (!votosSpec || !fuente || !reason || !editor) usage()

  if (reason.trim().length < RETRACTION_REASON_MIN) {
    bail(
      `--reason debe tener ≥${RETRACTION_REASON_MIN} caracteres (tiene ${reason.trim().length}). ` +
        `Es una corrección pública de cómo votaron grupos con nombre.`,
    )
  }
  // Nivel C: el desglose de un grupo de un escaño nombra a su concejal, así que
  // firma una persona, nunca la cuenta de rol.
  const firma = rechazoDeFirma(editor)
  if (firma) bail(`--editor: ${firma}`, 1)

  const kind = voteSourceKindForUrl(fuente)
  if (kind == null) {
    bail(
      `--fuente "${fuente}": no se reconoce qué clase de documento es, y adivinarlo es ` +
        `como un desglose acaba citado a algo que no lo publica. Cita el acta.`,
    )
  }
  const votes = parseVotos(votosSpec)
  const breakdownSource: VoteSourceRef = {
    kind,
    url: fuente,
    publisher: PUBLICADOR,
    retrievedAt: new Date().toISOString().slice(0, 10),
    verification: 'sin-verificar',
  }

  if (!existsSync(DATA_PATH)) bail(`${DATA_PATH} no existe`)
  let snap: PlenoVotesSnapshot
  try {
    // Nunca se escribe encima de una instantánea rota.
    snap = validateSnapshot(JSON.parse(readFileSync(DATA_PATH, 'utf8')))
  } catch (err) {
    bail(`la instantánea actual no valida: ${(err as Error).message}`)
  }

  const antes = snap.items.find((v) => v.id === voteId)
  let next: PlenoVotesSnapshot
  try {
    next = correctVoteBreakdown(
      snap,
      voteId,
      { votes, breakdownSource },
      { reason, editor, at: new Date().toISOString() },
    )
  } catch (err) {
    bail((err as Error).message)
  }

  // Se revalida la instantánea ENTERA: ahí viven la guarda del libro de
  // correcciones y la pareja desglose/fuente.
  let validated: PlenoVotesSnapshot
  try {
    validated = validateSnapshot({ ...next, generatedAt: new Date().toISOString() })
  } catch (err) {
    bail(`no se escribe — la instantánea quedaría inválida: ${(err as Error).message}`, 1)
  }
  const despues = validated.items.find((v) => v.id === voteId)!

  process.stdout.write(
    `[corregir-voto] ${voteId}\n` +
      comparar(antes!.votes, despues.votes) +
      '\n' +
      `  fuente del desglose: ${antes!.provenance?.breakdown?.url ?? '—'}\n` +
      `                    → ${despues.provenance?.breakdown?.url ?? '—'} (${kind})\n` +
      `  resultado:           ${despues.outcome} (no se toca)\n` +
      `  correcciones de ${voteId}: ${validated.corrections.filter((c) => c.voteId === voteId).length}\n` +
      `  editor:              ${editor}\n`,
  )

  if (dryRun) {
    process.stdout.write('[corregir-voto] --dry-run: no se ha escrito nada\n')
    return
  }
  writeFileSync(DATA_PATH, JSON.stringify(validated, null, 2) + '\n', 'utf8')
  process.stdout.write(`[corregir-voto] escrito ${DATA_PATH}\n`)
}

main()
