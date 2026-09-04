#!/usr/bin/env tsx
/**
 * reanchor-claim — corrige el LITERAL de una declaración extraída, para volver a
 * anclarla en las palabras que constan en el acta.
 *
 *   npm run reanchor-claim -- <claimId> --verbatim "<lo que dice el acta>" \
 *       --reason "<≥20 caracteres>" [--editor "<nombre>"]
 *   npm run reanchor-claim -- <claimId> --verbatim "…" --dry-run
 *
 * Hermano de `reclassify-claim`: aquél es dueño del TIPO, éste del `verbatim`, y
 * los dos escriben en su sidecar y no en la base. El porqué del estrato está en
 * la cabecera de `src/scraper/verified-merge.ts`; lo que este fichero añade es
 * la única comprobación que necesita el disco, y es justo la que importa:
 *
 *   EL LITERAL NUEVO TIENE QUE CONSTAR ENTERO EN UNA TRANSCRIPCIÓN DE ESA SESIÓN.
 *
 * Entero, y con `quoteCoverage` en vez de `quoteAppearsIn`, que es el
 * emparejador de la casa para la otra pregunta. La diferencia no es un detalle:
 * `quoteAppearsIn` desliza una ventana de ocho palabras y le basta con que UNA
 * encaje, porque su pregunta es «¿tiene esto procedencia?» y tiene que tolerar
 * que un curador recorte el arranque. La de aquí es «¿son ESTAS las palabras?»,
 * y con la ventana de ocho se podría anclar una cita soldada de dos pasajes —el
 * defecto exacto que dos de las siete retenidas ya tienen. Cobertura 1,0 exige
 * que el literal aparezca seguido, así que este CLI no puede fabricar la avería
 * que existe para reparar.
 *
 * Y la dirección, que es lo que lo mantiene honesto: sólo reancla lo que HOY no
 * consta en ninguna parte. Sobre una cita que ya tiene procedencia no se puede
 * usar — para ésas no hay nada que recuperar y sí una cita publicada que
 * cambiaría de palabras.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  applyReanchorEntries,
  retencionLexica,
  RETENCION_MINIMA,
} from '../src/scraper/verified-merge'
import { quoteAppearsIn, quoteCoverage } from '../src/scraper/quote-match'
import { archivosDe } from '../src/scraper/superseded-archive'
import { TRANSCRIPTS_DIR, SUPERSEDED_DIR } from './lib/transcript-corpus'
import { loadReanchors, rebuildVerified, REANCHORS, VERIFIED } from './verified-rebuild'
import { readdirSync } from 'node:fs'

interface Publicado {
  claim: {
    id: string
    plenoId: string
    verbatim: string
    speakerGroup: string | null
    type: string
  }
}

/** Los textos de una sesión, con el NOMBRE de cada uno para poder citarlo. */
function textosDe(plenoId: string): Array<{ fuente: string; texto: string }> {
  const out: Array<{ fuente: string; texto: string }> = []
  const vigente = resolve(TRANSCRIPTS_DIR, `${plenoId}.txt`)
  if (existsSync(vigente)) out.push({ fuente: 'current', texto: readFileSync(vigente, 'utf8') })
  if (!existsSync(SUPERSEDED_DIR)) return out
  for (const nombre of archivosDe(readdirSync(SUPERSEDED_DIR), plenoId)) {
    out.push({
      fuente: `superseded/${nombre}`,
      texto: readFileSync(resolve(SUPERSEDED_DIR, nombre), 'utf8'),
    })
  }
  return out
}

function parse(argv: string[]) {
  const pos: string[] = []
  let verbatim = ''
  let reason = ''
  let editor = 'curator'
  let dryRun = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--verbatim') verbatim = argv[++i]
    else if (argv[i] === '--reason') reason = argv[++i]
    else if (argv[i] === '--editor') editor = argv[++i]
    else if (argv[i] === '--dry-run') dryRun = true
    else pos.push(argv[i])
  }
  return { claimId: pos[0], verbatim, reason, editor, dryRun }
}

