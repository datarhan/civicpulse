#!/usr/bin/env tsx
/**
 * Rebuild exactly the derived data whose inputs moved.
 *
 *   npm run refresh                 rebuild what is stale
 *   npm run refresh -- --dry-run    report, run nothing
 *   npm run refresh -- --list llm   just the backlog a pipeline should work
 *
 * Walks `data-graph.ts` in dependency order. Rebuilds `derived` nodes; never
 * runs a `curated` one, and never spends a model call on an `llm` one — those
 * are *listed* so the capped backlogs in `hallazgos-pipeline.sh` and
 * `press-lab-pipeline.sh` can pick them up. The graph tells those pipelines
 * what is stale; it does not decide to spend on their behalf.
 *
 * ## The report separates five outcomes on purpose
 *
 * "Nothing was rebuilt" can mean everything was fresh, or that every node was
 * unreachable from here, or that a whole tier is deliberately out of scope.
 * Folding those together is `DATA_INTEGRITY.md` rule 2 — the shape that let a
 * pass report `re-judged 1017` having made zero LLM calls. Each bucket is
 * counted and named separately, and an empty bucket says whether it is empty
 * because there was nothing to do or because nothing of that kind exists yet.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DATA_GRAPH,
  topologicalOrder,
  stalenessInputs,
  type DataNode,
  type NodeTier,
} from '../src/scraper/data-graph'
import { sellar as stamp, stalenessOf, describeStaleness } from '../src/scraper/built-from'

const DATA_DIR = 'public/data'

type Outcome = 'rebuilt' | 'fresh' | 'failed' | 'stale-llm' | 'stale-curated' | 'unreachable'

interface Row {
  node: DataNode
  outcome: Outcome
  detail: string
  /** Si esta fila escribió ficheros en el árbol (reconstruir o sellar). */
  escrito?: boolean
}

/**
 * Dónde vive lo que un nodo escribe, con la regla de `hashOf`: un nombre pelado
 * está en `public/data`; lo que lleva separador es relativo a la raíz, y si no
 * está en `public/data` se mira la raíz antes de darlo por ausente.
 */
export function rutaDeSalida(w: string): string {
  const limpio = w.replace(/\/$/, '')
  if (!limpio.includes('/')) return `${DATA_DIR}/${limpio}`
  return existsSync(resolve(DATA_DIR, limpio)) ? `${DATA_DIR}/${limpio}` : limpio
}

/**
 * Las rutas que una pasada dejó reescritas, para que quien comitea las añada a
 * su pathspec.
 *
 * Sin esto, una tubería que comitea la ENTRADA de un derivado publica la
 * entrada y deja el derivado rederivado SIN comitear: `main` incumple entonces
 * su propia `tests/data-graph-frescura.test.ts` hasta que pasa la nocturna, y
 * la CI de cualquier PR que construya en esa ventana sale roja por ello.
 * Medido el 16-09-2026: ochenta minutos, tres tuberías, una PR ajena en rojo.
 */
export function rutasEscritas(rows: Row[]): string[] {
  const out = new Set<string>()
  for (const r of rows) {
    if (!r.escrito) continue
    for (const w of r.node.writes) out.add(rutaDeSalida(w))
  }
  return [...out].sort()
}

function run(command: string): { ok: boolean; detail: string } {
  try {
    execFileSync('bash', ['-lc', command], { stdio: 'pipe', encoding: 'utf8' })
    return { ok: true, detail: command }
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message?: string }
    const why = (e.stderr || e.stdout || e.message || '').trim().split('\n').slice(-2).join(' ')
    return { ok: false, detail: why.slice(0, 200) || 'command failed' }
  }
}

/** ¿Este fichero de salida ya lleva `builtFrom`? Ausente o ilegible cuenta que no. */
function llevaSello(salida: string): boolean {
  const path = resolve(DATA_DIR, salida)
  if (!existsSync(path)) return true // no producida en esta pasada: no es su fallo
  try {
    const doc = JSON.parse(readFileSync(path, 'utf8'))
    return Boolean(doc && typeof doc === 'object' && !Array.isArray(doc) && doc.builtFrom)
  } catch {
    return false
  }
}

