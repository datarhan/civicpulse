import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  builtFromFor,
  stalenessOf,
  hashOf,
  ABSENT,
  describeStaleness,
  type Staleness,
} from '../src/scraper/built-from'
import type { DataNode } from '../src/scraper/data-graph'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'built-from-'))
  mkdirSync(dir, { recursive: true })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const put = (name: string, body: unknown) =>
  writeFileSync(join(dir, name), typeof body === 'string' ? body : JSON.stringify(body))

const NODE: DataNode = {
  id: 'out.json',
  tier: 'derived',
  reads: ['a.json', 'b.json'],
  writes: ['out.json'],
  command: 'noop',
}

/** The write-back shape: reads and writes the same file. */
const SELF: DataNode = {
  id: 'self.json',
  tier: 'derived',
  reads: ['a.json', 'self.json'],
  writes: ['self.json'],
  command: 'noop',
}

describe('hashOf', () => {
  it('is stable for the same content and different for different', () => {
    put('a.json', { x: 1 })
    const first = hashOf('a.json', dir)
    expect(hashOf('a.json', dir)).toBe(first)
    put('a.json', { x: 2 })
    expect(hashOf('a.json', dir)).not.toBe(first)
  })

  it('reports an absent input rather than throwing or returning empty', () => {
    expect(hashOf('nope.json', dir)).toBe(ABSENT)
  })
})

describe('hashOf — directory inputs', () => {
  const putDir = (name: string, files: Record<string, string>) => {
    mkdirSync(join(dir, name), { recursive: true })
    for (const [f, body] of Object.entries(files)) writeFileSync(join(dir, name, f), body)
  }

  it('hashes a directory as a manifest of its files', () => {
    putDir('corpus', { 'a.txt': 'uno', 'b.txt': 'dos' })
    const first = hashOf('corpus/', dir)
    expect(first).not.toBe(ABSENT)
    expect(hashOf('corpus/', dir)).toBe(first)
  })

  it('changes when one file in it changes', () => {
    putDir('corpus', { 'a.txt': 'uno', 'b.txt': 'dos' })
    const before = hashOf('corpus/', dir)
    writeFileSync(join(dir, 'corpus', 'b.txt'), 'dos, corregido')
    expect(hashOf('corpus/', dir)).not.toBe(before)
  })

  it('changes when a file is added or removed', () => {
    putDir('corpus', { 'a.txt': 'uno' })
    const before = hashOf('corpus/', dir)
    writeFileSync(join(dir, 'corpus', 'c.txt'), 'tres')
    expect(hashOf('corpus/', dir)).not.toBe(before)
  })

  it('is order-independent — readdir order must not decide the hash', () => {
    putDir('one', { 'a.txt': 'uno', 'b.txt': 'dos' })
    putDir('two', { 'b.txt': 'dos', 'a.txt': 'uno' })
    expect(hashOf('one/', dir)).toBe(hashOf('two/', dir))
  })

  /**
   * `pleno-transcripts/` holds a `superseded/` subdirectory of transcripts a
   * session had BEFORE re-transcription. Recursing would mark the claims stale
   * every time an old transcript was archived, which is not a change to the
   * live corpus at all.
   */
  it('does not recurse into subdirectories', () => {
    putDir('corpus', { 'a.txt': 'uno' })
    const before = hashOf('corpus/', dir)
    mkdirSync(join(dir, 'corpus', 'superseded'), { recursive: true })
    writeFileSync(join(dir, 'corpus', 'superseded', 'old.txt'), 'viejo')
    expect(hashOf('corpus/', dir)).toBe(before)
  })

  it('reports a missing directory as absent, and an empty one as a real hash', () => {
    expect(hashOf('nope/', dir)).toBe(ABSENT)
    mkdirSync(join(dir, 'vacio'), { recursive: true })
    expect(hashOf('vacio/', dir)).not.toBe(ABSENT)
  })
})

describe('builtFromFor', () => {
  it('records a hash per input', () => {
    put('a.json', { x: 1 })
    put('b.json', { y: 2 })
    const bf = builtFromFor(NODE, dir)
    expect(Object.keys(bf).sort()).toEqual(['a.json', 'b.json'])
  })

  /** The hazard the whole graph is shaped around. */
  it('excludes an input the node writes back into', () => {
    put('a.json', { x: 1 })
    put('self.json', { y: 2 })
    expect(Object.keys(builtFromFor(SELF, dir))).toEqual(['a.json'])
  })
})

