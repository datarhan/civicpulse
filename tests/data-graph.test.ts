import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { analyseScriptIo } from '../src/scraper/script-io'
import {
  DATA_GRAPH,
  stalenessInputs,
  topologicalOrder,
  producersOf,
  type DataNode,
} from '../src/scraper/data-graph'
import { checkNode } from '../scripts/check-data-graph'

describe('analyseScriptIo', () => {
  it('resolves a const bound to a path', () => {
    const io = analyseScriptIo(`
      const OFFICIALS = resolve(DATA, 'officials.json')
      readFileSync(OFFICIALS, 'utf8')
    `)
    expect(io.reads).toEqual(['officials.json'])
  })

  /**
   * The bug the first version shipped: a regex stopping at the first comma
   * truncated `readJsonIfExists(resolve(DATA, 'streets.json'))` to
   * `resolve(DATA` and lost four of six inputs.
   */
  it('reads through a nested call argument', () => {
    const io = analyseScriptIo(`readJsonIfExists(resolve(DATA, 'streets.json'))`)
    expect(io.reads).toEqual(['streets.json'])
  })

  it('resolves an object of paths, then a member access', () => {
    const io = analyseScriptIo(`
      const PATHS = { press: join(ROOT, 'public/data/press.json') }
      await readJson(PATHS.press)
    `)
    expect(io.reads).toEqual(['press.json'])
  })

  it('chases a const that points at another const', () => {
    const io = analyseScriptIo(`
      const FINDINGS = 'public/data/pleno-findings.json'
      const findingsPath = resolve(FINDINGS)
      readFileSync(findingsPath, 'utf8')
    `)
    expect(io.reads).toEqual(['pleno-findings.json'])
  })

  it('separates reads from writes', () => {
    const io = analyseScriptIo(`
      const IN = resolve(DATA, 'tenders.json')
      const OUT = resolve(DATA, 'entities.json')
      readFileSync(IN, 'utf8'); writeFileSync(OUT, '{}')
    `)
    expect(io.reads).toEqual(['tenders.json'])
    expect(io.writes).toEqual(['entities.json'])
  })

  /**
   * The honesty property. A scan that finds nothing has NOT proven a script has
   * no inputs, and a caller must be able to tell the two apart.
   */
  it('reports analysed:false when it found no data paths at all', () => {
    expect(analyseScriptIo('const x = 1').analysed).toBe(false)
  })

  it('surfaces a mentioned path it cannot classify instead of guessing', () => {
    const io = analyseScriptIo(`const p = someHelper('quejas.json')`)
    expect(io.reads).toEqual([])
    expect(io.writes).toEqual([])
    expect(io.unclassified).toEqual(['quejas.json'])
  })

  it('honours an explicit marker for a path it cannot see', () => {
    const io = analyseScriptIo(`
      // data-graph: reads pleno-transcripts.json
      // data-graph: writes tender-geo.json
      const x = 1
    `)
    expect(io.reads).toEqual(['pleno-transcripts.json'])
    expect(io.writes).toEqual(['tender-geo.json'])
    expect(io.unclassified).toEqual([])
  })
})

describe('the declared graph matches the real scripts', () => {
  /**
   * The whole point of the file. Run for real against every node, so a compute
   * script gaining an input fails here and not in production six weeks later.
   */
  it.each(DATA_GRAPH.map((n) => [n.id, n] as const))('%s', (_id, node) => {
    const { problems, analysed } = checkNode(node as DataNode)
    expect(problems).toEqual([])
    // A node that passed only because nothing could be read is not a pass.
    if ((node as DataNode).tier === 'derived') expect(analysed).toBe(true)
  })

  it('names a script that exists, for every derived node', () => {
    const derived = DATA_GRAPH.filter((n) => n.tier === 'derived')
    expect(derived.length).toBeGreaterThan(0)
    for (const n of derived) {
      expect(n.script, `${n.id} declares no script`).toBeTruthy()
      expect(existsSync(resolve(n.script as string))).toBe(true)
    }
  })

  it('gives every derived node a rebuild command', () => {
    for (const n of DATA_GRAPH.filter((x) => x.tier === 'derived')) {
      expect(n.command, `${n.id} has no command`).toBeTruthy()
    }
  })
})