function main() {
  const { claimId, verbatim, reason, editor, dryRun } = parse(process.argv.slice(2))
  if (!claimId || !verbatim) {
    process.stderr.write(
      'usage: npm run reanchor-claim -- <claimId> --verbatim "<literal del acta>" \\\n' +
        '         --reason "<≥20 caracteres>" [--editor nombre] [--dry-run]\n\n' +
        '  Los candidatos los propone `npm run triage:claim-reanchor`.\n',
    )
    process.exit(2)
  }
  if (!existsSync(VERIFIED)) {
    process.stderr.write(`[reanchor] falta ${VERIFIED} — corre verify:pleno-claims primero\n`)
    process.exit(1)
  }

  const snap = JSON.parse(readFileSync(VERIFIED, 'utf8')) as { items: Publicado[] }
  const item = snap.items.find((it) => it.claim.id === claimId)
  if (!item) {
    process.stderr.write(`[reanchor] ${claimId} no está en el corpus publicado\n`)
    process.exit(1)
  }

  const textos = textosDe(item.claim.plenoId)
  if (textos.length === 0) {
    process.stderr.write(
      `[reanchor] ${claimId}: no hay ninguna transcripción de ${item.claim.plenoId} en disco. ` +
        'Sin acta no se puede anclar nada, y eso no es lo mismo que no encontrarlo.\n',
    )
    process.exit(1)
  }

  // La dirección. Este CLI recupera procedencia; no reescribe citas que ya la
  // tienen. Se pregunta con el emparejador de la casa, el mismo que usan la
  // comprobación y la puerta de publicación, para que las tres coincidan sobre
  // qué está afectado.
  const yaConsta = textos.find((t) => quoteAppearsIn(item.claim.verbatim, t.texto))
  if (yaConsta) {
    process.stderr.write(
      `[reanchor] ${claimId}: su literal YA consta en ${yaConsta.fuente}. Este CLI sólo reancla lo ` +
        'que no aparece en ninguna transcripción; sobre una cita con procedencia no hay nada que ' +
        'recuperar y sí una cita publicada que cambiaría de palabras.\n',
    )
    process.exit(1)
  }

  // Y el destino: entero y seguido, en alguna de las versiones.
  const conCobertura = textos
    .map((t) => ({ ...t, cobertura: quoteCoverage(verbatim, t.texto) }))
    .sort((a, b) => b.cobertura - a.cobertura)
  const destino = conCobertura[0]
  if (destino.cobertura < 1) {
    process.stderr.write(
      `[reanchor] ${claimId}: el literal propuesto no consta SEGUIDO en ninguna transcripción de ` +
        `${item.claim.plenoId}.\n` +
        conCobertura
          .map((t) => `    ${(t.cobertura * 100).toFixed(0).padStart(3)} %  ${t.fuente}\n`)
          .join('') +
        '  Un reanclaje ancla en palabras que constan. Copia el pasaje del acta tal cual —los\n' +
        '  candidatos los propone `npm run triage:claim-reanchor`.\n',
    )
    process.exit(1)
  }

  const retenido = retencionLexica(item.claim.verbatim, verbatim)
  process.stdout.write(
    `[reanchor] ${claimId} · ${item.claim.type}\n` +
      `    publicado  «${item.claim.verbatim}»\n` +
      `    acta       «${verbatim}»  (${destino.fuente})\n` +
      `    retención  ${(retenido * 100).toFixed(0)} % de las palabras con contenido ` +
      `(mínimo ${RETENCION_MINIMA * 100} %)\n`,
  )
  if (dryRun) {
    process.stdout.write('[reanchor] --dry-run: no se ha escrito nada\n')
    return
  }
  if (!reason || reason.trim().length < 20) {
    process.stderr.write('[reanchor] falta --reason de al menos 20 caracteres\n')
    process.exit(1)
  }

  let reanclajes = loadReanchors()
  try {
    reanclajes = applyReanchorEntries(
      reanclajes,
      [{ claimId, verbatim, fuente: destino.fuente, reason, editor }],
      new Date().toISOString(),
      new Map([
        [claimId, { verbatim: item.claim.verbatim, speakerGroup: item.claim.speakerGroup ?? null }],
      ]),
    )
  } catch (err) {
    process.stderr.write(`[reanchor] rechazado: ${(err as Error).message}\n`)
    process.exit(1)
  }
  writeFileSync(REANCHORS, JSON.stringify(reanclajes, null, 2) + '\n')

  rebuildVerified()
    .then((r) => {
      process.stdout.write(
        `[reanchor] escrito (curador: ${editor}) · ${r.reanchorApplied} reanclaje(s) aplicados · ` +
          'sidecar + verified.json + chunks al día\n',
      )
    })
    .catch((err) => {
      process.stderr.write(
        `[reanchor] sidecar escrito pero el rebuild FALLÓ: ${(err as Error).message}\n`,
      )
      process.exit(1)
    })
}

main()
