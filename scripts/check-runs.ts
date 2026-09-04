/**
 * check:runs — reds the build when a run reported success without doing work.
 *
 * Reads the manifests written by `startRun(...).finish()` and applies
 * `assessManifest`. See src/scraper/run-manifest.ts for why each rule exists;
 * all three of the incidents encoded there shipped as green nights.
 *
 *   npm run check:runs                 # last 36h, exits 1 on any error finding
 *   npm run check:runs -- --since 168  # last week
 *   npm run check:runs -- --soft       # report only, always exit 0
 *   npm run check:runs -- --all
 */
import {
  readManifests,
  fallosYaSuperados,
  assessManifest,
  formatManifest,
  type RunManifest,
} from '../src/scraper/run-manifest'

/**
 * Passes a scheduler is supposed to run, and how stale is too stale.
 *
 * Without this table the check cannot tell «nobody ran a pass today» from «the
 * nightly pass has been failing for nine days» — and on 2026-08-11 it could
 * not: `extract-pleno-claims` had last run on 08-03, the day the cron started
 * deferring, and `check:runs` reported the absence and exited 0. Nine days of
 * no transcription, no extraction and no findings, with `monitor:health`
 * printing «✓ sin avisos» throughout because it measures source freshness and
 * the deterministic scrapers kept running.
 *
 * Rule 2 of docs/DATA_INTEGRITY.md: a run must prove it did work, and «never
 * attempted» is its own state — not a quiet success.
 *
 * Two constraints on what may go in here, both learned the expensive way:
 *
 *  - **Only instrumented passes.** A script that never calls `startRun` would
 *    be permanently overdue, and a check that is always red is a check
 *    everybody switches off. `assertExpectationsAreReal` enforces it.
 *  - **Slack, not the nominal period.** A daily pass gets 48h, so one missed
 *    night is quiet and two are loud.
 */
interface ExpectedPass {
  script: string
  everyHours: number
  /** Named in the failure, because the fix is almost always the scheduler. */
  scheduler: string
  /**
   * La pasada sólo corre en el portátil del curador, nunca en un runner.
   *
   * Los manifiestos viven en `.run-manifests/`, que está en `.gitignore`, así
   * que en CI el directorio empieza vacío cada noche y una pasada de cron local
   * NUNCA tendrá historial ahí. Sin esta marca el check las declaraba
   * inexistentes y salía 2 — rojo permanente por no poder mirar, que es el
   * reverso del verde por no ejecutarse.
   */
  soloCurador?: boolean
}

export const EXPECTED_PASSES: ExpectedPass[] = [
  {
    script: 'extract-pleno-claims',
    everyHours: 48,
    scheduler: 'hallazgos-pipeline (diario 09:30)',
    soloCurador: true,
  },
  {
    // Nadie la vigilaba, y falló 49 mañanas seguidas sin que nadie se enterase:
    // desde el 2026-07-08, `claude exit 1: Not logged in` todos los días a las
    // 09:00 desde cron, que no abre el llavero. La pasada DETECTABA su propia
    // muerte y escribía «This is a broken run, not an empty one» — a un log de
    // 343 KB que no lee nadie. El resultado visible fue `/departamentos`
    // anclada en el 6 de julio durante siete semanas.
    //
    // Con manifiesto, dos cosas saltan solas: una pasada que corre y no
    // consigue veredictos (`nothing-attempted` + `backend-refusing`), y una
    // pasada que directamente deja de correr. La segunda era la que no tenía
    // forma de verse. Mismo margen de 48 h que sus vecinas: una mañana perdida
    // es silencio, dos son ruido.
    script: 'auto-curate-promises',
    everyHours: 48,
    scheduler: 'launchd com.civicpulse.auto-curate-promises (diario 08:30)',
    soloCurador: true,
  },
  {
    // Nothing watched this until 2026-08-11, and it is about to run unattended
    // for weeks against a 21-session backlog. Its failure modes are all quiet
    // ones: no GEMINI_API_KEY skips the step with a log line, an exhausted
    // quota stops it, and a backlog query that returns nothing looks identical
    // to a backlog that is finished. Same 48h slack as the pass beside it —
    // one missed night is quiet, two are loud.
    script: 'extract-speaker-map',
    everyHours: 48,
    scheduler: 'hallazgos-pipeline (diario 09:30)',
    soloCurador: true,
  },
]

