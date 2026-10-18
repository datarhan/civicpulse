#!/usr/bin/env tsx
/**
 * colas:rehacer — rebuild the curator worklists `check:queues` finds stale,
 * when that takes no judgement, before the health digest reports them.
 *
 *   npm run colas:rehacer              # rebuild what may be rebuilt
 *   npm run colas:rehacer -- --dry-run # say what it would do, touch nothing
 *
 * `check:queues` stays report-only; this is the separate step that acts, and
 * `monitor-health-cron.sh` runs it first so the digest describes the queues
 * after the repair. Until 2026-10-18 the same alarm («30 filas: 28 vivas, 2
 * sobre hallazgos retirados») reached the operator's phone day after day, and
 * the fix was always two deterministic passes typed by hand.
 *
 * What may run unattended is decided in `src/scraper/queue-repair.ts`: a queue
 * holding a curator's choice that its builder does not carry is refused, never
 * rebuilt. For the rest, per queue: copy the file aside, run the `triage:*`
 * pass `QUEUE_SOURCES` names, read it back, and put the copy back if the result
 * is still stale or lost a verdict the builder claims to carry.
 *
 * Every queue lands in exactly one bucket — rebuilt, clean, absent, refused,
 * failed — counted apart (DATA_INTEGRITY rule 2). Exits 1 when any queue was
 * refused or failed, because both need a person; 0 otherwise.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { basename, resolve } from 'node:path'

import {
  QUEUE_SOURCES,
  assessQueue,
  isClean,
  type CorpusView,
  type QueueSource,
} from '../src/scraper/queue-staleness'
import { REPAIR_SPECS, decideRepair, lostCuratorInput } from '../src/scraper/queue-repair'

const FINDINGS = 'public/data/pleno-findings.json'
const RESPALDO = 'editorial/.respaldo-colas'
const RESPALDOS_POR_COLA = 10

type Bucket = 'rebuilt' | 'clean' | 'absent' | 'refused' | 'failed'

function corpus(): CorpusView {
  const snap = JSON.parse(readFileSync(resolve(FINDINGS), 'utf8')) as {
    items: Array<{ id: string }>
    retractions?: Array<{ findingId: string }>
  }
  return {
    published: new Set(snap.items.map((f) => f.id)),
    retracted: new Set((snap.retractions ?? []).map((r) => r.findingId)),
  }
}

/** null = no file. A file that does not parse throws: that is not «absent». */
function leer(path: string): unknown | null {
  const p = resolve(path)
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf8'))
}

const filas = (parsed: unknown) => {
  const rows = (parsed as { rows?: unknown })?.rows
  return Array.isArray(rows) ? rows.length : 0
}

/** `npm run triage:x` → runs that script, and nothing a string could smuggle in. */
function regenerar(source: QueueSource): void {
  const m = /^npm run ([\w:-]+)$/.exec(source.regenerate)
  if (!m) throw new Error(`regenerate no es «npm run <script>»: ${source.regenerate}`)
  execFileSync('npm', ['run', '--silent', m[1]], { stdio: 'pipe', encoding: 'utf8' })
}

function respaldar(path: string): string {
  mkdirSync(resolve(RESPALDO), { recursive: true })
  const nombre = basename(path, '.json')
  const copia = resolve(
    RESPALDO,
    `${nombre}.${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  )
  copyFileSync(resolve(path), copia)
  // The newest few are enough to undo a bad night; the rest is clutter.
  const viejas = readdirSync(resolve(RESPALDO))
    .filter((f) => f.startsWith(`${nombre}.`))
    .sort()
    .slice(0, -RESPALDOS_POR_COLA)
  for (const f of viejas) rmSync(resolve(RESPALDO, f))
  return copia
}

function main() {
  const dryRun = process.argv.includes('--dry-run')
  const cuenta: Record<Bucket, number> = { rebuilt: 0, clean: 0, absent: 0, refused: 0, failed: 0 }
  const linea = (b: Bucket, s: QueueSource, texto: string) => {
    cuenta[b] += 1
    const nombre = basename(s.path, '.json').padEnd(24)
    process.stdout.write(`  ${b.padEnd(8)} ${nombre} ${texto}\n`)
  }

  for (const source of QUEUE_SOURCES) {
    const spec = REPAIR_SPECS[source.path]
    let antes: unknown | null
    try {
      antes = leer(source.path)
    } catch (err) {
      linea('refused', source, `no se lee como JSON (${(err as Error).message}) — míralo a mano`)
      continue
    }
    const informe = assessQueue(source, antes, corpus())
    const d = decideRepair(informe, antes, spec)
    if (d.action === 'absent') linea('absent', source, d.reason)
    else if (d.action === 'clean') linea('clean', source, `${informe.total} fila(s), ${d.reason}`)
    else if (d.action === 'refuse') linea('refused', source, d.reason)
    else if (dryRun) linea('rebuilt', source, `(--dry-run) la rehería: ${d.reason}`)
    else {
      const copia = respaldar(source.path)
      const volver = (motivo: string) => {
        copyFileSync(copia, resolve(source.path))
        linea('failed', source, `${motivo} — devuelta la copia ${basename(copia)}`)
      }
      try {
        regenerar(source)
      } catch (err) {
        // The builder's own words, not node's «Command failed»: that line is
        // what the cron log keeps, and it has to say what to fix.
        const e = err as Error & { stderr?: string; stdout?: string }
        const dice = `${e.stderr ?? ''}\n${e.stdout ?? ''}`
          .split('\n')
          .map((l) => l.trim())
          .find(Boolean)
        volver(`${source.regenerate} falló: ${dice ?? e.message.split('\n')[0]}`)
        continue
      }
      const despues = leer(source.path)
      const nuevo = assessQueue(source, despues, corpus())
      const perdidas = lostCuratorInput(antes, despues, spec)
      if (perdidas.length > 0) volver(`perdía el veredicto de ${perdidas.join(', ')}`)
      else if (!isClean(nuevo)) volver('rehecha, sigue desactualizada')
      else
        linea(
          'rebuilt',
          source,
          `${filas(antes)} → ${filas(despues)} fila(s) · ${d.reason} · copia en ${RESPALDO}/`,
        )
    }
  }

  process.stdout.write(
    `[colas:rehacer] ${QUEUE_SOURCES.length} cola(s) · rehechas ${cuenta.rebuilt} · ` +
      `al día ${cuenta.clean} · sin fichero ${cuenta.absent} · ` +
      `rechazadas ${cuenta.refused} · fallidas ${cuenta.failed}` +
      (dryRun ? ' · --dry-run: nada escrito' : '') +
      '\n',
  )
  if (cuenta.refused + cuenta.failed > 0) process.exitCode = 1
}

main()
