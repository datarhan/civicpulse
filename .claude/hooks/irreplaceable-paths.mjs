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
import { basename, resolve } from 'node:path'

/**
 * Local stores git does not track, and what is lost with each.
 *
 * Verified against `git check-ignore` on 2026-08-03. Tracked files are
 * deliberately absent — `.automation-measurements.json` and the various
 * baselines are committed, so git already covers them.
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
  '.review-cache.json': {
    what: 'qué rutas ya se revisaron sin cambios',
    recovery: 'automática — falla hacia MÁS revisión, no menos',
    users: 'npm run review:surfaces',
  },
}

/** Destructive shapes. `git clean -x` is here because it targets ignored files SPECIFICALLY. */
const DESTRUCTIVE =
  /(?:^|[;&|]|\s)(?:sudo\s+)?(?:rm|rmdir|shred|trash)\b|\btruncate\b|\bfind\b[^|;]*-delete\b|\bgit\s+clean\b[^|;]*-[a-zA-Z]*[xX]/

/** CLIs that destroy irreplaceable local data even though they are the sanctioned path. */
const DESTRUCTIVE_CLI = /\bdelete-voiceprint\b|\bdelete-voiceprint\.ts\b/

const clauses = (cmd) => String(cmd).split(/[;&|\n]+/)

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

/** A path argument that lands inside one of the stores. */
function storeForPath(p) {
  if (!p) return null
  const abs = resolve(String(p).replace(/^['"]|['"]$/g, ''))
  const root = resolve('.')
  const rel = abs.startsWith(root) ? abs.slice(root.length + 1) : basename(abs)
  return Object.keys(IRREPLACEABLE).find((k) => rel === k || rel.startsWith(`${k}/`)) ?? null
}

export const decideIrreplaceableBash = (command) => {
  if (!command) return null
  const cmd = String(command)

  for (const clause of clauses(cmd)) {
    if (DESTRUCTIVE_CLI.test(clause)) {
      return {
        decision: 'ask',
        reason: reasonFor(
          '.voiceprints',
          'Es la CLI correcta y deja rastro — pero el dato que borra no lo cubre git.',
        ),
      }
    }
    if (!DESTRUCTIVE.test(clause)) continue
    // `git clean -x` takes no path and hits every ignored file at once.
    if (/\bgit\s+clean\b/.test(clause)) {
      return {
        decision: 'ask',
        reason:
          `\`git clean -x\` borra precisamente los ficheros IGNORADOS, que aquí son\n` +
          `los únicos que git no puede devolver:\n\n` +
          Object.entries(IRREPLACEABLE)
            .map(([k, v]) => `  ${k.padEnd(20)} ${v.what}`)
            .join('\n') +
          `\n\nSin -x borra solo lo no rastreado y no ignorado, que suele ser lo que\n` +
          `quieres. Comprueba la bandera antes de aprobar.`,
      }
    }
    const hit = clause
      .trim()
      .split(/\s+/)
      .filter((a) => !a.startsWith('-'))
      .map(storeForPath)
      .find(Boolean)
    if (hit) return { decision: 'ask', reason: reasonFor(hit) }
  }
  return null
}