describe('stalenessInputs', () => {
  /**
   * The write-back hazard. `compute:dept-stats` folds its result into
   * `plenos-agendas.json`, which it also reads. Hashing that input would make
   * the node stale immediately after every rebuild, forever.
   */
  it('excludes an input the node writes back into', () => {
    const dept = DATA_GRAPH.find((n) => n.id === 'plenos-agendas.json')!
    expect(dept.reads).toContain('plenos-agendas.json')
    expect(stalenessInputs(dept)).not.toContain('plenos-agendas.json')
    expect(stalenessInputs(dept)).toContain('officials.json')
  })

  it('does the same for the provenance node, which diffs against itself', () => {
    // La REGLA, no la lista. Estaba escrita como `toEqual(['pleno-findings.json'])`
    // y se puso roja al declarar las dos entradas que al nodo le faltaban —el
    // corpus del verificador, que llega por un loader de lib/ y que el grafo no
    // mencionaba—. Una lista copiada a mano que se rompe cuando el grafo se
    // vuelve MÁS correcto es la forma restated-shape del modo de fallo 1 de
    // DATA_INTEGRITY: se arregla afirmando la propiedad.
    const prov = DATA_GRAPH.find((n) => n.id === 'finding-quote-provenance.json')!
    expect(prov.reads).toContain('finding-quote-provenance.json')
    expect(stalenessInputs(prov)).not.toContain('finding-quote-provenance.json')
    // La regla tiene DOS exclusiones desde el 2026-08-29: lo que el nodo se
    // escribe a sí mismo, y lo que git no versiona. Sigue siendo la propiedad,
    // no la lista.
    expect(stalenessInputs(prov)).toEqual(
      prov.reads.filter((r) => r !== prov.id && !(prov.noComparables ?? []).includes(r)),
    )
    // La segunda exclusión, nombrada: la base del verificador está en
    // .gitignore, así que su hash no significa lo mismo en el portátil que en
    // CI. Se seguía leyendo y el nodo salía rancio en una máquina o en la otra
    // todos los días, alternándose. Se declara, no se borra: la dependencia
    // existe, lo que no puede es fechar nada.
    expect(prov.noComparables).toContain('pleno-claims-verified-base.json')
    expect(stalenessInputs(prov)).not.toContain('pleno-claims-verified-base.json')
    // Y sigue midiendo algo: el nodo tiene entradas además de sí mismo.
    expect(stalenessInputs(prov).length).toBeGreaterThan(0)
    expect(stalenessInputs(prov)).toContain('pleno-findings.json')
  })
})

describe('topologicalOrder', () => {
  it('puts a node after everything it reads that the graph also produces', () => {
    const order = topologicalOrder().map((n) => n.id)
    // press-analytics reads plenos-agendas.json, which dept-stats writes.
    expect(order.indexOf('plenos-agendas.json')).toBeLessThan(order.indexOf('press-trust.json'))
  })

  it('includes every node exactly once', () => {
    const order = topologicalOrder()
    expect(order).toHaveLength(DATA_GRAPH.length)
    expect(new Set(order.map((n) => n.id)).size).toBe(DATA_GRAPH.length)
  })

  it('treats a self-edge as no edge, not as a cycle', () => {
    expect(() => topologicalOrder()).not.toThrow()
  })

  it('refuses a real cycle instead of picking an order', () => {
    const cyclic: DataNode[] = [
      { id: 'a.json', tier: 'derived', reads: ['b.json'], writes: ['a.json'], command: 'x' },
      { id: 'b.json', tier: 'derived', reads: ['a.json'], writes: ['b.json'], command: 'y' },
    ]
    expect(() => topologicalOrder(cyclic)).toThrow(/cycle/)
  })
})

describe('producersOf', () => {
  it('finds the node that writes a file under another name', () => {
    // compute:press-analytics writes three files but is keyed on one.
    expect(producersOf('press-triangulation.json').map((n) => n.id)).toEqual(['press-trust.json'])
  })

  it('is empty for a scraped input nothing in the graph produces', () => {
    expect(producersOf('officials.json')).toEqual([])
  })
})
