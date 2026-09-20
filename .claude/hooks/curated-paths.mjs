/**
 * Decision logic for the PreToolUse guard. Kept in its own module so the hook
 * runner can be unconditional — an earlier version only ran when argv[1] ended
 * in the script's own filename, so invoking it through a symlink or a renamed
 * copy silently allowed everything, and emitted nothing, which looks exactly
 * like a pass. A control that cannot be told apart from its own absence is not
 * a control.
 *
 * Two rules, both already broken in production once:
 *
 *   1. Curated files are never written by automation. Each is fronted by a CLI
 *      that re-validates the WHOLE snapshot before writing, so an invariant
 *      (verbatim quote ≥20 chars, evidence on a `critical` finding, a `dueBy`
 *      backed by a clause from the acta) cannot slip. A direct write skips the
 *      validator AND the audit trail, on files this project treats as legally
 *      material. Most of them make claims about named elected officials; some
 *      —place-overrides, entity-overrides, eficiencia-findings— deliberately
 *      name nobody, and the deny message must not say otherwise.
 *
 *   2. Anything under public/ is published. Vercel serves the whole directory,
 *      so a file there is fetchable by URL whether or not a page links to it.
 *      24 unreviewed drafts about named councillors sat there for weeks because
 *      "nothing renders it" was mistaken for "nobody can read it".
 *
 * Deterministic checks deny; heuristic ones ask. That is this repo's existing
 * split — the pre-commit `check:json` blocks, the probabilistic pre-push page
 * review never does. Matching a normalized file path is exact, so it denies.
 * Scanning a shell command is inference, so it asks.
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, normalize } from 'node:path'

/**
 * basename → the CLI that owns it. Kept in sync with docs/DATA_SOURCES.md by
 * tests/guard-curated-writes.test.js, which fails if that doc lists a curated
 * file this table does not guard.
 */
export const CURATED = {
  'promises.json': 'npm run reply / freeze:set / freeze:clear',
  'pleno-votes.json': 'npm run pleno-vote / promote-vote / retract-vote',
  'pleno-findings.json': 'npm run promote-claim / finding-reply / correct-pleno-finding',
  // Los veredictos publicados son base⊕overlay y sus CLIs son la única puerta;
  // faltaban de esta lista (hueco señalado en la revisión del 17-08): una
  // edición directa saltaría el rango isDowngrade y el registro del overlay.
  'pleno-claims-verified.json': 'npm run downgrade-verdict / verify:pleno-claims',
  'pleno-claims-overlay.json': 'npm run downgrade-verdict / apply-gold-downgrades',
  'pleno-claim-reclassifications.json': 'npm run reclassify-claim',
  'pleno-claim-reanchors.json': 'npm run reanchor-claim',
  'press-findings.json': 'npm run correct-press-finding',
  'journalist-reports.json':
    'npm run promote-report / correct-journalist-report / journalist-reply / journalist:archive / journalist:archive-sources',
  'quejas-responses.json': 'npm run queja-reply',
  'sindic.json': 'npm run sindic:add',
  'dedicaciones.json': 'curated + cited — hand-edit via PR, never programmatically',
  'plantilla.json': 'curated + cited — hand-edit via PR, never programmatically',
  'place-overrides.json': 'npm run promote-place',
  'entity-overrides.json': 'npm run entity-alias',
  'gazetteer-supplement.json': 'curated — each row needs OSM-id/URL provenance',
  'area-fit.json': 'npm run promote-area-fit',
  'requisitos-cargo.json': 'curated + cited — hand-edit via PR, never programmatically',
  'eficiencia-findings.json': 'npm run promote-indicador / correct-indicador / retract-indicador',
  'eficiencia-preguntas.json': 'curated + cited — hand-edit via PR, never programmatically',
  // Nombra a personas vivas junto a una cifra, y officials.json se raspa cada
  // noche: si esto no estuviera congelado, un cron podría cambiar solo quién
  // aparece en una página publicada. La deriva la caza check:competencias; la
  // única escritura programática permitida es la del CLI de réplica.
  'competencias.json': 'curated + cited — hand-edit via PR · npm run competencia-reply',
  // El padrón se raspa cada noche y la web del ayuntamiento va con retraso:
  // una renuncia de mayo de 2025 seguía sin reflejarse en septiembre de 2026.
  // Este es el único sitio donde una corrección sobrevive a la nocturna, y
  // nombra a personas vivas con el acta literal al lado: sólo escribe el CLI.
  'officials-corrections.json': 'npm run roster-correction -- --alta|--baja|--retirar|--reply',
  // El registro de solicitudes de acceso. Lo escribe una persona porque una
  // persona presentó el escrito y una persona leyó la respuesta: que lo
  // rellenara una máquina sería inventar un hecho sobre una administración.
  'solicitudes-acceso.json': 'curated — npm run solicitud -- add|responder|reclamar',
  // Datos societarios sobre empresas que cobran servicios municipales, cada uno
  // con el anuncio del BORME que lo sostiene. `scrape:borme` trae el material a
  // .cache/; publicar lo que se afirma de una empresa lo firma una persona.
  'sociedades.json': 'curated + cited — hand-edit via PR (material: npm run scrape:borme)',
}