export interface OverduePass extends ExpectedPass {
  lastRun: string | null
  hoursAgo: number | null
}

/** Expected passes whose newest manifest is older than their budget. */
export function overduePasses(
  all: RunManifest[],
  expected: ExpectedPass[],
  now: number,
): OverduePass[] {
  const out: OverduePass[] = []
  for (const e of expected) {
    const runs = all
      .filter((m) => m.script === e.script)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    const last = runs[0]
    if (!last) {
      out.push({ ...e, lastRun: null, hoursAgo: null })
      continue
    }
    const hoursAgo = (now - new Date(last.startedAt).getTime()) / 3600_000
    if (hoursAgo > e.everyHours) {
      out.push({ ...e, lastRun: last.startedAt, hoursAgo })
    }
  }
  return out
}

/**
 * Every expected pass must be one that has actually written a manifest at some
 * point. A typo here would be indistinguishable from a pass that never runs,
 * and would red the build forever for a reason nobody could act on.
 */
export function unrealExpectations(all: RunManifest[], expected: ExpectedPass[]): string[] {
  const seen = new Set(all.map((m) => m.script))
  return expected.filter((e) => !seen.has(e.script)).map((e) => e.script)
}

interface Args {
  sinceHours: number
  soft: boolean
}

function parseArgs(argv: string[]): Args {
  const out: Args = { sinceHours: 36, soft: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--since') out.sinceHours = Number(argv[++i])
    else if (argv[i] === '--all') out.sinceHours = Infinity
    else if (argv[i] === '--soft') out.soft = true
    else {
      process.stderr.write(`[check-runs] unknown flag ${argv[i]}\n`)
      process.exit(2)
    }
  }
  return out
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const all = readManifests()
  const cutoff = Number.isFinite(args.sinceHours)
    ? Date.now() - args.sinceHours * 3600_000
    : -Infinity
  const manifests = all.filter((m) => new Date(m.startedAt).getTime() >= cutoff)

  // No manifests AT ALL is a checkout without run history — a fresh clone, CI,
  // a machine where nothing has ever run. It is not evidence about the
  // pipeline, and both the typo guard and the overdue check would read it as
  // catastrophe: the first would FATAL on every expected pass, the second
  // would call all of them overdue. Measured, not assumed — with
  // `.run-manifests` moved aside this exited 2 before the guard below existed,
  // which is precisely the permanent-red it is supposed to prevent.
  if (all.length === 0) {
    process.stdout.write(
      '[check-runs] no hay ningún manifiesto en este checkout (.run-manifests está en\n' +
        '             .gitignore, así que en CI o en un clon nuevo esto es lo normal).\n' +
        '             Sin historial no se puede decir nada de las pasadas programadas.\n',
    )
    return
  }

  // El guardián de arriba cubre el checkout SIN historial ninguno. Falta el
  // caso de al lado, que es el que rompía la nocturna: un runner que SÍ tiene
  // manifiestos —los que acaba de escribir él mismo— pero que nunca va a tener
  // los de una pasada que sólo corre en el portátil del curador. Ahí
  // `all.length > 0`, así que el early-return no salta, y las dos pasadas de
  // `hallazgos-pipeline` caían en el FATAL de abajo todas las noches.
  const enCI = !!process.env.CI
  const omitidas = enCI ? EXPECTED_PASSES.filter((e) => e.soloCurador) : []
  const aplicables = EXPECTED_PASSES.filter((e) => !omitidas.includes(e))
  if (omitidas.length > 0) {
    // Se dice en voz alta: «no comprobado aquí» no es «comprobado y bien».
    process.stdout.write(
      `[check-runs] ${omitidas.length} pasada(s) NO comprobada(s) en este runner — sólo corren\n` +
        `             en el portátil del curador: ${omitidas.map((e) => e.script).join(', ')}.\n` +
        `             Su vigilancia vive en la máquina que las lanza; aquí no hay manifiesto\n` +
        `             que mirar y fingir lo contrario sería un rojo que nadie puede arreglar.\n`,
    )
  }

  // The typo guard fires before anything else: an expectation naming a script
  // that has never written a manifest is a bug in this file, not a finding
  // about the pipeline, and reporting it as the latter would be a permanent
  // red nobody can clear.
  const unreal = unrealExpectations(all, aplicables)
  if (unreal.length > 0) {
    process.stderr.write(
      `[check-runs] FATAL: EXPECTED_PASSES names ${unreal.join(', ')}, which has never\n` +
        `             written a manifest. Either the script does not call startRun, or the\n` +
        `             name is wrong. Fix the table — do not silence the check.\n`,
    )
    process.exit(2)
  }

  // Scheduled passes are checked against the WHOLE history, not the window: a
  // pass 9 days overdue has nothing inside a 36h window to notice.
  const overdue = overduePasses(all, aplicables, Date.now())
  // One line each, deliberately: `monitor-health.ts` keeps only a check's last
  // two lines when it turns it into an alert, so a two-line finding loses its
  // own diagnosis to the summary underneath it.
  for (const o of overdue) {
    const when =
      o.lastRun === null
        ? 'NUNCA ha corrido'
        : `última hace ${Math.floor(o.hoursAgo!)}h (${o.lastRun.slice(0, 10)})`
    process.stdout.write(
      `  ✗ ${o.script}: se espera cada ${o.everyHours}h, ${when} — lo lanza ${o.scheduler}\n`,
    )
  }

  if (manifests.length === 0) {
    // Not an error BY ITSELF — a quiet day is normal, and that is what this
    // branch has always said. What was missing is the line above: a scheduled
    // pass being absent is a different fact, and it is now reported as one.
    process.stdout.write(
      `[check-runs] no instrumented runs in the last ${args.sinceHours}h ` +
        `(${all.length} manifest(s) on disk in total, ` +
        `${aplicables.length} pasada(s) programada(s) vigilada(s), ${overdue.length} vencida(s))\n`,
    )
    if (overdue.length > 0 && !args.soft) process.exit(1)
    return
  }

  let errors = overdue.length
  let warns = 0
  // Fallos que una pasada POSTERIOR de lo mismo ya dejó atrás. Se siguen
  // imprimiendo enteros —el hallazgo, su código y su motivo— y dejan de contar
  // como error, porque no describen el estado de hoy. Ver `fallosYaSuperados`.
  const superados = fallosYaSuperados(manifests)
  for (const m of manifests) {
    const findings = assessManifest(m)
    const resuelto = superados.has(m.runId)
    const bad = resuelto ? 0 : findings.filter((f) => f.level === 'error').length
    const mark = bad > 0 ? '✗' : findings.length > 0 ? '!' : '✓'
    process.stdout.write(`\n${mark} ${formatManifest(m)}\n`)
    if (resuelto) {
      process.stdout.write(
        `    RESUELTO — una pasada posterior de ${m.script} dentro de esta ventana vino limpia.\n` +
          `    Lo de abajo pasó y se deja escrito; ya no cuenta como error.\n`,
      )
    }
    for (const f of findings) {
      if (f.level === 'error' && !resuelto) errors++
      else warns++
      process.stdout.write(`    ${f.level.toUpperCase()} [${f.code}] ${f.message}\n`)
    }
  }

  process.stdout.write(
    `\n[check-runs] ${manifests.length} run(s) · ${errors} error(s) · ${warns} warning(s) · ` +
      `${aplicables.length} pasada(s) programada(s), ${overdue.length} vencida(s)\n`,
  )
  if (errors > 0 && !args.soft) process.exit(1)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
