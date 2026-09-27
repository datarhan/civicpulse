/**
 * Destroying something git cannot bring back.
 *
 * Every other safety net in this repo is `git checkout`. The fault-injection
 * harness restores with it, the curated-write guard assumes it, and a bad edit
 * is one command from undone. None of that reaches a gitignored store — there
 * the usual net is simply absent, and nothing said so out loud.
 *
 * ## The incident this encodes (2026-08-03)
 *
 * `check:contract-drift` found that `/aviso-legal` did not disclose three
 * enrolled voiceprints — biometric data about three named councillors. Deciding
 * what to do, I reported them as "unused by any pipeline". That was true and
 * misleading: I had checked the AUTOMATED wiring (`WHISPER_IDENTIFY` defaults
 * to 0, no cron sets it) and concluded "unused", when voice-id is a documented
 * MANUAL step in `docs/TRANSCRIPTION.md` that the operator actually runs. The
 * operator chose deletion on the strength of my summary, and three voiceprints
 * were gone — from a directory git had never tracked.
 *
 * They were recoverable only by luck: `delete-voiceprint` deliberately keeps
 * the source audio, so the embeddings could be recomputed. Had that cache been
 * cleared first, "re-enroll" would have meant re-downloading Instagram reels
 * whose URLs lived in the index file the deletion had just emptied.
 *
 * ## What this hook is actually for
 *
 * Not "deleting is bad". It is a speed bump on exactly the class of action
 * where being wrong is permanent, carrying the one question that would have
 * caught the mistake: **who uses this, including by hand?** Grep the docs and
 * the npm scripts, not just the crons. "No automation references it" is not
 * "nothing uses it".
 *
 * `ask`, never `deny`: these are all legitimate operations. The point is that
 * the operator sees the stakes before, not after.
 */
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { inicioDeOrden, nombreDe, ordenes, subordenGit } from './shell-tokens.mjs'

/**
 * Local stores git does not track, and what is lost with each.
 *
 * Verified against `git check-ignore` on 2026-08-03, and again on 2026-09-27,
 * when two things had changed. `editorial/` joined: since the drafts were
 * untracked on 2026-09-25 (`check:editorial` now refuses to commit anything
 * under it), it holds the only copy of the journalist drafts and investigation
 * dossiers. And `.review-cache.json` left: its own row said the recovery was
 * automatic — a lost cache means more review, not less — and replayed over the
 * transcripts it was five of this hook's nine questions, every one a session
 * clearing it on purpose to force a re-read. A speed bump on something that
 * heals itself trains the approver to approve the next one unread.
 *
 * Tracked files are deliberately absent — `.automation-measurements.json` and
 * the various baselines are committed, so git already covers them.
 */