describe('stalenessOf — fails towards stale at every ambiguity', () => {
  it('is fresh when every recorded hash still matches', () => {
    put('a.json', { x: 1 })
    put('b.json', { y: 2 })
    put('out.json', { builtFrom: builtFromFor(NODE, dir) })
    expect(stalenessOf(NODE, dir)).toEqual({ stale: false, reason: null, changed: [] })
  })

  it('names exactly the input that moved', () => {
    put('a.json', { x: 1 })
    put('b.json', { y: 2 })
    put('out.json', { builtFrom: builtFromFor(NODE, dir) })
    put('b.json', { y: 99 })
    const s = stalenessOf(NODE, dir)
    expect(s.stale).toBe(true)
    expect(s.reason).toBe('input-changed')
    expect(s.changed).toEqual(['b.json'])
  })

  it('treats a missing artifact as stale, not as nothing to do', () => {
    put('a.json', { x: 1 })
    put('b.json', { y: 2 })
    expect(stalenessOf(NODE, dir).reason).toBe('missing-output')
  })

  it('treats an artifact with no builtFrom as stale', () => {
    put('a.json', { x: 1 })
    put('b.json', { y: 2 })
    put('out.json', { generatedAt: 'whenever' })
    expect(stalenessOf(NODE, dir).reason).toBe('no-builtFrom')
  })

  it('treats a malformed builtFrom as stale, never silently fresh', () => {
    put('a.json', { x: 1 })
    put('b.json', { y: 2 })
    for (const bad of [null, 42, 'hashes', ['a.json']]) {
      put('out.json', { builtFrom: bad })
      expect(stalenessOf(NODE, dir).reason).toBe('unreadable-builtFrom')
    }
  })

  it('treats unparseable JSON as stale', () => {
    put('a.json', { x: 1 })
    put('b.json', { y: 2 })
    put('out.json', '{ not json')
    expect(stalenessOf(NODE, dir).reason).toBe('unreadable-builtFrom')
  })

  /** A new input added to a node that was built before it existed. */
  it('is stale when an input has no recorded hash at all', () => {
    put('a.json', { x: 1 })
    put('b.json', { y: 2 })
    put('out.json', { builtFrom: { 'a.json': hashOf('a.json', dir) } })
    const s = stalenessOf(NODE, dir)
    expect(s.reason).toBe('input-unrecorded')
    expect(s.changed).toEqual(['b.json'])
  })

  it('notices an input that has since been deleted', () => {
    put('a.json', { x: 1 })
    put('b.json', { y: 2 })
    put('out.json', { builtFrom: builtFromFor(NODE, dir) })
    rmSync(join(dir, 'b.json'))
    expect(stalenessOf(NODE, dir).changed).toEqual(['b.json'])
  })

  /**
   * The permanent-staleness trap: rebuild, output hash changes, node reads its
   * own output, therefore stale again. A second call with nothing else changed
   * must be fresh.
   */
  it('does not re-stale a write-back node after it rebuilds', () => {
    put('a.json', { x: 1 })
    put('self.json', { builtFrom: builtFromFor(SELF, dir), payload: 'v1' })
    expect(stalenessOf(SELF, dir).stale).toBe(false)
    // Simulate the rebuild rewriting its own file.
    put('self.json', { builtFrom: builtFromFor(SELF, dir), payload: 'v2-rebuilt' })
    expect(stalenessOf(SELF, dir).stale).toBe(false)
  })
})

describe('describeStaleness', () => {
  it('gives a distinct sentence per reason', () => {
    const cases: Staleness[] = [
      { stale: true, reason: 'missing-output', changed: [] },
      { stale: true, reason: 'no-builtFrom', changed: [] },
      { stale: true, reason: 'unreadable-builtFrom', changed: [] },
      { stale: true, reason: 'input-unrecorded', changed: ['b.json'] },
      { stale: true, reason: 'input-changed', changed: ['b.json'] },
      { stale: false, reason: null, changed: [] },
    ]
    const said = new Set(cases.map((s) => describeStaleness(NODE, s)))
    expect(said.size).toBe(cases.length)
  })
})