const DRAFTY = /(suggestion|draft|borrador|propuesta)/i

/**
 * `public/./data/x.json` and `public//data/x.json` name the same file as
 * `public/data/x.json`, and both slipped past a raw `includes()`. Collapse the
 * path first so one spelling cannot mean two things.
 */
export const canonical = (p) =>
  normalize(String(p))
    .replace(/\/{2,}/g, '/')
    .replace(/^\.\//, '')

// The reason has to be true of EVERY file in CURATED, not of the ones it was
// written for. It used to end "…a file that makes claims about named elected
// officials", which is false of `place-overrides.json` (places),
// `entity-overrides.json` (companies) and `eficiencia-findings.json`, whose
// whole design is that it can never name a person. A guard that states a
// wrong reason is one whose reasons people stop reading — the same defect
// this repo just fixed on /eficiencia, where a caveat excused a figure with a
// motive that was not the real one. What IS true of all of them is the part
// that matters: the CLI is the validator and the audit trail.
const denyCurated = (name, sello = null) => ({
  decision: 'deny',
  reason:
    `${name} is curated: schema-validated, human-edited, and never written by ` +
    `automation. A direct write skips the validator and the audit trail on a ` +
    `file this project treats as legally material.\n\n` +
    `Use instead:  ${CURATED[name]}\n\n` +
    `The CLI re-validates the whole snapshot before writing, so an invariant ` +
    `cannot silently slip. Shelling out to achieve the same edit is the same ` +
    `bypass with extra steps. See docs/DATA_SOURCES.md.` +
    recordatorioDeSello(name, sello),
})

/**
 * A file with a CLI gets its stamp moved by the CLI. A hand-edited one has
 * nobody: the person applying the edit has to move it, and this message is what
 * the session relays to that person — so this is where it has to be said.
 *
 * On 2026-09-17 (16f5ee62) the Hidraqua ficha in `sociedades.json` was corrected
 * by hand, validated, and `generatedAt` stayed on 23 August. `check:stamps`
 * caught it two days later, over Telegram; the first time was c66cf931 on
 * `promises.json`. A guard that names the defect after the commit is a report,
 * not a guard.
 *
 * Only for files that ARE hand-edited and DO carry a stamp, read off the file:
 * the reason has to be true of every file it is shown for, and two hand-edited
 * files (`eficiencia-preguntas`, `gazetteer-supplement`) carry none.
 */
const recordatorioDeSello = (name, sello) =>
  sello && /hand-edit/.test(CURATED[name] ?? '')
    ? `\n\nNo CLI owns ${name}, so NOTHING moves its stamp: whoever applies this ` +
      `edit by hand must also set "${sello.clave}" (now ${sello.valor}) to the day ` +
      `of the change, in the same commit — or, once the edit is committed, run ` +
      `\`npm run restamp -- ${name} --motivo "…"\`, which moves the stamp and ` +
      `nothing else and takes the date from that commit. Otherwise the published ` +
      `file claims a date older than its own content and \`npm run check:stamps\` ` +
      `reds the health digest until someone does. Say so when you hand the edit over.`
    : ''

/**
 * Which field STAMPS this file's content: `composedAt` on a composed file,
 * whose `generatedAt` is a lineage pointer, and `generatedAt` otherwise. Decided
 * by reading the file, never from a list. `scripts/check-curated-stamps.ts`
 * imports this one — a second copy of the rule would be the defect that opens
 * docs/DATA_INTEGRITY.md.
 */
export function claveDelSello(obj) {
  return typeof obj?.composedAt === 'string' && obj.composedAt ? 'composedAt' : 'generatedAt'
}

/** The stamp a file carries on disk, or null if it has none or cannot be read. */
const selloEnDisco = (path, leer) => {
  try {
    const obj = JSON.parse(leer(path, 'utf8'))
    const clave = claveDelSello(obj)
    return typeof obj?.[clave] === 'string' && obj[clave] ? { clave, valor: obj[clave] } : null
  } catch {
    // Missing or unparsable: nothing to say about a stamp. The deny still fires.
    return null
  }
}

/** Write / Edit / NotebookEdit — exact path match, so it denies. */
export const decide = (path, exists = existsSync, leer = readFileSync) => {
  if (!path) return null
  const p = canonical(path)
  const name = basename(p)

  if (CURATED[name] && p.includes('public/data/'))
    return denyCurated(name, selloEnDisco(path, leer))

  if (p.includes('public/') && DRAFTY.test(name) && !exists(path)) {
    return {
      decision: 'ask',
      reason:
        `Creating ${name} under public/ — everything there is served by Vercel and ` +
        `fetchable by URL, linked or not. If these rows are unreviewed machine ` +
        `output about a named living person, they belong in editorial/ ` +
        `(gitignored) instead. That distinction is why 24 journalist drafts were ` +
        `publicly readable for weeks in 2026. Confirm this is safe to publish.`,
    }
  }

  return null
}

/**
 * Shell redirection, in-place edit, or copy onto a curated file. Denying Write
 * while leaving `echo … > promises.json` open would only teach the next session
 * to reach for Bash.
 *
 * Reading is fine (`jq . promises.json`, `git diff`, `cat`), and so are the
 * sanctioned CLIs (`npm run reply -- …`) — none carry a write token. This is
 * inference over an unparsed string, so it asks rather than denies.
 */
const REDIRECT = /(>>?|\b(?:tee|dd)\b|\b(?:sed|perl|ruby)\b[^|;]*\s-i\b|\btruncate\b)/
/** `cp`/`mv`/`install` write only their LAST argument. */
const COPYLIKE = /^\s*(?:sudo\s+)?(?:cp|mv|install|rsync)\b/

const writesTo = (clause, name) => {
  if (COPYLIKE.test(clause)) {
    // `cp promises.json /tmp/backup.json` is a read. Only the destination —
    // the final argument — is written.
    const args = clause
      .trim()
      .split(/\s+/)
      .filter((a) => !a.startsWith('-'))
    return basename(canonical(args[args.length - 1] || '')) === name
  }
  return REDIRECT.test(clause)
}

export const decideBash = (command) => {
  if (!command) return null
  const cmd = String(command)
  const hit = Object.keys(CURATED).find((name) =>
    // Only care when the mention sits in a clause that also writes it.
    cmd.split(/[;&|\n]+/).some((clause) => clause.includes(name) && writesTo(clause, name)),
  )
  if (!hit) return null

  return {
    decision: 'ask',
    reason:
      `This command looks like it writes ${hit} directly. That file is curated: ` +
      `the CLI that owns it re-validates the whole snapshot before writing, and ` +
      `a raw shell write skips both the validator and the audit trail.\n\n` +
      `Use instead:  ${CURATED[hit]}\n\n` +
      `If this is a read, a diff, or the sanctioned CLI itself, approve and ` +
      `carry on. See docs/DATA_SOURCES.md.`,
  }
}