export const IRREPLACEABLE = {
  '.voiceprints': {
    what: 'huellas de voz (dato biométrico) de concejales, + el audio de origen',
    recovery:
      're-enrolar desde .voiceprints/audio/ si sigue ahí; si no, hay que volver a\n' +
      '  descargar el audio público original — y los sourceUrl viven en el propio\n' +
      '  index.json que el borrado vacía.',
    users:
      'npm run identify-pleno-speakers (paso MANUAL, docs/TRANSCRIPTION.md)\n  y transcribe-pleno.sh con WHISPER_IDENTIFY=1',
  },
  '.run-manifests': {
    what: 'los manifiestos que prueban que cada pasada hizo trabajo de verdad',
    recovery: 'ninguna — se pierde el histórico de «¿hizo algo esta ejecución?»',
    users: 'npm run check:runs',
  },
  '.llm-cache': {
    what: 'respuestas de modelo direccionadas por contenido, con su telemetría',
    recovery: 'volver a pagarlas (o re-gastar cuota) llamada por llamada',
    users: 'todo lo que pasa por src/llm/client.ts',
  },
  editorial: {
    what:
      'borradores del agente periodista, dossiers de investigación (con capturas\n' +
      '  de prensa que no se pueden volver a bajar), colas de curaduría y borradores\n' +
      '  de solicitudes de acceso',
    recovery:
      'ninguna para lo capturado a mano o ya revisado; un borrador del agente se\n' +
      '  regenera con otro journalist:run (15–40 min, y no sale igual). No hay copia\n' +
      '  en git desde el 25-09-2026: check:editorial impide comitearlo.',
    users:
      'promote-report y check:citations -- --draft (leen el borrador por ruta),\n' +
      '  journalist:run --seed, journalist:entorno, npm run solicitud -- borrador,\n' +
      '  las habilidades revisar-borrador e investigar-cargo',
  },
  // Not the whole of `.cache/`: most of it re-downloads in seconds, and its
  // speaker-map audio re-downloads itself. These two do not.
  '.cache/borme': {
    what: 'las secciones del BORME de la provincia, barridas día a día desde 2009',
    recovery: 'volver a barrer al ritmo de cortesía del BOE: horas',
    users: 'scrape:borme --persona, journalist:entorno, la habilidad investigar-cargo',
  },
  '.cache/cesel': {
    what: 'las entregas CESEL y CONPREL descargadas, con los ficheros por comunidad autónoma',
    recovery:
      'los de .cache/cesel/ccaa, uno a uno con un navegador: el servidor no se los\n' +
      '  sirve a curl ni a un navegador sin cabeza (scripts/fetch-cesel-ccaa.ts)',
    users: 'compute/check:coste-esperado, scrape:coste-efectivo, indicador-registry',
  },
  '.embed-cache': {
    what: 'los embeddings del corpus del agente periodista y del verificador',
    recovery:
      'reconstruirlos pagando la API de OpenAI (embed:agent-corpus,\n' +
      '  embed:verifier-corpus); con gemini salen peores',
    users: 'journalist:run (recuperación semántica), el verificador, check:retrieval',
  },
}

/** Órdenes que borran o vacían sus operandos. */
const BORRAN = new Set(['rm', 'rmdir', 'shred', 'trash', 'unlink', 'truncate', 'srm'])

function reasonFor(key, extra) {
  const e = IRREPLACEABLE[key]
  return (
    `\`${key}\` is NOT tracked by git — this cannot be undone with \`git checkout\`.\n\n` +
    `Contiene: ${e.what}\n` +
    `Lo usa:   ${e.users}\n` +
    `Recuperación: ${e.recovery}\n\n` +
    (extra ? `${extra}\n\n` : '') +
    `Antes de aprobar, contesta a esto: **¿quién lo usa, incluido a mano?**\n` +
    `El 03-08-2026 se borraron tres huellas de voz porque se comprobó solo el\n` +
    `cableado automático (WHISPER_IDENTIFY=0, ningún cron) y se concluyó «no se\n` +
    `usa» — siendo un paso manual documentado que el operador sí ejecuta.\n` +
    `«Ninguna automatización lo referencia» NO es «nada lo usa»: mira también\n` +
    `docs/ y los scripts de package.json.`
  )
}

/**
 * The same facts, for the model. An `ask` reason reaches only the person
 * approving; on 2026-08-03 it was the model that concluded «unused», so the
 * model has to see what the store is and who uses it too.
 */
const contextFor = (key) => {
  const e = IRREPLACEABLE[key]
  const plano = (t) => t.replace(/\s*\n\s*/g, ' ')
  return (
    `${key} is not tracked by git, so deleting it cannot be undone with git checkout. ` +
    `It holds ${plano(e.what)}. Used by: ${plano(e.users)}. Recovery: ${plano(e.recovery)}.`
  )
}

const ask = (key, extra) => ({
  decision: 'ask',
  reason: reasonFor(key, extra),
  context: contextFor(key),
})

/** ¿Es este directorio una copia de este repositorio (el principal o un worktree)? */
const esCheckout = (dir) => existsSync(join(dir, '.claude', 'hooks', 'irreplaceable-paths.mjs'))