function main() {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  // `--rebuilt-paths`: por stdout, SÓLO las rutas que esta pasada reescribió;
  // el informe humano se va a stderr para no ensuciar la sustitución de quien
  // llama. Lo usa la tubería que comitea para añadirlas a su pathspec.
  const rutasPorStdout = argv.includes('--rebuilt-paths')
  const listIdx = argv.indexOf('--list')
  const listTier = listIdx >= 0 ? (argv[listIdx + 1] as NodeTier | undefined) : undefined

  let order: DataNode[]
  try {
    order = topologicalOrder()
  } catch (err) {
    process.stderr.write(`[refresh] ${err instanceof Error ? err.message : err}\n`)
    process.exit(1)
  }

  // `--stamp <node>`: record what a node was built from, WITHOUT rebuilding it.
  //
  // `llm` and `curated` nodes are never rebuilt here — that is the whole point
  // — so without this they would report "built before provenance was recorded"
  // forever. A permanently-stale node nobody can clear is noise, and noise
  // trains people to stop reading the report. Whoever actually did the work
  // (the pipeline after an extraction, a curator after a promotion) stamps it,
  // and from then on "stale" means an input genuinely moved.
  const stampIdx = argv.indexOf('--stamp')
  if (stampIdx >= 0) {
    const id = argv[stampIdx + 1]
    const node = order.find((n) => n.id === id)
    if (!node) {
      process.stderr.write(`[refresh] --stamp: "${id}" is not a node in the graph\n`)
      process.exit(2)
    }
    const err = stamp(node)
    if (err) {
      process.stderr.write(`[refresh] --stamp: ${err}\n`)
      process.exit(1)
    }
    process.stdout.write(
      `[refresh] stamped ${id} with ${stalenessInputs(node).length} input hash(es)\n`,
    )
    return
  }

  // `--list <tier>`: machine-readable backlog for a pipeline, nothing else.
  if (listTier) {
    for (const node of order) {
      if (node.tier !== listTier) continue
      if (stalenessOf(node).stale) process.stdout.write(`${node.id}\n`)
    }
    return
  }

  const rows: Row[] = []
  for (const node of order) {
    const s = stalenessOf(node)
    if (!s.stale) {
      // Fresco, pero puede tener una salida HERMANA sin sellar: `stalenessOf`
      // juzga por `node.id` y no mira las demás. Sin esto, `check:derivados`
      // reportaba «salida sin sellar» y mandaba a ejecutar `npm run refresh`,
      // que no la arreglaba — un consejo que no funciona es peor que ninguno,
      // porque enseña que el control miente. Sellar es idempotente y no toca
      // la frescura, así que se hace y ya.
      const faltan = node.writes.filter((w) => w !== node.id && !llevaSello(w))
      if (faltan.length > 0 && !dryRun) {
        const err = stamp(node)
        rows.push(
          err
            ? { node, outcome: 'failed', detail: err }
            : {
                node,
                outcome: 'fresh',
                detail: `inputs unchanged · sellada(s) ${faltan.join(', ')}`,
              },
        )
        continue
      }
      rows.push({
        node,
        outcome: 'fresh',
        detail:
          faltan.length > 0
            ? `inputs unchanged · would stamp ${faltan.join(', ')}`
            : 'inputs unchanged',
      })
      continue
    }
    const why = describeStaleness(node, s)

    if (node.tier === 'curated') {
      rows.push({
        node,
        outcome: 'stale-curated',
        detail: `${why} · ${node.command ?? 'a curator'}`,
      })
      continue
    }
    if (node.tier === 'llm') {
      rows.push({ node, outcome: 'stale-llm', detail: why })
      continue
    }
    if (!node.command) {
      rows.push({ node, outcome: 'unreachable', detail: `${why} · no command declared` })
      continue
    }
    if (dryRun) {
      rows.push({ node, outcome: 'rebuilt', detail: `would run: ${node.command} · ${why}` })
      continue
    }

    const r = run(node.command)
    if (!r.ok) {
      rows.push({ node, outcome: 'failed', detail: r.detail })
      continue
    }
    const stampErr = stamp(node)
    rows.push(
      stampErr
        ? { node, outcome: 'failed', detail: stampErr }
        : { node, outcome: 'rebuilt', detail: why, escrito: true },
    )
  }

  const informe = (s: string) =>
    rutasPorStdout ? process.stderr.write(s) : process.stdout.write(s)
  const by = (o: Outcome) => rows.filter((r) => r.outcome === o)
  const label: Record<Outcome, string> = {
    rebuilt: dryRun ? 'would rebuild' : 'rebuilt',
    fresh: 'fresh',
    failed: 'FAILED',
    'stale-llm': 'stale · llm',
    'stale-curated': 'stale · curated',
    unreachable: 'unreachable',
  }

  for (const outcome of Object.keys(label) as Outcome[]) {
    const group = by(outcome)
    if (group.length === 0) continue
    informe(`\n${label[outcome]} (${group.length})\n`)
    for (const r of group) {
      informe(`  ${r.node.id.padEnd(34)} ${r.detail}\n`)
    }
  }

  // An empty tier must say WHY it is empty. "0 llm nodes stale" and "this graph
  // declares no llm nodes yet" look identical in a count and mean opposite
  // things to whoever reads the log at 03:00.
  const tiers: NodeTier[] = ['llm', 'curated']
  const notes: string[] = []
  for (const t of tiers) {
    const declared = DATA_GRAPH.filter((n) => n.tier === t).length
    if (declared === 0) notes.push(`no ${t} nodes are declared in the graph yet`)
    else if (by(t === 'llm' ? 'stale-llm' : 'stale-curated').length === 0) {
      notes.push(`all ${declared} ${t} node(s) fresh`)
    }
  }

  informe(
    `\n[refresh] ${rows.length} node(s) · ` +
      (['rebuilt', 'fresh', 'failed', 'stale-llm', 'stale-curated', 'unreachable'] as Outcome[])
        .map((o) => `${by(o).length} ${label[o]}`)
        .join(' · ') +
      '\n',
  )
  for (const n of notes) informe(`[refresh] ${n}\n`)
  if (dryRun) informe('[refresh] --dry-run: nothing was written\n')

  if (rutasPorStdout) {
    for (const ruta of rutasEscritas(rows)) process.stdout.write(`${ruta}\n`)
  }

  if (by('failed').length > 0) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) main()