/**
 * The stores a path argument would take with it: the store itself, anything
 * inside it, or a directory that CONTAINS it (`rm -rf .`). A path outside the
 * current checkout counts only when it lies in another checkout of this repo,
 * so `rm -rf ~/.cache` is not mistaken for the project's `.cache/`.
 */
function storesForPath(p) {
  if (!p) return []
  const abs = resolve(String(p).replace(/^['"]|['"]$/g, ''))
  const root = resolve('.')
  const dentro = abs === root || abs.startsWith(root + '/')
  const claves = Object.keys(IRREPLACEABLE)
  if (dentro) {
    const rel = abs.slice(root.length + 1)
    return claves.filter(
      (k) => rel === '' || rel === k || rel.startsWith(`${k}/`) || k.startsWith(`${rel}/`),
    )
  }
  return claves.filter((k) => {
    const i = abs.indexOf(`/${k}`)
    if (i < 0) return false
    const tras = abs.slice(i + 1 + k.length)
    return (tras === '' || tras.startsWith('/')) && esCheckout(abs.slice(0, i))
  })
}

/** `npm run delete-voiceprint`, `tsx scripts/delete-voiceprint.ts`: ejecutarla, no nombrarla. */
const ejecutaDeleteVoiceprint = (nombre, args) =>
  (nombre === 'npm' && args[0] === 'run' && args[1] === 'delete-voiceprint') ||
  (['npx', 'tsx', 'node', 'bun'].includes(nombre) &&
    args.some((a) => /(?:^|\/)delete-voiceprint\.ts$/.test(a)))

/** Los operandos de `find` son las rutas de antes de la primera expresión. */
const rutasDeFind = (args) => {
  const fin = args.findIndex((a) => a.startsWith('-') || a === '(' || a === '!')
  return fin === -1 ? args : args.slice(0, fin)
}

export const decideIrreplaceableBash = (command) => {
  if (!command) return null

  for (const o of ordenes(String(command))) {
    const i = inicioDeOrden(o.palabras)
    if (i < 0) continue
    const nombre = nombreDe(o.palabras[i])
    const args = o.palabras.slice(i + 1).map((t) => t.texto)

    if (ejecutaDeleteVoiceprint(nombre, args)) {
      return ask(
        '.voiceprints',
        'Es la CLI correcta y deja rastro — pero el dato que borra no lo cubre git.',
      )
    }

    // `git clean -x` takes no path and hits every ignored file at once.
    if (nombre === 'git') {
      const g = subordenGit(args)
      if (g?.sub === 'clean' && g.resto.some((a) => /^-[a-zA-Z]*[xX]/.test(a))) {
        const lista = Object.entries(IRREPLACEABLE)
          .map(([k, v]) => `  ${k.padEnd(20)} ${v.what.split('\n')[0]}`)
          .join('\n')
        return {
          decision: 'ask',
          reason:
            `\`git clean -x\` borra precisamente los ficheros IGNORADOS, que aquí son\n` +
            `los únicos que git no puede devolver:\n\n` +
            lista +
            `\n\nSin -x borra solo lo no rastreado y no ignorado, que suele ser lo que\n` +
            `quieres. Comprueba la bandera antes de aprobar.`,
          context:
            `git clean -x deletes ignored files, and here the ignored files include ` +
            `${Object.keys(IRREPLACEABLE).join(', ')} — none of which has a copy in git.`,
        }
      }
      continue
    }

    let rutas = []
    if (BORRAN.has(nombre)) rutas = args.filter((a) => !a.startsWith('-'))
    else if (nombre === 'find' && args.includes('-delete')) rutas = rutasDeFind(args)
    for (const r of rutas) {
      const [hit, ...otros] = storesForPath(r)
      if (hit) return ask(hit, otros.length ? `Y con él también: ${otros.join(', ')}.` : null)
    }
  }
  return null
}
